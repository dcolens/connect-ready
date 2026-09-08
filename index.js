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

function validateTimeout(name, value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} should be a non-negative integer`);
  }
}

function validateFunction(name, value) {
  if (value !== undefined && typeof value !== 'function') {
    throw new TypeError(`${name} should be a function`);
  }
}

function normalizeError(value, message) {
  if (value instanceof Error) return value;
  return new Error(message, { cause: value });
}

/**
 * Register a bounded graceful-shutdown lifecycle for a Node HTTP server.
 *
 * Normal process signals drain active HTTP requests and exit successfully.
 * Fatal process events use a shorter deadline and exit unsuccessfully.
 *
 * @param {object} server Node HTTP server
 * @param {object} [options] lifecycle options
 * @returns {object} shutdown controller
 */
function registerShutdownHandlers(server, options = {}) {
  if (!server || typeof server.close !== 'function') {
    throw new TypeError('server should provide a close(callback) function');
  }

  const timeoutMs = options.timeoutMs ?? 30_000;
  const fatalTimeoutMs = options.fatalTimeoutMs ?? Math.min(timeoutMs, 30_000);
  const cleanup = options.cleanup ?? (async () => {});
  const forceClose = options.forceClose;
  const onFatal = options.onFatal;
  const exit = options.exit ?? process.exit.bind(process);

  validateTimeout('timeoutMs', timeoutMs);
  validateTimeout('fatalTimeoutMs', fatalTimeoutMs);
  validateFunction('cleanup', cleanup);
  validateFunction('forceClose', forceClose);
  validateFunction('onFatal', onFatal);
  validateFunction('exit', exit);

  let shuttingDown = false;
  let finished = false;
  let exitCode = 0;
  let timer;
  let timerDeadline = Infinity;
  let resolveCompletion;
  let completion;
  let context;

  function dispose() {
    process.removeListener('SIGTERM', onSigterm);
    process.removeListener('SIGINT', onSigint);
    process.removeListener('uncaughtException', onUncaughtException);
    process.removeListener('unhandledRejection', onUnhandledRejection);
  }

  function reportFatal(error, origin) {
    exitCode = 1;
    context.error = error;
    context.origin = origin;
    context.fatal = true;

    if (onFatal) {
      try {
        onFatal(error, origin);
      } catch (reportingError) {
        console.error(reportingError);
      }
    }
  }

  function complete(code) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    dispose();
    resolveCompletion(code);
    exit(code);
  }

  function forceShutdown() {
    if (finished) return;

    const forcedContext = { ...context, forced: true };

    try {
      forceClose?.(forcedContext);
    } catch (error) {
      reportFatal(error, 'forceClose');
    }

    try {
      server.closeAllConnections?.();
    } catch (error) {
      reportFatal(error, 'server.closeAllConnections');
    }

    complete(1);
  }

  function scheduleDeadline(delayMs) {
    const deadline = Date.now() + delayMs;
    if (deadline >= timerDeadline) return;

    clearTimeout(timer);
    timerDeadline = deadline;
    timer = setTimeout(forceShutdown, delayMs);
    timer.unref?.();
  }

  async function finishGracefully(serverError) {
    if (finished) return;

    if (serverError) {
      reportFatal(serverError, 'server.close');
    }

    try {
      await cleanup({ ...context, forced: false });
    } catch (error) {
      reportFatal(error, 'cleanup');
    }

    complete(exitCode);
  }

  function shutdown(request = {}) {
    const reason = request.reason ?? 'manual';
    const error = request.error;
    const fatal = request.fatal ?? error !== undefined;

    if (shuttingDown) {
      if (fatal) {
        const fatalError = normalizeError(error, `Fatal shutdown requested by ${reason}`);
        reportFatal(fatalError, reason);
        scheduleDeadline(fatalTimeoutMs);
      }
      return completion;
    }

    shuttingDown = true;
    exitCode = fatal ? 1 : 0;
    context = { reason, error: undefined, origin: undefined, fatal, forced: false };
    completion = new Promise(resolve => {
      resolveCompletion = resolve;
    });

    setStatus(503);

    if (fatal) {
      const fatalError = normalizeError(error, `Fatal shutdown requested by ${reason}`);
      reportFatal(fatalError, reason);
    }

    scheduleDeadline(fatal ? fatalTimeoutMs : timeoutMs);

    try {
      server.close(serverError => {
        void finishGracefully(serverError);
      });
    } catch (serverError) {
      void finishGracefully(serverError);
    }

    return completion;
  }

  function close() {
    return shutdown({ reason: 'manual' });
  }

  function onSigterm() {
    void shutdown({ reason: 'SIGTERM' });
  }

  function onSigint() {
    void shutdown({ reason: 'SIGINT' });
  }

  function onUncaughtException(error, origin) {
    void shutdown({ reason: origin ?? 'uncaughtException', error, fatal: true });
  }

  function onUnhandledRejection(reason) {
    const error = normalizeError(reason, 'Unhandled promise rejection');
    void shutdown({ reason: 'unhandledRejection', error, fatal: true });
  }

  process.once('SIGTERM', onSigterm);
  process.once('SIGINT', onSigint);
  process.once('uncaughtException', onUncaughtException);
  process.once('unhandledRejection', onUnhandledRejection);

  return {
    close,
    dispose,
    shutdown,
    get isShuttingDown() {
      return shuttingDown;
    },
  };
}

module.exports = {
  setStatus,
  getStatus,
  route,
  registerShutdownHandlers,
};
