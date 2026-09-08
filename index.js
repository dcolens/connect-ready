'use strict';

let status = 503;

/**
 * Set the HTTP status returned by the readiness route.
 *
 * Kubernetes considers responses from 200 through 399 successful.
 *
 * @param {number} code HTTP status code
 */
function setStatus(code) {
  if (!Number.isInteger(code) || code < 100 || code > 599) {
    const error = new Error('status should be an integer between 100 and 599');
    error.status = code;
    throw error;
  }

  status = code;
}

/**
 * Return the status currently exposed by the readiness route.
 *
 * @returns {number} HTTP status code
 */
function getStatus() {
  return status;
}

/**
 * Express/Connect readiness route.
 */
function route(_req, res) {
  res.sendStatus(status);
}

module.exports = {
  setStatus,
  getStatus,
  route,
};
