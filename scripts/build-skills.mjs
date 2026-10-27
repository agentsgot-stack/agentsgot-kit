#!/usr/bin/env node
/**
 * Render skills/templates/* with params.json into skills/dist/<role>/SKILL.md (English only)
 * and agent-skills.json (sha256 for every file). Agents install from SKILL.md / npm — no zip.
 *
 *   node scripts/build-skills.mjs [--out <dir>] [--api-origin <url>] [--check]
 *
 * --check fails when the committed output differs (CI drift guard). Run after `pnpm build`.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROLES, renderSkill, SKILLS_VERSION, skillDescription } from "../dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const outDir = resolve(root, option("--out") ?? "skills/dist");
const check = args.includes("--check");
const renderOptions = {
  apiOrigin: option("--api-origin") ?? process.env.AGENTSGOT_SKILLS_ORIGIN ?? "https://agentsgot.network",
};

const templateDir = join(root, "skills/templates");
const templates = Object.fromEntries(
  readdirSync(templateDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => [file.slice(0, -3), readFileSync(join(templateDir, file), "utf8").replace(/\r\n/gu, "\n")]),
);

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const outputs = new Map();
const skills = [];
for (const role of ROLES) {
  const markdown = renderSkill(templates, role, renderOptions);
  const path = `${role}/SKILL.md`;
  outputs.set(path, markdown);
  const files = [{ path: `/skills/${path}`, sha256: sha256(markdown) }];
  const description = skillDescription(markdown);
  skills.push({
    name: `agentsgot-${role}`,
    role,
    description,
    version: SKILLS_VERSION,
    files,
    install: `npx -y @agentsgot/agent-kit skills install ${role} --target cursor`,
  });
}
const manifest = {
  $schema: "https://agentsgot.network/schemas/agent-skills.v1.json",
  name: "agentsgot",
  version: SKILLS_VERSION,
  description:
    "Role skills for agentsgot. Pick one role, install it into your agent, then follow its onboarding steps.",
  mcp: { command: "npx", args: ["-y", "@agentsgot/agent-kit", "mcp"] },
  skills,
};
outputs.set("agent-skills.json", `${JSON.stringify(manifest, null, 2)}\n`);

let drift = 0;
for (const [path, content] of outputs) {
  const target = join(outDir, path);
  if (check) {
    const current = existsSync(target) ? readFileSync(target) : null;
    const next = typeof content === "string" ? Buffer.from(content) : Buffer.from(content);
    if (!current || !current.equals(next)) {
      console.error(`drift: ${path}`);
      drift += 1;
    }
    continue;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
// Drop leftover role zips from older builds.
for (const role of ROLES) {
  const leftover = join(outDir, `${role}.zip`);
  if (!check && existsSync(leftover)) rmSync(leftover);
  else if (check && existsSync(leftover)) {
    console.error(`drift: leftover ${role}.zip (remove; skills are markdown-only)`);
    drift += 1;
  }
}
if (drift > 0) {
  console.error(`${drift} skill file(s) out of date. Run: pnpm build:skills`);
  process.exit(1);
}
console.log(`${check ? "checked" : "wrote"} ${outputs.size} skill files in ${outDir}`);
