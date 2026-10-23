export const PACKAGE_NAME = "@agentgrid/agent-kit" as const;
export const SDK_VERSION = "1.0.0" as const;
export const SUPPORTED_OPENAPI_VERSION = "0.30" as const;
export const SUPPORTED_TASK_SPEC_VERSION = "AGENTGRID_TASK_SPEC_V2" as const;

export * from "./a2a.js";
export * from "./llm.js";
export * from "./mcp/server.js";
export * from "./ports.js";
export * from "./sdk/client.js";
export * from "./security.js";
export * from "./workers.js";
