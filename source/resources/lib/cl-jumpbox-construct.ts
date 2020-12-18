/**
 *  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
 * This is Jumpbox construct for AWS Centralized Logging Solution
 * @author @aws-solutions
 */

import { Stack, Construct, CfnCondition, CfnResource } from "@aws-cdk/core";
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
} from "@aws-cdk/aws-ec2";
import manifest from "./manifest.json";

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
    (sg.node.defaultChild as CfnResource).cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W5",
            reason: "outbound traffic for http[s]",
          },
        ],
      },
    };
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
    });
    (jumpbox.node.defaultChild as CfnResource).cfnOptions.condition =
      props.deploy;
  }
}
