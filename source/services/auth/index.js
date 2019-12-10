/*******************************************************************************
*  Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. 
*
*  Licensed under the Apache License Version 2.0 (the "License"). You may not 
*  use this file except in compliance with the License. A copy of the License is 
*  located at                                                           
*
*      http://www.apache.org/licenses/
*
*  or in the "license" file accompanying this file. This file is distributed on  
*  an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or 
*  implied. See the License for the specific language governing permissions and  
*  limitations under the License.      
********************************************************************************/
'use strict';
/**
* A Lambda function that creates a Cognito User Pool domain
* and updates an Elasticsearch Domain config for Cognito Authentication
**/

const AWS = require("aws-sdk");
const uuid = require("uuid");
const LOGGER = new(require('./logger'))();

exports.handler = function(event, context) {

    LOGGER.log('DEBUG',`REQUEST RECEIVED: ${JSON.stringify(event,null,2)}`);
    const cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider();
    const es = new AWS.ES();
    let responseData = {};

    if (event.RequestType == "Delete" || event.RequestType == "Update" ) {
        sendResponse(event, context, "SUCCESS", responseData);
    }
    else if (event.RequestType == "Create") {

        if (event.ResourceProperties.Resource === "UUID") {
          responseData = {UUID: uuid.v4()};
          sendResponse(event, context, "SUCCESS", responseData);
        }
        else {

          let params = {
              DomainName: event.ResourceProperties.Domain,
              CognitoOptions: {
                  Enabled: true,
                  IdentityPoolId: event.ResourceProperties.IdentityPoolId,
                  RoleArn: event.ResourceProperties.RoleArn,
                  UserPoolId: event.ResourceProperties.UserPoolId
              }
          };
          es.updateElasticsearchDomainConfig(params, function(err, data) {
              if (err) {
                  LOGGER.log('ERROR',`error updating the Elasticsearch domain config: ${err.stack}`);
                  sendResponse(event, context, "FAILED", responseData);
              }
              else {
                  LOGGER.log('INFO',"Elasticsearch domain config update SUCCEEDED");
                  sendResponse(event, context, "SUCCESS", responseData);
              }
          });

        }
    }
};

// Send response to the pre-signed S3 URL
function sendResponse(event, context, responseStatus, responseData) {

    let responseBody = JSON.stringify({
        Status: responseStatus,
        Reason: "See the details in CloudWatch Log Stream: " + context.logStreamName,
        PhysicalResourceId: context.logStreamName,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        Data: responseData
    });

    LOGGER.log('DEBUG',`RESPONSE BODY: ${JSON.stringify(responseBody,null,2)}`);

    let https = require("https");
    let url = require("url");

    let parsedUrl = url.parse(event.ResponseURL);
    let options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.path,
        method: "PUT",
        headers: {
            "content-type": "",
            "content-length": responseBody.length
        }
    };

    LOGGER.log('DEBUG',"SENDING RESPONSE...\n");

    let request = https.request(options, function(response) {
        LOGGER.log('DEBUG',`STATUS: ${response.statusCode}`);
        LOGGER.log('DEBUG',`headers: ${JSON.stringify(response.headers)}`);
        // Tell AWS Lambda that the function execution is done
        context.done();
    });

    request.on("error", function(error) {
        LOGGER.log('ERROR',`sendResponse Error: ${error}`);
        // Tell AWS Lambda that the function execution is done
        context.done();
    });

    // write data to request body
    request.write(responseBody);
    request.end();
}
