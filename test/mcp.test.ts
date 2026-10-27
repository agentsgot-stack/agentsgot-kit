import { describe, expect, it, vi } from "vitest";
import { defaultParams } from "#shared/params";
import { AgentGridMcpServer, serveStdio } from "../src/mcp/server.js";
import type { AgentGridClient } from "../src/sdk/client.js";

function server() {
  const client = {
    listTasks: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    getTask: vi.fn(async (taskId: string) => ({
      taskId,
      settlement: {
        deliveries: [
          {
            executor: `0x${"1".repeat(40)}`,
            artifactHash: `0x${"2".repeat(64)}`,
            status: "SIGNED",
          },
        ],
      },
    })),
    claimTask: vi.fn(async () => ({ id: "claim" })),
    submitWork: vi.fn(async () => ({ id: "sub", cid: "bafy", cidHash: "0x1", status: "SIGNED" })),
    createRewardClaim: vi.fn(async () => ({ scheduleIds: ["1"], tx: { to: "0x1" } })),
    getJoinTesterPoolIntent: vi.fn(async () => ({
      inPool: false,
      meetsMinimum: true,
      canJoin: true,
      tx: {
        chainId: 97,
        to: `0x${"ab".repeat(20)}`,
        data: "0x8371e6b4",
        value: "0",
      },
    })),
    prepareJoinTesterPool: vi.fn((input: { chainId: number; testerAssignment: string }) => ({
      tx: {
        chainId: input.chainId,
        to: input.testerAssignment,
        data: "0x8371e6b4",
        value: "0",
      },
    })),
    publishTask: vi.fn(async () => ({ id: "intent" })),
    getAcceptResult: vi.fn(async () => ({ tx: { to: "0x2" } })),
    listActions: vi.fn(async () => ({ items: [], asOfBlock: 1, asOf: "now" })),
  } as unknown as AgentGridClient;
  return { client, mcp: new AgentGridMcpServer(client) };
}

async function call(mcp: AgentGridMcpServer, name: string, args: Record<string, unknown> = {}) {
  return mcp.handle({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
}

describe("MCP server", () => {
  it("negotiates the MCP protocol", async () => {
    const result = await server().mcp.handle({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(result?.result).toMatchObject({ protocolVersion: "2025-06-18" });
  });
  it("lists the role-complete tool set", async () => {
    const result = await server().mcp.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect((result?.result as { tools: { name: string }[] }).tools.map(({ name }) => name)).toEqual(
      [
        "list_tasks",
        "get_task",
        "claim_task",
        "submit_work",
        "claim_rewards",
        "join_tester_pool",
        "publish_task",
        "accept_result",
        "get_next_actions",
        "get_eligibility",
        "heartbeat",
        "heartbeat_claim",
        "draw_testers",
        "get_submission",
        "submit_test_report",
        "get_final_result",
        "review_task",
        "join_arbitrator_pool",
        "list_arbitrator_cases",
        "get_dispute",
        "confirm_arbitration_seat",
        "arbitration_vote_intent",
        "send_transaction",
        "sign_delivery",
        "get_submission_file",
        "list_rewards",
        "submit_fallback_report",
        "get_role_guide",
        "list_actions",
      ],
    );
  });
  it("ships instructions with params-driven thresholds and role prompts", async () => {
    const init = await server().mcp.handle({ jsonrpc: "2.0", id: 1, method: "initialize" });
    const instructions = (init?.result as { instructions: string }).instructions;
    expect(instructions).toContain(`${defaultParams.testerMinStakeAgt} AGT`);
    expect(instructions).toContain(`${defaultParams.arbitratorMinStakeAgt} AGT`);
    expect(instructions).toContain("Never paste a private key");
    const list = await server().mcp.handle({ jsonrpc: "2.0", id: 2, method: "prompts/list" });
    expect((list?.result as { prompts: { name: string }[] }).prompts.map((p) => p.name)).toEqual([
      "role_executor",
      "role_tester",
      "role_arbitrator",
      "role_publisher",
    ]);
    const prompt = await server().mcp.handle({
      jsonrpc: "2.0",
      id: 3,
      method: "prompts/get",
      params: { name: "role_executor" },
    });
    expect(JSON.stringify(prompt?.result)).toContain("tester-draws/commit");
  });
  it("draw_testers commits then reveals, tolerating a pending reveal", async () => {
    const { client, mcp } = server();
    Object.assign(client, {
      commitTesterDraw: vi.fn(async () => ({ taskId: "t", signature: null })),
      revealTesterDraw: vi.fn(async () => {
        throw new Error("seed block not mined");
      }),
    });
    expect(await call(mcp, "draw_testers", { taskId: "t" })).toMatchObject({
      result: { structuredContent: { revealPending: true } },
    });
  });
  it("calls list_tasks", async () => {
    expect(await call(server().mcp, "list_tasks")).toMatchObject({
      result: { structuredContent: { items: [] } },
    });
  });
  it("calls get_task and returns delivery proofs", async () => {
    const { client, mcp } = server();
    expect(await call(mcp, "get_task", { taskId: "task" })).toMatchObject({
      result: {
        structuredContent: {
          taskId: "task",
          settlement: { deliveries: [{ status: "SIGNED" }] },
        },
      },
    });
    expect(client.getTask).toHaveBeenCalledWith("task");
  });
  it("calls claim_task with idempotency", async () => {
    const { client, mcp } = server();
    await call(mcp, "claim_task", { taskId: "task", idempotencyKey: "idem" });
    expect(client.claimTask).toHaveBeenCalledWith("task", "idem");
  });
  it("submit_work returns CID and signature status", async () => {
    expect(
      await call(server().mcp, "submit_work", {
        claimId: "c",
        files: [{ name: "x", text: "y" }],
        idempotencyKey: "i",
      }),
    ).toMatchObject({ result: { structuredContent: { cid: "bafy", signatureStatus: "SIGNED" } } });
  });
  it("claim_rewards returns a pending transaction and does not send", async () => {
    expect(await call(server().mcp, "claim_rewards", { scheduleIds: ["1"] })).toMatchObject({
      result: { structuredContent: { tx: { to: "0x1" } } },
    });
  });
  it("join_tester_pool defaults to the API join intent", async () => {
    const { client, mcp } = server();
    expect(await call(mcp, "join_tester_pool")).toMatchObject({
      result: {
        structuredContent: {
          canJoin: true,
          tx: { chainId: 97, data: "0x8371e6b4", value: "0" },
        },
      },
    });
    expect(client.getJoinTesterPoolIntent).toHaveBeenCalledOnce();
    expect(client.prepareJoinTesterPool).not.toHaveBeenCalled();
  });
  it("join_tester_pool can encode locally when addresses are provided", async () => {
    const testerAssignment = `0x${"ab".repeat(20)}`;
    const { client, mcp } = server();
    expect(await call(mcp, "join_tester_pool", { chainId: 97, testerAssignment })).toMatchObject({
      result: {
        structuredContent: {
          tx: { chainId: 97, to: testerAssignment, data: "0x8371e6b4", value: "0" },
        },
      },
    });
    expect(client.prepareJoinTesterPool).toHaveBeenCalledWith({ chainId: 97, testerAssignment });
    expect(client.getJoinTesterPoolIntent).not.toHaveBeenCalled();
  });
  it("calls publish_task", async () => {
    expect(
      await call(server().mcp, "publish_task", { specification: {}, idempotencyKey: "publish" }),
    ).toMatchObject({
      result: { structuredContent: { id: "intent" } },
    });
  });
  it("deduplicates publish_task by idempotency key", async () => {
    const { client, mcp } = server();
    const input = { specification: {}, idempotencyKey: "publish" };
    await call(mcp, "publish_task", input);
    await call(mcp, "publish_task", input);
    expect(client.publishTask).toHaveBeenCalledOnce();
  });
  it("accept_result returns the acceptance transaction and does not send", async () => {
    const { client, mcp } = server();
    expect(await call(mcp, "accept_result", { taskId: "task" })).toMatchObject({
      result: { structuredContent: { tx: { to: "0x2" } } },
    });
    expect(client.getAcceptResult).toHaveBeenCalledWith("task");
  });
  it("calls list_actions", async () => {
    expect(await call(server().mcp, "list_actions", { subjectId: "1" })).toMatchObject({
      result: { structuredContent: { asOfBlock: 1 } },
    });
  });
  it("returns an MCP error result for an unknown tool", async () => {
    expect(await call(server().mcp, "missing")).toMatchObject({ error: { code: -32602 } });
  });
  it("serves newline-delimited JSON-RPC over stdio", async () => {
    const writes: string[] = [];
    await serveStdio(server().mcp, {
      lines: (async function* () {
        yield '{"jsonrpc":"2.0","id":1,"method":"tools/list"}';
      })(),
      write: (line) => writes.push(line),
    });
    expect(writes[0]).toContain("list_tasks");
  });
});
