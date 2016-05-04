'use strict';
var ready = require('../index.js');
var assert = require('assert');
var events = require('events');

function tightWork(duration) {
  var start = Date.now();
  while ((Date.now() - start) < duration) {
    for (var i = 0; i < 1e5;) i++;
  }
}

describe("ready", function() {

	describe('setStatus', function() {
		it('throws if no params', function() {
			assert.throws(
				ready.setStatus,
				/status should be an integer between 1 and 999/
			);
		});
		it('throws if non number', function() {
			assert.throws(
				function(){ ready.setStatus({consecutiveFailures:101}); },
				/status should be an integer between 1 and 999/
			);
			assert.throws(
				function(){ ready.setStatus('hello'); },
				/status should be an integer between 1 and 999/
			);			
			assert.throws(
				function(){ ready.setStatus([1,2]); },
				/status should be an integer between 1 and 999/
			);
			assert.throws(
				function(){ ready.setStatus(0); },
				/status should be an integer between 1 and 999/
			);
		});

		it('accepts valid params', function() {
			assert.equal(ready.getStatus(), 500);
			assert.doesNotThrow(function() {
				ready.setStatus(500);				
			});
			assert.equal(ready.getStatus(), 500);
			assert.doesNotThrow(function() {
				ready.setStatus(1);				
			});
			assert.equal(ready.getStatus(), 1);
			assert.doesNotThrow(function() {
				ready.setStatus(200);				
			});
			assert.equal(ready.getStatus(), 200);
		});
	});

	describe('route', function() {

		it('returns the status', function(done) {
			ready.setStatus(200);
			ready.route({}, {sendStatus:function(code) {
				assert.equal(code, 200);
				return this;
			}, end: function() { done(); }});
		});

		it('returns the status', function(done) {
			ready.setStatus(500);
			ready.route({}, {sendStatus:function(code) {
				assert.equal(code, 500);
				return this;
			}, end: function() { done(); }});
		});
	});

	describe('toobusy', function() {
		it('rejects invalid lag', function() {
			assert.throws(
				function(){ ready.enableTooBusy({consecutiveFailures:101}); },
				/lag should be an integer greater than 10/
			);
			assert.throws(
				function(){ ready.enableTooBusy('hello'); },
				/lag should be an integer greater than 10/
			);
			assert.throws(
				function(){ ready.enableTooBusy(-20); },
				/lag should be an integer greater than 10/
			);
			assert.throws(
				function(){ ready.enableTooBusy(0); },
				/lag should be an integer greater than 10/
			);
		});
		it('accepts a valid lag', function() {
			assert.doesNotThrow(function() {
				ready.enableTooBusy(100);				
			});
			assert.doesNotThrow(function() {
				ready.enableTooBusy();				
			});
		});
		it('returns the status', function(done) {
			ready.enableTooBusy(10);
			ready.setStatus(200);
			tightWork(600);
			setTimeout(function() {
				ready.route({}, {sendStatus:function(code) {
					assert.equal(code, 503);
					return this;
				}, end: function() { done(); }});
			}, 0);
		});		
	});
});
