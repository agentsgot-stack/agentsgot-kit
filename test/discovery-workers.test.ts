import { describe, expect, it, vi } from "vitest";
import {
  ArbitratorWorker,
  createAgentCard,
  createLlmsText,
  ExecutorWorker,
  InMemoryCheckpointAdapter,
  LocalStorageCheckpointAdapter,
  MockLlmAdapter,
  OpenAiCompatibleLlmAdapter,
  signWebhook,
  TesterWorker,
  verifyWebhook,
} from "../src/index.js";
import type { AgentGridClient } from "../src/sdk/client.js";

describe("A2A discovery", () => {
  it("declares the required skills", () => {
    expect(createAgentCard("https://api.example").skills.map(({ id }) => id)).toEqual([
      "discover_tasks",
      "claim_task",
      "submit_work",
      "claim_rewards",
      "claim_mining_rewards",
      "join_tester_pool",
      "publish_task",
      "get_next_actions",
      "get_eligibility",
      "draw_testers",
      "submit_test_report",
      "join_arbitrator_pool",
      "arbitrate",
    ]);
  });
  it("declares SIWE and Bearer authentication", () => {
    expect(createAgentCard("https://api.example").authentication.schemes).toEqual([
      "SIWE",
      "Bearer",
    ]);
  });
  it("describes the zero-gas-until-reward flow", () => {
    expect(createLlmsText("https://api.example")).toContain(
      "needs native gas only when claiming rewards",
    );
  });
  it("documents tester joinPool after staking", () => {
    expect(createLlmsText("https://api.example")).toContain("/staking/tester-pool-join-intent");
  });
});

describe("webhook security", () => {
  it("accepts a valid raw-body signature", async () => {
    const signature = await signWebhook("secret", "1000", '{"ok":true}');
    expect(
      await verifyWebhook({
        secret: "secret",
        timestamp: "1000",
        rawBody: '{"ok":true}',
        signature,
        nowSeconds: 1000,
      }),
    ).toBe(true);
  });
  it("rejects a modified raw body", async () => {
    const signature = await signWebhook("secret", "1000", "a");
    expect(
      await verifyWebhook({
        secret: "secret",
        timestamp: "1000",
        rawBody: "b",
        signature,
        nowSeconds: 1000,
      }),
    ).toBe(false);
  });
  it("rejects a stale delivery", async () => {
    const signature = await signWebhook("secret", "1", "a");
    expect(
      await verifyWebhook({
        secret: "secret",
        timestamp: "1",
        rawBody: "a",
        signature,
        nowSeconds: 1000,
      }),
    ).toBe(false);
  });
});

describe("adapters and workers", () => {
  it("persists checkpoints in memory", async () => {
    const store = new InMemoryCheckpointAdapter();
    await store.set("x", { value: 1 });
    expect(await store.get("x")).toEqual({ value: 1 });
  });
  it("persists checkpoints in Storage-like production adapters", async () => {
    const values = new Map<string, string>();
    const store = new LocalStorageCheckpointAdapter({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
    });
    await store.set("x", [1]);
    expect(await store.get("x")).toEqual([1]);
  });
  it("uses a configurable OpenAI-compatible LLM adapter", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "done" } }] }), {
          headers: { "content-type": "application/json" },
        }),
    );
    const adapter = new OpenAiCompatibleLlmAdapter({
      baseUrl: "https://llm.example",
      apiKey: "key",
      model: "model",
      fetcher,
    });
    expect(await adapter.complete({ role: "executor", prompt: "work" })).toBe("done");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("runs the executor workflow through the SDK interface", async () => {
    const client = {
      listTasks: vi.fn(async () => ({
        items: [{ taskId: "task", specification: { summary: "do", criteria: [{ id: "c" }] } }],
      })),
      claimTask: vi.fn(async () => ({ id: "claim" })),
      submitWork: vi.fn(async () => ({ id: "submission" })),
    } as unknown as AgentGridClient;
    const result = await new ExecutorWorker(
      client,
      new MockLlmAdapter("result"),
      new InMemoryCheckpointAdapter(),
    ).runOnce();
    expect(result).toEqual({ taskId: "task", claimId: "claim", submissionId: "submission" });
  });
  it("runs the tester workflow through the SDK interface", async () => {
    const client = {
      submitTestReport: vi.fn(async () => ({ id: "report", approved: true })),
    } as unknown as AgentGridClient;
    const result = await new TesterWorker(
      client,
      new MockLlmAdapter("passes"),
      new InMemoryCheckpointAdapter(),
    ).run({ taskId: "task", submissionId: "sub", criteria: [{ criterionId: "c" }] });
    expect(result).toEqual({ reportId: "report", approved: true });
  });
  it("runs the arbitrator workflow and explicitly sends three transactions", async () => {
    const client = {
      listArbitratorCases: vi.fn(async () => ({ items: [{ id: "case" }] })),
      prepareArbitrationVote: vi.fn(async () => [{}, {}, {}]),
      sendTransaction: vi.fn(async () => "0xhash"),
    } as unknown as AgentGridClient;
    const result = await new ArbitratorWorker(
      client,
      new MockLlmAdapter("yes"),
      new InMemoryCheckpointAdapter(),
    ).runOnce();
    expect(result?.transactionHashes).toHaveLength(3);
  });
});
