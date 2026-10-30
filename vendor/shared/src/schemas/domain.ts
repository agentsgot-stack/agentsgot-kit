import { z } from "zod";

import {
  AcceptanceGrade,
  AcceptanceGradeSchema,
  AllocationModeSchema,
  ArbitrationRoundSchema,
  TaskTemplateSchema,
  TierSchema,
} from "./enums.js";

export const DecimalIntegerSchema = z.string().regex(/^(0|[1-9]\d*)$/u);
export const PositiveDecimalIntegerSchema = z.string().regex(/^[1-9]\d*$/u);
export const DecimalStringSchema = z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/u);
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/u);
export const Hex32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/u);

export const MachineCheckSchema = z.object({
  kind: z.string().trim().min(1).max(64),
  commandOrSchema: z.string().trim().min(1).max(4_096),
  expected: z.string().max(4_096),
});

export const CriterionSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    description: z.string().trim().min(1).max(4_096),
    grade: AcceptanceGradeSchema,
    weightBps: z.number().int().min(0).max(10_000),
    machineCheck: MachineCheckSchema.optional(),
  })
  .superRefine((criterion, context) => {
    if (criterion.grade === AcceptanceGrade.A && criterion.machineCheck === undefined) {
      context.addIssue({
        code: "custom",
        path: ["machineCheck"],
        message: "Grade A requires a machine check",
      });
    }
  });

export const TaskInputSchema = z.object({
  kind: z.enum(["REPO", "FILE", "URL", "TEXT"]),
  ref: z.string().trim().min(1).max(8_192),
});

export const TaskSpecSchema = z
  .object({
    version: z.enum(["AGENTGRID_TASK_SPEC_V3", "AGENTGRID_TASK_SPEC_V4"]),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(8_000),
    template: TaskTemplateSchema,
    deliverables: z.array(z.string().trim().min(1).max(2_000)).min(1),
    outOfScope: z.array(z.string().trim().min(1).max(2_000)),
    constraints: z.array(z.string().trim().min(1).max(2_000)),
    inputs: z.array(TaskInputSchema),
    criteria: z.array(CriterionSchema).min(1),
    estimatedHours: z.number().positive(),
    startTier: TierSchema,
    maxTier: TierSchema,
    runDays: z.number().int().positive(),
    allocationMode: AllocationModeSchema,
    topK: z.number().int().positive().optional(),
    maxParticipants: z.number().int().min(1).max(24).optional(),
    passingThreshold: z.number().int().min(50).max(90).default(60),
    criticReportHash: Hex32Schema.optional(),
  })
  .superRefine((specification, context) => {
    if (
      new Set(specification.criteria.map(({ id }) => id)).size !== specification.criteria.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["criteria"],
        message: "Criterion IDs must be unique",
      });
    }
    if (specification.criteria.reduce((sum, item) => sum + item.weightBps, 0) !== 10_000) {
      context.addIssue({
        code: "custom",
        path: ["criteria"],
        message: "Criterion weights must total 10000 bps",
      });
    }
    if (specification.allocationMode === "TOP_K" && specification.topK === undefined) {
      context.addIssue({
        code: "custom",
        path: ["topK"],
        message: "TopK allocation requires topK",
      });
    }
    if (specification.version === "AGENTGRID_TASK_SPEC_V4") {
      if (specification.allocationMode !== "PRO_RATA") {
        context.addIssue({
          code: "custom",
          path: ["allocationMode"],
          message: "V4 tasks use proportional allocation",
        });
      }
      if (specification.topK !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["topK"],
          message: "V4 tasks do not use Top K",
        });
      }
      if (specification.maxParticipants === undefined) {
        context.addIssue({
          code: "custom",
          path: ["maxParticipants"],
          message: "V4 tasks require a participant limit",
        });
      }
    }
  });

export const RuleCheckResultSchema = z.object({
  id: z.string().min(1),
  level: z.enum(["ok", "warn", "block"]),
  message: z.string().min(1),
  fields: z.array(z.string()).default([]),
  params: z.record(z.string(), z.string()).optional(),
});

export const DisputeSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  trigger: z.enum(["REJECTION", "TEST_CONTESTED", "MAINTENANCE_DEFECT"]),
  round: ArbitrationRoundSchema,
  panelSize: z.union([z.literal(3), z.literal(5), z.literal(9), z.literal(11), z.literal(21)]),
  criterionIds: z.array(z.string().min(1)).min(1),
  phase: z.enum(["DRAWING", "CONFIRM", "COMMIT", "REVEAL", "TALLIED", "EXECUTED"]),
  caseFee: DecimalIntegerSchema,
  lockPerJuror: DecimalIntegerSchema,
  outcome: z
    .object({
      perCriterion: z.record(z.string(), z.boolean()),
      result: z.enum(["PUBLISHER_WINS", "EXECUTOR_WINS", "PARTIAL"]),
    })
    .optional(),
});

export const VoteSchema = z.object({
  disputeId: z.string().min(1),
  jurorId: z.string().min(1),
  commitHash: Hex32Schema,
  revealed: z.record(z.string(), z.boolean()).optional(),
  reasonHash: Hex32Schema.optional(),
});

export const VestingTrancheSchema = z.object({
  taskId: z.string().min(1),
  beneficiary: AddressSchema,
  kind: z.enum(["DEDUCTION", "EMISSION"]),
  amount: PositiveDecimalIntegerSchema,
  releaseAt: IsoDateTimeSchema,
  status: z.enum(["LOCKED", "CLAIMABLE", "CLAIMED", "CLAWED_BACK"]),
});

/** Economic model v3 daily emission snapshot (§4.7). */
export const EmissionDaySchema = z.object({
  epoch: z.number().int().nonnegative(),
  treasuryBalance: DecimalIntegerSchema,
  dailyEmission: DecimalIntegerSchema,
  platformAmount: DecimalIntegerSchema,
  executorAmount: DecimalIntegerSchema,
  testerAmount: DecimalIntegerSchema,
  arbitratorAmount: DecimalIntegerSchema,
  burnedAmount: DecimalIntegerSchema.default("0"),
  /** Optional Merkle root binding accrued exec/test leaves for the epoch. */
  allocationRoot: Hex32Schema.optional(),
  totalTaskWeight: DecimalIntegerSchema.optional(),
  activeTaskCount: z.number().int().nonnegative().optional(),
  computedAt: IsoDateTimeSchema,
});

export type MachineCheck = z.infer<typeof MachineCheckSchema>;
export type Criterion = z.infer<typeof CriterionSchema>;
export type TaskInput = z.infer<typeof TaskInputSchema>;
export type TaskSpec = z.infer<typeof TaskSpecSchema>;
export type RuleCheckResult = z.infer<typeof RuleCheckResultSchema>;
export type Dispute = z.infer<typeof DisputeSchema>;
export type Vote = z.infer<typeof VoteSchema>;
export type VestingTranche = z.infer<typeof VestingTrancheSchema>;
export type EmissionDay = z.infer<typeof EmissionDaySchema>;
