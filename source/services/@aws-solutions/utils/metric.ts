/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import got from "got";

/**
 * Send metrics to solutions endpoint
 * @class Metrics
 */
export class Metrics {
  /**
   * Sends anonymous metric
   * @param {object} metric - metric JSON data
   */
  static async sendAnonymousMetric(
    endpoint: string,
    metric: {
      Solution: string;
      UUID: string;
      TimeStamp: string;
      Data: { [key: string]: string };
    }
  ): Promise<string> {
    try {
      await got(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "" + JSON.stringify(metric).length,
        },
        body: JSON.stringify(metric),
      });
      return `Metric sent: ${JSON.stringify(metric)}`;
    } catch (error) {
      return `error occurred while sending metric: ${(error as Error).message}`;
    }
  }
}
