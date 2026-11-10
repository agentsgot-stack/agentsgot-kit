import { describe, expect, it, vi } from "vitest";
import { defaultParams } from "#shared/params";
import { AgentGridMcpServer, serveStdio } from "../src/mcp/server.js";
import type { AgentGridClient } from "../src/sdk/client.js";

const LOCAL = `0x${"1".repeat(40)}`;
const OWNER = `0x${"a".repeat(40)}`;

function readiness(address: string, ready: boolean) {
  return {
    address,
    stakeWei: ready ? "1000" : "0",
    inFlightReserveWei: "0",
    requiredStakeWei: "1000",
    walletAgtWei: "0",
    gasWei: ready ? "1" : "0",
    ready,
    missing: ready ? [] : [{ code: "GAS_BALANCE_EMPTY", description: "no gas" }],
  };
}

function server() {
  const client = {
    walletAddress: LOCAL,
    getEligibility: vi.fn(async () => ({
      address: LOCAL,
      roles: { publisher: { missing: [] } },
    })),
    listTasks: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    getTask: vi.fn(async (taskId: string) => ({
      taskId,
      publisher: OWNER,
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
    getArbStreamPending: vi.fn(async () => ({
      account: "0xabc",
      pendingWei: "5",
      weight: "1",
      available: true,
    })),
    claimArbStream: vi.fn(async () => ({ account: "0xabc", tx: { to: "0x3" } })),
    openAppeal: vi.fn(async () => ({ taskId: "t", tx: { to: "0x4" } })),
    claimTesterSeat: vi.fn(async () => ({ taskId: "t", amountWei: "7", tx: { to: "0x5" } })),
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
        "check_publish_accounts",
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
        "get_rewards_breakdown",
        "open_appeal",
        "waive_appeal",
        "waive_dispute_appeal",
        "get_arb_stream_pending",
        "claim_arb_stream",
        "claim_tester_seat",
        "list_executor_shares",
        "vest_executor_shares",
        "submit_fallback_report",
        "get_role_guide",
        "list_actions",
      ],
    );
  });
  it("enforces the vesting claim batch boundary and requires an appeal statement", async () => {
    const result = await server().mcp.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const tools = (
      result?.result as {
        tools: { name: string; description: string; inputSchema: Record<string, unknown> }[];
      }
    ).tools;
    expect(tools.find(({ name }) => name === "list_rewards")?.description).toContain(
      "executor mining",
    );
    expect(tools.find(({ name }) => name === "claim_rewards")?.inputSchema).toMatchObject({
      properties: {
        scheduleIds: { minItems: 1, maxItems: 100, uniqueItems: true },
      },
    });
    expect(tools.find(({ name }) => name === "open_appeal")?.inputSchema).toMatchObject({
      required: ["taskId", "statement"],
    });
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
  it("submit_work uploads base64 files as binary with their relative paths", async () => {
    const { client, mcp } = server();
    await call(mcp, "submit_work", {
      claimId: "c",
      files: [
        { name: "delivery.zip", base64: "UEsDBAA=", contentType: "application/zip" },
        { name: "src/index.ts", text: "export {};" },
      ],
      idempotencyKey: "i",
    });
    const [input] = vi.mocked(client.submitWork).mock.calls[0] ?? [];
    expect(input?.files.map((file) => file.name)).toEqual(["delivery.zip", "src/index.ts"]);
    const zip = input?.files[0]?.content;
    expect(zip?.type).toBe("application/zip");
    expect([...new Uint8Array((await zip?.arrayBuffer()) ?? new ArrayBuffer(0))]).toEqual([
      0x50, 0x4b, 0x03, 0x04, 0x00,
    ]);
  });
  it("claim_rewards returns a pending transaction and does not send", async () => {
    expect(await call(server().mcp, "claim_rewards", { scheduleIds: ["1"] })).toMatchObject({
      result: { structuredContent: { tx: { to: "0x1" } } },
    });
  });
  it("reads and claims the arbitration stream", async () => {
    expect(await call(server().mcp, "get_arb_stream_pending")).toMatchObject({
      result: { structuredContent: { pendingWei: "5", available: true } },
    });
    expect(await call(server().mcp, "claim_arb_stream")).toMatchObject({
      result: { structuredContent: { tx: { to: "0x3" } } },
    });
  });
  it("claim_tester_seat requests a signed claim for the given task", async () => {
    const { client, mcp } = server();
    expect(await call(mcp, "claim_tester_seat", { taskId: "t" })).toMatchObject({
      result: { structuredContent: { amountWei: "7", tx: { to: "0x5" } } },
    });
    expect(client.claimTesterSeat).toHaveBeenCalledWith("t");
  });
  it("open_appeal forwards the statement and criteria", async () => {
    const { client, mcp } = server();
    await call(mcp, "open_appeal", { taskId: "t", statement: "defect", criteria: ["c1"] });
    expect(client.openAppeal).toHaveBeenCalledWith("t", { statement: "defect", criteria: ["c1"] });
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
  describe("publishing under a delegated key", () => {
    function delegated(local: { ready: boolean; operator?: boolean }) {
      const { client } = server();
      const session = {
        publishTask: vi.fn(async () => ({ id: "local-intent" })),
        getAcceptResult: vi.fn(async () => ({ tx: { to: "0x9" } })),
        getNextActions: vi.fn(async () => ({
          address: LOCAL,
          asOf: "now",
          items: [{ kind: "REVIEW_RESULT", priority: 1, deadline: null }],
        })),
      } as unknown as AgentGridClient;
      Object.assign(client, {
        getEligibility: vi.fn(async () => ({
          address: OWNER,
          roles: { publisher: { missing: [] } },
        })),
        getPublisherReadiness: vi.fn(
          async (address: string, _reserve?: string, operator?: string) =>
            operator
              ? {
                  ...readiness(address, Boolean(local.operator)),
                  operator: { address: operator, active: Boolean(local.operator) },
                }
              : readiness(address, address === LOCAL ? local.ready : false),
        ),
        getNextActions: vi.fn(async () => ({ address: OWNER, asOf: "now", items: [] })),
      });
      const walletSession = vi.fn(async () => session);
      return {
        client,
        session,
        walletSession,
        mcp: new AgentGridMcpServer(client, { walletSession }),
      };
    }

    it("reports both accounts and recommends the local wallet when only it can publish", async () => {
      const { mcp } = delegated({ ready: true });
      const result = await call(mcp, "check_publish_accounts", { reserveWei: "10" });
      expect(result).toMatchObject({
        result: {
          structuredContent: {
            delegated: true,
            recommendation: "localWallet",
            keyOwner: { address: OWNER, canPublish: false, hasPublishScope: true },
            localWallet: { address: LOCAL, canPublish: true },
          },
        },
      });
    });

    it("recommends publishing for the key owner when it granted the local wallet", async () => {
      const { client, mcp } = delegated({ ready: true, operator: true });
      const result = await call(mcp, "check_publish_accounts", { reserveWei: "10" });
      expect(result).toMatchObject({
        result: {
          structuredContent: {
            recommendation: "operator",
            operator: { address: OWNER, canPublish: true, operator: { address: LOCAL } },
            localWallet: { canPublish: true },
          },
        },
      });
      expect(client.getPublisherReadiness).toHaveBeenCalledWith(OWNER, "10", LOCAL);
      expect(
        (result?.result as { structuredContent: { next: string } }).structuredContent.next,
      ).toContain("publishAs=localWallet");
    });

    it("explains how to grant the local wallet when no account can publish", async () => {
      const { mcp } = delegated({ ready: false });
      const result = await call(mcp, "check_publish_accounts", {});
      const content = (
        result?.result as { structuredContent: { recommendation: string; next: string } }
      ).structuredContent;
      expect(content.recommendation).toBe("none");
      expect(content.next).toContain("setPublishOperator");
    });

    it("publishes for the key owner with the local wallet as operator", async () => {
      const { client, walletSession, mcp } = delegated({ ready: false, operator: true });
      await call(mcp, "publish_task", {
        specification: {},
        idempotencyKey: "op",
        publishAs: "operator",
      });
      expect(client.publishTask).toHaveBeenCalledWith({}, { operator: LOCAL });
      expect(walletSession).not.toHaveBeenCalled();
    });

    it("requires an explicit publishAs and refuses keyOwner from the local signer", async () => {
      const { client, mcp } = delegated({ ready: true });
      const spec = { specification: {}, idempotencyKey: "p" };
      for (const args of [spec, { ...spec, publishAs: "keyOwner" }]) {
        const result = await call(mcp, "publish_task", args);
        expect(result?.result).toMatchObject({ isError: true });
      }
      expect(client.publishTask).not.toHaveBeenCalled();
    });

    it("publishes as the local wallet through its own session", async () => {
      const { client, session, walletSession, mcp } = delegated({ ready: true });
      const result = await call(mcp, "publish_task", {
        specification: {},
        idempotencyKey: "p",
        publishAs: "localWallet",
      });
      expect(result).toMatchObject({ result: { structuredContent: { id: "local-intent" } } });
      expect(walletSession).toHaveBeenCalledOnce();
      expect(session.publishTask).toHaveBeenCalledOnce();
      expect(client.publishTask).not.toHaveBeenCalled();
    });

    it("routes publisher actions and next actions for local-wallet tasks", async () => {
      const { client, session, mcp } = delegated({ ready: true });
      vi.mocked(client.getTask).mockResolvedValueOnce({ publisher: LOCAL } as never);
      await call(mcp, "accept_result", { taskId: "t" });
      expect(session.getAcceptResult).toHaveBeenCalledWith("t");
      expect(client.getAcceptResult).not.toHaveBeenCalled();

      vi.mocked(client.listTasks).mockResolvedValueOnce({ items: [{}] } as never);
      expect(await call(mcp, "get_next_actions")).toMatchObject({
        result: {
          structuredContent: { items: [{ kind: "REVIEW_RESULT", account: "localWallet" }] },
        },
      });
    });
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
