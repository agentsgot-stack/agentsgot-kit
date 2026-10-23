import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set([
  "node_modules",
  ".git",
  ".data",
  ".next",
  "dist",
  "out",
  "artifacts",
  "cache",
  "typechain-types",
  "dependencies",
  "docs",
  "deployments",
  "coverage",
]);
const violations = [];
let checked = 0;
function inside(target) {
  const local = relative(root, target);
  return (
    local !== ".." &&
    !local.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
    !isAbsolute(local)
  );
}
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      visit(file);
      continue;
    }
    if (entry.name === "package.json") {
      const json = JSON.parse(readFileSync(file, "utf8"));
      for (const group of ["dependencies", "devDependencies", "optionalDependencies"]) {
        for (const [name, value] of Object.entries(json[group] ?? {})) {
          if (/^(?:file:|link:|workspace:)/u.test(value))
            violations.push(`${relative(root, file)}: local package dependency ${name}`);
        }
      }
    }
    if (/^tsconfig.*\.json$/u.test(entry.name)) {
      const text = readFileSync(file, "utf8");
      const match = /"extends"\s*:\s*"(\.[^"]+)"/u.exec(text);
      if (match && !inside(resolve(directory, match[1])))
        violations.push(`${relative(root, file)}: external tsconfig`);
    }
    if (![".ts", ".tsx", ".mts", ".mjs", ".cjs", ".sol"].includes(extname(file))) continue;
    checked++;
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.[^"']+)["']/gu)) {
      if (!inside(resolve(directory, match[1])))
        violations.push(`${relative(root, file)}: import ${match[1]}`);
    }
  }
}
visit(root);
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else console.log(`Independent boundary check passed (${checked} source files).`);
