import {
  AcceptanceGrade,
  AllocationMode,
  type Criterion,
  type DraftField,
  type TaskDraft,
  TaskTemplate,
  Tier,
} from "../src/index.js";

export const criterionA: Criterion = {
  id: "criterion-a",
  description: "The machine check passes",
  grade: AcceptanceGrade.A,
  weightBps: 10_000,
  machineCheck: { kind: "REGEX", commandOrSchema: "Tests? passed", expected: "" },
};

export function field<T>(value: T, source: "user" | "ai" | "rule" = "user"): DraftField<T> {
  return {
    value,
    source,
    confirmation: "confirmed",
    updatedAt: "2030-01-01T00:00:00Z",
  };
}

export function makeDraft(): TaskDraft {
  return {
    id: "draft-1",
    sessionId: "session-1",
    publisher: "0x1111111111111111111111111111111111111111",
    version: 3,
    fields: {
      title: field("Implement a deterministic rule"),
      summary: field("Implement and verify one deterministic rule module."),
      template: field(TaskTemplate.Translation),
      deliverables: field(["Source code", "Tests"]),
      outOfScope: field([]),
      constraints: field([]),
      inputs: field([]),
      criteria: field([field(criterionA)]),
      estimatedHours: field(1),
      startTier: field(Tier.T1),
      maxTier: field(Tier.T1),
      runDays: field(3),
      allocationMode: field(AllocationMode.ProRata, "rule"),
      topK: field(null),
      maxParticipants: field(9),
      passingThreshold: field(60),
      minimumTier: field(Tier.T1, "rule"),
      cost: field(
        {
          reserve: (300n * 10n ** 18n * 3n).toString(),
          dailyFee: (300n * 10n ** 18n).toString(),
        },
        "rule",
      ),
    },
    summarizedUpToMessageId: "message-1",
    lastSummarizedAt: "2030-01-01T00:00:00Z",
    pendingSuggestions: [],
    status: "FROZEN",
  };
}
