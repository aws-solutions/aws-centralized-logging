// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * This is EC2 construct for WebServer resource
 * @author @aws-solutions
 */

import { Stack, RemovalPolicy, CfnResource } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  Vpc,
  Instance,
  InstanceType,
  InitFile,
  InitService,
  InitServiceRestartHandle,
  CloudFormationInit,
  MachineImage,
  AmazonLinuxVirt,
  AmazonLinuxGeneration,
  AmazonLinuxCpuType,
  SecurityGroup,
  Peer,
  Port,
  InitPackage,
} from "aws-cdk-lib/aws-ec2";
import {
  LogGroup,
  RetentionDays,
  CfnSubscriptionFilter,
} from "aws-cdk-lib/aws-logs";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import manifest from "./manifest.json";
import { cfn_suppress_rules, applyCfnNagSuppressRules } from "./utils";

/**
 * @interface
 * @description web server interface
 */
interface IEC2Demo {
  /**
   * @description destination arn for log streaming
   * @type {string}
   */
  destination: string;
  /**
   * @description vpc for creating demo resources
   * @type {Vpc}
   */
  demoVpc: Vpc;
}
/**
 * @class
 * @description web server resources construct
 * @property {string} region of deployment
 */
export class EC2Demo extends Construct {
  readonly region: string;
  readonly publicIp: string;
  constructor(scope: Construct, id: string, props: IEC2Demo) {
    super(scope, id);

    const stack = Stack.of(this);

    this.region = stack.region; // Returns the AWS::Region for this stack (or the literal value if known)

    /**
     * @description security group for web server
     * @type {SecurityGroup}
     */
    const demoSg: SecurityGroup = new SecurityGroup(this, "DemoSG", {
      vpc: props.demoVpc,
    });
    demoSg.addIngressRule(Peer.anyIpv4(), Port.tcp(80), "allow HTTP traffic");
    // cfn_nag suppress rule
    applyCfnNagSuppressRules(demoSg.node.defaultChild as CfnResource, [
      cfn_suppress_rules.W5,
      cfn_suppress_rules.W2,
      cfn_suppress_rules.W9,
      cfn_suppress_rules.W40,
    ]);

    /**
     * @description log group for web server
     * @type {LogGroup}
     */
    const ec2Lg: LogGroup = new LogGroup(this, "EC2LogGroup", {
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.ONE_WEEK,
    });

    const handle: InitServiceRestartHandle = new InitServiceRestartHandle();

    /**
     * @description cloudformation init configuration for web server
     * @type {CloudFormationInit}
     */
    const init: CloudFormationInit = CloudFormationInit.fromElements(
      InitPackage.yum("httpd", { serviceRestartHandles: [handle] }),
      InitPackage.yum("php", { serviceRestartHandles: [handle] }),
      InitPackage.yum("amazon-cloudwatch-agent", {
        serviceRestartHandles: [handle],
      }),
      InitFile.fromObject("/tmp/cw-config.json", { //NOSONAR
        agent: {
          run_as_user: "root",
        },
        logs: {
          logs_collected: {
            files: {
              collect_list: [
                {
                  file_path: "/var/log/httpd/access_log",
                  log_group_name: ec2Lg.logGroupName,
                  log_stream_name: "{instance_id}/apache.log",
                  timezone: "UTC",
                },
              ],
            },
          },
        },
      }),
      InitFile.fromString(
        "/var/www/html/index.php",
        `<?php
        echo '<h1>AWS CloudFormation sample PHP application</h1>';
        ?>`,
        {
          mode: "000644",
          owner: "apache",
          group: "apache",
          serviceRestartHandles: [handle],
        }
      ),
      InitService.enable("httpd", {
        enabled: true,
        ensureRunning: true,
        serviceRestartHandle: handle,
      })
    );

    /**
     * @description web server instance
     * @type {Instance}
     */
    const demoEC2: Instance = new Instance(this, "DemoEC2", {
      vpc: props.demoVpc,
      instanceType: new InstanceType(manifest.jumpboxInstanceType),
      machineImage: MachineImage.latestAmazonLinux({
        virtualization: AmazonLinuxVirt.HVM,
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
        cpuType: AmazonLinuxCpuType.X86_64,
      }),
      init: init,
      allowAllOutbound: true,
      securityGroup: demoSg,
      requireImdsv2: true,
    });

    demoEC2.addUserData(
      "/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a stop",
      "/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/tmp/cw-config.json -s",
      "curl 127.0.0.1"
    );
    demoEC2.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        sid: "LogWrite",
        actions: ["logs:Create*", "logs:PutLogEvents"],
        resources: [ec2Lg.logGroupArn],
      })
    );
    this.publicIp = demoEC2.instancePublicIp;

    new CfnSubscriptionFilter(this, "WebServerSubscription", {
      destinationArn: props.destination,
      filterPattern:
        "[host, ident, authuser, date, request, status, bytes, referrer, agent]",
      logGroupName: ec2Lg.logGroupName,
    });

    applyCfnNagSuppressRules(ec2Lg.node.findChild("Resource") as CfnResource, [
      cfn_suppress_rules.W84,
    ]);
  }
}
