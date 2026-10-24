import { describe, expect, it } from "vitest";

import {
  AcceptanceGrade,
  AcceptanceGradeSchema,
  AllocationMode,
  AllocationModeSchema,
  ArbitrationRound,
  ArbitrationRoundSchema,
  CriterionSchema,
  EmissionDaySchema,
  finalizeDraft,
  Role,
  RoleSchema,
  TaskSpecSchema,
  TaskStatus,
  TaskStatusSchema,
  TaskTemplate,
  TaskTemplateSchema,
  Tier,
  TierSchema,
  ValidatorStatus,
  ValidatorStatusSchema,
} from "../src/index.js";
import { criterionA, makeDraft } from "./fixtures.js";

const enumCases = [
  [RoleSchema, Role],
  [TierSchema, Tier],
  [AcceptanceGradeSchema, AcceptanceGrade],
  [AllocationModeSchema, AllocationMode],
  [TaskTemplateSchema, TaskTemplate],
  [TaskStatusSchema, TaskStatus],
  [ValidatorStatusSchema, ValidatorStatus],
  [ArbitrationRoundSchema, ArbitrationRound],
] as const;

describe("serialized enums", () => {
  it.each(enumCases.map(([schema, values], index) => [index, schema, values] as const))(
    "accepts every member of enum %s",
    (_index, schema, values) => {
      for (const value of Object.values(values)) expect(schema.parse(value)).toBe(value);
    },
  );

  it.each(enumCases.map(([schema], index) => [index, schema] as const))(
    "rejects a non-member of enum %s",
    (_index, schema) => {
      expect(schema.safeParse("not_a_member").success).toBe(false);
    },
  );
});

describe("domain schemas", () => {
  it("requires machine checks for grade A", () => {
    expect(CriterionSchema.safeParse({ ...criterionA, machineCheck: undefined }).success).toBe(
      false,
    );
  });

  it("allows a subjective grade C criterion", () => {
    expect(
      CriterionSchema.safeParse({ ...criterionA, grade: "C", machineCheck: undefined }).success,
    ).toBe(true);
  });

  it("rejects criterion weights that do not total 10000", () => {
    const spec = finalizeDraft(makeDraft());
    expect(
      TaskSpecSchema.safeParse({ ...spec, criteria: [{ ...criterionA, weightBps: 9_999 }] })
        .success,
    ).toBe(false);
  });

  it("rejects duplicate criterion IDs", () => {
    const spec = finalizeDraft(makeDraft());
    expect(
      TaskSpecSchema.safeParse({
        ...spec,
        criteria: [
          { ...criterionA, weightBps: 5_000 },
          { ...criterionA, weightBps: 5_000 },
        ],
      }).success,
    ).toBe(false);
  });

  it("finalizes a fully confirmed draft", () => {
    expect(finalizeDraft(makeDraft()).version).toBe("AGENTGRID_TASK_SPEC_V4");
  });

  it("refuses an unconfirmed field", () => {
    const draft = makeDraft();
    draft.fields.runDays.confirmation = "unconfirmed";
    expect(() => finalizeDraft(draft)).toThrow(/runDays/u);
  });

  it("refuses an individually unconfirmed criterion", () => {
    const draft = makeDraft();
    const firstCriterion = draft.fields.criteria.value?.[0];
    if (firstCriterion === undefined) throw new Error("fixture criterion is missing");
    firstCriterion.confirmation = "suggested";
    expect(() => finalizeDraft(draft)).toThrow(/criteria/u);
  });

  it("refuses a system field not sourced from rules", () => {
    const draft = makeDraft();
    draft.fields.minimumTier.source = "ai";
    expect(() => finalizeDraft(draft)).toThrow(/minimumTier/u);
  });

  it("parses an emission day", () => {
    expect(
      EmissionDaySchema.parse({
        day: "2030-01-01",
        treasuryBalance: "800000000",
        dailyEmission: "600000",
        totalBilledVolume: "50000",
        ratePerUnit: "0.012",
        taskCount: 42,
        computedAt: "2030-01-01T00:00:00Z",
      }).taskCount,
    ).toBe(42);
  });
});
