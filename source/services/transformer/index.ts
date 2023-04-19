// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import zlib from "zlib";
import { Firehose } from "aws-sdk";
import { Record } from "aws-sdk/clients/firehose";
import { logger } from "logger";
import { sendUsageMetrics } from "metric";

/**
 * @description interface for log event
 * @property {string} id for the log event
 * @property {number}  timestamp for the log event
 * @property {string}  message stringified log event
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
  if ("account_id" in source) source["account_id"] = "" + source["account_id"];
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
    logger.debug({
      label: "handler",
      message: `extractedFields: ${extractedFields} `,
    });
    const source: { [key: string]: any } = {};

    for (const key in extractedFields) {
      if (extractedFields[key]) {
        const value = extractedFields[key];
        if (isNumeric(value)) {
          source[key] = 1 * value;
          continue;
        }

        const _jsonSubString = extractJson(value);
        if (_jsonSubString !== null) {
          source["$" + key] = JSON.parse(_jsonSubString);
        }

        source[key] = value;
      }
    }

    return source;
  }

  logger.debug({
    label: "handler",
    message: `message: ${message} `,
  });
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
  const firehose = new Firehose({
    customUserAgent: process.env.CUSTOM_SDK_USER_AGENT,
  });
  await firehose.putRecordBatch(params).promise();

  if (process.env.SEND_METRIC === "Yes") {
    const recordLengths = records.map((it) => (it.Data as Buffer).byteLength);
    const summedItemSize = recordLengths.reduce((sum, next) => {
      return sum + next;
    }, 0);
    await sendUsageMetrics(summedItemSize);
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
        const payload = JSON.parse(decompressed.toString());
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
