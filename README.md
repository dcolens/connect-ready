[![Build Status](https://travis-ci.org/dcolens/connect-ready.svg?branch=master)](https://travis-ci.org/dcolens/connect-ready) [![Build Status](https://travis-ci.org/dcolens/connect-ready.svg?branch=master)](https://travis-ci.org/dcolens/connect-ready)

# connect-ready
express route that indicates whether a service is ready or not. Mostly created to make graceful restart of node express servers in a Kubernetes environment.


## Graceful restart of a nodejs express server in Kubernetes

I intially thought that catching SIGTERM and waiting for server.close()` to finish would be enough to do a graceful restart of a nodejs service. I was wrong. 

The reliable way of handling a graceful restart is to use the [readynessProbe](http://kubernetes.io/docs/user-guide/production-pods/#liveness-and-readiness-probes-aka-health-checks) functionality either with a [pre-stop hook](http://kubernetes.io/docs/user-guide/container-environment/#container-hooks) or when catching the SIGTERM signal. The readynessProbes are used by Kubernetes to know if a service is ready and can receive traffic, in its http form Kubernetes checks for the responseCode, anything above 399 is considered not ready. 

When a service receives a stop signal (SIGTERM), it should respond with a 500 responsecode when probed for readiness, this will ensure Kubernetes does not send load to it anymore. Once that's done, `server.close()` can be called to ensure ongoing connections are terminated gracefully.

Note that by default Kubernetes will send a SIGKILL 30s after the SIGTERM if the service did not terminate, this timer is configurable in the manifest. 


## Example of a graceful node http server for Kubernetes

```javascript
'use strict';
var http = require('http');
var express = require('express');
var ready = require('connect-ready');

var app = express();
var server = http.createServer(app);


app.get('/ready', ready.route);

server.listen(3000, function () { 
    ready.setStatus(204);
  console.log('Example app listening on port 3000!');
});


//add graceful shutdown
process.on('SIGTERM', function () {
    ready.setStatus(500);
    console.log('received SIGTERM');
 
     /** 
      * delay the server closure by 2s to give kubernetes time to 
      * know the service is not ready and direct the traffic somewhere else. 
      * Instead of listening for SIGTERM, one could also configure a 
      * pre-stop hook in the kubernetes manifest. 
      */
    setTimeout(function() { 
        server.close(function() {
            console.log('all connections closed');
            process.exit(0);
        });     
    }, 2000);
});
```

## toobusy option

Another use of the readinessProbe can be to indicate if the server is too busy, connect-ready can use the [toobusy-js](https://github.com/STRML/node-toobusy) module to indicate whether the server is too busy and deflect load to another pod.

### Usage

1) npm install toobusy-js
2) enable toobusy in connect-ready:
  ```javascript
  ready.enableTooBusy(70)
  ```
  Where 70 is the lag as defined in [toobusy-js](https://github.com/STRML/node-toobusy)
