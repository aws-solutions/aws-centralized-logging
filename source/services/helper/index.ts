// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { v4 as uuidv4 } from "uuid";
import { logger } from "logger";
import { CloudWatchLogs, EC2, IAM } from "aws-sdk";
import {
  Context,
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceUpdateEvent,
} from "aws-lambda";
import { sendDeploymentMetrics } from "metric";

const awsClients = {
  ec2: "2016-11-15",
  cwLogs: "2014-03-28",
  iam: "2010-05-08",
};

interface IResponse {
  responseData: { [key: string]: unknown };
  status: string;
}

export const handler = async (
  event: CloudFormationCustomResourceEvent,
  context: Context
) => {
  logger.debug({
    label: "helper",
    message: `received event: ${JSON.stringify(event)}`,
  });

  const properties = event.ResourceProperties;

  /**
   * handle UUID
   */
  if (
    event.ResourceType === "Custom::CreateUUID" &&
    event.RequestType === "Create"
  ) {
    const { responseData, status } = createUUID();
    return responseBody(event, context.logStreamName, status, responseData);
  }

  /**
   * handle ES Service role
   */
  if (
    event.ResourceType === "Custom::CreateESServiceRole" &&
    event.RequestType === "Create"
  ) {
    const { responseData, status } = await createESRole();
    return responseBody(event, context.logStreamName, status, responseData);
  }

  /**
   * handle launch data
   */
  if (
    event.ResourceType === "Custom::LaunchData" &&
    process.env.SEND_METRIC === "Yes"
  ) {
    const responseData = await sendDeploymentMetrics(
      properties,
      event.RequestType
    );
    return responseBody(event, context.logStreamName, "SUCCESS", responseData);
  }

  /**
   * handle CW destinations
   */
  if (event.ResourceType === "Custom::CWDestination") {
    const { responseData, status } = await crudDestinations(
      properties,
      event.RequestType
    );
    return responseBody(event, context.logStreamName, status, responseData);
  }

  /**
   * default
   */
  // send response to custom resource
  return responseBody(event, context.logStreamName, "SUCCESS", {
    Data: "no data",
  });
};

/**
 * @description create UUID for customer deployment
 * @returns
 */
const createUUID = (): IResponse => {
  const responseData = { UUID: uuidv4() };
  const status = "SUCCESS";
  logger.info({
    label: "helper/createUUID",
    message: `uuid create: ${responseData.UUID}`,
  });
  return { responseData, status };
};

/**
 * @description create ES service linked role
 * @returns
 */

const createESRole = async (): Promise<IResponse> => {
  const iam = new IAM({
    apiVersion: awsClients.iam,
    customUserAgent: process.env.CUSTOM_SDK_USER_AGENT,
  });

  let responseData: {
    [key: string]: string;
  } = { Data: "no data" };
  let status = "SUCCESS";

  await iam
    .createServiceLinkedRole({ AWSServiceName: "es.amazonaws.com" })
    .promise()
    .catch((e) => {
      logger.error({
        label: "helper/createESRole",
        message: e,
      });
      if ((e as Error).name !== "InvalidInput") {
        // InvalidInput ES service linked role already exists
        responseData = {
          Error:
            "failed to create ES service linked role, please see in cw logs for more details",
        };
        status = "FAILED";
      }
      return { responseData, status };
    });
  logger.info({
    label: "helper/createESRole",
    message: `es service linked role created`,
  });
  return { responseData, status };
};

/**
 * @description crud for cw destinations
 * @returns
 */
const crudDestinations = async (
  properties: any,
  requestType: string
): Promise<IResponse> => {
  let responseData: {
    [key: string]: string;
  } = { Data: "no data" };
  let status = "SUCCESS";
  try {
    const allRegions = await getRegions();

    // delete destinations
    if (requestType === "Delete")
      await deleteDestination(properties.DestinationName, allRegions);
    // create/update destinations
    else {
      let spokeRegions = properties.Regions;
      logger.debug({
        label: "helper/CWDestination",
        message: `Regions to ${requestType} CloudWatch destinations: ${spokeRegions}`,
      });
      if (spokeRegions[0] === "All") {
        spokeRegions = allRegions;
      }
      await putDestination(
        spokeRegions,
        allRegions,
        properties.DestinationName,
        properties.Role,
        properties.DataStream,
        properties.SpokeAccounts
      );
    }
  } catch (e) {
    logger.error({
      label: "helper/CWDestination",
      message: e,
    });
    responseData = {
      Error: `failed to ${requestType} CW destinations, please see in cw logs for more details`,
    };
    status = "FAILED";
  }
  return { responseData, status };
};

/**
 * @description get list of ec2 regions
 */
async function getRegions(): Promise<string[]> {
  logger.info({
    label: "helper/getRegions",
    message: `getting ec2 regions`,
  });
  try {
    const ec2 = new EC2({
      apiVersion: awsClients.ec2,
      customUserAgent: process.env.CUSTOM_SDK_USER_AGENT,
    });
    const _r = await ec2.describeRegions().promise();
    if (!_r.Regions) throw new Error("failed to describe regions");

    const regions = <string[]>_r.Regions.map((region) => {
      return region.RegionName;
    });
    logger.debug({
      label: "helper/getRegions",
      message: `${JSON.stringify({ regions: regions })}`,
    });
    return regions;
  } catch (e) {
    logger.error({
      label: "helper/getRegions",
      message: e,
    });
    throw new Error("error in getting regions");
  }
}

/**
 * @description create cw destinations
 * @param {string[]} regions - regions for spokes
 * @param {string} destinationName - cw logs destination name
 * @param {string} roleArn - ARN of IAM role that grants CloudWatch Logs permissions to call the Amazon Kinesis PutRecord operation on the destination stream
 * @param {string} kinesisStreamArn - The ARN of an Amazon Kinesis stream to which to deliver matching log events
 * @param {string[]} spokeAccnts - list of spoke account ids
 */
async function putDestination(
  regions: string[],
  awsRegions: string[],
  destinationName: string,
  roleArn: string,
  kinesisStreamArn: string,
  spokeAccnts: string[]
) {
  logger.info({
    label: "helper/putDestination",
    message: `putting cw logs destinations for spokes`,
  });
  try {
    // check if provided region list is valid
    const regionValid = await areRegionsValid(regions, awsRegions);
    if (regionValid) {
      await deleteDestination(destinationName, regions);
      await Promise.all(
        regions.map(async (region) => {
          logger.debug({
            label: "helper/putDestination",
            message: `creating cw logs destination in ${region}`,
          });

          const cwLogs = new CloudWatchLogs({
            apiVersion: awsClients.cwLogs,
            region: region,
            customUserAgent: process.env.CUSTOM_SDK_USER_AGENT,
          });

          //put destination
          const dest: CloudWatchLogs.PutDestinationResponse = await cwLogs
            .putDestination({
              destinationName: destinationName,
              roleArn: roleArn,
              targetArn: kinesisStreamArn,
            })
            .promise();

          // put access policy
          const accessPolicy = {
            Version: "2012-10-17",
            Statement: [
              {
                Sid: "AllowSpokesSubscribe",
                Effect: "Allow",
                Principal: {
                  AWS: spokeAccnts,
                },
                Action: "logs:PutSubscriptionFilter",
                Resource: dest.destination?.arn,
              },
            ],
          };
          await cwLogs
            .putDestinationPolicy({
              destinationName: destinationName,
              accessPolicy: JSON.stringify(accessPolicy), // for spoke accounts as principals
            })
            .promise();
          logger.debug({
            label: "helper/putDestinations",
            message: `cw logs destination created in ${region}`,
          });
        })
      );
      logger.info({
        label: "helper/putDestinations",
        message: `All cw logs destinations created`,
      });
    } else {
      throw new Error("invalid regions");
    }
  } catch (e) {
    logger.error({
      label: "helper/putDestination",
      message: e,
    });
    throw new Error("error in creating cw log destination");
  }
}

/**
 * @description delete cw destinations
 * @param {string} destinationName - cw logs destination name
 */
async function deleteDestination(destinationName: string, regions: string[]) {
  logger.info({
    label: "helper/deleteDestination",
    message: `deleting cw logs destinations `,
  });
  await Promise.allSettled(
    regions.map(async (region) => {
      const cwLogs = new CloudWatchLogs({
        apiVersion: awsClients.cwLogs,
        region: region,
        customUserAgent: process.env.CUSTOM_SDK_USER_AGENT,
      });
      await cwLogs
        .deleteDestination({ destinationName: destinationName })
        .promise()
        .then(() => {
          logger.debug({
            label: "helper/deleteDestination",
            message: `cw logs destination deleted in ${region}`,
          });
        })
        .catch((e) => {
          logger.warn({
            label: `helper/deleteDestination`,
            message: `${region}: ${(e as Error).message}`,
          });
        });
    })
  );
  logger.info({
    label: "helper/deleteDestinations",
    message: `All cw logs destinations deleted`,
  });
}

/**
 * @description check if region list is valid
 * @param {string[]} regions - region list for spokes
 */
async function areRegionsValid(regions: string[], awsRegions: string[]) {
  logger.debug({
    label: "helper/areRegionsValid",
    message: `checking if region parameter is valid`,
  });

  if (!(awsRegions instanceof Array)) throw new Error("no regions found");
  try {
    await Promise.all(
      regions.map((region) => {
        if (!awsRegions.includes(region))
          throw new Error("invalid region provided");
      })
    );
    return true;
  } catch (e) {
    logger.error({
      label: "helper/areRegionsValid",
      message: `${(e as Error).message}`,
    });
    return false;
  }
}

const responseBody = async (
  event: CloudFormationCustomResourceEvent,
  logStreamName: string,
  responseStatus: string,
  responseData: any
) => {
  const responseBody = {
    Status: responseStatus,
    Reason: `${JSON.stringify(responseData)}`,
    PhysicalResourceId:
      (event as CloudFormationCustomResourceUpdateEvent).PhysicalResourceId ||
      logStreamName,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: responseData,
  };

  logger.debug({
    label: "helper/responseBody",
    message: `Response Body: ${JSON.stringify(responseBody)}`,
  });

  if (responseStatus === "FAILED") {
    throw new Error(responseBody.Data.Error);
  } else return responseBody;
};
