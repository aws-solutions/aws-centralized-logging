# AWS Centralized Logging Solution

Centralized Logging is a reference implementation that provides a foundation for logging to a centralized account. Customers can leverage the solution to index CloudTrail Logs, CW Logs, VPC Flow Logs on a ElasticSearch domain. The logs can then be searched on different fields.

The solution supports spoke accounts and regions and gives a single pane to gain actionable insight into the logs using Kibana.

_Note:_ For any relavant information outside the scope of this readme, please refer to the solution landing page and implementation guide.

**[🚀Solution Landing Page](https://aws.amazon.com/solutions/implementations/centralized-logging/)** | **[🚧Feature request](https://github.com/awslabs/aws-centralized-logging/issues/new?assignees=&labels=feature-request%2C+enhancement&template=feature_request.md&title=)** | **[🐛Bug Report](https://github.com/awslabs/aws-centralized-logging/issues/new?assignees=&labels=bug%2C+triage&template=bug_report.md&title=)** | **[📜Documentation Improvement](https://github.com/awslabs/aws-centralized-logging/issues/new?assignees=&labels=document-update&template=documentation_improvements.md&title=)**

## Table of content

- [Installation](#installing-pre-packaged-solution-template)
- [Customization](#customization)
  - [Setup](#setup)
  - [Changes](#changes)
  - [Unit Test](#unit-test)
  - [Build](#build)
  - [Deploy](#deploy)
- [Sample Scenario](#sample-scenario)
- [File Structure](#file-structure)
- [License](#license)

## Installing pre-packaged solution template

- Primary Template: [aws-centralized-logging.template](https://solutions-reference.s3.amazonaws.com/centralized-logging/latest/aws-centralized-logging.template)

- Demo Template: [Demo.template](https://solutions-reference.s3.amazonaws.com/centralized-logging/latest/aws-centralized-logging-demo.template)

## Customization

- Prerequisite: Node.js>10

### Setup

Clone the repository and run the following commands to install dependencies, format and lint as per the project standards

```
npm i
npm run prettier-format
npm run lint
```

### Changes

You may make any needed change as per your requirement. If you want to customize the Centralized Logging opinionated defaults, you can modify the [solution manifest file](./source/resources/lib/manifest.json). You can also control sending solution usage metrics to aws-solutions, from the manifest file.

```
"solutionVersion": "%%VERSION%%", #provide a valid value eg. v1.0
"sendMetric": "Yes",
```

Addtionally, you can customize the code and add any extension to the solution. Please review our [feature request guidelines](./.github/ISSUE_TEMPLATE/feature_request.md), if you want to submit a PR.

### Unit Test

You can run unit tests with the following command from the root of the project

```
 npm run test
```

### Build

You can build lambda binaries with the following command from the root of the project

```
 npm run build
```

### Deploy

Run the following command from the root of the project. Deploys all the primary solution components needed for centralized logging. **Deploy in Primary Account**

```
cd source/resources
npm i
```

```
./node_modules/aws-cdk/bin/cdk bootstrap --profile <PROFILE_NAME>
./node_modules/aws-cdk/bin/cdk synth CL-PrimaryStack
./node_modules/aws-cdk/bin/cdk deploy CL-PrimaryStack --parameters AdminEmail=<EMAIL> --parameters SpokeAccounts=<ACCOUNT-ID-1,ACCOUNT-ID-2...> --parameters JumpboxKey=<EC2_KEY_PAIR> --parameters JumpboxDeploy='Yes' --profile <PROFILE_NAME>
```

_Note:_ for PROFILE_NAME, substitute the name of an AWS CLI profile that contains appropriate credentials for deploying in your preferred region.

## Sample Scenario (Enabling CloudWatch logging on Elasticsearch domain)

The default deployment uses opinionated values as setup in [solution manifest file](./source/resources/lib/manifest.json). In this scenario let's say we want to enable CloudWatch logging for ES domain.

You would need to update the **ESDomain** resource in cl-primary-stack.ts as below:

```
 logging: {
        slowSearchLogEnabled: true,
        appLogEnabled: true,
        slowIndexLogEnabled: true,
      },
```

## File structure

AWS Centralized Logging solution consists of:

- cdk constructs to generate needed resources
- helper for bootstrapping purposes like creating CloudWatch Logs Destinations
- transformer to translate kinesis data stream records into Elasticsearch documents

<pre>
|-deployment/
  |dashboard                      [ sample dashboard for demo ]  
  |build-scripts/                 [ build scripts ]
|-source/
  |-resources
    |-bin/
      |-app.ts                    [ entry point for CDK app ]
    |-__tests__/                  [ unit tests for CDK constructs ] 
    |-lib/
      |-cl-demo-ec2-construct.ts  [ CDK construct for demo web server resource ]
      |-cl-demo-stack.ts          [ CDK construct for demo stack]
      |-cl-jumpbox-construct.ts   [ CDK construct for windows jumpbox resource ]  
      |-cl-primary-stack.ts       [ CDK construct for primary stack and related resources ]  
      |-manifest.json             [ manifest file for CDK resources ]
    |-config_files                [ tsconfig, jest.config.js, package.json etc. ]
  |-services/
    |-helper/                     [ lambda backed helper custom resource to help with solution launch/update/delete ]
    |-transformer/                [ microservice to translate kinesis records into es documents ]
      |-__tests/                  [ unit tests for all policy managers ]   
      |-lib/
        |-common/                 [ common moduel for logging and metrics collection ]
      |-index.ts                  [ entry point for lambda function]     
      |-config_files              [ tsconfig, jest.config.js, package.json etc. ]
  |-config_files                  [ eslint, prettier, tsconfig, jest.config.js, package.json etc. ]  
</pre>

## License

See license [here](./LICENSE.txt)
