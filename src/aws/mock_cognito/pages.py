"""Server-rendered HTML for the Hosted UI and the simulated AWS console."""

from __future__ import annotations

import html
import json

BASE_CSS = """
*{box-sizing:border-box}body{margin:0;font-family:"Amazon Ember",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#f2f3f3;color:#16191f}
a{color:#0972d3}
.banner{background:#232f3e;color:#fff;padding:10px 20px;font-size:14px;display:flex;align-items:center;gap:12px}
.banner b{font-size:18px;letter-spacing:.5px}.banner .sim{margin-left:auto;background:#ff9900;color:#16191f;padding:2px 8px;border-radius:3px;font-size:12px;font-weight:600}
.wrap{max-width:420px;margin:48px auto;padding:0 16px}
.card{background:#fff;border-radius:8px;box-shadow:0 1px 1px rgba(0,28,36,.3),1px 1px 1px rgba(0,28,36,.15),-1px 1px 1px rgba(0,28,36,.15);padding:28px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px}.muted{color:#5f6b7a;font-size:13px}
label{display:block;font-size:14px;font-weight:600;margin:16px 0 6px}
input[type=text],input[type=email],input[type=password]{width:100%;padding:8px 10px;border:1px solid #7d8998;border-radius:4px;font-size:14px}
button{margin-top:20px;width:100%;background:#ff9900;border:1px solid #ec7211;color:#16191f;font-weight:700;padding:9px 12px;border-radius:20px;font-size:14px;cursor:pointer}
button:hover{background:#ec7211}
.error{background:#fff7f7;border:1px solid #d91515;color:#d91515;padding:8px 12px;border-radius:4px;font-size:13px;margin-top:12px}
.hint{background:#f2f8fd;border:1px solid #0972d3;border-radius:4px;padding:10px 12px;font-size:12px;margin-top:20px;line-height:1.6}
code,pre{font-family:Monaco,Menlo,monospace;font-size:12px}
pre{background:#fafafa;border:1px solid #e9ebed;border-radius:4px;padding:10px;max-height:260px;overflow:auto}
.wide{max-width:760px}.row{display:flex;justify-content:space-between;border-bottom:1px solid #e9ebed;padding:8px 0;font-size:14px}.row span:first-child{color:#5f6b7a}
.check{display:flex;gap:8px;align-items:flex-start;font-size:13px;margin-top:16px;font-weight:400}
"""


def _page(title: str, body: str, banner: str = "Amazon Cognito") -> str:
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title><style>{BASE_CSS}</style></head><body>
<div class="banner"><b>aws</b><span>{html.escape(banner)}</span><span class="sim">SIMULATED — no real AWS</span></div>
{body}</body></html>"""


def login_page(params: dict, error: str | None, demo_users: list[dict]) -> str:
    hidden = "".join(
        f'<input type="hidden" name="{html.escape(k)}" value="{html.escape(str(v))}">' for k, v in params.items() if v is not None
    )
    err = f'<div class="error">{html.escape(error)}</div>' if error else ""
    hints = "".join(
        f"<div><code>{html.escape(u['email'])}</code> / <code>{html.escape(u['password'])}</code> — {html.escape(', '.join(u['groups']))}</div>"
        for u in demo_users
    )
    body = f"""<div class="wrap"><div class="card">
<h1>Sign in</h1><div class="muted">CapPlan Capacity Console · user pool <code>{html.escape(params.get('_pool', ''))}</code></div>
{err}
<form method="post" action="/login">{hidden}
<label for="username">Email</label><input id="username" name="username" type="email" autocomplete="username" required autofocus>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Sign in</button></form>
<div class="hint"><b>Demo users</b>{hints}</div>
</div></div>"""
    return _page("Sign in", body)


def error_page(title: str, message: str) -> str:
    body = f'<div class="wrap"><div class="card"><h1>{html.escape(title)}</h1><div class="error">{html.escape(message)}</div></div></div>'
    return _page(title, body)


def quickcreate_page(fields: dict, template: dict, permissions: dict) -> str:
    hidden = "".join(f'<input type="hidden" name="{html.escape(k)}" value="{html.escape(str(v))}">' for k, v in fields.items())
    acct = fields["accountId"]
    pretty = f"{acct[0:4]}-{acct[4:8]}-{acct[8:12]}" if len(acct) == 12 else acct
    body = f"""<div class="wrap wide"><div class="card">
<div class="muted">CloudFormation › Stacks › Quick create stack</div>
<h1>Quick create stack</h1>
<div class="muted">Signed in as <b>Admin</b> @ account <b>{html.escape(pretty)}</b> (simulated console session)</div>
<h2>Stack details</h2>
<div class="row"><span>Stack name</span><span><code>{html.escape(fields['stackName'])}</code></span></div>
<div class="row"><span>Template</span><span><code>capplan-access.json</code></span></div>
<div class="row"><span>ExternalId (parameter)</span><span><code>{html.escape(fields['externalId'])}</code></span></div>
<div class="row"><span>Trusted principal</span><span><code>{html.escape(template['Resources']['CapPlanRole']['Properties']['AssumeRolePolicyDocument']['Statement'][0]['Principal']['AWS'])}</code></span></div>
<h2>Permissions granted to CapPlan</h2>
<pre>{html.escape(json.dumps(permissions, indent=2))}</pre>
<h2>Template</h2>
<pre>{html.escape(json.dumps(template, indent=2))}</pre>
<form method="post" action="/console/cloudformation/quickcreate">{hidden}
<label class="check"><input type="checkbox" name="ack" value="1" required>I acknowledge that AWS CloudFormation might create IAM resources with custom names.</label>
<button type="submit">Create stack</button></form>
<form method="get" action="{html.escape(fields['redirectUri'])}"><input type="hidden" name="error" value="cancelled"><input type="hidden" name="state" value="{html.escape(fields.get('state',''))}">
<button type="submit" style="background:#fff;border-color:#7d8998">Cancel</button></form>
</div></div>"""
    return _page("Quick create stack", body, banner="CloudFormation")
