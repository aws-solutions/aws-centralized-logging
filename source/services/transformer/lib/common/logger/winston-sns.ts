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
import Transport = require("winston-transport");
import "util";
import { SNS } from "aws-sdk";

//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
export class WinstonSNS extends Transport {
  readonly topic_arn: string;
  readonly region: string;
  private sns: any;
  constructor(opts: any) {
    super(opts);
    this.topic_arn = opts.topic_arn;
    this.region = opts.topic_arn.split(":")[3];
    //
    // Consume any custom options here. e.g.:
    // - Connection information for databases
    // - Authentication information for APIs (e.g. loggly, papertrail,
    //   logentries, etc.).
    //
  }
  formatter = async (info: any) => {
    if (info.label)
      return `[${info.level.toUpperCase()}] [${info.label}] ${
        info.timestamp
      }: ${JSON.stringify(info.message, null, 2)}`;
    else
      return `[${info.level.toUpperCase()}] ${info.timestamp}: ${JSON.stringify(
        info.message,
        null,
        2
      )}`;
  };

  log = async (info: any) => {
    try {
      this.sns = new SNS({
        apiVersion: "2010-03-31",
        region: this.region,
      });
      const _txt = await this.formatter(info);
      await this.sns
        .publish({
          Message: _txt,
          TopicArn: this.topic_arn,
        })
        .promise();
      return "sns message published successfully";
    } catch (e) {
      throw new Error(e.message);
    }
  };
}
