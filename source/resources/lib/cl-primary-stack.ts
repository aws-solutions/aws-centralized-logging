// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * This is the Primary Stack for Centralized Logging on AWS
 * @author @aws-solutions
 */

import {
  FlowLogDestination,
  FlowLogTrafficType,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import {
  Code,
  Function,
  Runtime,
  StartingPosition,
} from "aws-cdk-lib/aws-lambda";
import {
  App,
  Aspects,
  CfnCondition,
  CfnMapping,
  CfnOutput,
  CfnParameter,
  CfnResource,
  CustomResource,
  Duration,
  Fn,
  NestedStack,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import {
  CfnDomain,
  Domain,
  ElasticsearchVersion,
  TLSSecurityPolicy,
} from "aws-cdk-lib/aws-elasticsearch";
import {
  AccountRecovery,
  CfnIdentityPool,
  CfnIdentityPoolRoleAttachment,
  CfnUserPool,
  CfnUserPoolUser,
  UserPool,
} from "aws-cdk-lib/aws-cognito";
import {
  ArnPrincipal,
  CfnRole,
  Effect,
  FederatedPrincipal,
  Policy,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Stream, StreamEncryption } from "aws-cdk-lib/aws-kinesis";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import { CfnDeliveryStream } from "aws-cdk-lib/aws-kinesisfirehose";
import { LogGroup, LogStream, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Jumpbox } from "./cl-jumpbox-construct";
import { KinesisEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Queue, QueueEncryption } from "aws-cdk-lib/aws-sqs";
import { Topic } from "aws-cdk-lib/aws-sns";
import { Alias, IAlias } from "aws-cdk-lib/aws-kms";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { CLDemo } from "./cl-demo-stack";
import {
  applyCfnNagSuppressRules,
  applyDependsOn,
  cfn_suppress_rules,
} from "./utils";
import manifest from "./manifest.json";
import path from "path";
import { ResourceRetentionAspect } from "./resource-retention-aspect";
import { Provider } from "aws-cdk-lib/custom-resources";

enum LogLevel {
  ERROR = "error",
  WARN = "warn",
  INFO = "info",
  DEBUG = "debug",
}

export class CLPrimary extends Stack {
  readonly account: string;
  readonly region: string;
  readonly partn: string;

  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const stack = Stack.of(this);
    this.account = stack.account; // Returns the AWS::AccountId for this stack (or the literal value if known)
    this.region = stack.region; // Returns the AWS::Region for this stack (or the literal value if known)
    this.partn = stack.partition; // Returns the AWS::Partition for this stack

    //=========================================================================
    // Parameter
    //=========================================================================
    /**
     * @description ES domain name
     * @type {CfnParameter}
     */
    const esDomain: CfnParameter = new CfnParameter(this, "DomainName", {
      type: "String",
      default: "centralizedlogging",
    });

    /**
     * @description email address for Cognito admin
     * @type {CfnParameter}
     */
    const adminEmail: CfnParameter = new CfnParameter(this, "AdminEmail", {
      type: "String",
      allowedPattern: "^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$",
    });

    /**
     * @description ES cluster size
     * @type {CfnParameter}
     */
    const clusterSize: CfnParameter = new CfnParameter(this, "ClusterSize", {
      description:
        "Elasticsearch cluster size; small (4 data nodes), medium (6 data nodes), large (6 data nodes)",
      type: "String",
      default: "Small",
      allowedValues: ["Small", "Medium", "Large"],
    });

    /**
     * @description Option to deploy demo template
     * @type {CfnParameter}
     */
    const demoTemplate: CfnParameter = new CfnParameter(this, "DemoTemplate", {
      description:
        "Deploy demo template for sample data and logs to primary account? If 'yes', make sure to add the primary account ID to the list of spoke account IDs above.",
      type: "String",
      default: "No",
      allowedValues: ["No", "Yes"],
    });

    /**
     * @description List of spoke account ids
     * @type {CfnParameter}
     */
    const spokeAccts: CfnParameter = new CfnParameter(this, "SpokeAccounts", {
      description:
        "Account IDs which you want to allow for centralized logging (comma separated list eg. 11111111,22222222)",
      type: "CommaDelimitedList",
    });

    /**
     * @regions List of regions for CW Logs Destination
     * @type {CfnParameter}
     */
    const spokeRegions: CfnParameter = new CfnParameter(this, "SpokeRegions", {
      description:
        "Regions which you want to allow for centralized logging (comma separated list eg. us-east-1,us-west-2)",
      type: "CommaDelimitedList",
      default: "All",
    });

    /**
     * @description deploy jumbox
     * @type {CfnParameter}
     */
    const jumpboxDeploy: CfnParameter = new CfnParameter(
      this,
      "JumpboxDeploy",
      {
        description: "Do you want to deploy jumpbox?",
        type: "String",
        default: "No",
        allowedValues: ["No", "Yes"],
      }
    );

    /**
     * @description key pair for jump box
     * @type {CfnParameter}
     */
    const jumpboxKey: CfnParameter = new CfnParameter(this, "JumpboxKey", {
      description:
        "Key pair name for jumpbox (You may leave this empty if you chose 'No' above)",
      type: "String",
    });

    //=============================================================================================
    // Metadata
    //=============================================================================================
    this.templateOptions.metadata = {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: [
          {
            Label: {
              default: "Elasticsearch Configuration",
            },
            Parameters: [
              esDomain.logicalId,
              clusterSize.logicalId,
              adminEmail.logicalId,
            ],
          },
          {
            Label: {
              default: "Spoke Configuration",
            },
            Parameters: [spokeAccts.logicalId, spokeRegions.logicalId],
          },
          {
            Label: {
              default: "Do you want to deploy sample log sources?",
            },
            Parameters: [demoTemplate.logicalId],
          },
          {
            Label: {
              default: "Jumpbox Configuration",
            },
            Parameters: [jumpboxDeploy.logicalId, jumpboxKey.logicalId],
          },
        ],
        ParameterLabels: {
          [adminEmail.logicalId]: {
            default: "Admin Email Address",
          },
          [esDomain.logicalId]: {
            default: "OpenSearch Domain Name",
          },
          [jumpboxKey.logicalId]: {
            default: "Key pair for jumpbox",
          },
          [jumpboxDeploy.logicalId]: {
            default: "Deployment",
          },
          [clusterSize.logicalId]: {
            default: "Cluster Size",
          },
          [demoTemplate.logicalId]: {
            default: "Sample Logs",
          },
          [spokeAccts.logicalId]: {
            default: "Account IDs",
          },
          [spokeRegions.logicalId]: {
            default: "Spoke Regions",
          },
        },
      },
    };
    this.templateOptions.description = `(${manifest.solutionId}) - The AWS CloudFormation template for deployment of the ${manifest.solutionName}. Version ${manifest.solutionVersion}`;
    this.templateOptions.templateFormatVersion = manifest.templateVersion;

    //=========================================================================
    // Mapping
    //=========================================================================
    const metricsMap = new CfnMapping(this, "CLMap", {
      mapping: {
        Metric: {
          SendAnonymizedMetric: manifest.sendMetric,
          MetricsEndpoint: manifest.metricsEndpoint, // aws-solutions metrics endpoint
        },
      },
    });

    const esMap = new CfnMapping(this, "ESMap", {
      mapping: {
        NodeCount: {
          Small: 4,
          Medium: 6,
          Large: 6,
        },
        MasterSize: {
          Small: "c5.large.elasticsearch",
          Medium: "c5.large.elasticsearch",
          Large: "c5.large.elasticsearch",
        },
        InstanceSize: {
          Small: "r5.large.elasticsearch",
          Medium: "r5.2xlarge.elasticsearch",
          Large: "r5.4xlarge.elasticsearch",
        },
      },
    });

    //=============================================================================================
    // Condition
    //=============================================================================================
    const demoDeploymentCheck = new CfnCondition(this, "demoDeploymentCheck", {
      expression: Fn.conditionEquals(demoTemplate.valueAsString, "Yes"),
    });
    const jumpboxDeploymentCheck = new CfnCondition(
      this,
      "JumpboxDeploymentCheck",
      {
        expression: Fn.conditionEquals(jumpboxDeploy.valueAsString, "Yes"),
      }
    );

    //=============================================================================================
    // Resource
    //=============================================================================================
    /**
     * @description helper lambda role
     * @type {Role}
     */
    const helperRole: Role = new Role(this, "HelperRole", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });
    const helperPolicy1 = new Policy(this, "HelperRolePolicy1", {
      roles: [helperRole],
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            "logs:CreateLogStream",
            "logs:PutLogEvents",
            "logs:CreateLogGroup",
          ],
          resources: [
            `arn:${this.partn}:logs:${this.region}:${this.account}:log-group:*`,
            `arn:${this.partn}:logs:${this.region}:${this.account}:log-group:*:log-stream:*`,
          ],
        }),
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            "ec2:DescribeRegions",
            "logs:PutDestination",
            "logs:DeleteDestination",
            "logs:PutDestinationPolicy",
          ],
          resources: ["*"],
        }),
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["iam:CreateServiceLinkedRole"],
          resources: [
            `arn:${this.partn}:iam::*:role/aws-service-role/es.amazonaws.com/AWSServiceRoleForAmazonElasticsearchService*`,
          ],
          conditions: {
            ["StringLike"]: {
              "iam:AWSServiceName": "es.amazonaws.com",
            },
          },
        }),
      ],
    });

    const customResourceHandler: lambda.Function = new lambda.Function(
      this,
      "HelperLambda",
      {
        description: manifest.solutionName + " -  solution helper functions",
        environment: {
          LOG_LEVEL: LogLevel.INFO, //change as needed
          METRICS_ENDPOINT: metricsMap.findInMap("Metric", "MetricsEndpoint"),
          SEND_METRIC: metricsMap.findInMap("Metric", "SendAnonymizedMetric"),
          CUSTOM_SDK_USER_AGENT: `AwsSolution/${manifest.solutionId}/${manifest.solutionVersion}`,
          CLUSTER_SIZE: clusterSize.valueAsString,
          SOLUTION_ID: manifest.solutionId,
          SOLUTION_VERSION: manifest.solutionVersion,
          STACK: "PrimaryStack",
        },
        handler: "index.handler",
        code: Code.fromAsset(
          `${path.dirname(
            __dirname
          )}/../services/helper/dist/helper/cl-helper.zip`
        ),
        runtime: Runtime.NODEJS_16_X,
        timeout: Duration.seconds(300),
        role: helperRole,
      }
    );
    applyDependsOn(customResourceHandler, helperPolicy1);

    // Wrapping the customResourceHandler in a Provider allows to write simplified code in customResourceHandler
    const provider: Provider = new Provider(this, "CustomResourceProvider", {
      onEventHandler: customResourceHandler,
    });

    /**
     * Get UUID for deployment
     */
    const createUniqueId = new CustomResource(this, "CreateUUID", {
      resourceType: "Custom::CreateUUID",
      serviceToken: provider.serviceToken,
    });

    /**
     * Create service linked role for ES
     */
    new CustomResource(this, "CreateESServiceRole", {
      resourceType: "Custom::CreateESServiceRole",
      serviceToken: provider.serviceToken,
    });

    /**
     * Send launch data to aws-solutions
     */
    new CustomResource(this, "LaunchData", {
      resourceType: "Custom::LaunchData",
      serviceToken: provider.serviceToken,
      properties: {
        SolutionUuid: createUniqueId.getAttString("UUID"),
      },
    });

    /**
     * @description cognito user pool
     * @type {UserPool}
     */
    const esUserPool: UserPool = new UserPool(this, "ESUserPool", {
      standardAttributes: {
        email: {
          mutable: true,
          required: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3),
      },
      signInAliases: { email: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      selfSignUpEnabled: false,
    });
    // enforce advanced security mode
    (esUserPool.node.defaultChild as CfnUserPool).addPropertyOverride(
      "UserPoolAddOns",
      {
        AdvancedSecurityMode: "ENFORCED",
      }
    );
    // add domain to user pool
    const upDomain = esUserPool.addDomain("ESCognitoDomain", {
      cognitoDomain: {
        domainPrefix: `${esDomain.valueAsString}-${createUniqueId.getAttString(
          "UUID"
        )}`,
      },
    });

    /**
     * @description adding admin to user pool
     * @type {CfnUserPoolUser}
     */
    new CfnUserPoolUser(this, "AdminUser", {
      userPoolId: esUserPool.userPoolId,
      userAttributes: [{ name: "email", value: adminEmail.valueAsString }],
      username: adminEmail.valueAsString,
    });

    /**
     * @description cognito user pool
     * @type {CfnIdentityPool}
     * @remarks higher level constructs for Identity pools are yet not developed
     * @see https://docs.aws.amazon.com/cdk/api/latest/docs/aws-cognito-readme.html
     */
    const identityPool: CfnIdentityPool = new CfnIdentityPool(
      this,
      "ESIdentityPool",
      {
        allowUnauthenticatedIdentities: false,
      }
    );

    /**
     * @description cognito authenticated role
     * @type {Role}
     */
    const idpAuthRole: Role = new Role(this, "CognitoAuthRole", {
      assumedBy: new FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          ["StringEquals"]: {
            "cognito-identity.amazonaws.com:aud": identityPool.ref,
          },
          ["ForAnyValue:StringLike"]: {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
    });

    // identity pool authorized role
    new CfnIdentityPoolRoleAttachment(this, "IdentityPoolRoleAttachment", {
      identityPoolId: identityPool.ref,
      roles: { authenticated: idpAuthRole.roleArn },
    });

    /**
     * @description es role for cognito access
     * @type {Role}
     * @remark same policy as arn:aws:iam::aws:policy/AmazonESCognitoAccess
     */
    const esCognitoRole: Role = new Role(this, "ESCognitoRole", {
      assumedBy: new ServicePrincipal("es.amazonaws.com"),
      inlinePolicies: {
        ["ESCognitoAccess"]: PolicyDocument.fromJson({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "cognito-idp:DescribeUserPool",
                "cognito-idp:CreateUserPoolClient",
                "cognito-idp:DeleteUserPoolClient",
                "cognito-idp:DescribeUserPoolClient",
                "cognito-idp:AdminInitiateAuth",
                "cognito-idp:AdminUserGlobalSignOut",
                "cognito-idp:ListUserPoolClients",
                "cognito-identity:DescribeIdentityPool",
                "cognito-identity:UpdateIdentityPool",
                "cognito-identity:SetIdentityPoolRoles",
                "cognito-identity:GetIdentityPoolRoles",
              ],
              Resource: "*",
            },
          ],
        }),
      },
    });
    esCognitoRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["iam:PassRole"],
        resources: [esCognitoRole.roleArn],
        conditions: {
          ["StringLike"]: {
            "iam:PassedToService": "cognito-identity.amazonaws.com",
          },
        },
      })
    );

    /**
     * @description IAM role for kinesis firehose
     * @type {Role}
     */
    const firehoseRole: Role = new Role(this, "FirehoseRole", {
      assumedBy: new ServicePrincipal("firehose.amazonaws.com"),
    });

    /**
     * @description log group for VPC flow logs
     * @type {LogGroup}
     */
    const flowLg: LogGroup = new LogGroup(this, "VPCFlowLogGroup", {
      removalPolicy: RemovalPolicy.RETAIN,
    });

    /**
     * @description iam role for flow logs
     * @type {Role}
     */
    const flowRole: Role = new Role(this, "flowRole", {
      assumedBy: new ServicePrincipal("vpc-flow-logs.amazonaws.com"),
    });

    /**
     * @description es vpc with 2 isolated subnets
     * @type {Vpc}
     */
    const VPC: Vpc = new Vpc(this, "ESVPC", {
      cidr: manifest.esdomain.vpcCIDR,
      vpnGateway: false,
      flowLogs: {
        ["ESVpcFlow"]: {
          destination: FlowLogDestination.toCloudWatchLogs(flowLg, flowRole),
          trafficType: FlowLogTrafficType.ALL,
        },
      },
      subnetConfiguration: [
        {
          cidrMask: 24,
          subnetType: SubnetType.PRIVATE_ISOLATED,
          name: "ESIsolatedSubnet",
        },
        {
          cidrMask: 24,
          subnetType: SubnetType.PUBLIC,
          name: "ESPublicSubnet",
        },
      ],
    });
    Aspects.of(VPC).add(new ResourceRetentionAspect());

    /**
     * @description security group for es domain
     * @type {SecurityGroup}
     */
    const esSg: SecurityGroup = new SecurityGroup(this, "ESSG", {
      vpc: VPC,
      allowAllOutbound: false,
    });
    esSg.addIngressRule(
      Peer.ipv4(VPC.vpcCidrBlock),
      Port.tcp(443),
      "allow inbound https traffic"
    );
    esSg.addEgressRule(
      Peer.ipv4(VPC.vpcCidrBlock),
      Port.tcp(443),
      "allow outbound https"
    );
    Aspects.of(esSg).add(new ResourceRetentionAspect());

    /**
     * @description es domain
     * @type {Domain}
     */
    const domain: Domain = new Domain(this, "ESDomain", {
      version: ElasticsearchVersion.V7_10,
      domainName: esDomain.valueAsString,
      enforceHttps: true,
      vpc: VPC,
      vpcSubnets: [{ subnets: VPC.isolatedSubnets }],
      securityGroups: [esSg],
      encryptionAtRest: {
        enabled: true,
      },
      zoneAwareness: {
        availabilityZoneCount: 2,
      },
      nodeToNodeEncryption: true,
      automatedSnapshotStartHour: 0,
      cognitoKibanaAuth: {
        identityPoolId: identityPool.ref,
        role: esCognitoRole,
        userPoolId: esUserPool.userPoolId,
      },
      tlsSecurityPolicy: TLSSecurityPolicy.TLS_1_2,
    });

    // attach policy to idp auth role
    idpAuthRole.attachInlinePolicy(
      new Policy(this, "authRolePolicy", {
        statements: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
              "es:ESHttpGet",
              "es:ESHttpDelete",
              "es:ESHttpPut",
              "es:ESHttpPost",
              "es:ESHttpHead",
              "es:ESHttpPatch",
            ],
            resources: [domain.domainArn],
          }),
        ],
      })
    );

    /**
     * @description cluster configurations for es domain
     * @remark property is not supported on higher level construct
     */
    const clusterConfig = {
      DedicatedMasterEnabled: true,
      InstanceCount: esMap.findInMap("NodeCount", clusterSize.valueAsString),
      ZoneAwarenessEnabled: true,
      InstanceType: esMap.findInMap("InstanceSize", clusterSize.valueAsString),
      DedicatedMasterType: esMap.findInMap(
        "MasterSize",
        clusterSize.valueAsString
      ),
      DedicatedMasterCount: 3,
    };
    // adding cluster config
    applyDependsOn(domain, upDomain);
    const cfnDomain = domain.node.defaultChild as CfnDomain;
    cfnDomain.addPropertyOverride("ElasticsearchClusterConfig", clusterConfig);

    /**
     * @description es domain access policy
     * @remark domain construct adds access policy using lambda function
     */
    const accessPolicies = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "es:ESHttpGet",
            "es:ESHttpDelete",
            "es:ESHttpPut",
            "es:ESHttpPost",
            "es:ESHttpHead",
            "es:ESHttpPatch",
          ],
          Principal: { AWS: idpAuthRole.roleArn },
          Resource: `arn:${this.partn}:es:${this.region}:${this.account}:domain/${esDomain.valueAsString}/*`,
        },
        {
          Effect: "Allow",
          Action: [
            "es:DescribeElasticsearchDomain",
            "es:DescribeElasticsearchDomains",
            "es:DescribeElasticsearchDomainConfig",
            "es:ESHttpPost",
            "es:ESHttpPut",
            "es:HttpGet",
          ],
          Principal: { AWS: firehoseRole.roleArn },
          Resource: `arn:${this.partn}:es:${this.region}:${this.account}:domain/${esDomain.valueAsString}/*`,
        },
      ],
    };
    // adding access policy
    cfnDomain.addPropertyOverride("AccessPolicies", accessPolicies);

    /**
     * @description dead letter queue for lambda
     * @type {Queue}
     */
    const dlq: Queue = new Queue(this, `dlq`, {
      encryption: QueueEncryption.KMS_MANAGED,
    });

    /**
     * @description Lambda transformer for log events
     * @type {Function}
     */
    // eslint-disable-next-line @typescript-eslint/ban-types
    const logTransformer: Function = new lambda.Function(
      this,
      "CLTransformer",
      {
        description: `${manifest.solutionName} - Lambda function to transform log events and send to kinesis firehose`,
        environment: {
          LOG_LEVEL: LogLevel.INFO, //change as needed
          SOLUTION_ID: manifest.solutionId,
          SOLUTION_VERSION: manifest.solutionVersion,
          UUID: createUniqueId.getAttString("UUID"),
          CLUSTER_SIZE: clusterSize.valueAsString,
          DELIVERY_STREAM: manifest.firehoseName,
          METRICS_ENDPOINT: metricsMap.findInMap("Metric", "MetricsEndpoint"),
          SEND_METRIC: metricsMap.findInMap("Metric", "SendAnonymizedMetric"),
          CUSTOM_SDK_USER_AGENT: `AwsSolution/${manifest.solutionId}/${manifest.solutionVersion}`,
        },
        handler: "index.handler",
        code: Code.fromAsset(
          `${path.dirname(
            __dirname
          )}/../services/transformer/dist/transformer/cl-transformer.zip`
        ),
        runtime: Runtime.NODEJS_16_X,
        timeout: Duration.seconds(300),
        deadLetterQueue: dlq,
        deadLetterQueueEnabled: true,
      }
    );

    /**
     * @description Kms key for SNS topic
     * @type {IAlias}
     */
    const snsKeyAlias: IAlias = Alias.fromAliasName(
      this,
      "snsKey",
      "alias/aws/sns"
    );

    /**
     * @description sns topic for alarms
     * @type {Topic}
     */
    const topic: Topic = new Topic(this, "Topic", {
      displayName: "CL-Lambda-Error",
      masterKey: snsKeyAlias,
    });
    // add email subscription for admin
    topic.addSubscription(new EmailSubscription(adminEmail.valueAsString));

    // adding cw alarm for lambda error rate
    const alarm = logTransformer
      .metricErrors()
      .createAlarm(this, "CL-LambdaError-Alarm", {
        threshold: 0.05,
        evaluationPeriods: 1,
      });
    alarm.addAlarmAction(new SnsAction(topic));

    /**
     * @description kinesis data stream for centralized logging
     * @type {Stream}
     */
    const clDataStream: Stream = new Stream(this, "CLDataStream", {
      shardCount: manifest.kinesisDataStream.shard,
      retentionPeriod: Duration.hours(
        manifest.kinesisDataStream.retentionInHrs
      ),
      encryption: StreamEncryption.MANAGED,
    });
    // add event source for kinesis data stream
    logTransformer.addEventSource(
      new KinesisEventSource(clDataStream, {
        batchSize: 100, // default
        startingPosition: StartingPosition.TRIM_HORIZON,
      })
    );

    /**
     * @description S3 bucket for access logs
     * @type {Bucket}
     */
    const accessLogsBucket: Bucket = new Bucket(this, "AccessLogsBucket", {
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    /**
     * @description S3 bucket for Firehose
     * @type {Bucket}
     */
    const firehoseBucket: Bucket = new Bucket(this, "CLBucket", {
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: "cl-access-logs",
    });
    // adding bucket policy
    firehoseBucket.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new ArnPrincipal(firehoseRole.roleArn)],
        actions: ["s3:Put*", "s3:Get*"],
        resources: [firehoseBucket.bucketArn, `${firehoseBucket.bucketArn}/*`],
      })
    );
    // apply retention policy
    Aspects.of(firehoseBucket).add(new ResourceRetentionAspect());
    /**
     * @description log group for firehose error events
     * @type {LogGroup}
     */
    const firehoseLG: LogGroup = new LogGroup(
      this,
      `${manifest.firehoseName}-FirehoseLogGroup`,
      {
        removalPolicy: RemovalPolicy.RETAIN,
        retention: RetentionDays.ONE_YEAR,
      }
    );

    /**
     * @description log stream for elasticsearch delivery logs
     * @type {LogStream}
     */
    const firehoseLS: LogStream = new LogStream(this, "FirehoseESLogStream", {
      logGroup: firehoseLG,
      logStreamName: "ElasticsearchDelivery",
    });

    /**
     * @description log stream for s3 delivery logs
     * @type {LogStream}
     */
    const firehoseLSS3: LogStream = new LogStream(this, "FirehoseS3LogStream", {
      logGroup: firehoseLG,
      logStreamName: "S3Delivery",
    });

    /**
     * @description iam policy for firehose role
     * @type {Policy}
     */
    const firehosePolicy: Policy = new Policy(this, "FirehosePolicy", {
      policyName: manifest.firehosePolicy,
      roles: [firehoseRole],
      statements: [
        // policy to access S3 bucket
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            "s3:AbortMultipartUpload",
            "s3:GetBucketLocation",
            "s3:GetObject",
            "s3:ListBucket",
            "s3:ListBucketMultipartUploads",
            "s3:PutObject",
          ],
          resources: [
            `arn:${this.partn}:s3:::${firehoseBucket.bucketName}`,
            `arn:${this.partn}:s3:::${firehoseBucket.bucketName}/*`,
          ],
        }),
        // policy for kms key
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["kms:GenerateDataKey", "kms:Decrypt"],
          resources: [
            `arn:${this.partn}:kms:${this.region}:${this.account}:key/*`,
          ],
          conditions: {
            ["StringEquals"]: {
              "kms:ViaService": `s3.${this.region}.amazonaws.com`,
            },
            ["StringLike"]: {
              "kms:EncryptionContext:aws:s3:arn": [
                `arn:${this.partn}:s3:::${firehoseBucket.bucketName}/*`,
              ],
            },
          },
        }),
        // policy for es vpc
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            "ec2:DescribeVpcs",
            "ec2:DescribeVpcAttribute",
            "ec2:DescribeSubnets",
            "ec2:DescribeSecurityGroups",
            "ec2:DescribeNetworkInterfaces",
            "ec2:CreateNetworkInterface",
            "ec2:CreateNetworkInterfacePermission",
            "ec2:DeleteNetworkInterface",
          ],
          resources: ["*"],
        }),
        // policy for es
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            "es:DescribeElasticsearchDomain",
            "es:DescribeElasticsearchDomains",
            "es:DescribeElasticsearchDomainConfig",
            "es:ESHttpPost",
            "es:ESHttpPut",
          ],
          resources: [
            `arn:${this.partn}:es:${this.region}:${this.account}:domain/${domain.domainName}`,
            `arn:${this.partn}:es:${this.region}:${this.account}:domain/${domain.domainName}/*`,
          ],
        }),
        // policy for HTTP Get
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["es:ESHttpGet"],
          resources: [
            `arn:${this.partn}:es:${this.region}:${this.account}:domain/${domain.domainName}/_all/_settings`,
            `arn:${this.partn}:es:${this.region}:${this.account}:domain/${domain.domainName}/_cluster/stats`,
            `arn:${this.partn}:es:${this.region}:${this.account}:domain/${domain.domainName}/cwl-kinesis/_mapping/kinesis`,
            `arn:${this.partn}:es:${this.region}:${this.account}:domain/${domain.domainName}/_nodes`,
            `arn:${this.partn}:es:${this.region}:${this.account}:domain/${domain.domainName}/_nodes/*/stats`,
            `arn:${this.partn}:es:${this.region}:${this.account}:domain/${domain.domainName}/_stats`,
            `arn:${this.partn}:es:${this.region}:${this.account}:domain/${domain.domainName}/cwl-kinesis/_stats`,
          ],
        }),
        // policy for CW logs
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["logs:PutLogEvents", "logs:CreateLogStream"],
          resources: [`${firehoseLG.logGroupArn}`],
        }),
        // policy for kms decryption
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["kms:Decrypt"],
          resources: [
            `arn:${this.partn}:kms:${this.region}:${this.account}:key/*`,
          ],
          conditions: {
            ["StringEquals"]: {
              "kms:ViaService": `kinesis.${this.region}.amazonaws.com`,
            },
            ["StringLike"]: {
              "kms:EncryptionContext:aws:kinesis:arn": `${clDataStream.streamArn}`,
            },
          },
        }),
      ],
    });

    /**
     * @description CL Firehose
     * @type {CfnDeliveryStream}
     */
    const clFirehose: CfnDeliveryStream = new CfnDeliveryStream(
      this,
      "CLFirehose",
      {
        elasticsearchDestinationConfiguration: {
          indexName: "cwl",
          domainArn: domain.domainArn,
          roleArn: firehoseRole.roleArn,
          indexRotationPeriod: "OneDay",
          s3Configuration: {
            bucketArn: firehoseBucket.bucketArn,
            roleArn: firehoseRole.roleArn,
            cloudWatchLoggingOptions: {
              enabled: true,
              logGroupName: `/aws/kinesisfirehose/${manifest.firehoseName}`,
              logStreamName: firehoseLSS3.logStreamName,
            },
          },
          s3BackupMode: "AllDocuments",
          vpcConfiguration: {
            roleArn: firehoseRole.roleArn,
            subnetIds: VPC.isolatedSubnets.map((subnet) => subnet.subnetId),
            securityGroupIds: [esSg.securityGroupId],
          },
          cloudWatchLoggingOptions: {
            enabled: true,
            logGroupName: `/aws/kinesisfirehose/${manifest.firehoseName}`,
            logStreamName: firehoseLS.logStreamName,
          },
        },
        deliveryStreamType: "DirectPut",
        deliveryStreamName: manifest.firehoseName,
        deliveryStreamEncryptionConfigurationInput: {
          keyType: "AWS_OWNED_CMK",
        },
      }
    );
    applyDependsOn(clFirehose, firehosePolicy);

    // allow lambda to put records on firehose
    logTransformer.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["firehose:PutRecordBatch"],
        resources: [clFirehose.attrArn],
      })
    );

    /**
     * @description IAM role for cw logs destination
     * @type {Role}
     */
    const cwDestinationRole: Role = new Role(this, "CWDestinationRole", {
      assumedBy: new ServicePrincipal("logs.amazonaws.com"),
    });
    const assumeBy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            Service: "logs.amazonaws.com",
          },
          Action: "sts:AssumeRole",
        },
      ],
    };
    (cwDestinationRole.node.defaultChild as CfnRole).addOverride(
      "Properties.AssumeRolePolicyDocument",
      assumeBy
    );

    /**
     * @description iam permissions for putting record on kinesis data stream
     * @type {Policy}
     */
    const cwDestPolicy: Policy = new Policy(this, "CWDestPolicy", {
      roles: [cwDestinationRole],
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["kinesis:PutRecord"],
          resources: [`${clDataStream.streamArn}`],
        }),
      ],
    });

    /**
     * @description iam permission to pass role for creating cw destinations
     * @type {Policy}
     */
    const helperPolicy2: Policy = new Policy(this, "HelperRolePolicy2", {
      roles: [helperRole],
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["iam:PassRole"],
          resources: [cwDestinationRole.roleArn],
        }),
      ],
    });
    applyDependsOn(helperPolicy2, cwDestPolicy);

    /**
     * @description create CW Logs Destination
     * @type {CustomResource}
     */
    const cwDestination: CustomResource = new CustomResource(
      this,
      "CWDestination",
      {
        resourceType: "Custom::CWDestination",
        serviceToken: provider.serviceToken,
        properties: {
          Regions: spokeRegions.valueAsList,
          DestinationName: `${
            manifest.cwDestinationName
          }-${createUniqueId.getAttString("UUID")}`, // adding uuid for unique deployments
          Role: cwDestinationRole.roleArn,
          DataStream: clDataStream.streamArn,
          SpokeAccounts: spokeAccts.valueAsList,
        },
      }
    );
    applyDependsOn(cwDestination, helperPolicy2);

    new Jumpbox(this, "CL-Jumpbox", {
      vpc: VPC,
      subnets: VPC.publicSubnets,
      keyname: jumpboxKey.valueAsString,
      deploy: jumpboxDeploymentCheck,
    });

    /**
     * @description Demo stack
     * @type {NestedStack}
     */
    const demo: NestedStack = new CLDemo(this, "CL-DemoStack", {
      parameters: {
        ["CWDestinationParm"]: `arn:${this.partn}:logs:${this.region}:${
          this.account
        }:destination:${
          manifest.cwDestinationName
        }-${createUniqueId.getAttString("UUID")}`,
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    demo.nestedStackResource!.cfnOptions.condition = demoDeploymentCheck;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    applyDependsOn(demo.nestedStackResource as CfnResource, domain);

    //=============================================================================================
    // cfn_nag suppress rules
    //=============================================================================================
    applyCfnNagSuppressRules(helperPolicy1.node.defaultChild as CfnResource, [
      cfn_suppress_rules.W12,
    ]);

    applyCfnNagSuppressRules(
      customResourceHandler.node.defaultChild as CfnResource,
      [cfn_suppress_rules.W58, cfn_suppress_rules.W89, cfn_suppress_rules.W92]
    );

    applyCfnNagSuppressRules(
      provider.node.children[0].node.findChild("Resource") as CfnResource,
      [cfn_suppress_rules.W58, cfn_suppress_rules.W89, cfn_suppress_rules.W92]
    );

    applyCfnNagSuppressRules(esCognitoRole.node.defaultChild as CfnResource, [
      cfn_suppress_rules.W11,
    ]);

    VPC.publicSubnets.forEach((subnet) => {
      applyCfnNagSuppressRules(subnet.node.defaultChild as CfnResource, [
        cfn_suppress_rules.W33,
      ]);
    });

    applyCfnNagSuppressRules(domain.node.defaultChild as CfnResource, [
      cfn_suppress_rules.W28,
    ]);

    applyCfnNagSuppressRules(logTransformer.node.defaultChild as CfnResource, [
      cfn_suppress_rules.W58,
      cfn_suppress_rules.W89,
      cfn_suppress_rules.W92,
    ]);

    applyCfnNagSuppressRules(
      accessLogsBucket.node.defaultChild as CfnResource,
      [cfn_suppress_rules.W35, cfn_suppress_rules.W51]
    );

    applyCfnNagSuppressRules(
      firehoseLG.node.findChild("Resource") as CfnResource,
      [cfn_suppress_rules.W84]
    );

    applyCfnNagSuppressRules(firehosePolicy.node.defaultChild as CfnResource, [
      cfn_suppress_rules.W12,
      cfn_suppress_rules.W76,
    ]);

    applyCfnNagSuppressRules(flowLg.node.findChild("Resource") as CfnResource, [
      cfn_suppress_rules.W84,
    ]);

    //=============================================================================================
    // Output
    //=============================================================================================
    new CfnOutput(this, "Destination Subscription Command", {
      description: "Command to run in spoke accounts/regions",
      value: `aws logs put-subscription-filter \
      --destination-arn arn:${this.partn}:logs:<region>:${
        this.account
      }:destination:${manifest.cwDestinationName}-${createUniqueId.getAttString(
        "UUID"
      )} \
      --log-group-name <MyLogGroup> \
      --filter-name <MyFilterName> \
      --filter-pattern <MyFilterPattern> \
      --profile <MyAWSProfile> `,
    });

    new CfnOutput(this, "Unique ID", {
      description: "UUID for Centralized Logging Stack",
      value: createUniqueId.getAttString("UUID"),
    });

    new CfnOutput(this, "Admin Email", {
      description: "Admin Email address",
      value: adminEmail.valueAsString,
    });

    new CfnOutput(this, "Domain Name", {
      description: "ES Domain Name",
      value: esDomain.valueAsString,
    });

    new CfnOutput(this, "Kibana URL", {
      description: "Kibana URL",
      value: `https://${domain.domainEndpoint}/_plugin/kibana/`,
    });

    new CfnOutput(this, "Cluster Size", {
      description: "ES Cluster Size",
      value: clusterSize.valueAsString,
    });

    new CfnOutput(this, "Demo Deployment", {
      description: "Demo data deployed?",
      value: demoTemplate.valueAsString,
    });
  }
}
