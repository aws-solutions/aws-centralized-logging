# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.2] - 2022-09-14

### Changed

- updated package versions
- utils logger/metrics moved up to flatten directory hierarchy

## [4.0.1] - 2021-12-05

### Added

- support for '+' in admin email address

### Changed

- aws-cdk updated to 1.132.0
- moved generic helpers to utils library, [logger](./source/services/utils/logger), [metrics](./source/services/utils/metrics)
- CloudWatch Logs destinations created with UUID appended to name for uniqueness

## [4.0.0] - 2020-12-15

### Added

- VPC with 2 isolated & 2 public subnets
- Elasticsearch domain in isolated subnets
- Kinesis Data Stream and Kinesis Firehose for data streaming
- CloudWatch Logs Destination for cross account/region data streaming
- Windows jumpbox for accessing kibana
- Security group for jumpbox
- Security group for ES and Kinesis resources

### Updated

- Elasticsearch V7.7
- Lambda log event transformer
- AWS CDK constructs for IaC

### Removed

- Spoke templates
- Cross account IAM role for Lambda (cross account streaming now uses CloudWatch Logs Destination)

## [3.2.1] - 2020-09-14

### Added

- SNS topic is now encrypted using KMS CMK
- Optional MFA support for Cognito users

### Updated

- Now uses CDK to create deployment templates
- Leverages AWS Solutions Contruct for Lambda/ElasticSearch/Kibana
- Updated to use Amazon Elasticsearch Service v7.7

### Removed

- Demo Access Logging bucket no longer enables versioning
- Removed global egress access from the VPC security group
- Removed all hard-coded logical resource IDs and names to enable multiple stacks to be deployed, such as for testing or migration

## [3.2] - 2019-12-18

### Added

- Backward-compatible to v3.0.0
- Includes all v3.0.1 changes
- Do NOT upgrade from v3.0.1 to v3.2

## [3.0.1] - 2019-11-29

### Added

- Uses SSM Parameters to retrieve the latest HVM x86_64 AMI
- Block public access to 2 buckets created for demo
- CLFullAccessUserRole replaces CognitoAuthorizedRole. It is associated with the Admin group. Initial user is placed in this group.
- CLReadOnlyAccessRole is added. It provides read-only access to users in UserPoolGroupROAccess. This is the default role for Authenticated users in the pool.

### Updated

- Nodejs8.10 to Nodejs12.x Lambda run time.
- Updated license to Apache License version 2.0
- Corrected Master_Role environmental variable in spoke template to MASTER_ROLE
- Updated demo EC2 instance to T3.MICRO
- Updated Nodejs deprecated buffer() to buffer.from()
- Removed python solution-helper from spoke template and replaced with the Nodejs version used by primary.
- Updated NOTICE.txt for 3rd party modules
- Replaced istanbul (deprecated) with nyc
- ElasticSearch version moved to a mapping parameter
- ElasticSearch cluster mappings consolidated under ElasticSearch for clarity/usability
- Tightened security on IAM roles to specific methods and resources

### Removed

- Unreferenced SolutionHelperRole in demo template
- Unreferenced S3 bucket mapping in demo template
- AMIInfo lookup Lambda
- CognitoUnAuthorizedRole / unauthenticated Cognito access

## [0.0.1] - 2019-09-09

### Added

- CHANGELOG template file to fix new pipeline standards

### Updated

- updated buildspec.yml to meet new pipeline build standards
- updated build-s3-dist.sh to meet new pipeline build standards
- updated run-unit-tests.sh for correct references to folders
- updated cloudformation templates to include a bucket for S3 access logs
- updated cloudformation template with correct lambda function environment variable key names
