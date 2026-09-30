"""Local stand-ins for the AWS services in the reference architecture.

Everything talks to moto (``motoserver/moto`` in docker compose, or
``moto.mock_aws`` in tests) through ordinary boto3 clients, so swapping in a
real AWS account is a matter of removing ``AWS_ENDPOINT_URL`` and supplying
real credentials.
"""
