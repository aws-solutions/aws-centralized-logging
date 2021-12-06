/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

/**
 * @description
 * This is EC2 construct for WebServer resource
 * @author @aws-solutions
 */

import { Stack, Construct, RemovalPolicy, CfnResource } from "@aws-cdk/core";
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
} from "@aws-cdk/aws-ec2";
import {
  LogGroup,
  RetentionDays,
  CfnSubscriptionFilter,
} from "@aws-cdk/aws-logs";
import { Effect, PolicyStatement } from "@aws-cdk/aws-iam";
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
      InitFile.fromObject("/tmp/cw-config.json", {
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

    /**
     * @description subscription filter on web server log group
     * @type {SubscriptionFilter}
     */
    new CfnSubscriptionFilter(this, "WebServerSubscription", {
      destinationArn: props.destination,
      filterPattern:
        "[host, ident, authuser, date, request, status, bytes, referrer, agent]",
      logGroupName: ec2Lg.logGroupName,
    });

    // cfn_nag suppress rule
    applyCfnNagSuppressRules(ec2Lg.node.findChild("Resource") as CfnResource, [
      cfn_suppress_rules.W84,
    ]);
  }
}
