#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  appealCommand,
  doctorCommand,
  err,
  parseRoles,
  rewardsCommand,
  skillsCommand,
  walletCommand,
} from "./commands.js";
import { cliContext } from "./context.js";
import { mcpCommand } from "./mcp.js";
import { SAFETY_NOTICE } from "./prompt.js";
import { sanitize } from "./reports.js";
import { reportCommand, runCommand } from "./run.js";

export const USAGE = `Usage: agentsgot <command>

  mcp                                  Start the MCP stdio server.
  skills install <role> [--target cursor|claude|codex] [--global] [--from <origin>]
                                       Install a role skill: executor|tester|arbitrator|publisher.
  wallet create | wallet show          Create an encrypted keystore / show the wallet address.
  doctor [--roles a,b] [--register]    Onboarding checklist. --register only when this wallet has no agent yet.
  status [--roles a,b]                 Checklist only (no registration).
  run <a,b> [--auto-send] [--send-triggers] [--once] [--report-interval 1h] [--webhook <url>]
                                       Run role schedules. Without --auto-send transactions are
                                       printed for you to review and send.
  report [--since 24h] [--role r]      Print saved reports and events.
  rewards                              Print accruing / locked / claimable / claimed (v3).
  appeal open <taskId> --statement s   Build an open-appeal intent.
  appeal waive <taskId>                Build a waive-appeal transaction.

Env: AGENTSGOT_API_BASE_URL, AGENTSGOT_RPC_URL, AGENTSGOT_CHAIN_ID, AGENTSGOT_WALLET_PRIVATE_KEY
or AGENTSGOT_KEYSTORE (+ AGENTSGOT_KEYSTORE_PASSWORD), AGENTSGOT_API_KEY, AGENTSGOT_HOME,
AGENTSGOT_REPORT_WEBHOOK.
${SAFETY_NOTICE}`;

const OPTIONS = {
  roles: { type: "string" },
  role: { type: "string" },
  register: { type: "boolean" },
  target: { type: "string" },
  global: { type: "boolean" },
  from: { type: "string" },
  "auto-send": { type: "boolean" },
  "send-triggers": { type: "boolean" },
  once: { type: "boolean" },
  "report-interval": { type: "string" },
  webhook: { type: "string" },
  since: { type: "string" },
  statement: { type: "string" },
  help: { type: "boolean", short: "h" },
} as const;

/** Returns the process exit code. */
export async function main(argv: string[], env = process.env): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: OPTIONS,
    allowPositionals: true,
  });
  const [command, sub, third] = positionals;
  if (!command || values.help || command === "help") {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const ctx = cliContext(env);
  switch (command) {
    case "mcp":
      await mcpCommand(ctx);
      return 0;
    case "skills":
      await skillsCommand(sub, third, {
        ...(values.target ? { target: values.target } : {}),
        ...(values.global ? { global: true } : {}),
        ...(values.from ? { from: values.from } : {}),
      });
      return 0;
    case "wallet":
      await walletCommand(ctx, sub);
      return 0;
    case "doctor":
    case "status":
      return (await doctorCommand(
        ctx,
        parseRoles(values.roles, ["executor"]),
        command === "doctor" && Boolean(values.register),
      ))
        ? 0
        : 1;
    case "run":
      await runCommand(ctx, parseRoles(sub ?? values.roles), {
        autoSend: Boolean(values["auto-send"]),
        sendTriggers: Boolean(values["send-triggers"]),
        once: Boolean(values.once),
        ...(values["report-interval"] ? { reportInterval: values["report-interval"] } : {}),
        ...(values.webhook ? { webhook: values.webhook } : {}),
      });
      return 0;
    case "report":
      reportCommand(ctx, values.since ?? "24h", values.role);
      return 0;
    case "rewards":
      await rewardsCommand(ctx);
      return 0;
    case "appeal":
      await appealCommand(ctx, sub, third, values.statement);
      return 0;
    default:
      err(`Unknown command ${command}.\n\n${USAGE}`);
      return 2;
  }
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint())
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      err(sanitize(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    },
  );
