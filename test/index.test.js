'use strict';

const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');
const ready = require('../index.js');

const controllers = [];

function createServer() {
  return {
    closeCalls: 0,
    closeAllConnectionsCalls: 0,
    closeCallback: undefined,
    close(callback) {
      this.closeCalls += 1;
      this.closeCallback = callback;
    },
    closeAllConnections() {
      this.closeAllConnectionsCalls += 1;
    },
  };
}

function register(server, options = {}) {
  const exitCodes = [];
  const controller = ready.registerShutdownHandlers(server, {
    ...options,
    exit(code) {
      exitCodes.push(code);
    },
  });
  controllers.push(controller);
  return { controller, exitCodes };
}

describe('connect-ready', () => {
  beforeEach(() => {
    ready.setStatus(503);
  });

  afterEach(() => {
    for (const controller of controllers.splice(0)) controller.dispose();
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

  describe('registerShutdownHandlers()', () => {
    it('validates its arguments before registering handlers', () => {
      assert.throws(
        () => ready.registerShutdownHandlers(),
        /server should provide a close/,
      );
      assert.throws(
        () => ready.registerShutdownHandlers(createServer(), { timeoutMs: -1 }),
        /timeoutMs should be a non-negative integer/,
      );
      assert.throws(
        () => ready.registerShutdownHandlers(createServer(), { cleanup: true }),
        /cleanup should be a function/,
      );
    });

    it('registers and disposes process handlers', () => {
      const events = ['SIGTERM', 'SIGINT', 'uncaughtException', 'unhandledRejection'];
      const before = Object.fromEntries(events.map(event => [event, process.listenerCount(event)]));
      const { controller } = register(createServer());

      for (const event of events) {
        assert.equal(process.listenerCount(event), before[event] + 1);
      }

      controller.dispose();

      for (const event of events) {
        assert.equal(process.listenerCount(event), before[event]);
      }
    });

    it('handles SIGTERM and SIGINT as successful shutdowns', async () => {
      for (const signal of ['SIGTERM', 'SIGINT']) {
        const existingListeners = process.listeners(signal);
        const server = createServer();
        const { exitCodes } = register(server);
        const signalHandler = process.listeners(signal).find(
          listener => !existingListeners.includes(listener),
        );

        signalHandler();
        server.closeCallback();
        await new Promise(resolve => setImmediate(resolve));

        assert.deepEqual(exitCodes, [0]);
      }
    });

    it('handles uncaught exceptions and unhandled rejections as fatal shutdowns', async () => {
      const cases = [
        ['uncaughtException', [new Error('uncaught'), 'uncaughtException']],
        ['unhandledRejection', ['rejected value']],
      ];

      for (const [event, arguments_] of cases) {
        const existingListeners = process.listeners(event);
        const server = createServer();
        const fatalReports = [];
        const { exitCodes } = register(server, {
          onFatal(error, origin) {
            fatalReports.push({ error, origin });
          },
        });
        const eventHandler = process.listeners(event).find(
          listener => !existingListeners.includes(listener),
        );

        eventHandler(...arguments_);
        server.closeCallback();
        await new Promise(resolve => setImmediate(resolve));

        assert.deepEqual(exitCodes, [1]);
        assert.equal(fatalReports.length, 1);
        assert.equal(fatalReports[0].origin, event);
      }
    });

    it('drains active requests, cleans up, and exits zero for normal shutdown', async () => {
      const server = createServer();
      const cleanupContexts = [];
      const { controller, exitCodes } = register(server, {
        cleanup(context) {
          cleanupContexts.push(context);
        },
      });
      ready.setStatus(204);

      const completion = controller.shutdown({ reason: 'SIGTERM' });

      assert.equal(controller.isShuttingDown, true);
      assert.equal(ready.getStatus(), 503);
      assert.equal(server.closeCalls, 1);
      assert.deepEqual(exitCodes, []);

      server.closeCallback();

      assert.equal(await completion, 0);
      assert.deepEqual(exitCodes, [0]);
      assert.deepEqual(cleanupContexts, [{
        reason: 'SIGTERM',
        error: undefined,
        origin: undefined,
        fatal: false,
        forced: false,
      }]);
    });

    it('returns the same completion and closes the server only once', async () => {
      const server = createServer();
      const { controller } = register(server);

      const first = controller.close();
      const second = controller.close();

      assert.equal(first, second);
      assert.equal(server.closeCalls, 1);

      server.closeCallback();
      assert.equal(await first, 0);
    });

    it('exits one and reports an uncaught exception', async () => {
      const server = createServer();
      const fatalReports = [];
      const expectedError = new Error('broken');
      const { controller, exitCodes } = register(server, {
        onFatal(error, origin) {
          fatalReports.push({ error, origin });
        },
      });

      const completion = controller.shutdown({
        reason: 'uncaughtException',
        error: expectedError,
        fatal: true,
      });
      server.closeCallback();

      assert.equal(await completion, 1);
      assert.deepEqual(exitCodes, [1]);
      assert.deepEqual(fatalReports, [{ error: expectedError, origin: 'uncaughtException' }]);
    });

    it('preserves a non-Error rejection as the error cause', async () => {
      const server = createServer();
      const fatalReports = [];
      const { controller } = register(server, {
        onFatal(error, origin) {
          fatalReports.push({ error, origin });
        },
      });

      const completion = controller.shutdown({
        reason: 'unhandledRejection',
        error: 'rejected value',
        fatal: true,
      });
      server.closeCallback();
      await completion;

      assert.equal(fatalReports[0].origin, 'unhandledRejection');
      assert.equal(fatalReports[0].error.cause, 'rejected value');
    });

    it('exits one if cleanup fails', async () => {
      const server = createServer();
      const cleanupError = new Error('cleanup failed');
      const fatalReports = [];
      const { controller, exitCodes } = register(server, {
        cleanup() {
          throw cleanupError;
        },
        onFatal(error, origin) {
          fatalReports.push({ error, origin });
        },
      });

      const completion = controller.close();
      server.closeCallback();

      assert.equal(await completion, 1);
      assert.deepEqual(exitCodes, [1]);
      assert.deepEqual(fatalReports, [{ error: cleanupError, origin: 'cleanup' }]);
    });

    it('force-closes connections and exits one at the deadline', async () => {
      const server = createServer();
      const forceContexts = [];
      const { controller, exitCodes } = register(server, {
        timeoutMs: 5,
        forceClose(context) {
          forceContexts.push(context);
        },
      });

      const completion = controller.close();
      await new Promise(resolve => setTimeout(resolve, 20));

      assert.equal(await completion, 1);
      assert.deepEqual(exitCodes, [1]);
      assert.equal(server.closeAllConnectionsCalls, 1);
      assert.equal(forceContexts.length, 1);
      assert.equal(forceContexts[0].forced, true);
    });

    it('escalates an in-progress normal shutdown after a fatal error', async () => {
      const server = createServer();
      const fatalReports = [];
      const { controller } = register(server, {
        timeoutMs: 60_000,
        fatalTimeoutMs: 5,
        onFatal(error, origin) {
          fatalReports.push({ error, origin });
        },
      });

      const completion = controller.close();
      const repeatedCompletion = controller.shutdown({
        reason: 'uncaughtException',
        error: new Error('fatal during shutdown'),
        fatal: true,
      });
      await new Promise(resolve => setTimeout(resolve, 20));

      assert.equal(completion, repeatedCompletion);
      assert.equal(await completion, 1);
      assert.equal(fatalReports[0].origin, 'uncaughtException');
      assert.equal(server.closeAllConnectionsCalls, 1);
    });
  });
});
