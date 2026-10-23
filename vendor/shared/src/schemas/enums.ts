import { z } from "zod";

export const Role = {
  Publisher: "PUBLISHER",
  Executor: "EXECUTOR",
  Tester: "TESTER",
  Reviewer: "REVIEWER",
  Arbitrator: "ARBITRATOR",
} as const;
export const Tier = {
  T1: "T1",
  T2: "T2",
  T3: "T3",
  T4: "T4",
  T5: "T5",
} as const;
export const AcceptanceGrade = { A: "A", B: "B", C: "C" } as const;
export const AllocationMode = {
  WinnerTakesAll: "WINNER_TAKES_ALL",
  TopK: "TOP_K",
  ProRata: "PRO_RATA",
} as const;
export const TaskTemplate = {
  CodeFix: "CODE_FIX",
  DataProcessing: "DATA_PROCESSING",
  Translation: "TRANSLATION",
  Research: "RESEARCH",
  Custom: "CUSTOM",
} as const;
export const TaskStatus = {
  Published: "PUBLISHED",
  Running: "RUNNING",
  Grace: "GRACE",
  Closed: "CLOSED",
  Testing: "TESTING",
  Reviewing: "REVIEWING",
  ResultPosted: "RESULT_POSTED",
  Accepted: "ACCEPTED",
  Disputed: "DISPUTED",
  Appealed: "APPEALED",
  Maintenance: "MAINTENANCE",
  Completed: "COMPLETED",
  Cancelled: "CANCELLED",
  Expired: "EXPIRED",
  NoSubmission: "NO_SUBMISSION",
  Insufficient: "INSUFFICIENT",
  Failed: "FAILED",
} as const;
export const ValidatorStatus = {
  Active: "ACTIVE",
  Grace: "GRACE",
  Inactive: "INACTIVE",
  CoolingDown: "COOLING_DOWN",
} as const;
export const ArbitrationRound = { First: "FIRST", Final: "FINAL" } as const;

export const RoleSchema = z.enum(Role);
export const TierSchema = z.enum(Tier);
export const AcceptanceGradeSchema = z.enum(AcceptanceGrade);
export const AllocationModeSchema = z.enum(AllocationMode);
export const TaskTemplateSchema = z.enum(TaskTemplate);
export const TaskStatusSchema = z.enum(TaskStatus);
export const ValidatorStatusSchema = z.enum(ValidatorStatus);
export const ArbitrationRoundSchema = z.enum(ArbitrationRound);

export type Role = z.infer<typeof RoleSchema>;
export type Tier = z.infer<typeof TierSchema>;
export type AcceptanceGrade = z.infer<typeof AcceptanceGradeSchema>;
export type AllocationMode = z.infer<typeof AllocationModeSchema>;
export type TaskTemplate = z.infer<typeof TaskTemplateSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type ValidatorStatus = z.infer<typeof ValidatorStatusSchema>;
export type ArbitrationRound = z.infer<typeof ArbitrationRoundSchema>;
