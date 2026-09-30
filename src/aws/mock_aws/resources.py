"""Platform bootstrap and customer-account resource operations."""

from __future__ import annotations

import json
from datetime import datetime

from botocore.exceptions import ClientError

from . import clients

RAW_BUCKET = "capplan-raw"
CURATED_BUCKET = "capplan-curated"
ALERT_TOPIC = "capplan-alerts"
ALERT_INBOX = "capplan-alerts-inbox"
CLUSTER = "capplan-streaming"
METRIC_NAMESPACE = "CapPlan/Streaming"


def service_name(region: str, resource: str) -> str:
    return f"{region}-{resource}"


# --------------------------------------------------------------------------- platform


def bootstrap_platform() -> dict:
    s3 = clients.platform("s3")
    for b in (RAW_BUCKET, CURATED_BUCKET):
        try:
            s3.create_bucket(Bucket=b)
        except ClientError as exc:
            if exc.response["Error"]["Code"] not in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists"):
                raise
    sns = clients.platform("sns")
    topic_arn = sns.create_topic(Name=ALERT_TOPIC)["TopicArn"]
    sqs = clients.platform("sqs")
    queue_url = sqs.create_queue(QueueName=ALERT_INBOX)["QueueUrl"]
    queue_arn = sqs.get_queue_attributes(QueueUrl=queue_url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
    subs = sns.list_subscriptions_by_topic(TopicArn=topic_arn)["Subscriptions"]
    if not any(s["Endpoint"] == queue_arn for s in subs):
        sns.subscribe(TopicArn=topic_arn, Protocol="sqs", Endpoint=queue_arn)
        sns.subscribe(TopicArn=topic_arn, Protocol="email", Endpoint="oncall@capplan.example")
    return {"topicArn": topic_arn, "queueUrl": queue_url, "buckets": [RAW_BUCKET, CURATED_BUCKET]}


def upload_file(bucket: str, key: str, path) -> None:
    clients.platform("s3").upload_file(str(path), bucket, key)


def publish_alert(topic_arn: str, subject: str, payload: dict) -> str:
    resp = clients.platform("sns").publish(
        TopicArn=topic_arn,
        Subject=subject[:99],
        Message=json.dumps(payload, default=str),
        MessageAttributes={"severity": {"DataType": "String", "StringValue": str(payload.get("severity", "info"))}},
    )
    return resp["MessageId"]


def recent_notifications(queue_url: str, limit: int = 10) -> list[dict]:
    sqs = clients.platform("sqs")
    msgs = sqs.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=min(limit, 10), VisibilityTimeout=0).get("Messages", [])
    out = []
    for m in msgs:
        body = json.loads(m["Body"])
        out.append({"messageId": body.get("MessageId"), "subject": body.get("Subject"), "timestamp": body.get("Timestamp")})
    return out


# --------------------------------------------------------------------------- customer account


def bootstrap_account(creds: dict, regions: list[str], resources: list[str], initial_units: dict) -> list[dict]:
    """ECS cluster + one service per (region, resource) with an Application
    Auto Scaling scalable target, in the customer's account."""
    created = []
    for region in regions:
        aws_region = clients.AWS_REGION[region]
        ecs = clients.assumed("ecs", creds, aws_region)
        aas = clients.assumed("application-autoscaling", creds, aws_region)
        ecs.create_cluster(clusterName=CLUSTER)
        for resource in resources:
            family = f"capplan-{resource}"
            ecs.register_task_definition(
                family=family,
                requiresCompatibilities=["FARGATE"],
                networkMode="awsvpc",
                cpu="4096",
                memory="8192",
                containerDefinitions=[{"name": resource, "image": f"public.ecr.aws/capplan/{resource}:latest", "essential": True}],
            )
            name = service_name(region, resource)
            units = int(initial_units[(region, resource)])
            existing = ecs.describe_services(cluster=CLUSTER, services=[name])["services"]
            if existing and existing[0].get("status") == "ACTIVE":
                ecs.update_service(cluster=CLUSTER, service=name, desiredCount=units)
            else:
                ecs.create_service(cluster=CLUSTER, serviceName=name, taskDefinition=family, desiredCount=units, launchType="FARGATE")
            aas.register_scalable_target(
                ServiceNamespace="ecs",
                ResourceId=f"service/{CLUSTER}/{name}",
                ScalableDimension="ecs:service:DesiredCount",
                MinCapacity=1,
                MaxCapacity=2000,
            )
            created.append({"region": aws_region, "service": name, "desiredCount": units})
    return created


def set_desired_count(creds: dict, region: str, resource: str, units: int) -> int:
    ecs = clients.assumed("ecs", creds, clients.AWS_REGION[region])
    resp = ecs.update_service(cluster=CLUSTER, service=service_name(region, resource), desiredCount=int(units))
    return int(resp["service"]["desiredCount"])


def describe_desired_counts(creds: dict, region: str, resources: list[str]) -> dict[str, int]:
    ecs = clients.assumed("ecs", creds, clients.AWS_REGION[region])
    names = [service_name(region, r) for r in resources]
    svcs = ecs.describe_services(cluster=CLUSTER, services=names)["services"]
    return {s["serviceName"][len(region) + 1 :]: s["desiredCount"] for s in svcs}


def put_metrics(creds: dict, region: str, ts: datetime, values: dict[str, float]) -> None:
    cw = clients.assumed("cloudwatch", creds, clients.AWS_REGION[region])
    cw.put_metric_data(
        Namespace=METRIC_NAMESPACE,
        MetricData=[
            {"MetricName": k, "Timestamp": ts, "Value": float(v), "Dimensions": [{"Name": "Region", "Value": region}]}
            for k, v in values.items()
        ],
    )
