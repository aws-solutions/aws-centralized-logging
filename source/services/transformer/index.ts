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

import zlib from "zlib";
import { Firehose } from "aws-sdk";
import { Record } from "aws-sdk/clients/firehose";
import { logger } from "./lib/common/logger";
import { Metrics } from "./lib/common/metrics";
import moment from "moment";
/**
 * @description interface for log event
 * @property {string} id for the log event
 * @property {number}  timestamp for the log event
 * @property {string}  message stringified log evenrt
 * @property {any}  extractedFields inferred fields from the event
 */
interface ILogEvent {
  id: string;
  timestamp: number;
  message: string;
  extractedFields: any;
}

/**
 * @description interface for log event
 * @property {any[]} Records kinesis records from the data stream
 */
interface IEvent {
  Records: [
    {
      kinesis: {
        kinesisSchemaVersion: string;
        partitionKey: string;
        sequenceNumber: string;
        data: string;
        approximateArrivalTimestamp: number;
      };
      eventSource: string;
      eventVersion: string;
      eventID: string;
      eventName: string;
      invokeIdentityArn: string;
      awsRegion: string;
      eventSourceARN: string;
    }
  ];
}

/**
 * @description transform log events into es documents
 * @param {ILogEvent} logEvent - log event to transform into es document
 * @param {string} owner - account id of the owner
 * @param {string} logGroup - log group originating the event
 * @param {string} logStream - log stream originating the event
 */
function transform(
  logEvent: ILogEvent,
  owner: string,
  logGroup: string,
  logStream: string
) {
  const source = buildSource(logEvent.message, logEvent.extractedFields);
  if ("requestParameters" in source)
    source["requestParameters"] = JSON.stringify(source["requestParameters"]);
  if ("responseElements" in source)
    source["responseElements"] = JSON.stringify(source["responseElements"]);
  if ("apiVersion" in source) source["apiVersion"] = "" + source["apiVersion"];
  source["timestamp"] = new Date(1 * logEvent.timestamp).toISOString();
  source["id"] = logEvent.id;
  source["type"] = "CloudWatchLogs";
  source["@message"] = logEvent.message;
  source["@owner"] = owner;
  source["@log_group"] = logGroup;
  source["@log_stream"] = logStream;

  return source;
}

/**
 * @description building source for log events
 * @param message - log event
 * @param extractedFields - fields in the log event
 */
function buildSource(message: string, extractedFields: any) {
  if (extractedFields) {
    const source = {};

    for (const key in extractedFields) {
      if (
        Object.prototype.hasOwnProperty.call(extractedFields, key) &&
        extractedFields[key]
      ) {
        const value = extractedFields[key];

        if (isNumeric(value)) {
          source[key] = 1 * value;
          continue;
        }

        const jsonSubString = extractJson(value);
        if (jsonSubString !== null) {
          source["$" + key] = JSON.parse(jsonSubString);
        }

        source[key] = value;
      }
    }

    return source;
  }

  const jsonSubString = extractJson(message);
  if (jsonSubString !== null) {
    return JSON.parse(jsonSubString);
  }

  return {};
}

/**
 * @description extracting json from log event
 * @param {string} message - log event
 */
function extractJson(message: string) {
  const jsonStart = message.indexOf("{");
  if (jsonStart < 0) return null;
  const jsonSubString = message.substring(jsonStart);
  return isValidJson(jsonSubString) ? jsonSubString : null;
}

/**
 * @description checking if extracted field has valid JSON
 * @param {string} message - log event
 */
function isValidJson(message: string) {
  try {
    JSON.parse(message);
  } catch (e) {
    return false;
  }
  return true;
}

/**
 * @description checking if extracted field has numeric value
 * @param n - extracted field to test for numeric value
 */
function isNumeric(n: any) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

/**
 * @description creates records for firehose from the log events
 * @param {ILogEvent} logEvent - log event to transform into es document
 * @param {string} owner - account id of the owner
 * @param {string} logGroup - log group originating the event
 * @param {string} logStream - log stream originating the event
 */
function createRecordsFromEvents(
  logEvents: ILogEvent[],
  owner: string,
  logGroup: string,
  logStream: string
) {
  const records: Record[] = [];
  logEvents.forEach((event: ILogEvent) => {
    const transformedEvent = transform(event, owner, logGroup, logStream);
    logger.debug({
      label: "createRecordsFromEvents",
      message: `transformed event: ${JSON.stringify(transformedEvent)}`,
    });
    records.push({
      Data: Buffer.from(JSON.stringify(transformedEvent)),
    });
  });
  logger.info({
    label: "createRecordsFromEvents",
    message: "records created from log events",
  });
  return records;
}

async function putRecords(records: Record[]) {
  logger.debug({
    label: "putRecords",
    message: "records put on firehose",
  });
  const params = {
    DeliveryStreamName: "" + process.env.DELIVERY_STREAM /* required */,
    Records: records,
  };
  const firehose = new Firehose();
  await firehose.putRecordBatch(params).promise();

  // send usage metric to aws-solutions
  if (process.env.SEND_METRIC === "Yes") {
    logger.info({
      label: "putRecords",
      message: `sending metrics for indexed data`,
    });

    let totalItemSize = 0;
    records.forEach((r) => {
      totalItemSize += (r.Data as Buffer).byteLength;
    });
    logger.debug({
      label: "putRecords/sendMetric",
      message: `totalItemSize: ${totalItemSize}`,
    });

    const metric = {
      Solution: process.env.SOLUTION_ID,
      UUID: process.env.UUID,
      TimeStamp: moment.utc().format("YYYY-MM-DD HH:mm:ss.S"),
      Data: {
        TotalItemSize: totalItemSize,
        Version: process.env.SOLUTION_VERSION,
        Region: process.env.AWS_REGION,
      },
    };
    await Metrics.sendAnonymousMetric(
      <string>process.env.METRICS_ENDPOINT,
      metric
    );
  }
}

exports.handler = async (event: IEvent) => {
  logger.debug({
    label: "handler",
    message: `event: ${JSON.stringify(event)}`,
  });
  await Promise.allSettled(
    event.Records.map(async (r) => {
      try {
        const buffer = Buffer.from(r.kinesis.data, "base64");
        let decompressed;
        try {
          decompressed = zlib.gunzipSync(buffer);
        } catch (e) {
          logger.error({
            label: "handler",
            message: `error in reading data: ${JSON.stringify(e)} `,
          });
          throw new Error("error in decompressing data");
        }
        const payload = JSON.parse(decompressed);
        logger.debug({ label: "handler", message: JSON.stringify(payload) });

        // CONTROL_MESSAGE are sent by CWL to check if the subscription is reachable.
        // They do not contain actual data.
        if (payload.messageType === "CONTROL_MESSAGE") {
          return;
        } else if (payload.messageType === "DATA_MESSAGE") {
          const records = createRecordsFromEvents(
            payload.logEvents,
            payload.owner,
            payload.logGroup,
            payload.logStream
          );
          await putRecords(records);
          logger.info({
            label: "handler",
            message: "records put success",
          });
        } else {
          return;
        }
      } catch (e) {
        logger.error({
          label: "handler",
          message: e,
        });
      }
    })
  );
};
