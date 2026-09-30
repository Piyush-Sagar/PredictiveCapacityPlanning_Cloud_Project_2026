# AWS (simulated)

No real AWS account is used anywhere. Two packages:

## `mock_aws` — boto3 against moto

* `clients.py`: platform clients (the CapPlan SaaS account, `123456789012`),
  customer-admin clients (moto `x-moto-account-id` routing, used only by the
  simulated console), and clients using assumed-role credentials.
* `sts_connect.py`: the cross-account connect flow. A CloudFormation stack
  (`CapPlanAccess`) creates `CapPlanReadOnlyRole`, which trusts the platform
  on condition of a per-connection **ExternalId**. `verify_and_assume` checks
  the trust policy the way AWS would, since moto doesn't evaluate it, then
  calls `sts:AssumeRole`.
* `resources.py`: platform bootstrap (S3 buckets, SNS topic + SQS/email
  subscribers); per-account ECS cluster, services and scalable targets in the
  real AWS region names; `UpdateService` scaling; CloudWatch metrics.
* `cost_explorer.py`: `GetCostAndUsage` / `GetCostForecast` response shapes
  computed from simulated unit-hours × on-demand pricing.

Swapping in real AWS means unsetting `AWS_ENDPOINT_URL`, supplying real
credentials and deploying the stack template from `sts_connect.stack_template`.

## `mock_cognito` — user pool + Hosted UI

`uvicorn mock_cognito.app:app --port 9229`

* `/oauth2/authorize` → Hosted UI login → `/oauth2/token`: authorization code
  with **PKCE (S256) required**, one-time codes, registered redirect URIs only
* RS256 ID and access tokens with `cognito:groups`, refresh tokens (no
  rotation, as in Cognito), `/oauth2/userInfo`, `/oauth2/revoke`, `/logout`
* `/{pool}/.well-known/jwks.json` and OIDC discovery
* `/console/cloudformation/quickcreate`: the simulated console page used by
  "Connect AWS account"

Demo users and passwords are configurable with `COGNITO_DEMO_USERS` (JSON).
