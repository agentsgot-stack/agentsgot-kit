export const PACKAGE_NAME = "@agentsgot/agent-kit" as const;
export const SDK_VERSION = "1.0.0" as const;
/** Backend OpenAPI info.version, rather than the OpenAPI specification version. */
export const SUPPORTED_OPENAPI_VERSION = "0.1.0" as const;
export const SUPPORTED_TASK_SPEC_VERSION = "AGENTGRID_TASK_SPEC_V4" as const;
export const SUPPORTED_TASK_SPEC_VERSIONS = [
  "AGENTGRID_TASK_SPEC_V3",
  "AGENTGRID_TASK_SPEC_V4",
] as const;

export * from "./a2a.js";
export * from "./guides.js";
export * from "./llm.js";
export * from "./mcp/server.js";
export * from "./ports.js";
export * from "./roles.js";
export * from "./runner.js";
export * from "./schedules.js";
export * from "./sdk/client.js";
export * from "./security.js";
export * from "./skills.js";
export * from "./workers.js";
export * from "./zip.js";
