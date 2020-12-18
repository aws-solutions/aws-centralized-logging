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
import got from "got";
import { logger } from "../logger/index";
/**
 * Send metrics to solutions endpoint
 * @class Metrics
 */
export class Metrics {
  /**
   * Sends anonymous metric
   * @param {object} metric - metric JSON data
   */
  static async sendAnonymousMetric(endpoint: string, metric: any) {
    logger.debug({
      label: "metrics/sendAnonymousMetric",
      message: `metrics endpoint: ${endpoint}`,
    });
    logger.debug({
      label: "metrics/sendAnonymousMetric",
      message: `sending metric:${JSON.stringify(metric)}`,
    });
    try {
      await got(endpoint, {
        port: 443,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "" + JSON.stringify(metric).length,
        },
        body: JSON.stringify(metric),
      });
      logger.info({
        label: "metrics/sendAnonymousMetric",
        message: `metric sent successfully`,
      });
      return `Metric sent: ${JSON.stringify(metric)}`;
    } catch (error) {
      logger.warn({
        label: "metrics/sendAnonymousMetric",
        message: `Error occurred while sending metric: ${JSON.stringify(
          error
        )}`,
      });
      return `Error occurred while sending metric`;
    }
  }
}
