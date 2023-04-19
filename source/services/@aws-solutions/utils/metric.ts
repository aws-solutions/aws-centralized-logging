// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import got from "got";
import { logger } from "./logger";

const metricsEndpoint = <string>process.env.METRICS_ENDPOINT;
const awsRegion = <string>process.env.AWS_REGION;
const solutionId = <string>process.env.SOLUTION_ID;
const solutionVersion = <string>process.env.SOLUTION_VERSION;

export const sendDeploymentMetrics = async (
  properties: { [p: string]: string },
  requestType: string
): Promise<{ [key: string]: unknown }> => {
  logger.debug({
    label: "sendDeploymentMetrics",
    message: `Sending deployment metrics`,
  });

  const stack = process.env.STACK;
  const clusterSize = process.env.CLUSTER_SIZE;

  if (!stack || !clusterSize)
    throw new Error("Missing mandatory environment variable");

  const eventType = `Solution${requestType}`;
  const data = {
    Event: eventType,
    ClusterSize: clusterSize,
    Stack: stack,
  };

  // SolutionUuid cannot be passed as environment variable in this case,
  // because it is generated after deployment of the Lambda Function
  const uuid = properties.SolutionUuid;
  const metric = await sendToAwsSolutionsEngineeringTeam(uuid, data);

  return {
    Data: metric,
  };
};

export async function sendUsageMetrics(totalItemSize: number) {
  logger.info({
    label: "sendUsageMetrics",
    message: `Sending metrics for indexed data. totalItemSize: ${totalItemSize}`,
  });
  const data = {
    TotalItemSize: `${totalItemSize}`,
  };

  const uuid = <string>process.env.UUID;

  await sendToAwsSolutionsEngineeringTeam(uuid, data);
}

async function sendToAwsSolutionsEngineeringTeam(
  uuid: string,
  data: { [p: string]: string }
) {
  const metric = {
    Solution: solutionId,
    UUID: uuid,
    TimeStamp: new Date().toISOString().replace("T", " ").replace("Z", ""), // Date and time instant in a java.sql.Timestamp compatible format,
    Data: {
      ...data,
      Version: solutionVersion,
      Region: awsRegion,
    },
  };
  try {
    await got(metricsEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "" + JSON.stringify(metric).length,
      },
      body: JSON.stringify(metric),
    });
    logger.debug(`Metric sent: ${JSON.stringify(metric)}`);
  } catch (error) {
    logger.error(
      `error occurred while sending metric: ${(error as Error).message}`
    );
  }
}
