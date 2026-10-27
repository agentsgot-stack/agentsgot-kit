#!/usr/bin/env node
// Backward-compatible `agentsgot-mcp` entry; same as `agentsgot mcp`.
import { cliContext } from "../cli/context.js";
import { mcpCommand } from "../cli/mcp.js";

await mcpCommand(cliContext(process.env));
