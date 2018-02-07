/*********************************************************************************************************************
 *  Copyright 2016 Amazon.com, Inc. or its affiliates. All Rights Reserved.                                           *
 *                                                                                                                    *
 *  Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance        *
 *  with the License. A copy of the License is located at                                                             *
 *                                                                                                                    *
 *      http://aws.amazon.com/asl/                                                                                    *
 *                                                                                                                    *
 *  or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES *
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    *
 *  and limitations under the License.                                                                                *
 *********************************************************************************************************************/

/**
 * @author Solution Builders
 */

'use strict';

let https = require('https');
let zlib = require('zlib');
let crypto = require('crypto');
let AWS = require('aws-sdk');
let moment = require('moment');
const MetricsHelper = require('./lib/metrics-helper.js');

const endpoint = process.env.DomainEndpoint;
const masterRole = process.env.MasterRole;
const sessionId = process.env.SessionId;
const owner = process.env.Owner;
const solution = process.env.Solution;
const clusterSize = process.env.ClusterSize;
const uuid = process.env.UUID;
const anonymousData = process.env.AnonymousData;

function handler(input, context, callback) {

  let eventText = JSON.stringify(input, null, 2);

  //return callback if environment variable not set
  if (!endpoint || !masterRole || !sessionId || !owner) return callback(
    'environment variables not defined');

  // Log a message to the console, you can view this text in the Monitoring tab in the Lambda console
  // or in the CloudWatch Logs console
  console.log('Received event:', eventText);

  // decode input from base64
  let zippedInput = new Buffer(input.awslogs.data, 'base64');

  // decompress the input
  zlib.gunzip(zippedInput, function(error, buffer) {
    if (error) {
      return callback(error);
    }

    // parse the input from JSON
    let awslogsData = JSON.parse(buffer.toString('utf8'));

    // transform the input to Elasticsearch documents
    let elasticsearchBulkData = transform(awslogsData);

    // skip control messages
    if (!elasticsearchBulkData) {
      console.log('Received a control message');
      return callback(null, 'success');
    }

    console.log('elasticsearchBulkData:', elasticsearchBulkData);

    // post documents to the Amazon Elasticsearch Service
    post(elasticsearchBulkData, function(error, success,
      statusCode,
      failedItems) {
      console.log('Response: ' + JSON.stringify({
        "statusCode": statusCode
      }));

      if (error) {
        console.log('postElasticSearchBulkData Error: ' +
          JSON.stringify(
            error, null, 2));

        if (failedItems && failedItems.length > 0) {
          console.log("Failed Items: " +
            JSON.stringify(failedItems, null, 2));
        }

        return callback(error);

      } else {
        console.log('Success: ' + JSON.stringify(success));

        if (anonymousData === 'Yes') {

          //send anonymous metrics ONLY if chosen 'Yes'
          sendMetrics({
            'clusterSize': clusterSize,
            'itemsIndexed': success.successfulItems,
            'totalItemSize': success.totalItemSize
          }, function(err, data) {
            if (err) console.log('Metrics Status: ' + JSON.stringify(
              err));
            else console.log('Metrics Status: ' + JSON.stringify(
              data));
            return callback('Success');
          });
        } else return callback('Success');


      }

    });

  });

}

/**
 * Transform CloudWatch Logs stream data for indexing
 * on ES domain
 * @param {JSON} payload - cw log stream data
 */
function transform(payload) {
  if (payload.messageType === 'CONTROL_MESSAGE') {
    return null;
  }

  let bulkRequestBody = '';

  payload.logEvents.forEach(function(logEvent) {
    let timestamp = new Date(1 * logEvent.timestamp);

    // index name format: cwl-YYYY.MM.DD
    let indexName = [
      'cwl-' + timestamp.getUTCFullYear(), // year
      ('0' + (timestamp.getUTCMonth() + 1)).slice(-2), // month
      ('0' + timestamp.getUTCDate()).slice(-2) // day
    ].join('.');

    let source = buildSource(logEvent.message, logEvent.extractedFields);
    source['@id'] = logEvent.id;
    source['@timestamp'] = new Date(1 * logEvent.timestamp).toISOString();
    source['@message'] = logEvent.message;
    source['@owner'] = payload.owner;
    source['@log_group'] = payload.logGroup;
    source['@log_stream'] = payload.logStream;

    let action = {
      "index": {}
    };
    action.index._index = indexName;
    action.index._type = 'CloudWatchLogs';
    action.index._id = logEvent.id;

    bulkRequestBody += [
      JSON.stringify(action),
      JSON.stringify(source),
    ].join('\n') + '\n';
  });
  return bulkRequestBody;
}

/**
 * Building item for ES indexing
 * @param {String} message - message field from cw event
 * @param {Array} extractedFields - extracted fields from cw event
 */
function buildSource(message, extractedFields) {
  if (extractedFields) {
    let source = {};

    for (let key in extractedFields) {
      if (extractedFields.hasOwnProperty(key) && extractedFields[key]) {
        let value = extractedFields[key];

        if (isNumeric(value)) {
          source[key] = 1 * value;
          continue;
        }

        let jsonSubString = extractJson(value);
        if (jsonSubString !== null) {
          source['$' + key] = JSON.parse(jsonSubString);
        }

        source[key] = value;
      }
    }
    return source;
  }

  let jsonSubString = extractJson(message);
  if (jsonSubString !== null) {
    return JSON.parse(jsonSubString);
  }

  return {};
}

function extractJson(message) {
  let jsonStart = message.indexOf('{');
  if (jsonStart < 0) return null;
  let jsonSubString = message.substring(jsonStart);
  return isValidJson(jsonSubString) ? jsonSubString : null;
}

function isValidJson(message) {
  try {
    JSON.parse(message);
  } catch (e) {
    return false;
  }
  return true;
}

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

/**
 * Post logs on ES domain.
 * @param {body} body - ES bulk data to be indexed
 * @param {post~callback} callback - The callback that handles the response.
 */
function post(body, callback) {

  console.log('endpoint:', endpoint);

  assumeRole(function(err, creds) {
    if (err) {
      console.log('error in assuming role: ', err);
      return callback(err);
    }

    buildRequest(endpoint, body, creds, function(err, requestParams) {
      if (err) {
        console.log('error in http request: ', err);
        return callback(err);
      }

      console.log('requestParams:', requestParams);
      let request = https.request(requestParams, function(response) {
        let responseBody = '';
        response.on('data', function(chunk) {
          responseBody += chunk;
        });
        response.on('end', function() {
          let info = JSON.parse(responseBody);
          let failedItems;
          let success;

          console.log('post info:', info);

          if (response.statusCode >= 200 && response.statusCode <
            299) {
            failedItems = info.items.filter(function(x) {
              return x.index.status >= 300;
            });

            success = {
              "attemptedItems": info.items.length,
              "successfulItems": info.items.length -
                failedItems.length,
              "failedItems": failedItems.length,
              "totalItemSize": requestParams.headers[
                'Content-Length']
            };
          }

          let error = response.statusCode !== 200 || info.errors ===
            true ? {
              "statusCode": response.statusCode,
              "responseBody": responseBody
            } : null;

          console.log('post error:', error);

          return callback(error, success, response.statusCode,
            failedItems);

        });
      }).on('error', function(e) {
        return callback(e);
      });
      request.end(requestParams.body);
    });

  });

}

/**
 * Assumes role with permissions for ES indexing
 * @param {assumeRole~callback} cb - The callback that handles the response with credentials
 */
function assumeRole(cb) {
  let creds = {
    aws_secret_key: process.env.AWS_SECRET_ACCESS_KEY,
    aws_access_key: process.env.AWS_ACCESS_KEY_ID,
    aws_session_token: process.env.AWS_SESSION_TOKEN
  };

  //assume role in spoke accounts
  if (owner === 'Spoke') {
    //assume role for posting documents on ES Domain
    let sts = new AWS.STS({
      apiVersion: '2011-06-15'
    });
    sts.assumeRole({
      RoleArn: masterRole,
      /* required */
      RoleSessionName: sessionId,
      /* required */
    }, function(err, data) {
      if (err) {
        console.log(err);
        return cb(err, null);
      } // an error occurred
      else {
        console.log('assume role response: ', data);
        creds = {
          aws_secret_key: data.Credentials.SecretAccessKey,
          aws_access_key: data.Credentials.AccessKeyId,
          aws_session_token: data.Credentials.SessionToken
        };
        return cb(null, creds);
      }
    });
  } else if (owner === 'Hub') return cb(null, creds);
  else return cb('invalid owner', null);
}

/**
 * Build https request for indexing on ES
 * @param {String} endpoint - ES endpoint for log indexing
 * @param {String} body - - ES bulk data to be indexed
 * @param {Dictionary} creds - AWS credentials for https request
 * @param {buildRequest~callback} cb - The callback that handles the response
 */
function buildRequest(endpoint, body, creds, cb) {
  let endpointParts = endpoint.match(
    /^([^\.]+)\.?([^\.]*)\.?([^\.]*)\.amazonaws\.com$/);
  let region = endpointParts[2];
  let service = endpointParts[3];
  let datetime = (new Date()).toISOString().replace(/[:\-]|\.\d{3}/g, '');
  let date = datetime.substr(0, 8);
  let kDate = hmac('AWS4' + creds.aws_secret_key, date);
  let kRegion = hmac(kDate, region);
  let kService = hmac(kRegion, service);
  let kSigning = hmac(kService, 'aws4_request');

  let request = {
    host: endpoint,
    method: 'POST',
    path: '/_bulk',
    body: body,
    headers: {
      'Content-Type': 'application/json',
      'Host': endpoint,
      'Content-Length': Buffer.byteLength(body),
      'X-Amz-Security-Token': creds.aws_session_token,
      'X-Amz-Date': datetime
    }
  };

  let canonicalHeaders = Object.keys(request.headers)
    .sort(function(a, b) {
      return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
    })
    .map(function(k) {
      return k.toLowerCase() + ':' + request.headers[k];
    })
    .join('\n');

  let signedHeaders = Object.keys(request.headers)
    .map(function(k) {
      return k.toLowerCase();
    })
    .sort()
    .join(';');

  let canonicalString = [
    request.method,
    request.path, '',
    canonicalHeaders, '',
    signedHeaders,
    hash(request.body, 'hex'),
  ].join('\n');

  let credentialString = [date, region, service, 'aws4_request'].join('/');

  let stringToSign = [
    'AWS4-HMAC-SHA256',
    datetime,
    credentialString,
    hash(canonicalString, 'hex')
  ].join('\n');

  request.headers.Authorization = [
    'AWS4-HMAC-SHA256 Credential=' + creds.aws_access_key + '/' +
    credentialString,
    'SignedHeaders=' + signedHeaders,
    'Signature=' + hmac(kSigning, stringToSign, 'hex')
  ].join(', ');

  return cb(null, request);
}

function hmac(key, str, encoding) {
  return crypto.createHmac('sha256', key).update(str, 'utf8').digest(encoding);
}

function hash(str, encoding) {
  return crypto.createHash('sha256').update(str, 'utf8').digest(encoding);
}

function sendMetrics(metricData, cb) {
  let _metricsHelper = new MetricsHelper();

  let _metric = {
    Solution: solution,
    UUID: uuid,
    TimeStamp: moment().utc().format('YYYY-MM-DD HH:mm:ss.S'),
    Data: {
      ClusterSize: metricData.clusterSize,
      ItemsIndexed: metricData.itemsIndexed,
      TotalItemSize: metricData.totalItemSize
    }
  };

  console.log('anonymous metric: ', JSON.stringify(_metric));

  _metricsHelper.sendAnonymousMetric(_metric, function(err, data) {
    if (err) {
      let responseData = {
        Error: 'Sending anonymous metric failed'
      };
      console.log([responseData.Error, ':\n', err].join(''));
      cb(responseData, null);
    } else {
      let responseStatus = 'SUCCESS';
      let responseData = {
        Success: 'Anonymous metrics sent to AWS'
      };
      cb(null, responseData);
    }
  });

}

module.exports = {
  handler,
  transform,
  buildSource,
  buildRequest,
  assumeRole
};
