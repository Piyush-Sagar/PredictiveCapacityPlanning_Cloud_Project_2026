"""boto3 client factory.

* platform clients act as the CapPlan SaaS account (moto's default account);
* customer-admin clients act *inside* a customer account, used only by the
  simulated console when it deploys the cross-account access stack;
* assumed clients use temporary STS credentials obtained by AssumeRole.
"""

from __future__ import annotations

import os
from functools import lru_cache

import boto3
from botocore.config import Config

PLATFORM_ACCOUNT_ID = "123456789012"
HOME_REGION = "us-east-1"

# Dashboard regions → AWS regions.
AWS_REGION = {
    "us-east": "us-east-1",
    "us-west": "us-west-2",
    "eu-west": "eu-west-1",
    "ap-south": "ap-south-1",
    "sa-east": "sa-east-1",
}

_CFG = Config(retries={"max_attempts": 2, "mode": "standard"}, connect_timeout=3, read_timeout=10)


def endpoint_url() -> str | None:
    return os.environ.get("AWS_ENDPOINT_URL") or None


def _client(service: str, region: str, **creds):
    return boto3.client(
        service,
        region_name=region,
        endpoint_url=endpoint_url(),
        aws_access_key_id=creds.get("AccessKeyId", "test"),
        aws_secret_access_key=creds.get("SecretAccessKey", "test"),
        aws_session_token=creds.get("SessionToken"),
        config=_CFG,
    )


@lru_cache(maxsize=64)
def platform(service: str, region: str = HOME_REGION):
    return _client(service, region)


def customer_admin(service: str, account_id: str, region: str = HOME_REGION):
    """Client acting as an administrator of ``account_id`` (moto header routing)."""
    c = _client(service, region)

    def _inject(request, **_):
        request.headers["x-moto-account-id"] = account_id

    c.meta.events.register("before-send.*.*", _inject)
    return c


def assumed(service: str, creds: dict, region: str = HOME_REGION):
    return _client(service, region, **creds)


def reset_cache() -> None:
    platform.cache_clear()
