interface Env {
  AGENTSGOT_API_BASE_URL: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ExportedHandler<E = unknown> {
  fetch(request: Request, env: E, ctx: ExecutionContext): Response | Promise<Response>;
}
