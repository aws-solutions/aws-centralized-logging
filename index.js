//Copyright 2016-2017 Amazon.com, Inc. or its affiliates.  All Rights Reserved.  Licensed under the
//Amazon Software License (the "License").  You may not use this file except in compliance with the License. A copy of the
//License is located at http://aws.amazon.com/asl or in the "license" file accompanying this file.  This file is distributed on an "AS
//IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific
//language governing permissions and limitations under the License.

// v1.1.2
var https = require('https');
var zlib = require('zlib');
var crypto = require('crypto');
var AWS = require('aws-sdk');
const util = require('util');

var endpoint = "";

exports.handler = function(input, context) {
    // decode input from base64
    console.log(input);
    var zippedInput = new Buffer(input.awslogs.data, 'base64');

    //grab the name of the endpoint
    var grabStackId = context.invokedFunctionArn;
    var lastN = grabStackId.lastIndexOf(":");
    var lastO = grabStackId.lastIndexOf("-");
    var stackId = grabStackId.substring(lastN, lastO);
    lastO = stackId.lastIndexOf("-");
    stackId = stackId.substring(1, lastO);
    console.log("stackID is ", stackId);

    endpoint = process.env.ENDPOINT;
    console.log("endpoint is ", endpoint);

    zlib.gunzip(zippedInput, function(error, buffer) {
        if (error) { context.fail(error); return; }

        // parse the input from JSON
        var awslogsData = JSON.parse(buffer.toString('utf8'));

        // transform the input to Elasticsearch documents
        var elasticsearchBulkData = transform(awslogsData);

        // skip control messages
        if (!elasticsearchBulkData) {
            console.log('Received a control message');
            context.succeed('Control message handled successfully');
            return;
        }

        console.log('elasticsearchBulkData:', elasticsearchBulkData);

        // post documents to the Amazon Elasticsearch Service
        post(elasticsearchBulkData, function(error, success, statusCode, failedItems) {
            console.log('Response: ' + JSON.stringify({
                "statusCode": statusCode
            }));

            if (error) {
                console.log('postElasticSearchBulkData Error: ' + JSON.stringify(error, null, 2));

                if (failedItems && failedItems.length > 0) {
                    console.log("Failed Items: " +
                        JSON.stringify(failedItems, null, 2));
                }

                context.fail(JSON.stringify(error));
            } else {
                console.log('Success: ' + JSON.stringify(success));
                context.succeed('Success');
            }
        });
    });
};

function transform(payload) {
    if (payload.messageType === 'CONTROL_MESSAGE') {
        return null;
    }

    var bulkRequestBody = '';

    payload.logEvents.forEach(function(logEvent) {
        var timestamp = new Date(1 * logEvent.timestamp);

        // index name format: cwl-YYYY.MM.DD
        var indexName = [
            'cwl-' + timestamp.getUTCFullYear(),              // year
            ('0' + (timestamp.getUTCMonth() + 1)).slice(-2),  // month
            ('0' + timestamp.getUTCDate()).slice(-2)          // day
        ].join('.');

        var source = buildSource(logEvent.message, logEvent.extractedFields);
        source['@id'] = logEvent.id;
        source['@timestamp'] = new Date(1 * logEvent.timestamp).toISOString();
        source['@message'] = logEvent.message;
        source['@owner'] = payload.owner;
        source['@log_group'] = payload.logGroup;
        source['@log_stream'] = payload.logStream;

        var action = { "index": {} };
        action.index._index = indexName;
        action.index._type = payload.logGroup;
        action.index._id = logEvent.id;

        bulkRequestBody += [
            JSON.stringify(action),
            JSON.stringify(source),
        ].join('\n') + '\n';
    });
    return bulkRequestBody;
}

function buildSource(message, extractedFields) {
    if (extractedFields) {
        var source = {};

        for (var key in extractedFields) {
            if (extractedFields.hasOwnProperty(key) && extractedFields[key]) {
                var value = extractedFields[key];

                if (isNumeric(value)) {
                    source[key] = 1 * value;
                    continue;
                }

                jsonSubString = extractJson(value);
                if (jsonSubString !== null) {
                    source['$' + key] = JSON.parse(jsonSubString);
                }

                source[key] = value;
            }
        }
        return source;
    }

    jsonSubString = extractJson(message);
    if (jsonSubString !== null) {
        return JSON.parse(jsonSubString);
    }

    return {};
}

function extractJson(message) {
    var jsonStart = message.indexOf('{');
    if (jsonStart < 0) return null;
    var jsonSubString = message.substring(jsonStart);
    return isValidJson(jsonSubString) ? jsonSubString : null;
}

function isValidJson(message) {
    try {
        JSON.parse(message);
    } catch (e) { return false; }
    return true;
}

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function post(body, callback) {
    console.log('endpoint:', endpoint);
    var requestParams = buildRequest(endpoint, body);
    console.log('requestParams:', requestParams);
    var request = https.request(requestParams, function(response) {
        var responseBody = '';
        response.on('data', function(chunk) {
            responseBody += chunk;
        });
        response.on('end', function() {
            var info = JSON.parse(responseBody);
            var failedItems;
            var success;

            console.log('post info:', info);

            if (response.statusCode >= 200 && response.statusCode < 299) {
                failedItems = info.items.filter(function(x) {
                    return x.index.status >= 300;
                });

                success = {
                    "attemptedItems": info.items.length,
                    "successfulItems": info.items.length - failedItems.length,
                    "failedItems": failedItems.length
                };
            }

            var error = response.statusCode !== 200 || info.errors === true ? {
                "statusCode": response.statusCode,
                "responseBody": responseBody
            } : null;

            console.log('post error:', error);

            callback(error, success, response.statusCode, failedItems);
        });
    }).on('error', function(e) {
        callback(e);
    });
    request.end(requestParams.body);
}

function buildRequest(endpoint, body) {
    var endpointParts = endpoint.match(/^([^\.]+)\.?([^\.]*)\.?([^\.]*)\.amazonaws\.com$/);
    var region = endpointParts[2];
    var service = endpointParts[3];
    var datetime = (new Date()).toISOString().replace(/[:\-]|\.\d{3}/g, '');
    var date = datetime.substr(0, 8);
    var kDate = hmac('AWS4' + process.env.AWS_SECRET_ACCESS_KEY, date);
    var kRegion = hmac(kDate, region);
    var kService = hmac(kRegion, service);
    var kSigning = hmac(kService, 'aws4_request');

    var request = {
        host: endpoint,
        method: 'POST',
        path: '/_bulk',
        body: body,
        headers: {
            'Content-Type': 'application/json',
            'Host': endpoint,
            'Content-Length': Buffer.byteLength(body),
            'X-Amz-Security-Token': process.env.AWS_SESSION_TOKEN,
            'X-Amz-Date': datetime
        }
    };

    var canonicalHeaders = Object.keys(request.headers)
        .sort(function(a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; })
        .map(function(k) { return k.toLowerCase() + ':' + request.headers[k]; })
        .join('\n');

    var signedHeaders = Object.keys(request.headers)
        .map(function(k) { return k.toLowerCase(); })
        .sort()
        .join(';');

    var canonicalString = [
        request.method,
        request.path, '',
        canonicalHeaders, '',
        signedHeaders,
        hash(request.body, 'hex'),
    ].join('\n');

    var credentialString = [ date, region, service, 'aws4_request' ].join('/');

    var stringToSign = [
        'AWS4-HMAC-SHA256',
        datetime,
        credentialString,
        hash(canonicalString, 'hex')
    ] .join('\n');

    request.headers.Authorization = [
        'AWS4-HMAC-SHA256 Credential=' + process.env.AWS_ACCESS_KEY_ID + '/' + credentialString,
        'SignedHeaders=' + signedHeaders,
        'Signature=' + hmac(kSigning, stringToSign, 'hex')
    ].join(', ');

    return request;
}

function hmac(key, str, encoding) {
    return crypto.createHmac('sha256', key).update(str, 'utf8').digest(encoding);
}

function hash(str, encoding) {
    return crypto.createHash('sha256').update(str, 'utf8').digest(encoding);
}
