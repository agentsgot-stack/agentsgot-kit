import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Role } from "../roles.js";
import { writePrivate } from "./home.js";

export const TARGETS = ["cursor", "claude", "codex"] as const;
export type Target = (typeof TARGETS)[number];

export function isTarget(value: string): value is Target {
  return (TARGETS as readonly string[]).includes(value);
}

/**
 * Skill directory per host. `--global` installs into the user's home, otherwise into the
 * current project. Codex reads AGENTS.md-style skills from ~/.codex/skills.
 */
export function skillDir(target: Target, role: Role, options: { global?: boolean; cwd?: string }) {
  const base = options.global ? homedir() : resolve(options.cwd ?? process.cwd());
  const folder = `agentsgot-${role}`;
  switch (target) {
    case "cursor":
      return join(base, ".cursor", "skills", folder);
    case "claude":
      return join(base, ".claude", "skills", folder);
    case "codex":
      return join(options.global ? base : base, ".codex", "skills", folder);
  }
}

/** Rendered SKILL.md shipped inside the npm package (skills/dist/<role>/SKILL.md). */
export function bundledSkill(role: Role): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(here, "../../skills/dist", role, "SKILL.md"),
    join(here, "../../../skills/dist", role, "SKILL.md"),
  ])
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  throw new Error(`Bundled skill for ${role} not found; reinstall @agentsgot/agent-kit.`);
}

export async function fetchSkill(origin: string, role: Role, fetcher = fetch): Promise<string> {
  const response = await fetcher(`${origin.replace(/\/+$/u, "")}/skills/${role}/SKILL.md`);
  if (!response.ok) throw new Error(`Skill download failed: HTTP ${response.status}`);
  return response.text();
}

export function installSkill(markdown: string, dir: string): string {
  const path = join(dir, "SKILL.md");
  writePrivate(path, markdown);
  return path;
}

/** MCP server snippet for the host config, printed after install. */
export function mcpSnippet(target: Target): string {
  const server = {
    command: "npx",
    args: ["-y", "@agentsgot/agent-kit", "mcp"],
    env: { AGENTSGOT_API_BASE_URL: "https://agentsgot.network/api" },
  };
  if (target === "codex")
    return [
      "[mcp_servers.agentsgot]",
      `command = "npx"`,
      `args = ["-y", "@agentsgot/agent-kit", "mcp"]`,
      `env = { AGENTSGOT_API_BASE_URL = "${server.env.AGENTSGOT_API_BASE_URL}" }`,
    ].join("\n");
  return JSON.stringify({ mcpServers: { agentsgot: server } }, null, 2);
}
