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

	describe('shutdown', function() {
		it('no signal', function(done) {
			ready.shutdown(undefined, undefined, done, '/tmp/termination-log', undefined);
		});
		it('no signal with logger', function(done) {
			ready.shutdown(undefined, undefined, function() {}, '/tmp/termination-log', {info:function(gelf, msg) {
				assert.equal(msg, 'shutdown');
				done();
			}});
		});		
		it('while stoping already', function(done) {
			ready.shutdown(undefined, 
				undefined, 
				function() {
					done(new Error('should not be called'));
					clearTimeout(timer);
				}, 
				'/tmp/termination-log', 
				undefined
			);
			var timer = setTimeout(function() {
				done();
			}, 200);
		});

		it('signal', function(done) {
			//reload the module to ensure stopping is reset to false
			delete require.cache[require.resolve('../index.js')];
			ready = require('../index.js');
			ready.shutdown(
				'SIGTERM', 
				new Error('test'), 
				function(status) {
					assert.equal(status, 1);
					done();
				}, 
				'/tmp/termination-log', 
				undefined
			);
		});

		it('signal no error', function(done) {
			//reload the module to ensure stopping is reset to false
			delete require.cache[require.resolve('../index.js')];
			ready = require('../index.js');
			ready.shutdown(
				'SIGTERM', 
				undefined, 
				function(status) {
					assert.equal(status, 1);
					done();
				}, 
				'/tmp/termination-log', 
				undefined
			);
		});

		it('signal and logger', function(done) {
			//reload the module to ensure stopping is reset to false
			delete require.cache[require.resolve('../index.js')];
			ready = require('../index.js');
			ready.shutdown(
				'SIGTERM', 
				new Error('test'), 
				function() { }, 
				'/tmp/termination-log', 
				{	fatal:function(gelf, msg) {
						assert.equal(msg, 'test');
						done();
					}
				}
			);
		});	

		it('no signal', function(done) {
			delete require.cache[require.resolve('../index.js')];
			ready = require('../index.js');
			ready.shutdown(undefined, undefined, done, '/not a valid path/termination-log', undefined);
		});			
	});

	describe('gracefulShutdownKeepaliveConnections', function() {

		it('sets "connection: close" header if stopping', function(done) {
			delete require.cache[require.resolve('../index.js')];
			ready = require('../index.js');
			ready.shutdown('SIGTERM');

			var res = {
				set: function(name, value) {
					assert.equal(name.toLowerCase(), 'connection');
					assert.equal(value.toLowerCase(), 'close');
				}
			}
			ready.gracefulShutdownKeepaliveConnections({}, res, done);
		});

		it('calls next if not stopping', function(done) {
			delete require.cache[require.resolve('../index.js')];
			ready = require('../index.js');

			var res = {
				set: function(header) {
					throw new Error('should not call res.set');
				}
			}
			ready.gracefulShutdownKeepaliveConnections({}, res, done);
		});
	});	
});
