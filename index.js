'use strict';
var fs = require('fs');

var status = 500;
var toobusy = false;
var stopping = false;

function setStatus(code) {
	if (!Number.isInteger(code) || (code<1) || (code>999)) {
		var e = new Error('status should be an integer between 1 and 999');
		e.status = code;
		throw e;
  }   
  status = code;
}

function getStatus() {
	return status;
}

function route(req, res) {
	if (toobusy && toobusy()) {
		res.sendStatus(503).end();
	} else {
		res.sendStatus(status).end();
	}
}

function enableTooBusy(lag) {
	if (typeof(lag) === 'undefined') {
		lag = 70;
	}
	if (!Number.isInteger(lag) || lag<10) {
		var e = new Error('lag should be an integer greater than 10');
		e.lag = lag;
		throw e;
  }
 	toobusy = require('toobusy-js');
 	toobusy.maxLag(lag);
}

function shutdown(signal, error, cb, terminationFile, logger) {
	status = 503;
	var reason;
	if (error) {
		if (logger && logger.fatal) { logger.fatal({GELF:true, signal: signal, stack: error.stack}, error.message); }
		reason = signal + '\n' + error.message + '\n' + error.stack;
	} else {
		if (logger && logger.info) { logger.info('shutdown'); }
		reason = shutdown;
	}
	if (stopping) { return; }
	stopping = true;

	fs.writeFile(terminationFile, reason, function(err) {
		if (err) { console.error(err); }
		cb(signal ? 1 : 0);
	});
}

module.exports = {
	setStatus: setStatus,
	getStatus: getStatus,
	route: route,
	shutdown: shutdown,
	enableTooBusy: enableTooBusy
};
