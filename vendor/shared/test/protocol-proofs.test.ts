import { describe, expect, it } from "vitest";
import {
  assertProtocolProofBounds,
  CidV1Schema,
  computeValidatorStakeRequirementAgt,
  PROTOCOL_PROOF_TYPES,
  rawCidV1,
  TesterAssignmentSchema,
} from "../src/protocol-proofs.js";

describe("protocol proof primitives", () => {
  it("keeps the contract field order", () => {
    expect(PROTOCOL_PROOF_TYPES.TesterAssignment.map(({ name }) => name)).toEqual([
      "taskId",
      "executor",
      "testersHash",
      "seedCommitment",
      "executorTier",
      "nonce",
      "deadline",
    ]);
  });

  it("defines every WP3Y protocol proof with the contract field order", () => {
    expect(Object.keys(PROTOCOL_PROOF_TYPES)).toEqual([
      "ExecutorDelivery",
      "TesterAssignment",
      "TestReport",
      "AssignmentVoucher",
      "PublisherProfile",
      "ValidatorStakeRequirement",
      "ArbitrationCase",
      "CollusionReport",
      "EmissionDay",
      "Settlement",
    ]);
  });

  it("clamps the validator requirement before signing", () => {
    const limits = { minimumAgt: 10, dynamicMaximumAgt: 200, multiplierBps: 30_000 };
    expect(computeValidatorStakeRequirementAgt([], limits)).toBe(10n * 10n ** 18n);
    expect(computeValidatorStakeRequirementAgt([50n * 10n ** 18n], limits)).toBe(150n * 10n ** 18n);
    expect(computeValidatorStakeRequirementAgt([1_000n * 10n ** 18n], limits)).toBe(
      200n * 10n ** 18n,
    );
    expect(computeValidatorStakeRequirementAgt([2n * 10n ** 17n * 30n], limits)).toBe(
      18n * 10n ** 18n,
    );
  });

  it("rejects protocol facts outside contract hard bounds", () => {
    expect(() =>
      assertProtocolProofBounds({
        kind: "EMISSION_DAY",
        activeIndependentExecutors30d: 10_000_001,
      }),
    ).toThrow("EMISSION_DAY_OUT_OF_BOUNDS");
    expect(() =>
      assertProtocolProofBounds({
        kind: "ARBITRATION_CASE",
        criterionCount: 1,
        excludedCount: 0,
        sourceCount: 0,
        weightBps: [9_999],
      }),
    ).toThrow("ARBITRATION_CASE_OUT_OF_BOUNDS");
  });

  it("computes a deterministic raw CIDv1", async () => {
    const first = await rawCidV1(new TextEncoder().encode("agentgrid"));
    const second = await rawCidV1(new TextEncoder().encode("agentgrid"));
    expect(first).toBe(second);
    expect(CidV1Schema.parse(first)).toBe(first);
  });

  it("rejects assignments that omit the executor binding", () => {
    expect(
      TesterAssignmentSchema.safeParse({
        taskId: `0x${"1".repeat(64)}`,
        testersHash: `0x${"2".repeat(64)}`,
        seedCommitment: `0x${"3".repeat(64)}`,
        executorTier: 0,
        nonce: "0",
        deadline: "1",
      }).success,
    ).toBe(false);
  });
});
