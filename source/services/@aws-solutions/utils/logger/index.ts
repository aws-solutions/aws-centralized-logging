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
/** 
 * {
     emerg: 0,
     alert: 1,
     crit: 2,
     error: 3,
     warning: 4,
     notice: 5,
     info: 6,
     debug: 7
    }
 */
import { createLogger, transports, format } from "winston";
const { combine, timestamp, printf } = format;

/*
 * Formatting the output as desired
 */
const myFormat = printf(({ level, label, message }) => {
  const _level = level.toUpperCase();
  if (label) return `[${_level}] [${label}] ${message}`;
  else return `[${_level}] ${message}`;
});

export const logger = createLogger({
  format: combine(
    //
    // Order is important here, the formats are called in the
    // order they are passed to combine.
    //
    timestamp(),
    myFormat
  ),

  transports: [
    //cw logs transport channel
    new transports.Console({
      level: process.env.LOG_LEVEL,
      handleExceptions: true, //handle uncaught exceptions
      //format: format.splat()
    }),
  ],
});
