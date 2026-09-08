# connect-ready

Express/Connect readiness route for Kubernetes applications.

## Requirements

- Node.js 22 or newer

## Installation

```shell
npm install connect-ready
```

## Readiness route

The route returns `503` until the application explicitly becomes ready.

```javascript
'use strict';

const http = require('node:http');
const express = require('express');
const ready = require('connect-ready');

const app = express();
const server = http.createServer(app);

app.get('/ready', ready.route);

server.listen(3000, () => {
  ready.setStatus(204);
});
```

Kubernetes considers HTTP responses from 200 through 399 successful. Use a failure status such as `503` whenever the application cannot accept traffic:

```javascript
ready.setStatus(503);
```

## Graceful shutdown in Kubernetes

Modern Kubernetes marks a terminating Pod endpoint as not ready. The application must still stop accepting new connections and allow active requests to finish.

`registerShutdownHandlers()` installs a consistent lifecycle for Node HTTP servers:

- `SIGTERM` and `SIGINT` drain active requests and exit `0`;
- `uncaughtException` and `unhandledRejection` attempt bounded cleanup and exit `1`;
- readiness changes to `503` as soon as shutdown starts;
- `server.close()` immediately stops new connections and drains active requests;
- the process force-closes HTTP connections and exits `1` if its deadline expires.

```javascript
const shutdown = ready.registerShutdownHandlers(server, {
  // Keep this below the Pod's terminationGracePeriodSeconds.
  timeoutMs: Number.parseInt(process.env.SHUTDOWN_TIMEOUT_MS ?? '30000', 10),

  // Fatal process errors should not drain for as long as a normal rollout.
  fatalTimeoutMs: 30_000,

  async cleanup() {
    await database.close();
    await log4js.shutdown();
  },

  onFatal(error, origin) {
    logger.fatal({ error, origin }, 'Fatal process error');
  },

  // Optional: server.closeAllConnections() does not close upgraded protocols.
  forceClose() {
    webSocketServer.close();
  },
});
```

Node.js 22 `server.close()` stops accepting new connections, closes idle keep-alive connections, and waits for active HTTP requests to complete. Dependencies are cleaned up after those requests drain.

Set `timeoutMs` slightly below the Pod's `terminationGracePeriodSeconds`. The Kubernetes grace period must be long enough for the longest active request plus dependency cleanup and a safety margin. Applications with requests lasting up to 45 minutes should configure both deadlines accordingly.

An uncaught exception can leave application state inconsistent, so `fatalTimeoutMs` defaults to the smaller of 30 seconds and `timeoutMs`. Fatal shutdown still attempts to drain and clean up, but it must exit non-zero within that shorter deadline.

A controller can also initiate shutdown or remove its process listeners explicitly:

```javascript
shutdown.close();   // Start a normal programmatic shutdown.
shutdown.dispose(); // Or unregister the handlers if another component takes ownership.
```

## API

### `setStatus(code)`

Sets the readiness HTTP status. The code must be an integer from 100 through 599.

### `getStatus()`

Returns the current readiness HTTP status.

### `route(req, res)`

Express/Connect route that responds with the current readiness status.

### `registerShutdownHandlers(server, options)`

Registers handlers for normal process signals and fatal process events. Returns a shutdown controller.

Options:

- `timeoutMs`: normal shutdown deadline; defaults to 30 seconds.
- `fatalTimeoutMs`: fatal-error deadline; defaults to at most 30 seconds.
- `cleanup(context)`: async dependency cleanup after HTTP requests drain.
- `onFatal(error, origin)`: fatal-error reporting hook.
- `forceClose(context)`: closes upgraded or custom connections at the deadline.

The controller provides:

- `close()`: starts a normal programmatic shutdown.
- `shutdown(request)`: starts shutdown with an explicit reason or error.
- `dispose()`: unregisters the installed process handlers.
- `isShuttingDown`: indicates whether shutdown has started.
