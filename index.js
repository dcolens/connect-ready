'use strict';
var status = 500;

function setStatus(code) {
	if (!Number.isInteger(code) || (code<1) || (code>999)) {
		var e = new Error('invalid status');
		e.status = code;
		throw e;
  }   
  status = code;
}

function getStatus() {
	return status;
}

function route(req, res) {
	res.setStatus(status).end();
}

module.exports = {
	setStatus: setStatus,
	getStatus: getStatus,
	route: route
};
