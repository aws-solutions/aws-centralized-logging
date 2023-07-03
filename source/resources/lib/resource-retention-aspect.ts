// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { CfnResource, IAspect } from "aws-cdk-lib";
import { IConstruct } from "constructs";
import { applyRetentionPolicy } from "./utils";

/**
 * @description cdk aspect to apply deletion policy
 */
export class ResourceRetentionAspect implements IAspect {
  public visit(node: IConstruct) {
    if (node instanceof CfnResource) {
      applyRetentionPolicy(node);
    }
  }
}
