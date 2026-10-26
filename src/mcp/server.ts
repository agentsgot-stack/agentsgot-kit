import type { AgentGridClient, TaskSpec } from "../sdk/client.js";

type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number; method: string; params?: unknown };
type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(input: Record<string, unknown>): Promise<unknown>;
};

function object(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error("Tool input must be an object.");
  return input as Record<string, unknown>;
}

export class AgentGridMcpServer {
  private readonly tools: Tool[];
  private readonly publishIntents = new Map<string, Promise<unknown>>();

  constructor(private readonly client: AgentGridClient) {
    const schema = (properties: Record<string, unknown>, required: string[] = []) => ({
      type: "object",
      properties,
      required,
      additionalProperties: false,
    });
    this.tools = [
      {
        name: "list_tasks",
        description:
          "List matching AgentGrid tasks. Requires scope tasks:read. Delegated API keys with this scope may call on behalf of the key owner.",
        inputSchema: schema({
          cursor: { type: "string" },
          limit: { type: "integer" },
          status: { type: "string" },
        }),
        run: (input) => this.client.listTasks(input as Record<string, string | number | undefined>),
      },
      {
        name: "get_task",
        description:
          "Get full AgentGrid task details, including signed delivery executors and artifact hashes when available. Requires scope tasks:read.",
        inputSchema: schema({ taskId: { type: "string" } }, ["taskId"]),
        run: (input) => this.client.getTask(String(input.taskId)),
      },
      {
        name: "claim_task",
        description:
          "Create an off-chain claim lease. Claiming does not occupy a participant slot; the slot is taken only when the delivery signature makes the claim SUBMITTED. Blocked when signed deliveries already reach maxParticipants. Requires scope tasks:claim. A delegated agent uses the key owner's identity for the claim.",
        inputSchema: schema({ taskId: { type: "string" }, idempotencyKey: { type: "string" } }, [
          "taskId",
          "idempotencyKey",
        ]),
        run: (input) => this.client.claimTask(String(input.taskId), String(input.idempotencyKey)),
      },
      {
        name: "submit_work",
        description:
          "Upload work and return its CID and delivery signature status. Requires scope work:submit. A delegated agent signs the ExecutorDelivery typed data with its own wallet; the backend records the signer_address.",
        inputSchema: schema(
          {
            claimId: { type: "string" },
            files: { type: "array" },
            evidence: { type: "string" },
            idempotencyKey: { type: "string" },
          },
          ["claimId", "files", "idempotencyKey"],
        ),
        run: async (input) => {
          const files = (input.files as { name: string; text: string }[]).map((file) => ({
            name: file.name,
            content: new Blob([file.text], { type: "text/plain" }),
          }));
          const result = await this.client.submitWork({
            claimId: String(input.claimId),
            files,
            ...(input.evidence === undefined ? {} : { evidence: String(input.evidence) }),
            idempotencyKey: String(input.idempotencyKey),
          });
          return {
            submissionId: result.id,
            cid: result.cid,
            cidHash: result.cidHash,
            signatureStatus: result.status,
          };
        },
      },
      {
        name: "claim_rewards",
        description:
          "Return a caller-paid reward claim transaction without sending it. Requires scope rewards:claim.",
        inputSchema: schema({ scheduleIds: { type: "array", items: { type: "string" } } }, [
          "scheduleIds",
        ]),
        run: (input) => this.client.createRewardClaim(input.scheduleIds as string[]),
      },
      {
        name: "join_tester_pool",
        description:
          "Return a caller-paid TesterAssignment.joinPool() intent from GET /staking/tester-pool-join-intent without sending it. Includes inPool, meetsMinimum, and canJoin. ValidatorStaking.deposit alone does not enter the tester draw pool. Optional chainId + testerAssignment encode locally instead of calling the API.",
        inputSchema: schema({
          chainId: { type: "integer", minimum: 1 },
          testerAssignment: {
            type: "string",
            description: "Optional TesterAssignment proxy; when set with chainId, skip the API.",
          },
        }),
        run: (input) => {
          if (input.chainId !== undefined && input.testerAssignment !== undefined) {
            return Promise.resolve(
              this.client.prepareJoinTesterPool({
                chainId: Number(input.chainId),
                testerAssignment: String(input.testerAssignment),
              }),
            );
          }
          return this.client.getJoinTesterPoolIntent();
        },
      },
      {
        name: "publish_task",
        description: "Build a TaskSpec V4 publish intent. Requires scope tasks:publish.",
        inputSchema: schema(
          { specification: { type: "object" }, idempotencyKey: { type: "string" } },
          ["specification", "idempotencyKey"],
        ),
        run: (input) => {
          const key = String(input.idempotencyKey);
          const existing = this.publishIntents.get(key);
          if (existing) return existing;
          const created = this.client.publishTask(input.specification as TaskSpec);
          this.publishIntents.set(key, created);
          return created;
        },
      },
      {
        name: "accept_result",
        description:
          "Return the publisher's caller-paid acceptance transaction for a posted result without sending it. Requires scope tasks:publish.",
        inputSchema: schema({ taskId: { type: "string" } }, ["taskId"]),
        run: (input) => this.client.getAcceptResult(String(input.taskId)),
      },
      {
        name: "list_actions",
        description: "List caller-triggerable protocol transactions. Requires scope tasks:read.",
        inputSchema: schema({ address: { type: "string" }, subjectId: { type: "string" } }),
        run: (input) =>
          this.client.listActions({
            ...(input.address === undefined ? {} : { address: String(input.address) }),
            ...(input.subjectId === undefined ? {} : { subjectId: String(input.subjectId) }),
          }),
      },
    ];
  }

  async handle(request: JsonRpcRequest): Promise<Record<string, unknown> | null> {
    if (request.method === "initialize")
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "agentgrid", version: "1.0.0" },
        },
      };
    if (request.method === "notifications/initialized") return null;
    if (request.method === "tools/list")
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: { tools: this.tools.map(({ run: _run, ...tool }) => tool) },
      };
    if (request.method === "tools/call") {
      const params = object(request.params);
      const tool = this.tools.find(({ name }) => name === params.name);
      if (!tool)
        return { jsonrpc: "2.0", id: request.id, error: { code: -32602, message: "Unknown tool" } };
      try {
        const result = await tool.run(object(params.arguments ?? {}));
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          },
        };
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            isError: true,
            content: [
              { type: "text", text: error instanceof Error ? error.message : String(error) },
            ],
          },
        };
      }
    }
    return { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } };
  }
}

export interface StdioPort {
  lines: AsyncIterable<string>;
  write(line: string): void;
}

export async function serveStdio(server: AgentGridMcpServer, io: StdioPort): Promise<void> {
  for await (const line of io.lines) {
    if (!line.trim()) continue;
    const response = await server.handle(JSON.parse(line) as JsonRpcRequest);
    if (response) io.write(`${JSON.stringify(response)}\n`);
  }
}
