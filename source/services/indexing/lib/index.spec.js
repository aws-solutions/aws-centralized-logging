'use strict';

let assert = require('chai').assert;
let expect = require('chai').expect;
let sinon = require('sinon');
let AWS = require('aws-sdk-mock');
let https = require('https');
let PassThrough = require('stream').PassThrough;

const Logging = require('../index.js');
const MetricsHelper = require('./metrics-helper.js');

describe('ES_Logging_TestSuite', function() {
  //test suite for transform function
  describe('#transform', function() {

    let _awslogs_data = {
      messageType: 'DATA_MESSAGE',
      owner: 'xxxxx',
      logGroup: 'testLogGroup',
      logStream: 'testLogStream',
      subscriptionFilters: ['testFilter'],
      logEvents: [{
        id: 'eventId1',
        timestamp: 1440442987000,
        message: '[ERROR] First test message'
      }, {
        id: 'eventId2',
        timestamp: 1440442987001,
        message: '[ERROR] Second test message'
      }]
    };

    let _es_bulkdata =
      '{\"index\":{\"_index\":\"cwl-2015.08.24\",\"_type\":\"CloudWatchLogs\",\"_id\":\"eventId1\"}}\n{\"@id\":\"eventId1\",\"@timestamp\":\"2015-08-24T19:03:07.000Z\",\"@message\":\"[ERROR] First test message\",\"@owner\":\"xxxxx\",\"@log_group\":\"testLogGroup\",\"@log_stream\":\"testLogStream\"}\n{\"index\":{\"_index\":\"cwl-2015.08.24\",\"_type\":\"CloudWatchLogs\",\"_id\":\"eventId2\"}}\n{\"@id\":\"eventId2\",\"@timestamp\":\"2015-08-24T19:03:07.001Z\",\"@message\":\"[ERROR] Second test message\",\"@owner\":\"xxxxx\",\"@log_group\":\"testLogGroup\",\"@log_stream\":\"testLogStream\"}\n';

    let _awslogs_data2 = {
      message: "2 1234 eni-xxxx 10.x.x.x 10.x.x.x 123 123 17 1 76 1496689911 1496689967 ACCEPT OK",
      extractedFields: {
        srcaddr: "10.x.x.x",
        dstport: "123",
        start: "1496689911",
        dstaddr: "10.x.x.x",
        version: "2",
        packets: "1",
        protocol: "17",
        account_id: "1234",
        interface_id: "eni-xxxx",
        log_status: "OK",
        bytes: "76",
        srcport: "123",
        action: "ACCEPT",
        end: "1496689967"
      }
    };

    let _source = {
      srcaddr: '10.x.x.x',
      dstport: 123,
      start: 1496689911,
      dstaddr: '10.x.x.x',
      version: 2,
      packets: 1,
      protocol: 17,
      account_id: 1234,
      interface_id: 'eni-xxxx',
      log_status: 'OK',
      bytes: 76,
      srcport: 123,
      action: 'ACCEPT',
      end: 1496689967
    };

    //hooks
    beforeEach(function() {});
    afterEach(function() {});

    /**
     * Test cases
     * @param {JSON} _awslogs_data - sample CW log event
     * @param {JSON} _awslogs_data2 - sample CW log event
     * @param {String} _es_bulkdata - data to be indexed on es
     * @param {JSON} _source - data after transformation
     */
    it('should return success when buildSource successfully',
      function(
        done) {

        let sourcedata = Logging.buildSource(_awslogs_data2.message,
          _awslogs_data2.extractedFields);
        assert.deepEqual(sourcedata, _source);
        done();

      });

    it('should return success when log data transformed correctly',
      function(done) {

        let data = Logging.transform(_awslogs_data);
        assert.equal(data, _es_bulkdata);
        done();

      });

  });

  //test suite for buildRequest function
  describe('#buildRequest', function() {

    let _es_bulkdata =
      '{\"index\":{\"_index\":\"cwl-2015.08.24\",\"_type\":\"CloudWatchLogs\",\"_id\":\"eventId1\"}}\n{\"@id\":\"eventId1\",\"@timestamp\":\"2015-08-24T19:03:07.000Z\",\"@message\":\"[ERROR] First test message\",\"@owner\":\"123456789123\",\"@log_group\":\"testLogGroup\",\"@log_stream\":\"testLogStream\"}\n{\"index\":{\"_index\":\"cwl-2015.08.24\",\"_type\":\"CloudWatchLogs\",\"_id\":\"eventId2\"}}\n{\"@id\":\"eventId2\",\"@timestamp\":\"2015-08-24T19:03:07.001Z\",\"@message\":\"[ERROR] Second test message\",\"@owner\":\"123456789123\",\"@log_group\":\"testLogGroup\",\"@log_stream\":\"testLogStream\"}\n';

    let _endpoint = 'centralized-logging.aws_region.es.amazonaws.com';

    let _creds = {
      aws_secret_key: 'xxxxxx',
      aws_access_key: 'xxxxxx',
      aws_session_token: 'xxxxxx'
    };

    //hooks
    before(function() {});
    after(function() {});

    /**
     * Test cases
     * @param {String} _endpoint - es endpoint
     * @param {String} _es_bulkdata - data to be indexed on es
     * @param {String} _creds - aws credentials
     */
    it('should return success when post request built successfully',
      function(
        done) {

        Logging.buildRequest(_endpoint, _es_bulkdata, _creds,
          function(err, request) {
            if (err) done(err);
            else {
              done();
            }
          });

      });

  });

  //test suite for assume role function
  describe('#assumeRole', function() {

    let _assumedRole = {
      AssumedRoleUser: {
        AssumedRoleId: 'a'
      },
      Credentials: {
        SecretAccessKey: 'x',
        AccessKeyId: 'y',
        SessionToken: 'z'
      }
    };

    //hooks
    beforeEach(function() {});
    afterEach(function() {
      AWS.restore('STS');
    });

    /**
     * Test cases
     * @param {Service} STS - aws service STS
     * @param {Method} assumeRole - STS method assumeRole
     */
    it('should return credentials when sts assume role succeeds',
      function(
        done) {

        AWS.mock('STS', 'assumeRole', function(params, callback) {
          callback(null, _assumedRole);
        });

        Logging.assumeRole(function(err, creds) {
          if (err) {
            done(err);
          } else {
            expect(creds.aws_secret_key).to.equal('x');
            done();
          }
        });

      });

    it('should return error when sts assume role fails', function(done) {

      AWS.mock('STS', 'assumeRole', function(params, callback) {
        callback('sts error', null);
      });

      Logging.assumeRole(function(err, creds) {
        if (err) {
          expect(err).to.equal('sts error');
          done();
        } else {
          done('invalid failure for negative test');
        }
      });

    });

  });

  //test suite for sendMetrics function
  describe('#sendMetrics', function() {

    //hooks
    beforeEach(function() {
      this.request = sinon.stub(https, 'request');
    });

    afterEach(function() {
      https.request.restore();
    });

    /**
     * Test cases
     * @param {JSON} {} - sample parameter
     * @param {function~callback} - empty callback
     */
    it('should return success when metrics successfully sent', function() {

      let request = new PassThrough();
      let write = sinon.spy(request, 'write');

      this.request.returns(request);

      let _metricsHelper = new MetricsHelper();
      _metricsHelper.sendAnonymousMetric({}, function() {});

      assert(write.withArgs('{}').calledOnce);

    });

    it('should return error when failed to send metrics', function(done) {

      let expected =
        'Error occurred when sending metric request {\"response\":\"ERROR\"}';
      let request = new PassThrough();

      this.request.returns(request);

      let _metricsHelper = new MetricsHelper();
      _metricsHelper.sendAnonymousMetric({},
        function(err) {
          assert.equal(err, expected);
          done();
        });

      request.emit('error', {
        response: 'ERROR'
      });

    });

  });

});
