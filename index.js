'use strict';
var status = 500;
var toobusy = false;

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

module.exports = {
	setStatus: setStatus,
	getStatus: getStatus,
	route: route,
	enableTooBusy: enableTooBusy
};
