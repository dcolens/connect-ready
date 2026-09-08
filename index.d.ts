interface ShutdownContext {
  reason: string;
  error?: Error;
  origin?: string;
  fatal: boolean;
  forced: boolean;
}

interface ShutdownOptions {
  timeoutMs?: number;
  fatalTimeoutMs?: number;
  cleanup?: (context: ShutdownContext) => void | Promise<void>;
  forceClose?: (context: ShutdownContext) => void;
  onFatal?: (error: Error, origin: string) => void;
  exit?: (code: number) => void;
}

interface ShutdownRequest {
  reason?: string;
  error?: unknown;
  fatal?: boolean;
}

interface ClosableServer {
  close(callback: (error?: Error) => void): unknown;
  closeAllConnections?(): void;
}

interface ShutdownController {
  readonly isShuttingDown: boolean;
  close(): Promise<number>;
  dispose(): void;
  shutdown(request?: ShutdownRequest): Promise<number>;
}

declare function setStatus(code: number): void;
declare function getStatus(): number;
declare function route(req: any, res: any): void;
declare function registerShutdownHandlers(
  server: ClosableServer,
  options?: ShutdownOptions,
): ShutdownController;

export {
  ClosableServer,
  ShutdownContext,
  ShutdownController,
  ShutdownOptions,
  ShutdownRequest,
  getStatus,
  registerShutdownHandlers,
  route,
  setStatus,
};
