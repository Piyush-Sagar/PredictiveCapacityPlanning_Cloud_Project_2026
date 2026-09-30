"""Mock Amazon Cognito user pool: Hosted UI + OAuth2 authorization-code flow
with PKCE (S256), RS256-signed ID/access tokens, refresh tokens, JWKS and
OIDC discovery. Also serves the simulated CloudFormation quick-create page
used by the "Connect AWS account" flow.

Run:  uvicorn mock_cognito.app:app --port 9229
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlencode, urlparse

import jwt
from fastapi import FastAPI, Form, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from mock_aws import sts_connect

from .keys import SigningKey
from .pages import error_page, login_page, quickcreate_page

PUBLIC_URL = os.environ.get("COGNITO_PUBLIC_URL", "http://localhost:9229").rstrip("/")
POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "us-east-1_CapPlanDemo")
CLIENT_ID = os.environ.get("COGNITO_CLIENT_ID", "capplan-web")
ALLOWED_REDIRECT_PREFIXES = [
    p.strip() for p in os.environ.get("COGNITO_ALLOWED_REDIRECTS", "http://localhost:3000/").split(",") if p.strip()
]
ACCESS_TTL = int(os.environ.get("COGNITO_ACCESS_TTL_SECONDS", "3600"))
KEY_DIR = Path(os.environ.get("COGNITO_KEY_DIR", Path(__file__).resolve().parents[3] / ".keys"))
ISSUER = f"{PUBLIC_URL}/{POOL_ID}"

DEMO_USERS = json.loads(
    os.environ.get(
        "COGNITO_DEMO_USERS",
        json.dumps(
            [
                {"email": "operator@capplan.example", "password": "Operator#2026", "name": "Ops Operator", "groups": ["operators"]},
                {"email": "admin@capplan.example", "password": "Admin#2026", "name": "Platform Admin", "groups": ["admins", "operators"]},
            ]
        ),
    )
)
for u in DEMO_USERS:
    u["sub"] = str(uuid.uuid5(uuid.NAMESPACE_URL, f"capplan:{u['email']}"))

key = SigningKey(KEY_DIR)
SESSION_SECRET = hashlib.sha256(key.pem()).digest()


@dataclass
class AuthCode:
    user: dict
    client_id: str
    redirect_uri: str
    challenge: str | None
    method: str | None
    scope: str
    nonce: str | None
    expires: float = field(default_factory=lambda: time.time() + 300)


CODES: dict[str, AuthCode] = {}
REFRESH: dict[str, dict] = {}

app = FastAPI(title="Mock Amazon Cognito", version="1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"]
)


# --------------------------------------------------------------------------- helpers


def _find_user(email: str) -> dict | None:
    return next((u for u in DEMO_USERS if u["email"].lower() == email.strip().lower()), None)


def _redirect_allowed(uri: str) -> bool:
    return any(uri.startswith(p) for p in ALLOWED_REDIRECT_PREFIXES)


def _sign_session(sub: str) -> str:
    exp = str(int(time.time()) + 8 * 3600)
    mac = hmac.new(SESSION_SECRET, f"{sub}.{exp}".encode(), hashlib.sha256).hexdigest()
    return f"{sub}.{exp}.{mac}"


def _read_session(value: str | None) -> dict | None:
    if not value:
        return None
    try:
        sub, exp, mac = value.split(".")
    except ValueError:
        return None
    good = hmac.new(SESSION_SECRET, f"{sub}.{exp}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(good, mac) or int(exp) < time.time():
        return None
    return next((u for u in DEMO_USERS if u["sub"] == sub), None)


def _s256(verifier: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()


def _issue_tokens(user: dict, client_id: str, scope: str, nonce: str | None, auth_time: int) -> dict:
    now = int(time.time())
    common = {"sub": user["sub"], "iss": ISSUER, "cognito:groups": user["groups"], "auth_time": auth_time, "iat": now, "exp": now + ACCESS_TTL}
    headers = {"kid": key.kid}
    access = jwt.encode(
        {**common, "token_use": "access", "client_id": client_id, "scope": scope, "username": user["email"], "jti": str(uuid.uuid4())},
        key.pem(),
        algorithm="RS256",
        headers=headers,
    )
    id_claims = {
        **common,
        "aud": client_id,
        "token_use": "id",
        "email": user["email"],
        "email_verified": True,
        "name": user["name"],
        "cognito:username": user["email"],
    }
    if nonce:
        id_claims["nonce"] = nonce
    id_token = jwt.encode(id_claims, key.pem(), algorithm="RS256", headers=headers)
    refresh = secrets.token_urlsafe(48)
    REFRESH[refresh] = {"user": user, "client_id": client_id, "scope": scope}
    return {
        "access_token": access,
        "id_token": id_token,
        "refresh_token": refresh,
        "token_type": "Bearer",
        "expires_in": ACCESS_TTL,
    }


# --------------------------------------------------------------------------- OIDC discovery / JWKS


@app.get("/health")
def health():
    return {"status": "ok", "issuer": ISSUER}


@app.get("/.well-known/jwks.json")
@app.get(f"/{POOL_ID}/.well-known/jwks.json")
def jwks():
    return key.jwks()


@app.get(f"/{POOL_ID}/.well-known/openid-configuration")
@app.get("/.well-known/openid-configuration")
def discovery():
    return {
        "issuer": ISSUER,
        "authorization_endpoint": f"{PUBLIC_URL}/oauth2/authorize",
        "token_endpoint": f"{PUBLIC_URL}/oauth2/token",
        "userinfo_endpoint": f"{PUBLIC_URL}/oauth2/userInfo",
        "end_session_endpoint": f"{PUBLIC_URL}/logout",
        "jwks_uri": f"{PUBLIC_URL}/{POOL_ID}/.well-known/jwks.json",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "id_token_signing_alg_values_supported": ["RS256"],
        "scopes_supported": ["openid", "email", "profile"],
        "subject_types_supported": ["public"],
    }


# --------------------------------------------------------------------------- Hosted UI


@app.get("/oauth2/authorize")
@app.get("/login")
def authorize(
    request: Request,
    response_type: str = "code",
    client_id: str = "",
    redirect_uri: str = "",
    state: str | None = None,
    scope: str = "openid email profile",
    code_challenge: str | None = None,
    code_challenge_method: str | None = None,
    nonce: str | None = None,
    prompt: str | None = None,
):
    if client_id != CLIENT_ID:
        return HTMLResponse(error_page("invalid_client", "Unknown app client id."), status_code=400)
    if not _redirect_allowed(redirect_uri):
        return HTMLResponse(error_page("redirect_mismatch", "redirect_uri is not registered for this app client."), status_code=400)
    if response_type != "code":
        return HTMLResponse(error_page("unsupported_response_type", "Only the authorization code grant is enabled."), status_code=400)
    if not code_challenge or code_challenge_method != "S256":
        return HTMLResponse(error_page("invalid_request", "PKCE (code_challenge with S256) is required for public clients."), status_code=400)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": scope,
        "code_challenge": code_challenge,
        "code_challenge_method": code_challenge_method,
        "nonce": nonce,
    }
    user = _read_session(request.cookies.get("cognito"))
    if user and prompt != "login":
        return _complete_login(user, params)
    return HTMLResponse(login_page({**params, "_pool": POOL_ID}, None, DEMO_USERS))


def _complete_login(user: dict, params: dict) -> RedirectResponse:
    code = secrets.token_urlsafe(32)
    CODES[code] = AuthCode(
        user=user,
        client_id=params["client_id"],
        redirect_uri=params["redirect_uri"],
        challenge=params.get("code_challenge"),
        method=params.get("code_challenge_method"),
        scope=params.get("scope") or "openid",
        nonce=params.get("nonce"),
    )
    q = {"code": code}
    if params.get("state"):
        q["state"] = params["state"]
    resp = RedirectResponse(f"{params['redirect_uri']}?{urlencode(q)}", status_code=302)
    resp.set_cookie("cognito", _sign_session(user["sub"]), httponly=True, samesite="lax", max_age=8 * 3600)
    return resp


@app.post("/login")
def login_submit(
    username: str = Form(...),
    password: str = Form(...),
    client_id: str = Form(...),
    redirect_uri: str = Form(...),
    state: str | None = Form(None),
    scope: str = Form("openid email profile"),
    code_challenge: str = Form(...),
    code_challenge_method: str = Form("S256"),
    nonce: str | None = Form(None),
):
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": scope,
        "code_challenge": code_challenge,
        "code_challenge_method": code_challenge_method,
        "nonce": nonce,
    }
    if client_id != CLIENT_ID or not _redirect_allowed(redirect_uri):
        return HTMLResponse(error_page("invalid_request", "Invalid client or redirect."), status_code=400)
    user = _find_user(username)
    if not user or not hmac.compare_digest(user["password"], password):
        return HTMLResponse(login_page({**params, "_pool": POOL_ID}, "Incorrect username or password.", DEMO_USERS), status_code=401)
    return _complete_login(user, params)


@app.post("/oauth2/token")
def token(
    grant_type: str = Form(...),
    client_id: str = Form(...),
    code: str | None = Form(None),
    redirect_uri: str | None = Form(None),
    code_verifier: str | None = Form(None),
    refresh_token: str | None = Form(None),
):
    def err(e: str, desc: str, status: int = 400):
        return JSONResponse({"error": e, "error_description": desc}, status_code=status)

    if client_id != CLIENT_ID:
        return err("invalid_client", "unknown client", 401)
    if grant_type == "authorization_code":
        ac = CODES.pop(code or "", None)
        if not ac or ac.expires < time.time():
            return err("invalid_grant", "authorization code is invalid or expired")
        if ac.client_id != client_id or ac.redirect_uri != redirect_uri:
            return err("invalid_grant", "redirect_uri or client mismatch")
        if not code_verifier or _s256(code_verifier) != ac.challenge:
            return err("invalid_grant", "PKCE verification failed")
        return _issue_tokens(ac.user, client_id, ac.scope, ac.nonce, int(time.time()))
    if grant_type == "refresh_token":
        entry = REFRESH.get(refresh_token or "")
        if not entry or entry["client_id"] != client_id:
            return err("invalid_grant", "refresh token is invalid")
        out = _issue_tokens(entry["user"], client_id, entry["scope"], None, int(time.time()))
        # Cognito does not rotate refresh tokens by default.
        REFRESH.pop(out["refresh_token"], None)
        out["refresh_token"] = refresh_token
        return out
    return err("unsupported_grant_type", grant_type)


@app.get("/oauth2/userInfo")
def userinfo(authorization: str = Header("")):
    tok = authorization.removeprefix("Bearer ").strip()
    try:
        claims = jwt.decode(tok, key.private.public_key(), algorithms=["RS256"], issuer=ISSUER)
    except jwt.PyJWTError as exc:
        raise HTTPException(401, f"invalid token: {exc}") from exc
    user = next((u for u in DEMO_USERS if u["sub"] == claims["sub"]), None)
    if not user:
        raise HTTPException(401, "unknown user")
    return {"sub": user["sub"], "email": user["email"], "email_verified": "true", "name": user["name"], "username": user["email"]}


@app.get("/logout")
def logout(client_id: str = "", logout_uri: str = ""):
    target = logout_uri if client_id == CLIENT_ID and _redirect_allowed(logout_uri) else "/health"
    resp = RedirectResponse(target, status_code=302)
    resp.delete_cookie("cognito")
    return resp


@app.post("/oauth2/revoke")
def revoke(token: str = Form(...), client_id: str = Form(...)):
    REFRESH.pop(token, None)
    return {}


# --------------------------------------------------------------------------- simulated console (connect account)


@app.get("/console/cloudformation/quickcreate", response_class=HTMLResponse)
def quickcreate(
    accountId: str,
    externalId: str,
    redirectUri: str,
    state: str = "",
    stackName: str = sts_connect.STACK_NAME,
):
    if not _redirect_allowed(redirectUri):
        return HTMLResponse(error_page("Invalid redirect", "The callback URL is not registered."), status_code=400)
    if not (accountId.isdigit() and len(accountId) == 12):
        return HTMLResponse(error_page("Invalid account", "AWS account IDs are 12 digits."), status_code=400)
    fields = {"accountId": accountId, "externalId": externalId, "redirectUri": redirectUri, "state": state, "stackName": stackName}
    return quickcreate_page(fields, sts_connect.stack_template(externalId), sts_connect.permissions_policy())


@app.post("/console/cloudformation/quickcreate")
def quickcreate_submit(
    accountId: str = Form(...),
    externalId: str = Form(...),
    redirectUri: str = Form(...),
    state: str = Form(""),
    stackName: str = Form(sts_connect.STACK_NAME),
    ack: str | None = Form(None),
):
    if not _redirect_allowed(redirectUri):
        return HTMLResponse(error_page("Invalid redirect", "The callback URL is not registered."), status_code=400)
    if ack != "1":
        return HTMLResponse(error_page("Capabilities required", "You must acknowledge IAM resource creation."), status_code=400)
    try:
        out = sts_connect.deploy_access_stack(accountId, externalId)
    except Exception as exc:  # noqa: BLE001 - surface any moto/botocore error to the user
        return HTMLResponse(error_page("Stack creation failed", str(exc)), status_code=502)
    q = urlencode({"roleArn": out["roleArn"], "stackId": out["stackId"], "state": state, "accountId": accountId})
    sep = "&" if urlparse(redirectUri).query else "?"
    return RedirectResponse(f"{redirectUri}{sep}{q}", status_code=303)
