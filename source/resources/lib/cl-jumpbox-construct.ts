// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * This is Jumpbox construct for Centralized Logging on AWS Solution
 * @author @aws-solutions
 */

import { Stack, CfnCondition, CfnResource } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  Instance,
  InstanceType,
  MachineImage,
  WindowsVersion,
  Vpc,
  SecurityGroup,
  ISubnet,
  Port,
  Peer,
} from "aws-cdk-lib/aws-ec2";
import manifest from "./manifest.json";
import { applyCfnNagSuppressRules, cfn_suppress_rules } from "./utils";

interface IJumpbox {
  /**
   * @description vpc to launch jumpbox
   * @type {Vpc}
   */
  vpc: Vpc;
  /**
   * @description public subnets to launch jumpbox
   * @type {ISubnet[]}
   */
  subnets: ISubnet[];
  /**
   * @description ssh key for jumpbox
   * @type {string}
   */
  keyname: string;
  /**
   * @description deploy jumpbox
   * @type {CfnCondition}
   */
  deploy: CfnCondition;
}
/**
 * @class
 * @description web server resources construct
 * @property {string} region of deployment
 */
export class Jumpbox extends Construct {
  readonly region: string;
  constructor(scope: Construct, id: string, props: IJumpbox) {
    super(scope, id);

    const stack = Stack.of(this);

    this.region = stack.region; // Returns the AWS::Region for this stack (or the literal value if known)

    //=========================================================================
    // Resource
    //=========================================================================
    /**
     * @description security group for jumpbox
     * @type {SecurityGroup}
     */
    const sg: SecurityGroup = new SecurityGroup(this, "JumpboxSG", {
      vpc: props.vpc,
      allowAllOutbound: false,
    });
    sg.addEgressRule(Peer.anyIpv4(), Port.tcp(80), "allow outbound https");
    sg.addEgressRule(Peer.anyIpv4(), Port.tcp(443), "allow outbound https");
    applyCfnNagSuppressRules(sg.node.defaultChild as CfnResource, [
      cfn_suppress_rules.W5,
    ]);
    (sg.node.defaultChild as CfnResource).cfnOptions.condition = props.deploy;

    /**
     * @description jumpbox instance
     * @type {Instance}
     */
    const jumpbox: Instance = new Instance(this, "JumpboxEC2", {
      vpc: props.vpc,
      instanceType: new InstanceType(manifest.jumpboxInstanceType),
      machineImage: MachineImage.latestWindows(
        WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE
      ),
      securityGroup: sg,
      vpcSubnets: { subnets: props.subnets },
      keyName: props.keyname,
      requireImdsv2: true,
    });
    (jumpbox.node.defaultChild as CfnResource).cfnOptions.condition =
      props.deploy;
  }
}
