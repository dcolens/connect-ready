// index.d.ts

declare function setStatus(code: number): void;
declare function getStatus(): number;
declare function route(req: any, res: any): void;
declare function gracefulShutdownKeepaliveConnections(req: any, res: any, next: any): void;
declare function enableTooBusy(lag?: number): void;
declare function shutdown(signal: any, error: any, cb: any, terminationFile: any, logger: any): void;

export {
    setStatus,
    getStatus,
    route,
    shutdown,
    enableTooBusy,
    gracefulShutdownKeepaliveConnections,
};