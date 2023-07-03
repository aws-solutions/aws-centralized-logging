// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, DefaultStackSynthesizer } from "aws-cdk-lib";
import { CLPrimary } from "../lib/cl-primary-stack";

const app = new App();

new CLPrimary(app, "CL-PrimaryStack", {
  synthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});
