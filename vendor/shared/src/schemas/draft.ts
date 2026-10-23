import { z } from "zod";
import {
  AddressSchema,
  CriterionSchema,
  DecimalIntegerSchema,
  IsoDateTimeSchema,
  TaskInputSchema,
  type TaskSpec,
  TaskSpecSchema,
} from "./domain.js";
import { AllocationModeSchema, TaskTemplateSchema, TierSchema } from "./enums.js";

export const DraftFieldSourceSchema = z.enum(["user", "ai", "rule"]);
export const DraftFieldConfirmationSchema = z.enum(["unconfirmed", "confirmed", "suggested"]);

export function draftFieldSchema<T extends z.ZodType>(valueSchema: T) {
  return z.object({
    value: valueSchema.nullable(),
    source: DraftFieldSourceSchema,
    confirmation: DraftFieldConfirmationSchema,
    updatedAt: IsoDateTimeSchema,
  });
}

export const DraftCriterionSchema = draftFieldSchema(CriterionSchema);

const RuleCostSchema = z.object({
  reserve: DecimalIntegerSchema,
  dailyFee: DecimalIntegerSchema,
});

export const TaskDraftFieldsSchema = z.object({
  title: draftFieldSchema(z.string().trim().min(1).max(200)),
  summary: draftFieldSchema(z.string().trim().min(1).max(8_000)),
  template: draftFieldSchema(TaskTemplateSchema),
  deliverables: draftFieldSchema(z.array(z.string().trim().min(1).max(2_000)).min(1)),
  outOfScope: draftFieldSchema(z.array(z.string().trim().min(1).max(2_000))),
  constraints: draftFieldSchema(z.array(z.string().trim().min(1).max(2_000))),
  inputs: draftFieldSchema(z.array(TaskInputSchema)),
  criteria: draftFieldSchema(z.array(DraftCriterionSchema).min(1)),
  estimatedHours: draftFieldSchema(z.number().positive()),
  startTier: draftFieldSchema(TierSchema),
  maxTier: draftFieldSchema(TierSchema),
  runDays: draftFieldSchema(z.number().int().positive()),
  allocationMode: draftFieldSchema(AllocationModeSchema),
  topK: draftFieldSchema(z.number().int().positive()),
  maxParticipants: draftFieldSchema(z.number().int().min(1).max(24)),
  passingThreshold: draftFieldSchema(z.number().int().min(50).max(90)),
  minimumTier: draftFieldSchema(TierSchema),
  cost: draftFieldSchema(RuleCostSchema),
});

export const DraftSuggestionSchema = z.object({
  field: z.string().min(1),
  value: z.unknown(),
  createdAt: IsoDateTimeSchema,
});

export const TaskDraftSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  publisher: AddressSchema,
  version: z.number().int().nonnegative(),
  fields: TaskDraftFieldsSchema,
  summarizedUpToMessageId: z.string().nullable(),
  lastSummarizedAt: IsoDateTimeSchema.nullable(),
  pendingSuggestions: z.array(DraftSuggestionSchema),
  status: z.enum(["EDITING", "FROZEN", "PUBLISHED", "EXPIRED"]),
});

export type DraftField<T> = {
  value: T | null;
  source: z.infer<typeof DraftFieldSourceSchema>;
  confirmation: z.infer<typeof DraftFieldConfirmationSchema>;
  updatedAt: string;
};
export type DraftCriterion = z.infer<typeof DraftCriterionSchema>;
export type TaskDraftFields = z.infer<typeof TaskDraftFieldsSchema>;
export type TaskDraft = z.infer<typeof TaskDraftSchema>;
export type DraftSuggestion = z.infer<typeof DraftSuggestionSchema>;

const editableFields = [
  "title",
  "summary",
  "template",
  "deliverables",
  "outOfScope",
  "constraints",
  "inputs",
  "criteria",
  "estimatedHours",
  "startTier",
  "maxTier",
  "runDays",
  "maxParticipants",
  "passingThreshold",
] as const;

export function finalizeDraft(input: TaskDraft): TaskSpec {
  const draft = TaskDraftSchema.parse(input);
  const missing: string[] = editableFields.filter((name) => {
    const field = draft.fields[name];
    return field.value === null || field.confirmation !== "confirmed";
  });
  for (const name of ["minimumTier", "cost", "allocationMode"] as const) {
    const field = draft.fields[name];
    if (field.value === null || field.source !== "rule") missing.push(name);
  }
  const draftCriteria = draft.fields.criteria.value;
  if (
    draftCriteria?.some(
      (criterion) => criterion.value === null || criterion.confirmation !== "confirmed",
    ) === true
  ) {
    missing.push("criteria");
  }
  if (missing.length > 0) {
    throw new Error(`Draft fields are incomplete or unconfirmed: ${missing.join(", ")}`);
  }

  const fields = draft.fields;
  return TaskSpecSchema.parse({
    version: "AGENTGRID_TASK_SPEC_V4",
    title: fields.title.value,
    summary: fields.summary.value,
    template: fields.template.value,
    deliverables: fields.deliverables.value,
    outOfScope: fields.outOfScope.value,
    constraints: fields.constraints.value,
    inputs: fields.inputs.value,
    criteria: fields.criteria.value?.map((criterion) => criterion.value),
    estimatedHours: fields.estimatedHours.value,
    startTier: fields.startTier.value,
    maxTier: fields.maxTier.value,
    runDays: fields.runDays.value,
    allocationMode: fields.allocationMode.value,
    maxParticipants: fields.maxParticipants.value,
    passingThreshold: fields.passingThreshold.value,
  });
}
