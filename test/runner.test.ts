import { describe, expect, it, vi } from "vitest";
import { defaultParams } from "#shared/params";
import {
  AgentGridError,
  deadlineMode,
  InMemoryCheckpointAdapter,
  mergedSchedules,
  type NextAction,
  RoleRunner,
  roleSchedules,
  type VoteCheckpoint,
} from "../src/index.js";
import type { AgentGridClient } from "../src/sdk/client.js";

const tx = { chainId: 31337, to: "0x1", data: "0x", value: "0" as const };

function item(partial: Partial<NextAction> & Pick<NextAction, "kind" | "role">): NextAction {
  return {
    priority: 1,
    subject: { kind: "TASK", id: "s1" },
    taskId: "t1",
    deadline: null,
    request: { method: "POST", path: "/x", body: null },
    onChain: false,
    hint: "",
    trigger: null,
    ...partial,
  };
}

function client(items: NextAction[], extra: Record<string, unknown> = {}) {
  return {
    getNextActions: vi.fn(async () => ({ address: "0xa", asOf: "", items, warnings: [] })),
    sendTransaction: vi.fn(async () => "0xhash"),
    ...extra,
  } as unknown as AgentGridClient & Record<string, ReturnType<typeof vi.fn>>;
}

describe("RoleRunner", () => {
  it("draws testers right after signing the delivery", async () => {
    const c = client([item({ kind: "SIGN_DELIVERY", role: "executor" })], {
      signDelivery: vi.fn(async () => ({})),
      commitTesterDraw: vi.fn(async () => ({})),
      revealTesterDraw: vi.fn(async () => ({ testers: ["0xt1", "0xt2", "0xt3"] })),
    });
    const runner = new RoleRunner({
      client: c,
      roles: ["executor"],
      checkpoints: new InMemoryCheckpointAdapter(),
    });
    const report = await runner.tick();
    expect(c.commitTesterDraw).toHaveBeenCalledWith("t1");
    expect(c.revealTesterDraw).toHaveBeenCalledWith("t1");
    expect(report.events.map(({ type }) => type)).toEqual(["delivery_signed", "testers_drawn"]);
  });

  it("retries reveal on the next tick when the seed block is not mined", async () => {
    const c = client([item({ kind: "TESTER_DRAW_COMMIT", role: "executor", priority: 0 })], {
      commitTesterDraw: vi.fn(async () => ({})),
      revealTesterDraw: vi.fn(async () => {
        throw new AgentGridError(409, "SEED_BLOCK_PENDING", "wait", true);
      }),
    });
    const report = await new RoleRunner({
      client: c,
      roles: ["executor"],
      checkpoints: new InMemoryCheckpointAdapter(),
    }).tick();
    expect(report.handled[0]?.outcome).toBe("skipped");
    expect(report.expedited).toBe(true);
  });

  it("never sends transactions without autoSend", async () => {
    const c = client([item({ kind: "POST_RESULT", role: "executor" })], {
      getFinalResult: vi.fn(async () => ({ tx })),
    });
    const report = await new RoleRunner({
      client: c,
      roles: ["executor"],
      checkpoints: new InMemoryCheckpointAdapter(),
    }).tick();
    expect(c.sendTransaction).not.toHaveBeenCalled();
    expect(report.handled[0]).toMatchObject({ outcome: "pending-tx", pendingTx: tx });
  });

  it("waives an appeal through decideAppeal when autoSend is on", async () => {
    const c = client([item({ kind: "APPEAL_DECISION" as NextAction["kind"], role: "executor" })], {
      getTask: vi.fn(async () => ({ taskId: "t1", appeal: { executors: ["0xa"] } })),
      waiveAppeal: vi.fn(async () => ({ tx })),
    });
    const report = await new RoleRunner({
      client: c,
      roles: ["executor"],
      checkpoints: new InMemoryCheckpointAdapter(),
      autoSend: true,
      handlers: {
        decideAppeal: async () => ({ action: "waive" }),
      },
    }).tick();
    expect(c.waiveAppeal).toHaveBeenCalledWith("t1");
    expect(c.sendTransaction).toHaveBeenCalledWith(tx);
    expect(report.handled[0]?.outcome).toBe("done");
  });

  it("surfaces appeal_decision_needed when decideAppeal is missing", async () => {
    const c = client([item({ kind: "APPEAL_DECISION" as NextAction["kind"], role: "executor" })], {
      getTask: vi.fn(async () => ({ taskId: "t1" })),
    });
    const report = await new RoleRunner({
      client: c,
      roles: ["executor"],
      checkpoints: new InMemoryCheckpointAdapter(),
    }).tick();
    expect(report.handled[0]?.outcome).toBe("skipped");
    expect(report.events.map(({ type }) => type)).toContain("appeal_decision_needed");
  });

  it("ignores items for roles that are not enabled", async () => {
    const c = client([item({ kind: "REVIEW_RESULT", role: "publisher" })]);
    const report = await new RoleRunner({
      client: c,
      roles: ["tester"],
      checkpoints: new InMemoryCheckpointAdapter(),
    }).tick();
    expect(report.handled).toEqual([]);
  });

  it("refuses a tester evaluation that skips a criterion", async () => {
    const c = client([item({ kind: "SUBMIT_TEST_REPORT", role: "tester" })], {
      getTask: vi.fn(async () => ({ specification: { criteria: [{ id: "a" }, { id: "b" }] } })),
      submitTestReport: vi.fn(),
    });
    const report = await new RoleRunner({
      client: c,
      roles: ["tester"],
      checkpoints: new InMemoryCheckpointAdapter(),
      handlers: {
        evaluateDelivery: async () => ({
          approved: true,
          criteria: [{ criterionId: "a", passed: true, note: "ok" }],
          summary: "s",
        }),
      },
    }).tick();
    expect(c.submitTestReport).not.toHaveBeenCalled();
    expect(report.handled[0]?.outcome).toBe("error");
  });

  it("persists the vote salt at commit and reuses it at reveal", async () => {
    const checkpoints = new InMemoryCheckpointAdapter();
    const intent = vi.fn(async () => ({ commitTx: tx, revealTx: { ...tx, data: "0x02" } }));
    const subject = { kind: "ARBITRATION_CASE" as const, id: "case1" };
    const commit = client(
      [item({ kind: "COMMIT_ARBITRATION_VOTE", role: "arbitrator", subject })],
      {
        getDispute: vi.fn(async () => ({ criteria: [{ id: "a" }] })),
        createArbitrationVoteIntent: intent,
      },
    );
    await new RoleRunner({
      client: commit,
      roles: ["arbitrator"],
      checkpoints,
      autoSend: true,
      handlers: { judgeDispute: async () => [{ satisfied: true, reason: "ok" }] },
    }).tick();
    const stored = await checkpoints.get<VoteCheckpoint>("vote:case1");
    expect(stored?.salt).toMatch(/^0x[0-9a-f]{64}$/u);
    const reveal = client(
      [item({ kind: "REVEAL_ARBITRATION_VOTE", role: "arbitrator", subject })],
      {
        createArbitrationVoteIntent: intent,
      },
    );
    await new RoleRunner({
      client: reveal,
      roles: ["arbitrator"],
      checkpoints,
      autoSend: true,
    }).tick();
    expect(intent.mock.calls[1]).toEqual(["case1", stored?.votes, stored?.salt]);
    expect(reveal.sendTransaction).toHaveBeenCalledWith({ ...tx, data: "0x02" });
  });
});

describe("schedules", () => {
  it("keeps every interval at or below 1/6 of the protected window", () => {
    const cases = roleSchedules("arbitrator").find(({ name }) => name === "cases");
    expect(cases?.everySeconds).toBeLessThanOrEqual(
      (defaultParams.arbAcceptWindowHours * 3600) / 6,
    );
    const heartbeat = roleSchedules("executor").find(({ name }) => name === "claim-heartbeat");
    expect(heartbeat?.everySeconds).toBeLessThanOrEqual(1800 / 6);
  });
  it("halves intervals in expedited mode", () => {
    for (const job of mergedSchedules(["executor", "tester", "arbitrator", "publisher"]))
      expect(job.expeditedSeconds).toBeLessThanOrEqual(job.everySeconds);
  });
  it("enters expedited mode in the last 20% of a window", () => {
    const start = new Date(0);
    const end = new Date(100_000);
    expect(deadlineMode(start, end, new Date(40_000))).toBe("normal");
    expect(deadlineMode(start, end, new Date(60_000))).toBe("target-passed");
    expect(deadlineMode(start, end, new Date(85_000))).toBe("expedited");
    expect(deadlineMode(start, end, new Date(100_000))).toBe("overdue");
  });
});
