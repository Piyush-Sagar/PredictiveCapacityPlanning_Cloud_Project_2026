"""LSTM baseline with a pinball-loss head for P50 and P90.

Encoder: the last 48 five-minute steps (log level relative to the origin, CPU,
calendar, scheduled-event flags). Decoder context: per-lead seasonal lag,
calendar and scheduled-event flags for the 12 future steps, plus a region
one-hot. Output: 12 leads x (q50, q90 = q50 + softplus(delta))."""

from __future__ import annotations

import numpy as np
import torch
from torch import nn

from .. import config
from ..features import DAY, RegionSeries, _take
from .base import LEADS, Forecast, Forecaster, ModelProfile

WINDOW = 48
N_SEQ = 6
N_FUT = 6


def _encode(s: RegionSeries, origins: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    ly = s.logy
    cur = ly[origins][:, None]
    back = origins[:, None] - np.arange(WINDOW - 1, -1, -1)[None, :]
    seq = np.stack(
        [
            _take(ly, back) - cur,
            _take(s.cpu, back) / 100,
            _take(s.hour_sin, back),
            _take(s.hour_cos, back),
            _take(s.sched_live, back),
            _take(s.sched_release, back),
        ],
        axis=-1,
    )
    fwd = origins[:, None] + LEADS[None, :]
    fut = np.stack(
        [
            _take(ly, fwd - DAY) - cur,
            _take(s.hour_sin, fwd),
            _take(s.hour_cos, fwd),
            _take(s.sched_live, fwd),
            _take(s.sched_release, fwd),
            _take(s.weekend, fwd),
        ],
        axis=-1,
    ).reshape(len(origins), -1)
    onehot = np.zeros((len(origins), len(config.REGIONS)))
    onehot[:, config.REGIONS.index(s.region)] = 1
    ctx = np.concatenate([fut, onehot], axis=1)
    return np.nan_to_num(seq).astype(np.float32), np.nan_to_num(ctx).astype(np.float32)


class _Net(nn.Module):
    def __init__(self, hidden: int = 64):
        super().__init__()
        self.lstm = nn.LSTM(N_SEQ, hidden, batch_first=True)
        ctx_dim = config.MAX_LEAD * N_FUT + len(config.REGIONS)
        self.head = nn.Sequential(
            nn.Linear(hidden + ctx_dim, 128), nn.ReLU(), nn.Linear(128, config.MAX_LEAD * 2)
        )

    def forward(self, seq, ctx):
        _, (h, _) = self.lstm(seq)
        out = self.head(torch.cat([h[-1], ctx], dim=1)).view(-1, config.MAX_LEAD, 2)
        q50 = out[..., 0]
        q90 = q50 + nn.functional.softplus(out[..., 1])
        return q50, q90


def _pinball(pred, target, q):
    diff = target - pred
    return torch.mean(torch.maximum(q * diff, (q - 1) * diff))


class LSTMQuantile(Forecaster):
    name = "lstm"
    kind = "baseline"
    profile = ModelProfile(host="fargate-1vcpu")

    def __init__(self, epochs: int = 12, seed: int = config.SEED):
        self.epochs = epochs
        self.seed = seed
        self.net: _Net | None = None

    def _dataset(self, series, split):
        seqs, ctxs, ys = [], [], []
        for s in series.values():
            o = s.indices(split)
            o = o[(o >= DAY) & (o + config.MAX_LEAD < len(s))]
            seq, ctx = _encode(s, o)
            y = _take(s.logy, o[:, None] + LEADS[None, :]) - s.logy[o][:, None]
            seqs.append(seq)
            ctxs.append(ctx)
            ys.append(y.astype(np.float32))
        return (
            torch.from_numpy(np.concatenate(seqs)),
            torch.from_numpy(np.concatenate(ctxs)),
            torch.from_numpy(np.concatenate(ys)),
        )

    def fit(self, series):
        torch.manual_seed(self.seed)
        torch.set_num_threads(4)
        seq, ctx, y = self._dataset(series, "train")
        vseq, vctx, vy = self._dataset(series, "val")
        self.net = _Net()
        opt = torch.optim.Adam(self.net.parameters(), lr=2e-3)
        gen = torch.Generator().manual_seed(self.seed)
        best, best_state = float("inf"), None
        for _ in range(self.epochs):
            self.net.train()
            perm = torch.randperm(len(y), generator=gen)
            for i in range(0, len(y), 256):
                b = perm[i : i + 256]
                q50, q90 = self.net(seq[b], ctx[b])
                loss = _pinball(q50, y[b], 0.5) + _pinball(q90, y[b], 0.9)
                opt.zero_grad()
                loss.backward()
                opt.step()
            self.net.eval()
            with torch.no_grad():
                q50, q90 = self.net(vseq, vctx)
                vloss = float(_pinball(q50, vy, 0.5) + _pinball(q90, vy, 0.9))
            if vloss < best:
                best = vloss
                best_state = {k: v.clone() for k, v in self.net.state_dict().items()}
        self.net.load_state_dict(best_state)
        self.net.eval()
        return self

    def predict(self, s: RegionSeries, origins: np.ndarray) -> Forecast:
        seq, ctx = _encode(s, origins)
        with torch.no_grad():
            q50, q90 = self.net(torch.from_numpy(seq), torch.from_numpy(ctx))
        level = s.y[origins][:, None]
        return Forecast(p50=level * np.exp(q50.numpy()), p90=level * np.exp(q90.numpy()))

    def artifact_mb(self):
        return sum(p.numel() * 4 for p in self.net.parameters()) / 1e6 if self.net else 0.0

    def save(self, path):
        torch.save(self.net.state_dict(), path)
