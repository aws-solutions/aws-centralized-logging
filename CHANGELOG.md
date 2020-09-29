# Change Log
 All notable changes to this project will be documented in this file.
 
 The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
 and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.2] - BUGFIX 2020-09-28
- Changed Cognito user pool to only allow account creation by the Cognito Admin user

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
