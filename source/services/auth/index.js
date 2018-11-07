'use strict';

/**
* A Lambda function that creates a Cognito User Pool domain
* and updates an Elasticsearch Domain config for Cognito Authentication
**/

var AWS = require("aws-sdk");
const LOGGER = new(require('./logger'))();

exports.handler = function(event, context) {

    LOGGER.log('DEBUG',`REQUEST RECEIVED: ${JSON.stringify(event,null,2)}`);

    const cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider();
    const es = new AWS.ES();

    if (event.RequestType == "Delete") {
        let responseStatus = "FAILED";
        let responseData = {};
        // For Delete requests, delete the domain on the Cognito User Pool
        let params = {
            Domain: event.ResourceProperties.CognitoDomain,
            UserPoolId: event.ResourceProperties.UserPoolId
        };
        cognitoidentityserviceprovider.deleteUserPoolDomain(params, function(err, data) {
            if (err) {
                LOGGER.log('ERROR',`error deleting domain on Cognito User Pool: ${err.stack}`);
                sendResponse(event, context, responseStatus, responseData);
            }
            else {
                LOGGER.log('DEBUG',`SUCCESS deleting domain on Cognito User Pool: ${data}`);
                responseStatus = "SUCCESS";
                sendResponse(event, context, responseStatus, responseData);
            }
        });
    }
    else if (event.RequestType == "Create") {
        let responseStatus = "FAILED";
        let responseData = {};
        //create a domain for a provided Cognito User Pool
        let params = {
            Domain: event.ResourceProperties.CognitoDomain,
            UserPoolId: event.ResourceProperties.UserPoolId
        };
        cognitoidentityserviceprovider.createUserPoolDomain(params, function(err, data) {
            if (err) {
                LOGGER.log('ERROR',`error creating domain on Cognito User Pool: ${err.stack}`);
                responseStatus = "FAILED";
                sendResponse(event, context, responseStatus, responseData);
            }
            else {
                //update the ES domain config for Cognito Auth
                LOGGER.log('INFO',"Cognito User Pool Domain Create SUCCEEDED");
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
                        sendResponse(event, context, responseStatus, responseData);
                    }
                    else {
                        LOGGER.log('INFO',"Elasticsearch domain config update SUCCEEDED");
                        responseStatus = "SUCCESS";
                        sendResponse(event, context, responseStatus, responseData);
                    }
                });
            }
        });
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
