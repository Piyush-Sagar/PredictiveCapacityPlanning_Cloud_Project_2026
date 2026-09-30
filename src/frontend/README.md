# Frontend — Predictive Capacity Planning Dashboard

Phase I demo of the operator dashboard described in `docs/` and the
architecture diagrams under `architecture/`: forecasts, model confidence,
recommended capacity, scaling decisions, costs, and SLA metrics for a
video-streaming platform.

Two modes, chosen at build time with `NEXT_PUBLIC_DATA_MODE`:

* **`live`** (Docker Compose / `make dev`): sign in through the mock Cognito
  Hosted UI (authorization code + PKCE, handled server-side in
  `app/auth/*`). Tokens live in httpOnly cookies. `proxy.ts` guards pages, and
  `app/api/backend/[...path]` is a BFF proxy that attaches the access token
  (refreshing it when needed) and the selected AWS account, then forwards to
  the FastAPI backend. Data refetches on every simulation tick.
* **`mock`** (default): the original backend-free demo. Every number comes
  from the seeded generators in `lib/mock/`.

Pages call `useApiData(path, mockFn)` (`lib/api/hooks.ts`), which fetches in
live mode and evaluates the mock generator otherwise, so both modes share one
component tree.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4
- shadcn/ui (Base UI primitives) for cards, tables, tabs, sheets, menus
- Recharts for forecast bands, cost trends, and benchmark charts
- `next-themes` for the dark/light toggle (dark by default)
- Auth: mock Cognito (live mode) via server-side PKCE + httpOnly cookies; `lib/auth-stub.ts` user in mock mode

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 (mock mode). For live mode, run the whole stack
from the repo root with `docker compose up --build` or `make dev`.

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

## Routes

| Route | View |
| --- | --- |
| `/` | Overview — pipeline diagram, key metrics, quick links |
| `/forecast` | Demand forecast with P50/P90 confidence bands |
| `/capacity` | Capacity recommendations, guardrails, scale decisions |
| `/confidence` | Model calibration, coverage, and fallback status |
| `/alerts` | Approval workflow for proposed scaling actions |
| `/cost-sla` | Cost trend, SLA violations, scaling event log |
| `/benchmarking` | Model accuracy/latency/cost comparison (Chronos, TimesFM, Moirai, TTM vs. seasonal-naive, XGBoost, LSTM) |
| `/accounts` | Connect AWS accounts (simulated CloudFormation + AssumeRole), scaling policy, simulation clock, SNS deliveries |
| `/login` | Sign in with (mock) Amazon Cognito |

## Structure

```
app/                   # routes (one folder per view above)
components/layout/     # sidebar, topbar, theme toggle, user badge
components/dashboard/  # charts, tables, badges, KPI cards
components/ui/          # shadcn/ui primitives
lib/types.ts            # domain model (forecasts, capacity, alerts, benchmarks)
lib/mock/                # seeded, deterministic mock data generators
```

Mock data is seeded (not `Math.random()`/`Date.now()`) so server-rendered and
client-hydrated output always match — see `lib/mock/rng.ts`.
