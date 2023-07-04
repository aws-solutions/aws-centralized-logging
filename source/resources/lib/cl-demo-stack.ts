// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Demo Stack for Centralized Logging on AWS
 * @author @aws-solutions
 */

import {
  CfnMapping,
  CfnOutput,
  CfnParameter,
  CfnResource,
  Fn,
  NestedStack,
  NestedStackProps,
  RemovalPolicy,
  Stack,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  FlowLog,
  FlowLogDestination,
  FlowLogResourceType,
  FlowLogTrafficType,
  SubnetType,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import {
  Effect,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import {
  CfnSubscriptionFilter,
  LogGroup,
  RetentionDays,
} from "aws-cdk-lib/aws-logs";
import { Trail } from "aws-cdk-lib/aws-cloudtrail";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import { EC2Demo } from "./cl-demo-ec2-construct";
import { applyCfnNagSuppressRules, cfn_suppress_rules } from "./utils";
import manifest from "./manifest.json";

/**
 * @class
 * @description demo stack
 * @property {string} account id
 * @property {string} region of deployment
 */
export class CLDemo extends NestedStack {
  readonly account: string;
  readonly region: string;
  /**
   * @constructor
   * @param {Construct} scope parent of the construct
   * @param {string} id unique identifier for the object
   * @param {NestedStackProps} props props for the construct
   */
  constructor(scope: Construct, id: string, props?: NestedStackProps) {
    super(scope, id, props);
    const stack = Stack.of(this);

    this.account = stack.account; // Returns the AWS::AccountId for this stack (or the literal value if known)
    this.region = stack.region; // Returns the AWS::Region for this stack (or the literal value if known)

    //=============================================================================================
    // Parameters
    //=============================================================================================
    /**
     * @description parameter for CW Logs Destination Arn
     * @type {CfnParameter}
     */
    const cwLogsDestinationArn: CfnParameter = new CfnParameter(
      this,
      "CWDestinationParm",
      {
        type: "String",
      }
    );

    //=============================================================================================
    // Metadata
    //=============================================================================================
    this.templateOptions.metadata = {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: [
          {
            Label: { default: "Destination Configuration" },
            Parameters: [cwLogsDestinationArn.logicalId],
          },
        ],
        ParameterLabels: {
          [cwLogsDestinationArn.logicalId]: {
            default: "CloudWatch Logs Destination Arn for Log Streaming",
          },
        },
      },
    };

    this.templateOptions.description = `(${manifest.solutionId}D) - The AWS CloudFormation template for deployment of the ${manifest.solutionName}. Version ${manifest.solutionVersion}`;
    this.templateOptions.templateFormatVersion = manifest.templateVersion;

    //=============================================================================================
    // Map
    //=============================================================================================
    new CfnMapping(this, "EC2", {
      mapping: { Instance: { Type: "t3.micro" } },
    });

    new CfnMapping(this, "FilterPatternLookup", {
      mapping: {
        Common: {
          Pattern:
            "[host, ident, authuser, date, request, status, bytes, referrer, agent]",
        },
        CloudTrail: {
          Pattern: "",
        },
        FlowLogs: {
          Pattern:
            '[version, account_id, interface_id, srcaddr != "-", dstaddr != "-", srcport != "-", dstport != "-", protocol, packets, bytes, start, end, action, log_status]',
        },
        Lambda: {
          Pattern: '[timestamp=*Z, request_id="*-*", event]',
        },
        SpaceDelimited: {
          Pattern: "[]",
        },
        Other: {
          Pattern: "",
        },
      },
    });

    //=============================================================================================
    // Resources
    //=============================================================================================

    /**
     * @description demo vpc with 1 public subnet
     * @type {Vpc}
     */
    const demoVPC: Vpc = new Vpc(this, "DemoVPC", {
      cidr: "10.0.1.0/26",
      natGateways: 0,
      vpnGateway: false,
      subnetConfiguration: [
        {
          cidrMask: 28,
          name: "PublicSubnet",
          subnetType: SubnetType.PUBLIC,
        },
      ],
    });
    demoVPC.applyRemovalPolicy(RemovalPolicy.DESTROY);
    demoVPC.publicSubnets.forEach((subnet) => {
      applyCfnNagSuppressRules(subnet.node.defaultChild as CfnResource, [
        cfn_suppress_rules.W33,
      ]);
    });

    //===================
    // FlowLog resources
    //===================
    /**
     * @description log group for VPC flow logs
     * @type {LogGroup}
     */
    const flowLg: LogGroup = new LogGroup(this, "VPCFlowLogGroup", {
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.ONE_WEEK,
    });

    /**
     * @description iam role for flow logs
     * @type {Role}
     */
    const flowRole: Role = new Role(this, "flowRole", {
      assumedBy: new ServicePrincipal("vpc-flow-logs.amazonaws.com"),
    });

    /**
     * @description demo flow logs
     * @type {FlowLog}
     */
    new FlowLog(this, "DemoFlowLog", {
      resourceType: FlowLogResourceType.fromVpc(demoVPC),
      trafficType: FlowLogTrafficType.ALL,
      destination: FlowLogDestination.toCloudWatchLogs(flowLg, flowRole),
    });

    new CfnSubscriptionFilter(this, "FlowLogSubscription", {
      destinationArn: cwLogsDestinationArn.valueAsString,
      filterPattern: Fn.findInMap("FilterPatternLookup", "FlowLogs", "Pattern"),
      logGroupName: flowLg.logGroupName,
    });

    //====================
    // WebServer resources
    //====================
    /**
     * @description ec2 web server resources
     * @type {EC2Demo}
     */
    const ec2: EC2Demo = new EC2Demo(this, "WebServer", {
      destination: cwLogsDestinationArn.valueAsString,
      demoVpc: demoVPC,
    });

    //=====================
    // CloudTrail resources
    //=====================
    /**
     * @description log group for CloudTrail
     * @type {LogGroup}
     */
    const cloudtrailLg: LogGroup = new LogGroup(this, "CloudTrailLogGroup", {
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.ONE_WEEK,
    });

    /**
     * @description bucket for CloudTrail
     * @type {Bucket}
     */
    const trailBucket: Bucket = new Bucket(this, "TrailBucket", {
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });
    trailBucket.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal("cloudtrail.amazonaws.com")],
        sid: "CloudTrailRead",
        actions: ["s3:GetBucketAcl"],
        resources: [trailBucket.bucketArn],
      })
    );
    trailBucket.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal("cloudtrail.amazonaws.com")],
        sid: "CloudTrailWrite",
        actions: ["s3:PutObject"],
        resources: [`${trailBucket.bucketArn}/AWSLogs/${this.account}/*`],
      })
    );

    /**
     * @description demo trail
     * @type {Trail}
     */
    new Trail(this, "demoTrail", {
      bucket: trailBucket,
      cloudWatchLogGroup: cloudtrailLg,
      isMultiRegionTrail: false,
      sendToCloudWatchLogs: true,
      includeGlobalServiceEvents: true,
    });

    new CfnSubscriptionFilter(this, "CloudTrailSubscription", {
      destinationArn: cwLogsDestinationArn.valueAsString,
      filterPattern: Fn.findInMap(
        "FilterPatternLookup",
        "CloudTrail",
        "Pattern"
      ),
      logGroupName: cloudtrailLg.logGroupName,
    });

    //=============================================================================================
    // cfn_nag suppress rules
    //=============================================================================================
    applyCfnNagSuppressRules(trailBucket.node.defaultChild as CfnResource, [
      cfn_suppress_rules.W35,
    ]);

    applyCfnNagSuppressRules(flowLg.node.findChild("Resource") as CfnResource, [
      cfn_suppress_rules.W84,
    ]);

    applyCfnNagSuppressRules(
      cloudtrailLg.node.findChild("Resource") as CfnResource,
      [cfn_suppress_rules.W84]
    );

    //=============================================================================================
    // Output
    //=============================================================================================
    new CfnOutput(this, "Destination Arn", {
      description: "CloudWatch Logs destination arn",
      value: cwLogsDestinationArn.valueAsString,
    });

    new CfnOutput(this, "URL", {
      description: "URL for demo web server",
      value: `http://${ec2.publicIp}`,
    });
  }
}
