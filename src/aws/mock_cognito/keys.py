"""RSA signing key for the mock user pool, persisted so tokens survive restarts."""

from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def _b64(n: int) -> str:
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


class SigningKey:
    def __init__(self, key_dir: Path):
        key_dir.mkdir(parents=True, exist_ok=True)
        path = key_dir / "signing-key.pem"
        if path.exists():
            self.private = serialization.load_pem_private_key(path.read_bytes(), password=None)
        else:
            self.private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            path.write_bytes(
                self.private.private_bytes(
                    serialization.Encoding.PEM,
                    serialization.PrivateFormat.PKCS8,
                    serialization.NoEncryption(),
                )
            )
            path.chmod(0o600)
        nums = self.private.public_key().public_numbers()
        self.kid = hashlib.sha256(f"{nums.n}:{nums.e}".encode()).hexdigest()[:20]
        self.jwk = {"kty": "RSA", "alg": "RS256", "use": "sig", "kid": self.kid, "n": _b64(nums.n), "e": _b64(nums.e)}

    def pem(self) -> bytes:
        return self.private.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
        )

    def jwks(self) -> dict:
        return {"keys": [self.jwk]}

    def jwks_json(self) -> str:
        return json.dumps(self.jwks())
