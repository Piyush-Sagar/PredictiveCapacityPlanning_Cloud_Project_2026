"""Bearer-token authorisation, equivalent to an API Gateway JWT authoriser
backed by a Cognito user pool: RS256 signature via JWKS, issuer, token_use
and client_id checks; Cognito groups map to roles."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from capplan_db.models import User

from .config import get_settings
from .deps import get_db

_jwks_client: jwt.PyJWKClient | None = None


def _client() -> jwt.PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = jwt.PyJWKClient(get_settings().jwks_url, cache_keys=True, lifespan=600)
    return _jwks_client


def set_jwks_client(client) -> None:
    """Test hook."""
    global _jwks_client
    _jwks_client = client


@dataclass
class Principal:
    sub: str
    email: str
    name: str
    groups: list[str]

    @property
    def role(self) -> str:
        return "admin" if "admins" in self.groups else "operator"


def verify_access_token(token: str) -> dict:
    s = get_settings()
    try:
        signing_key = _client().get_signing_key_from_jwt(token)
        claims = jwt.decode(token, signing_key.key, algorithms=["RS256"], issuer=s.cognito_issuer, options={"require": ["exp", "iss", "sub"]})
    except jwt.PyJWKClientError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"cannot fetch JWKS: {exc}") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"invalid token: {exc}") from exc
    if claims.get("token_use") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "access token required")
    if claims.get("client_id") != s.cognito_client_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token issued for a different app client")
    return claims


def current_principal(request: Request, db: Session = Depends(get_db)) -> Principal:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token", headers={"WWW-Authenticate": "Bearer"})
    claims = verify_access_token(header[7:].strip())
    # Access tokens don't carry profile claims; the id token's are forwarded by the BFF.
    email = request.headers.get("x-capplan-user-email") or claims.get("username", "")
    name = request.headers.get("x-capplan-user-name") or email
    p = Principal(sub=claims["sub"], email=email, name=name, groups=list(claims.get("cognito:groups", [])))
    now = datetime.now(timezone.utc)
    user = db.get(User, p.sub)
    if user is None:
        db.add(User(sub=p.sub, email=p.email, name=p.name, role=p.role, created_at=now, last_login_at=now))
    else:
        user.last_login_at, user.role = now, p.role
        if p.email:
            user.email = p.email
        if p.name:
            user.name = p.name
    db.commit()
    return p


def require_role(*roles: str):
    def dep(p: Principal = Depends(current_principal)) -> Principal:
        if p.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"requires role: {' or '.join(roles)}")
        return p

    return dep


require_operator = require_role("operator", "admin")
require_admin = require_role("admin")
