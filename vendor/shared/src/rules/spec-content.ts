import type { Criterion, MachineCheck, RuleCheckResult, TaskInput } from "../schemas/index.js";

/** Machine check kinds testers execute; any other kind cannot be verified and blocks publishing. */
export const MACHINE_CHECK_KINDS = ["JSON_SCHEMA", "REGEX", "URL_CHECK"] as const;
export type MachineCheckKind = (typeof MACHINE_CHECK_KINDS)[number];

/** The executable parts of a specification; `null` marks a field that is not filled yet. */
export interface SpecContent {
  title: string | null;
  summary: string | null;
  deliverables: readonly string[] | null;
  constraints: readonly string[] | null;
  inputs: readonly TaskInput[] | null;
  criteria: readonly Criterion[] | null;
}

const PLACEHOLDER = /待补充|待用户|待填写|待提供|\bTBD\b|\bTODO\b|\{\{[^}]*\}\}/iu;
const INPUT_REQUEST = /请补充|请提供|请填写|please\s+(?:add|provide|supply|fill)/iu;

/** Returns why a machine check can never be executed as written, or null when it is runnable. */
export function machineCheckProblem(check: MachineCheck): string | null {
  if (!(MACHINE_CHECK_KINDS as readonly string[]).includes(check.kind))
    return `unsupported kind ${check.kind}`;
  if (check.kind === "REGEX") {
    try {
      new RegExp(check.commandOrSchema, "gu");
    } catch {
      return "regex does not compile with flags gu";
    }
  }
  if (check.kind === "JSON_SCHEMA") {
    let schema: unknown;
    try {
      schema = JSON.parse(check.commandOrSchema);
    } catch {
      return "schema is not valid JSON";
    }
    if (typeof schema !== "object" || schema === null || Array.isArray(schema))
      return "schema must be a JSON object";
  }
  if (check.kind === "URL_CHECK" && check.expected.trim() !== "") {
    const status = Number(check.expected);
    if (!Number.isInteger(status) || status < 100 || status > 599)
      return "expected must be an HTTP status code";
  }
  return null;
}

/**
 * Deterministic executability checks: every machine check must be runnable by testers and no field
 * may still carry a placeholder or a request addressed to the publisher.
 */
export function checkSpecContent(content: SpecContent): RuleCheckResult[] {
  const criteria = content.criteria ?? [];
  const problems = criteria.flatMap((criterion) => {
    const problem = criterion.machineCheck ? machineCheckProblem(criterion.machineCheck) : null;
    return problem ? [`${criterion.id}: ${problem}`] : [];
  });
  const needsJson = criteria.some(({ machineCheck }) => machineCheck?.kind === "JSON_SCHEMA");
  if (needsJson && !(content.deliverables ?? []).some((item) => /json/iu.test(item)))
    problems.push("JSON_SCHEMA checks need a JSON deliverable");
  const offending = new Set<string>();
  const scan = (field: string, texts: readonly string[], pattern = PLACEHOLDER) => {
    if (texts.some((text) => pattern.test(text))) offending.add(field);
  };
  scan("title", content.title ? [content.title] : []);
  scan("summary", content.summary ? [content.summary] : []);
  scan("deliverables", content.deliverables ?? []);
  scan("constraints", content.constraints ?? []);
  scan("criteria", criteria.map(({ description }) => description));
  const inputs = (content.inputs ?? []).map(({ ref }) => ref);
  scan("inputs", inputs);
  scan("inputs", inputs, INPUT_REQUEST);
  return [
    {
      id: "criteria.machineChecks",
      level: problems.length ? "block" : "ok",
      message: problems.length
        ? `Machine checks cannot run: ${problems.join("; ")}`
        : "Every machine check is runnable",
      fields: ["criteria"],
      ...(problems.length ? { params: { problems: problems.join("; ") } } : {}),
    },
    {
      id: "content.placeholders",
      level: offending.size ? "block" : "ok",
      message: offending.size
        ? `Fields still contain placeholders or requests for the publisher: ${[...offending].join(", ")}`
        : "No unresolved placeholders",
      fields: [...offending],
    },
  ];
}
