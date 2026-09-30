import jwt

from conftest import REDIRECT, login, pkce_pair


def test_pkce_login_issues_verifiable_tokens(cognito):
    tokens = login(cognito, "admin@capplan.example", "Admin#2026")
    jwks = cognito.get("/.well-known/jwks.json").json()
    key = jwt.PyJWK(jwks["keys"][0]).key
    access = jwt.decode(tokens["access_token"], key, algorithms=["RS256"], issuer="http://localhost:9229/us-east-1_CapPlanDemo")
    assert access["token_use"] == "access" and access["client_id"] == "capplan-web"
    assert "admins" in access["cognito:groups"]
    idt = jwt.decode(tokens["id_token"], key, algorithms=["RS256"], audience="capplan-web", issuer="http://localhost:9229/us-east-1_CapPlanDemo")
    assert idt["email"] == "admin@capplan.example"


def test_wrong_password_and_bad_verifier_rejected(cognito):
    _, challenge = pkce_pair()
    form = {
        "username": "operator@capplan.example", "password": "nope", "client_id": "capplan-web",
        "redirect_uri": REDIRECT, "code_challenge": challenge, "code_challenge_method": "S256",
    }
    assert cognito.post("/login", data=form, follow_redirects=False).status_code == 401
    form["password"] = "Operator#2026"
    r = cognito.post("/login", data=form, follow_redirects=False)
    code = r.headers["location"].split("code=")[1].split("&")[0]
    bad = cognito.post(
        "/oauth2/token",
        data={"grant_type": "authorization_code", "client_id": "capplan-web", "code": code, "redirect_uri": REDIRECT, "code_verifier": "x" * 50},
    )
    assert bad.status_code == 400 and bad.json()["error"] == "invalid_grant"


def test_authorize_requires_pkce_and_registered_redirect(cognito):
    base = {"response_type": "code", "client_id": "capplan-web", "redirect_uri": REDIRECT}
    assert cognito.get("/oauth2/authorize", params=base).status_code == 400
    _, ch = pkce_pair()
    evil = {**base, "redirect_uri": "https://evil.example/cb", "code_challenge": ch, "code_challenge_method": "S256"}
    assert cognito.get("/oauth2/authorize", params=evil).status_code == 400


def test_refresh_token(cognito):
    tokens = login(cognito, "operator@capplan.example", "Operator#2026")
    r = cognito.post("/oauth2/token", data={"grant_type": "refresh_token", "client_id": "capplan-web", "refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200 and r.json()["access_token"]
    assert r.json()["refresh_token"] == tokens["refresh_token"]  # Cognito does not rotate by default
