import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import {
  AgentGridClient,
  type AgentGridError,
  FetchHttpAdapter,
  InMemoryHttpAdapter,
  MockWalletAdapter,
  PACKAGE_NAME,
  SDK_VERSION,
  SUPPORTED_OPENAPI_VERSION,
  SUPPORTED_TASK_SPEC_VERSION,
} from "../src/index.js";

const taskId = `0x${"aa".repeat(32)}`;
const cidHash = `0x${"bb".repeat(32)}`;
const tx = { chainId: 31337, to: `0x${"12".repeat(20)}`, data: "0x1234", value: "0" };
const typed = {
  domain: { name: "AgentGrid Protocol", version: "1", chainId: 31337, verifyingContract: tx.to },
  types: {
    ExecutorDelivery: [
      { name: "taskId", type: "bytes32" },
      { name: "cidHash", type: "bytes32" },
    ],
  },
  primaryType: "ExecutorDelivery" as const,
  message: { taskId, cidHash },
};

function clientWith(handler: ConstructorParameters<typeof InMemoryHttpAdapter>[0]) {
  const http = new InMemoryHttpAdapter(handler);
  const wallet = new MockWalletAdapter();
  return { client: new AgentGridClient({ http, wallet, credential: "key" }), http, wallet };
}

describe("AgentGridClient", () => {
  it("exports package and semantic versions", () => {
    expect(PACKAGE_NAME).toBe("@agentsgot/agent-kit");
    expect(SDK_VERSION).toBe("1.0.0");
    expect(SUPPORTED_OPENAPI_VERSION).toBe("0.1.0");
    expect(SUPPORTED_TASK_SPEC_VERSION).toBe("AGENTGRID_TASK_SPEC_V4");
  });

  it("performs nonce, SIWE signing, and verification", async () => {
    const { client, http, wallet } = clientWith((request) =>
      request.path === "/auth/nonce"
        ? { nonce: "nonce" }
        : {
            sessionToken: "session",
            expiresAt: "later",
            principal: { kind: "user", address: wallet.address, scopes: [] },
          },
    );
    const result = await client.authenticate(({ nonce, address }) => `${address}:${nonce}`);
    expect(result.sessionToken).toBe("session");
    expect(wallet.signedMessages).toEqual([`${wallet.address}:nonce`]);
    expect(http.requests).toHaveLength(2);
  });

  it("registers off-chain and adopts the one-time key", async () => {
    const { client, http } = clientWith(() => ({
      agentId: "agent-1",
      agent: "0x1",
      tier: "TIER0",
      apiKey: { key: "new-key", prefix: "ag", scopes: [] },
    }));
    await client.registerAgent();
    await client.listTasks();
    expect(http.requests[1]?.token).toBe("new-key");
  });

  it("passes task filters as query parameters", async () => {
    const { client, http } = clientWith(() => ({ items: [], nextCursor: null, hasMore: false }));
    await client.listTasks({ status: "PUBLISHED", limit: 5 });
    expect(http.requests[0]?.query).toEqual({ status: "PUBLISHED", limit: 5 });
  });

  it("gets task details with signed delivery proofs", async () => {
    const executor = `0x${"12".repeat(20)}`;
    const artifactHash = `0x${"34".repeat(32)}`;
    const { client, http } = clientWith(() => ({
      taskId,
      settlement: {
        deliveries: [
          {
            executor,
            artifactHash,
            status: "SIGNED",
            submittedAt: "2026-10-26T00:00:00.000Z",
          },
        ],
      },
    }));

    const task = await client.getTask(taskId);
    expect(http.requests[0]?.path).toBe(`/tasks/${taskId}`);
    expect(task.settlement?.deliveries).toEqual([
      {
        executor,
        artifactHash,
        status: "SIGNED",
        submittedAt: "2026-10-26T00:00:00.000Z",
      },
    ]);
  });

  it("claims a task with an idempotency key", async () => {
    const { client, http } = clientWith(() => ({
      id: "claim",
      taskId,
      executor: "0x1",
      status: "CLAIMED",
      leaseExpiresAt: "later",
    }));
    await client.claimTask(taskId, "idem");
    expect(http.requests[0]?.headers).toEqual({ "idempotency-key": "idem" });
  });

  it("heartbeats an off-chain claim", async () => {
    const { client, http } = clientWith(() => ({
      id: "claim",
      taskId,
      executor: "0x1",
      status: "CLAIMED",
      leaseExpiresAt: "later",
    }));
    await client.heartbeatClaim("claim");
    expect(http.requests[0]?.path).toBe("/claims/claim/heartbeat");
  });

  it("reports Agent presence with the stored credential", async () => {
    const { client, http } = clientWith(() => ({ online: true }));
    await client.reportPresence();
    expect(http.requests[0]?.method).toBe("POST");
    expect(http.requests[0]?.path).toBe("/agents/heartbeat");
  });

  it("uploads, signs exact ExecutorDelivery typed data, and attaches the signature", async () => {
    const { client, http, wallet } = clientWith((request) =>
      request.path.endsWith("/signature")
        ? {
            id: "submission",
            claimId: "claim",
            taskId,
            cid: "bafy",
            cidHash,
            status: "SIGNED",
            executorTypedData: typed,
          }
        : {
            id: "submission",
            claimId: "claim",
            taskId,
            cid: "bafy",
            cidHash,
            status: "STORED",
            executorTypedData: typed,
          },
    );
    const result = await client.submitWork({
      claimId: "claim",
      files: [{ name: "a.txt", content: new Blob(["a"]) }],
      idempotencyKey: "delivery",
    });
    expect(result.status).toBe("SIGNED");
    expect(wallet.signedTypedData[0]).toEqual(typed);
    expect((http.requests[0]?.body as FormData).get("file")).toBeInstanceOf(Blob);
  });

  it("reads delivery files as text, or base64 when they are binary", async () => {
    const bodies: Record<string, Uint8Array> = {
      "/submissions/s/files/0": new TextEncoder().encode("export {};"),
      "/submissions/s/files/1": new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff]),
    };
    const { client, http } = clientWith((request) => ({
      contentType: "application/octet-stream",
      data: bodies[request.path],
    }));
    await expect(client.getSubmissionFile("s", 0)).resolves.toEqual({
      contentType: "application/octet-stream",
      size: 10,
      encoding: "utf8",
      content: "export {};",
    });
    await expect(client.getSubmissionFile("s", 1)).resolves.toMatchObject({
      size: 5,
      encoding: "base64",
      content: "UEsDBP8=",
    });
    expect(http.requests[0]).toMatchObject({ binary: true, token: "key" });
  });

  it("commits a tester draw", async () => {
    const { client, http } = clientWith(() => ({
      taskId,
      executor: "0x1",
      seedCommitment: cidHash,
      seed: null,
      testers: [],
      signature: null,
    }));
    await client.commitTesterDraw(taskId);
    expect(http.requests[0]?.path).toContain("tester-draws/commit");
  });

  it("reveals a tester draw", async () => {
    const { client, http } = clientWith(() => ({
      taskId,
      executor: "0x1",
      seedCommitment: cidHash,
      seed: cidHash,
      testers: [],
      signature: "0x",
    }));
    await client.revealTesterDraw(taskId);
    expect(http.requests[0]?.path).toContain("tester-draws/reveal");
  });

  it("canonicalizes and signs TestReport with shared typed-data fields", async () => {
    const { client, http, wallet } = clientWith((request) => {
      if (request.path.startsWith("/submissions/"))
        return {
          id: "sub",
          claimId: "c",
          taskId,
          cid: "bafy",
          cidHash,
          status: "SIGNED",
          executorTypedData: typed,
        };
      if (request.path.endsWith("tester-draws/reveal"))
        return {
          taskId,
          executor: wallet.address,
          seedCommitment: cidHash,
          seed: cidHash,
          testers: [wallet.address],
          signature: "0x",
        };
      return {
        id: "report",
        taskId,
        executor: wallet.address,
        tester: wallet.address,
        approved: true,
        criteria: [],
        summary: "ok",
        conclusionsHash: cidHash,
        signature: "0x",
        status: "SIGNED",
      };
    });
    await client.submitTestReport({
      taskId,
      submissionId: "sub",
      approved: true,
      criteria: [],
      summary: " ok ",
      idempotencyKey: "report",
    });
    expect(wallet.signedTypedData[0]?.primaryType).toBe("TestReport");
    expect(wallet.signedTypedData[0]?.message.executor).toBe(wallet.address);
    expect(http.requests.at(-1)?.body).toMatchObject({ submissionId: "sub" });
  });

  it("gets final result calldata without sending it", async () => {
    const { client, wallet } = clientWith(() => ({ result: { taskId }, tx }));
    expect((await client.getFinalResult(taskId)).tx).toEqual(tx);
    expect(wallet.sentTransactions).toHaveLength(0);
  });

  it("gets the publisher acceptance calldata without sending it", async () => {
    const { client, http, wallet } = clientWith(() => ({ tx }));
    expect((await client.getAcceptResult(taskId)).tx).toEqual(tx);
    expect(http.requests[0]?.path).toBe(`/tasks/${taskId}/accept-result-intent`);
    expect(wallet.sentTransactions).toHaveLength(0);
  });

  it("lists triggerable actions", async () => {
    const { client, http } = clientWith(() => ({ items: [], asOfBlock: 1, asOf: "now" }));
    await client.listActions({ address: "0x1", subjectId: "1" });
    expect(http.requests[0]?.query).toEqual({ address: "0x1", subjectId: "1" });
  });

  it("lists reward tranches", async () => {
    const { client } = clientWith(() => ({ chainTime: "now", items: [] }));
    expect((await client.listRewards()).items).toEqual([]);
  });

  it("builds a reward claim transaction without sending", async () => {
    const { client, wallet } = clientWith(() => ({ scheduleIds: ["1"], tx }));
    expect((await client.createRewardClaim(["1"])).tx).toEqual(tx);
    expect(wallet.sentTransactions).toHaveLength(0);
  });

  it("builds TesterAssignment.joinPool without sending", () => {
    const testerAssignment = getAddress(`0x${"cd".repeat(20)}`);
    const { client, wallet } = clientWith(() => ({}));
    const intent = client.prepareJoinTesterPool({ chainId: 97, testerAssignment });
    expect(intent.tx).toEqual({
      chainId: 97,
      to: testerAssignment,
      data: "0x8371e6b4",
      value: "0",
    });
    expect(wallet.sentTransactions).toHaveLength(0);
  });

  it("fetches joinPool intent from the API", async () => {
    const testerAssignment = getAddress(`0x${"cd".repeat(20)}`);
    const tx = { chainId: 97, to: testerAssignment, data: "0x8371e6b4", value: "0" as const };
    const { client, http, wallet } = clientWith(() => ({
      inPool: false,
      meetsMinimum: true,
      canJoin: true,
      tx,
    }));
    expect(await client.getJoinTesterPoolIntent()).toMatchObject({ canJoin: true, tx });
    expect(http.requests[0]?.path).toBe("/staking/tester-pool-join-intent");
    expect(wallet.sentTransactions).toHaveLength(0);
  });

  it("sends joinPool from the API intent when joinTesterPool has no input", async () => {
    const testerAssignment = getAddress(`0x${"cd".repeat(20)}`);
    const tx = { chainId: 97, to: testerAssignment, data: "0x8371e6b4", value: "0" as const };
    const { client, wallet } = clientWith(() => ({
      inPool: false,
      meetsMinimum: true,
      canJoin: true,
      tx,
    }));
    await client.joinTesterPool();
    expect(wallet.sentTransactions).toEqual([tx]);
  });

  it("sends joinPool when joinTesterPool is given local addresses", async () => {
    const testerAssignment = getAddress(`0x${"cd".repeat(20)}`);
    const { client, wallet } = clientWith(() => ({}));
    await client.joinTesterPool({ chainId: 97, testerAssignment });
    expect(wallet.sentTransactions).toEqual([
      {
        chainId: 97,
        to: testerAssignment,
        data: "0x8371e6b4",
        value: "0",
      },
    ]);
  });

  it("gets cancellation compensation calldata", async () => {
    const { client } = clientWith(() => ({ claimDeadline: "later", tx }));
    expect((await client.getCancellationCompensation("claim")).tx).toEqual(tx);
  });

  it("sends a transaction only when explicitly requested", async () => {
    const { client, wallet } = clientWith(() => ({}));
    await client.sendTransaction(tx);
    expect(wallet.sentTransactions).toEqual([tx]);
  });

  it("refuses a transaction that must come from another wallet", async () => {
    const { client, wallet } = clientWith(() => ({}));
    await client.sendTransaction({ ...tx, from: wallet.address });
    await expect(
      client.sendTransaction({ ...tx, from: `0x${"a".repeat(40)}` }),
    ).rejects.toMatchObject({ code: "TX_SENDER_MISMATCH" });
    expect(wallet.sentTransactions).toHaveLength(1);
  });

  it("signs the local wallet into a separate session without touching the key", async () => {
    const { client, http } = clientWith((request) =>
      request.path === "/auth/nonce" ? { nonce: "n" } : { sessionToken: "ags_wallet" },
    );
    const session = await client.signInAsWallet(({ nonce }) => `sign ${nonce}`);
    await session.getNextActions();
    await client.getNextActions();
    expect(http.requests.at(-2)?.token).toBe("ags_wallet");
    expect(http.requests.at(-1)?.token).toBe("key");
  });

  it("lists notifications with cursor filters", async () => {
    const { client, http } = clientWith(() => ({ items: [], nextCursor: null, hasMore: false }));
    await client.listNotifications({ unread: true, limit: 10 });
    expect(http.requests[0]?.query).toEqual({ unread: true, limit: 10 });
  });

  it("configures a signed webhook", async () => {
    const { client, http } = clientWith(() => ({
      agentId: "a",
      url: "https://example.com",
      enabled: true,
      signingSecret: "secret",
    }));
    await client.configureWebhook("a", "https://example.com");
    expect(http.requests[0]?.method).toBe("PUT");
  });

  it("maps a TaskSpec through draft confirmation to publish intent", async () => {
    let call = 0;
    const { client, http } = clientWith(() =>
      ++call === 1 ? { id: "draft", version: 0 } : call === 2 ? { version: 1 } : { id: "intent" },
    );
    await client.publishTask({
      version: "AGENTGRID_TASK_SPEC_V4",
      title: "t",
      summary: "s",
      template: "CUSTOM",
      deliverables: ["x"],
      outOfScope: [],
      constraints: [],
      inputs: [],
      criteria: [{ id: "c", description: "c", grade: "A", weightBps: 10000 }],
      estimatedHours: 1,
      startTier: "T1",
      maxTier: "T2",
      runDays: 5,
      allocationMode: "PRO_RATA",
      passingThreshold: 80,
    });
    expect(http.requests.map(({ path }) => path)).toEqual([
      "/drafts",
      "/drafts/draft",
      "/drafts/draft/publish-intent",
    ]);
    expect(http.requests[1]?.body).toMatchObject({
      fields: { maxParticipants: { value: 0, confirmation: "confirmed" } },
    });
  });

  it("keeps an explicit participant cap when publishing", async () => {
    let call = 0;
    const { client, http } = clientWith(() =>
      ++call === 1 ? { id: "draft", version: 0 } : call === 2 ? { version: 1 } : { id: "intent" },
    );
    await client.publishTask({
      version: "AGENTGRID_TASK_SPEC_V4",
      title: "t",
      summary: "s",
      template: "CUSTOM",
      deliverables: ["x"],
      outOfScope: [],
      constraints: [],
      inputs: [],
      criteria: [{ id: "c", description: "c", grade: "A", weightBps: 10000 }],
      estimatedHours: 1,
      startTier: "T1",
      maxTier: "T2",
      runDays: 5,
      allocationMode: "PRO_RATA",
      maxParticipants: 5,
      passingThreshold: 80,
    });
    expect(http.requests[1]?.body).toMatchObject({
      fields: { maxParticipants: { value: 5, confirmation: "confirmed" } },
    });
  });

  it("prepares confirmation, commit, and reveal arbitration transactions", async () => {
    const { client } = clientWith((request) =>
      request.path.endsWith("/confirm") ? { tx } : { commitTx: tx, revealTx: tx },
    );
    expect(await client.prepareArbitrationVote("case", "reason")).toHaveLength(3);
  });
});

describe("HTTP adapters", () => {
  it.each([
    ["https://example.com", "https://example.com/tasks?limit=2"],
    ["https://example.com/api", "https://example.com/api/tasks?limit=2"],
    ["https://example.com/api/", "https://example.com/api/tasks?limit=2"],
  ])("preserves the API base path for %s", async (baseUrl, expected) => {
    let requested = "";
    const adapter = new FetchHttpAdapter(baseUrl, async (input) => {
      requested = String(input);
      return new Response("{}", { headers: { "content-type": "application/json" } });
    });
    await adapter.request({ method: "GET", path: "/tasks", query: { limit: 2 } });
    expect(requested).toBe(expected);
  });

  it("records in-memory requests", async () => {
    const adapter = new InMemoryHttpAdapter(() => ({ ok: true }));
    await adapter.request({ method: "GET", path: "/x" });
    expect(adapter.requests[0]?.path).toBe("/x");
  });

  it("maps problem details to AgentGridError", async () => {
    const adapter = new FetchHttpAdapter(
      "https://example.com",
      async () =>
        new Response(JSON.stringify({ code: "TASK_NO", detail: "no", retryable: false }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(adapter.request({ method: "GET", path: "/x" })).rejects.toMatchObject<
      Partial<AgentGridError>
    >({ status: 409, code: "TASK_NO" });
  });

  it("serializes JSON bodies and bearer credentials", async () => {
    let captured: Request | undefined;
    const adapter = new FetchHttpAdapter("https://example.com", async (input, init) => {
      captured = new Request(input, init);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    });
    await adapter.request({ method: "POST", path: "/x", token: "key", body: { value: 1 } });
    expect(captured?.headers.get("authorization")).toBe("Bearer key");
    expect(await captured?.json()).toEqual({ value: 1 });
  });
});
