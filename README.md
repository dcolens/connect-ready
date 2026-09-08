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

Node.js 22 `server.close()` stops accepting new connections, closes idle keep-alive connections, and waits for active HTTP requests to complete. Handle normal termination separately from application failures so a rolling update exits successfully.

```javascript
'use strict';

const shutdownTimeout = Number.parseInt(process.env.SHUTDOWN_TIMEOUT_MS ?? '30000', 10);
let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  ready.setStatus(503);

  const forceShutdown = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, shutdownTimeout);
  forceShutdown.unref();

  server.close(error => {
    clearTimeout(forceShutdown);

    if (error) {
      process.exit(1);
      return;
    }

    process.exit(0);
  });
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
```

Set `SHUTDOWN_TIMEOUT_MS` slightly below the Pod's `terminationGracePeriodSeconds`. The Kubernetes grace period must be long enough for the longest active request plus application cleanup and a safety margin.

Close databases, message brokers, and other dependencies only after active requests have drained. Track upgraded protocols such as WebSockets separately because they are not ordinary HTTP requests.

Treat fatal process errors separately from normal Kubernetes termination and exit non-zero after performing bounded cleanup.

## API

### `setStatus(code)`

Sets the readiness HTTP status. The code must be an integer from 100 through 599.

### `getStatus()`

Returns the current readiness HTTP status.

### `route(req, res)`

Express/Connect route that responds with the current readiness status.
