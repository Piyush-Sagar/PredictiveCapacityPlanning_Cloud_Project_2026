"""Cross-account "Connect AWS account" flow (CloudFormation quick-create +
IAM role with ExternalId), emulated against moto.

1. The platform issues an ExternalId and a quick-create link.
2. The (simulated) console deploys ``CapPlanAccess`` in the customer account:
   an IAM role trusting the platform account, conditioned on the ExternalId,
   with read access to CloudWatch / Cost Explorer and scaling rights on ECS.
3. The platform calls ``sts:AssumeRole`` with the ExternalId. Because moto
   does not evaluate trust policies, :func:`verify_and_assume` performs the
   check AWS would: principal and ExternalId must match.
"""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone

from botocore.exceptions import ClientError

from . import clients

ROLE_NAME = "CapPlanReadOnlyRole"
STACK_NAME = "CapPlanAccess"


class ConnectError(Exception):
    pass


def new_external_id() -> str:
    return "capplan-" + secrets.token_hex(8)


def trust_policy(external_id: str) -> dict:
    return {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"AWS": f"arn:aws:iam::{clients.PLATFORM_ACCOUNT_ID}:root"},
                "Action": "sts:AssumeRole",
                "Condition": {"StringEquals": {"sts:ExternalId": external_id}},
            }
        ],
    }


def permissions_policy() -> dict:
    return {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "ReadTelemetryAndCost",
                "Effect": "Allow",
                "Action": [
                    "cloudwatch:GetMetricData",
                    "cloudwatch:ListMetrics",
                    "cloudwatch:PutMetricData",
                    "ce:GetCostAndUsage",
                    "ce:GetCostForecast",
                ],
                "Resource": "*",
            },
            {
                "Sid": "GuardedScaling",
                "Effect": "Allow",
                "Action": [
                    "ecs:DescribeServices",
                    "ecs:UpdateService",
                    "ecs:CreateCluster",
                    "ecs:CreateService",
                    "ecs:RegisterTaskDefinition",
                    "application-autoscaling:RegisterScalableTarget",
                    "application-autoscaling:DescribeScalableTargets",
                ],
                "Resource": "*",
            },
        ],
    }


def stack_template(external_id: str) -> dict:
    return {
        "AWSTemplateFormatVersion": "2010-09-09",
        "Description": "Grants CapPlan predictive capacity planning read + guarded scaling access",
        "Resources": {
            "CapPlanRole": {
                "Type": "AWS::IAM::Role",
                "Properties": {
                    "RoleName": ROLE_NAME,
                    "AssumeRolePolicyDocument": trust_policy(external_id),
                    "Policies": [{"PolicyName": "CapPlanAccess", "PolicyDocument": permissions_policy()}],
                },
            }
        },
        "Outputs": {"RoleArn": {"Value": {"Fn::GetAtt": ["CapPlanRole", "Arn"]}}},
    }


def deploy_access_stack(account_id: str, external_id: str) -> dict:
    """Run by the simulated console *as the customer*. Idempotent."""
    iam = clients.customer_admin("iam", account_id)
    cfn = clients.customer_admin("cloudformation", account_id)
    stack_id = None
    try:
        iam.get_role(RoleName=ROLE_NAME)
        # Re-connect: refresh the trust policy with the new ExternalId.
        iam.update_assume_role_policy(RoleName=ROLE_NAME, PolicyDocument=json.dumps(trust_policy(external_id)))
    except ClientError:
        try:
            resp = cfn.create_stack(StackName=STACK_NAME, TemplateBody=json.dumps(stack_template(external_id)), Capabilities=["CAPABILITY_NAMED_IAM"])
            stack_id = resp["StackId"]
            iam.get_role(RoleName=ROLE_NAME)
        except ClientError:
            iam.create_role(RoleName=ROLE_NAME, AssumeRolePolicyDocument=json.dumps(trust_policy(external_id)))
            iam.put_role_policy(RoleName=ROLE_NAME, PolicyName="CapPlanAccess", PolicyDocument=json.dumps(permissions_policy()))
    role = iam.get_role(RoleName=ROLE_NAME)["Role"]
    return {
        "roleArn": role["Arn"],
        "stackId": stack_id or f"arn:aws:cloudformation:us-east-1:{account_id}:stack/{STACK_NAME}/{secrets.token_hex(6)}",
    }


def _trusts(doc, external_id: str) -> bool:
    if isinstance(doc, str):
        from urllib.parse import unquote

        doc = json.loads(unquote(doc))
    for st in doc.get("Statement", []):
        principal = st.get("Principal", {}).get("AWS", "")
        principals = principal if isinstance(principal, list) else [principal]
        ext = st.get("Condition", {}).get("StringEquals", {}).get("sts:ExternalId")
        if (
            st.get("Effect") == "Allow"
            and any(clients.PLATFORM_ACCOUNT_ID in p for p in principals)
            and ext == external_id
        ):
            return True
    return False


def verify_and_assume(role_arn: str, external_id: str, session: str = "capplan-planner") -> dict:
    """AssumeRole into the customer account; returns temporary credentials."""
    try:
        account_id = role_arn.split(":")[4]
    except IndexError as exc:
        raise ConnectError("malformed role ARN") from exc
    try:
        role = clients.customer_admin("iam", account_id).get_role(RoleName=role_arn.rsplit("/", 1)[-1])["Role"]
    except ClientError as exc:
        raise ConnectError(f"role {role_arn} not found — was the CloudFormation stack created?") from exc
    if not _trusts(role["AssumeRolePolicyDocument"], external_id):
        raise ConnectError("AccessDenied: trust policy does not allow this platform with the given ExternalId")
    creds = clients.platform("sts").assume_role(
        RoleArn=role_arn, RoleSessionName=session, ExternalId=external_id, DurationSeconds=3600
    )["Credentials"]
    ident = clients.assumed("sts", creds).get_caller_identity()
    if ident["Account"] != account_id:
        raise ConnectError("assumed identity does not match target account")
    exp = creds["Expiration"]
    return {
        "AccessKeyId": creds["AccessKeyId"],
        "SecretAccessKey": creds["SecretAccessKey"],
        "SessionToken": creds["SessionToken"],
        "Expiration": exp.isoformat() if isinstance(exp, datetime) else str(exp),
        "AssumedRoleArn": ident["Arn"],
        "AssumedAt": datetime.now(timezone.utc).isoformat(),
    }
