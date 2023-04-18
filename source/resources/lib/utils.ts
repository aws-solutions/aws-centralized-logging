// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Utils for cdk constructs
 * @author @aws-solutions
 */

import { Resource, CfnResource, RemovalPolicy } from "aws-cdk-lib";

interface CfnNagSuppression {
  id: string;
  reason: string;
}

export function applyRetentionPolicy(resource: Resource | CfnResource) {
  if (resource) {
    if (resource instanceof Resource)
      resource = resource.node.defaultChild as CfnResource;
    resource.applyRemovalPolicy(RemovalPolicy.RETAIN);
  }
}

export function applyDependsOn(
  dependee: Resource | CfnResource,
  parent: Resource
) {
  if (dependee) {
    if (dependee instanceof Resource)
      dependee = dependee.node.defaultChild as CfnResource;
    dependee.addDependency(parent.node.defaultChild as CfnResource);
  }
}

export function applyCfnNagSuppressRules(
  resource: CfnResource,
  suppressions: CfnNagSuppression[]
) {
  let rules = [];

  if (suppressions instanceof Array)
    for (const suppression of suppressions) {
      rules.push({ id: suppression.id, reason: suppression.reason });
    }

  if (resource.cfnOptions.metadata?.cfn_nag) {
    // If the CfnResource already contains some suppressions, we don't want to erase them.
    const existingRules =
      resource.cfnOptions.metadata.cfn_nag.rules_to_suppress;
    rules = [...existingRules, ...rules];
  }

  // It's possible that multiple constructs try to add the same suppression.
  // We only keep one occurrence (last) of each.
  // Based on https://stackoverflow.com/a/56768137
  const uniqueRules = [
    ...new Map(rules.map((rule) => [rule.id, rule])).values(),
  ];

  resource.cfnOptions.metadata = {
    cfn_nag: {
      rules_to_suppress: uniqueRules,
    },
  };
}

/**
 * @description common cfn_nag suppress rules
 */
export const cfn_suppress_rules: { [key: string]: CfnNagSuppression } = {
  W2: {
    id: "W2",
    reason: "Security group is a demo resource, allows CIDR open to world",
  },
  W5: {
    id: "W5",
    reason: "Security group allows outbound traffic for http[s]",
  },
  W9: {
    id: "W9",
    reason:
      "Security group is a demo web server, inbound access needed, CIDR not /32",
  },
  W11: {
    id: "W11",
    reason: "Cognito actions do not allow resource level permissions",
  },
  W12: {
    id: "W12",
    reason: "* needed, actions do no support resource level permissions",
  },
  W28: {
    id: "W28",
    reason: "OpenSearch service uses customer provided domain name",
  },
  W33: {
    id: "W33",
    reason: "Subnet allows public ip for jumpbox and demo web server",
  },
  W35: {
    id: "W35",
    reason:
      "Access logging disabled on the bucket as its a logging bucket or a demo resource",
  },
  W40: {
    id: "W40",
    reason:
      "Security group is a demo resource, egress with allow all IP Protocol",
  },
  W51: {
    id: "W51",
    reason: "Bucket allows permissions for log delivery",
  },
  W58: {
    id: "W58",
    reason:
      "CloudWatch logs write permissions added with managed role AWSLambdaBasicExecutionRole",
  },
  W76: {
    id: "W76",
    reason: "IAM policy verified",
  },
  W84: {
    id: "W84",
    reason:
      "Log group is encrypted using the CloudWatch server-side encryption keys (AWS Managed Keys)",
  },
  W89: {
    id: "W89",
    reason:
      "Not a valid use case for Lambda functions to be deployed inside a VPC",
  },
  W92: {
    id: "W92",
    reason: "Not a valid use case for Lambda reserved concurrency",
  },
};
