'use strict';

const assert = require('node:assert/strict');
const { beforeEach, describe, it } = require('node:test');
const ready = require('../index.js');

describe('connect-ready', () => {
  beforeEach(() => {
    ready.setStatus(503);
  });

  describe('setStatus()', () => {
    it('starts with a not-ready status', () => {
      assert.equal(ready.getStatus(), 503);
    });

    it('accepts valid HTTP status codes', () => {
      for (const status of [100, 204, 503, 599]) {
        ready.setStatus(status);
        assert.equal(ready.getStatus(), status);
      }
    });

    it('rejects values that are not valid HTTP status codes', () => {
      for (const status of [undefined, null, '204', {}, [], 99, 600, 200.5, NaN]) {
        assert.throws(
          () => ready.setStatus(status),
          /status should be an integer between 100 and 599/,
        );
      }
    });

    it('attaches the rejected status to the error', () => {
      assert.throws(
        () => ready.setStatus(99),
        error => error.status === 99,
      );
    });
  });

  describe('route()', () => {
    it('responds with the current status', () => {
      ready.setStatus(204);
      let responseStatus;

      ready.route({}, {
        sendStatus(status) {
          responseStatus = status;
        },
      });

      assert.equal(responseStatus, 204);
    });
  });
});
