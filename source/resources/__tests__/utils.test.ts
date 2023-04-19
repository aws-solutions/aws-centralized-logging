// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "@aws-cdk/assert/jest";
import { App, Stack } from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";

import { applyCfnNagSuppressRules } from "../lib/utils";
import { ResourcePart } from "@aws-cdk/assert";

test("validate cfn_nag suppressions are added", () => {
  const app = new App();
  const stack = new Stack(app, "TestStack");

  const cfnBucket = new s3.CfnBucket(stack, "TestBucket");

  // Add individual suppression
  applyCfnNagSuppressRules(cfnBucket, [
    {
      id: "W1",
      reason: "This should be ignored",
    },
  ]);
  expect(stack).toHaveResourceLike(
    "AWS::S3::Bucket",
    {
      Metadata: {
        cfn_nag: {
          rules_to_suppress: [
            {
              id: "W1",
              reason: "This should be ignored",
            },
          ],
        },
      },
    },
    ResourcePart.CompleteDefinition
  );

  // Add multiple suppressions (one of which is an overwrite)
  applyCfnNagSuppressRules(cfnBucket, [
    {
      id: "W1",
      reason: "Reason for warning 1",
    },
    {
      id: "W2",
      reason: "Reason for warning 2",
    },
    {
      id: "W3",
      reason: "Reason for warning 3",
    },
  ]);

  expect(stack).toHaveResource("AWS::S3::Bucket");

  expect(stack).toHaveResourceLike(
    "AWS::S3::Bucket",
    {
      Metadata: {
        cfn_nag: {
          rules_to_suppress: [
            {
              id: "W1",
              reason: "Reason for warning 1",
            },
            {
              id: "W2",
              reason: "Reason for warning 2",
            },
            {
              id: "W3",
              reason: "Reason for warning 3",
            },
          ],
        },
      },
    },
    ResourcePart.CompleteDefinition
  );
});
