import pytest
from moto import mock_aws

from mock_aws import clients, resources, sts_connect


@pytest.fixture
def aws():
    with mock_aws():
        clients.reset_cache()
        yield
    clients.reset_cache()


def test_connect_flow_assumes_into_customer_account(aws):
    ext = sts_connect.new_external_id()
    out = sts_connect.deploy_access_stack("111122223333", ext)
    assert out["roleArn"] == "arn:aws:iam::111122223333:role/CapPlanReadOnlyRole"
    creds = sts_connect.verify_and_assume(out["roleArn"], ext)
    assert ":111122223333:" in creds["AssumedRoleArn"]
    # Resources created with the assumed credentials land in the customer account.
    resources.bootstrap_account(creds, ["us-east"], ["ecs-task"], {("us-east", "ecs-task"): 5})
    assert resources.set_desired_count(creds, "us-east", "ecs-task", 9) == 9
    ecs = clients.assumed("ecs", creds, "us-east-1")
    svc = ecs.describe_services(cluster=resources.CLUSTER, services=["us-east-ecs-task"])["services"][0]
    assert svc["desiredCount"] == 9 and ":111122223333:" in svc["serviceArn"]


def test_wrong_external_id_is_denied(aws):
    out = sts_connect.deploy_access_stack("444455556666", "capplan-right")
    with pytest.raises(sts_connect.ConnectError, match="ExternalId"):
        sts_connect.verify_and_assume(out["roleArn"], "capplan-wrong")


def test_missing_stack_is_reported(aws):
    with pytest.raises(sts_connect.ConnectError, match="not found"):
        sts_connect.verify_and_assume("arn:aws:iam::777788889999:role/CapPlanReadOnlyRole", "x")
