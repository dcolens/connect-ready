'use strict';
var readyness = require('../index.js');
var assert = require('assert');
var events = require('events');

describe("readyness", function() {

	describe('setStatus', function() {
		it('throws if no params', function() {
			assert.throws(
				readyness.setStatus,
				/invalid status/
			);
		});
		it('throws if non number', function() {
			assert.throws(
				function(){ readyness.setStatus({consecutiveFailures:101}); },
				/invalid status/
			);
			assert.throws(
				function(){ readyness.setStatus('hello'); },
				/invalid status/
			);			
			assert.throws(
				function(){ readyness.setStatus([1,2]); },
				/invalid status/
			);
			assert.throws(
				function(){ readyness.setStatus(0); },
				/invalid status/
			);
		});

		it('accepts valid params', function() {
			assert.equal(readyness.getStatus(), 500);
			assert.doesNotThrow(function() {
				readyness.setStatus(500);				
			});
			assert.equal(readyness.getStatus(), 500);
			assert.doesNotThrow(function() {
				readyness.setStatus(1);				
			});
			assert.equal(readyness.getStatus(), 1);
			assert.doesNotThrow(function() {
				readyness.setStatus(200);				
			});
			assert.equal(readyness.getStatus(), 200);
		});
	});

	describe('route', function() {

		it('returns the status', function(done) {
			readyness.setStatus(200);
			readyness.route({}, {sendStatus:function(code) {
				assert.equal(code, 200);
				return this;
			}, end: function() { done(); }});
		});

		it('returns the status', function(done) {
			readyness.setStatus(500);
			readyness.route({}, {sendStatus:function(code) {
				assert.equal(code, 500);
				return this;
			}, end: function() { done(); }});
		});
	});
});
