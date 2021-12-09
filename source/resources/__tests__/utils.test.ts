/*********************************************************************************************************************
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.                                                *
 *                                                                                                                    *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance    *
 *  with the License. A copy of the License is located at                                                             *
 *                                                                                                                    *
 *      http://www.apache.org/licenses/LICENSE-2.0                                                                    *
 *                                                                                                                    *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES *
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    *
 *  and limitations under the License.                                                                                *
 *********************************************************************************************************************/

import { App, Stack } from "@aws-cdk/core";
import * as s3 from "@aws-cdk/aws-s3";
import {
  expect as expectCDK,
  haveResource,
  haveResourceLike,
  ResourcePart,
} from "@aws-cdk/assert";

import { applyCfnNagSuppressRules } from "../lib/utils";

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
  expectCDK(stack).to(
    haveResourceLike(
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
    )
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

  expectCDK(stack).to(haveResource("AWS::S3::Bucket"));

  expectCDK(stack).to(
    haveResourceLike(
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
    )
  );
});
