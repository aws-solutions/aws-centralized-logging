// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "@aws-cdk/assert/jest";
import { CLPrimary } from "../lib/cl-primary-stack";
import { App, Stack } from "aws-cdk-lib";

describe("==Primary Stack Tests==", () => {
  const app = new App();
  const stack: Stack = new CLPrimary(app, "CL-PrimaryStack");

  describe("Test resources", () => {
    test("snapshot test", () => {
      expect(stack).toMatchSnapshot();
    });
  });
});
