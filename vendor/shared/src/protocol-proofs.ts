import { z } from "zod";

const Hex32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/u);
const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/u);
const SignatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/u);
const UintStringSchema = z.string().regex(/^(0|[1-9][0-9]*)$/u);

export const CidV1Schema = z.string().regex(/^b[a-z2-7]{10,}$/u);

export const ProtocolProofDomainSchema = z.object({
  name: z.literal("AgentGrid Protocol"),
  version: z.literal("1"),
  chainId: z.number().int().positive(),
  verifyingContract: AddressSchema,
});

export const ExecutorDeliverySchema = z.object({
  taskId: Hex32Schema,
  cidHash: Hex32Schema,
});

export const TesterAssignmentSchema = z.object({
  taskId: Hex32Schema,
  executor: AddressSchema,
  testersHash: Hex32Schema,
  seedCommitment: Hex32Schema,
  executorTier: z.number().int().min(0).max(3),
  nonce: UintStringSchema,
  deadline: UintStringSchema,
});

export const TestReportProofSchema = z.object({
  taskId: Hex32Schema,
  cidHash: Hex32Schema,
  executor: AddressSchema,
  conclusionsHash: Hex32Schema,
  approved: z.boolean(),
  signature: SignatureSchema.optional(),
});

export const AssignmentVoucherSchema = z.object({
  taskId: Hex32Schema,
  executor: AddressSchema,
  issuedAt: UintStringSchema,
  expiresAt: UintStringSchema,
  nonce: UintStringSchema,
  signature: SignatureSchema.optional(),
});

export const PublisherProfileProofSchema = z.object({
  publisher: AddressSchema,
  completedTasks: z.number().int().min(0).max(0xffff_ffff),
  reputation: z.number().int().min(0).max(2),
  nonce: UintStringSchema,
  deadline: UintStringSchema,
  signature: SignatureSchema.optional(),
});

export const TesterTimeoutProofSchema = z.object({
  taskId: Hex32Schema,
  tester: AddressSchema,
  nonce: UintStringSchema,
  deadline: UintStringSchema,
  signature: SignatureSchema.optional(),
});

export const ArbitrationCaseProofSchema = z.object({
  caseId: Hex32Schema,
  taskId: Hex32Schema,
  criteriaHash: Hex32Schema,
  evidenceHash: Hex32Schema,
  nonce: UintStringSchema,
  deadline: UintStringSchema,
  signature: SignatureSchema.optional(),
});

export const CollusionReportProofSchema = z.object({
  juror: AddressSchema,
  reporter: AddressSchema,
  evidenceHash: Hex32Schema,
  nonce: UintStringSchema,
  deadline: UintStringSchema,
  signature: SignatureSchema.optional(),
});

export const EmissionDayProofSchema = z.object({
  epoch: UintStringSchema,
  platformAmount: UintStringSchema,
  executorAmount: UintStringSchema,
  testerAmount: UintStringSchema,
  arbAmount: UintStringSchema,
  execAccruedSnapshot: UintStringSchema,
  testAccruedSnapshot: UintStringSchema,
  burnAmount: UintStringSchema,
  nonce: UintStringSchema,
  deadline: UintStringSchema,
  signature: SignatureSchema.optional(),
});

export const HourlyAnchorProofSchema = z.object({
  hourId: UintStringSchema,
  recordsRoot: Hex32Schema,
  poolSnapshotRoot: Hex32Schema,
  seatSnapshotRoot: Hex32Schema,
  nonce: UintStringSchema,
  deadline: UintStringSchema,
  signature: SignatureSchema.optional(),
});

export const PROTOCOL_PROOF_TYPES = {
  ExecutorDelivery: [
    { name: "taskId", type: "bytes32" },
    { name: "cidHash", type: "bytes32" },
  ],
  TesterAssignment: [
    { name: "taskId", type: "bytes32" },
    { name: "executor", type: "address" },
    { name: "testersHash", type: "bytes32" },
    { name: "seedCommitment", type: "bytes32" },
    { name: "executorTier", type: "uint8" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
  TestReport: [
    { name: "taskId", type: "bytes32" },
    { name: "cidHash", type: "bytes32" },
    { name: "executor", type: "address" },
    { name: "conclusionsHash", type: "bytes32" },
    { name: "approved", type: "bool" },
  ],
  AssignmentVoucher: [
    { name: "taskId", type: "bytes32" },
    { name: "executor", type: "address" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
    { name: "nonce", type: "uint256" },
  ],
  PublisherProfile: [
    { name: "publisher", type: "address" },
    { name: "completedTasks", type: "uint64" },
    { name: "reputation", type: "uint8" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
  TesterTimeout: [
    { name: "taskId", type: "bytes32" },
    { name: "tester", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
  ArbitrationCase: [
    { name: "caseId", type: "bytes32" },
    { name: "taskId", type: "bytes32" },
    { name: "criteriaHash", type: "bytes32" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
  CollusionReport: [
    { name: "juror", type: "address" },
    { name: "reporter", type: "address" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
  EmissionDay: [
    { name: "epoch", type: "uint64" },
    { name: "platformAmount", type: "uint256" },
    { name: "executorAmount", type: "uint256" },
    { name: "testerAmount", type: "uint256" },
    { name: "arbAmount", type: "uint256" },
    { name: "execAccruedSnapshot", type: "uint256" },
    { name: "testAccruedSnapshot", type: "uint256" },
    { name: "burnAmount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
  HourlyAnchor: [
    { name: "hourId", type: "uint64" },
    { name: "recordsRoot", type: "bytes32" },
    { name: "poolSnapshotRoot", type: "bytes32" },
    { name: "seatSnapshotRoot", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
  Settlement: [
    { name: "taskId", type: "bytes32" },
    { name: "resultsHash", type: "bytes32" },
    { name: "deductionAgt", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
  TesterSeatClaim: [
    { name: "taskId", type: "bytes32" },
    { name: "tester", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export function assertProtocolProofBounds(
  input:
    | { kind: "PUBLISHER_PROFILE"; completedTasks: number; reputation: number }
    | {
        kind: "ARBITRATION_CASE";
        criterionCount: number;
        excludedCount: number;
        sourceCount: number;
        weightBps: readonly number[];
      }
    | {
        kind: "EMISSION_DAY";
        platformAmount: bigint;
        executorAmount: bigint;
        testerAmount: bigint;
        arbAmount: bigint;
        execAccruedSnapshot: bigint;
        testAccruedSnapshot: bigint;
        burnAmount: bigint;
      },
): void {
  if (input.kind === "PUBLISHER_PROFILE") {
    if (
      !Number.isInteger(input.completedTasks) ||
      input.completedTasks < 0 ||
      input.completedTasks > 0xffff_ffff ||
      !Number.isInteger(input.reputation) ||
      input.reputation < 0 ||
      input.reputation > 2
    )
      throw new RangeError("PUBLISHER_PROFILE_OUT_OF_BOUNDS");
    return;
  }

  if (input.kind === "ARBITRATION_CASE") {
    const weightTotal = input.weightBps.reduce((sum, value) => sum + value, 0);
    if (
      input.criterionCount < 1 ||
      input.criterionCount > 64 ||
      input.excludedCount > 256 ||
      input.sourceCount > 256 ||
      input.weightBps.length !== input.criterionCount ||
      weightTotal !== 10_000
    )
      throw new RangeError("ARBITRATION_CASE_OUT_OF_BOUNDS");
    return;
  }
  if (
    input.platformAmount < 0n ||
    input.executorAmount < 0n ||
    input.testerAmount < 0n ||
    input.arbAmount < 0n ||
    input.execAccruedSnapshot < 0n ||
    input.testAccruedSnapshot < 0n ||
    input.burnAmount < 0n ||
    input.execAccruedSnapshot > input.executorAmount ||
    input.testAccruedSnapshot > input.testerAmount
  )
    throw new RangeError("EMISSION_DAY_OUT_OF_BOUNDS");
}

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

export function base32Lower(bytes: Uint8Array): string {
  let result = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) result += BASE32[(buffer << (5 - bits)) & 31];
  return result;
}

/** CIDv1 for a raw block using sha2-256, matching Kubo block/put with format=raw. */
export async function rawCidV1(content: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(content);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer));
  const cid = new Uint8Array(4 + digest.length);
  cid.set([0x01, 0x55, 0x12, 0x20]);
  cid.set(digest, 4);
  return `b${base32Lower(cid)}`;
}
