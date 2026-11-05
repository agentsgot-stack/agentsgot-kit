import { mcpInstructions, roleGuide } from "../guides.js";
import { isRole, ROLES } from "../roles.js";
import type {
  AgentGridClient,
  ArbitrationVote,
  TaskSpec,
  TestCriterionResult,
} from "../sdk/client.js";

type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number; method: string; params?: unknown };
type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(input: Record<string, unknown>): Promise<unknown>;
};

/** "What to call next" appended to every tool description so agents never stall mid-loop. */
export const TOOL_NEXT_STEPS: Record<string, string> = {
  list_tasks: "get_task, then claim_task for a task whose criteria you can satisfy.",
  get_task: "claim_task (executor) or submit_test_report (drawn tester).",
  claim_task: "heartbeat_claim before leaseExpiresAt, then submit_work.",
  submit_work: "IMMEDIATELY draw_testers with the same taskId; nobody else will.",
  draw_testers:
    "If revealPending, call draw_testers again in ~30s. Otherwise poll get_next_actions until POST_RESULT appears.",
  get_submission: "Evaluate every criterion, then submit_test_report.",
  submit_test_report: "get_next_actions; nothing else is required for this delivery.",
  get_final_result: "Ask the user to approve, then send_transaction with the returned tx.",
  claim_rewards: "Ask the user to approve, then send_transaction.",
  join_tester_pool: "If canJoin, ask the user to approve and send_transaction; then heartbeat.",
  join_arbitrator_pool:
    "If canJoin, ask the user to approve and send_transaction; then list_arbitrator_cases.",
  publish_task: "Ask the user to approve, then send_transaction (createTask).",
  accept_result: "Ask the user to approve, then send_transaction.",
  review_task: "Ask the user to approve, then send_transaction.",
  get_next_actions:
    "Execute items in order; each item names the request (and tool) to use. APPEAL_DECISION → get_task, verify the posted result, then waive_appeal (no objection) or open_appeal (with statement). POST_RESULT from any related party → get_final_result → send_transaction.",
  get_eligibility:
    "Resolve each missing step (its request field names the call), then get_next_actions.",
  heartbeat: "get_next_actions.",
  heartbeat_claim: "submit_work when the delivery is ready.",
  list_arbitrator_cases: "get_dispute for each case in CONFIRMING/COMMIT/REVEAL.",
  get_dispute: "confirm_arbitration_seat (CONFIRMING) or arbitration_vote_intent (COMMIT/REVEAL).",
  confirm_arbitration_seat: "send_transaction within arbAcceptWindowHours.",
  arbitration_vote_intent:
    "Persist salt locally; send commitTx now; send revealTx as soon as REVEAL opens.",
  send_transaction: "get_next_actions to confirm the state advanced.",
  list_actions: "send_transaction for a callable trigger after user approval.",
  sign_delivery: "IMMEDIATELY draw_testers with the same taskId.",
  get_submission_file: "Judge every criterion, then submit_test_report.",
  list_rewards: "claim_rewards with the claimable scheduleIds.",
  get_rewards_breakdown: "claim_rewards / claim_arb_stream as needed.",
  open_appeal: "Ask the user to approve, then send_transaction (appeal fee).",
  waive_appeal: "Ask the user to approve, then send_transaction.",
  get_arb_stream_pending: "If available and pendingWei > 0, claim_arb_stream.",
  claim_arb_stream: "Ask the user to approve, then send_transaction.",
  claim_tester_seat: "Ask the user to approve, then send_transaction from the tester wallet.",
  submit_fallback_report: "Ask the user to approve, then send_transaction before the deadline.",
  get_role_guide: "get_eligibility, then get_next_actions.",
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
          "List matching agentsgot tasks. Requires scope tasks:read. Delegated API keys with this scope may call on behalf of the key owner.",
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
          "Get full agentsgot task details, including signed delivery executors and artifact hashes when available. Requires scope tasks:read.",
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
          "Return a caller-paid RewardVesting claim transaction for up to 100 owned schedules without sending it. Use only unique scheduleIds with a CLAIMABLE tranche from list_rewards. Requires scope rewards:claim.",
        inputSchema: schema(
          {
            scheduleIds: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              maxItems: 100,
              uniqueItems: true,
            },
          },
          ["scheduleIds"],
        ),
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
        name: "get_next_actions",
        description:
          "Every pending duty for this wallet across roles (claim heartbeat, sign delivery, tester draw commit/reveal, test reports, postResult, publisher review, arbitration confirm/commit/reveal, reward claims, triggers), sorted by priority then deadline. Each item names the exact request to make. Poll every few minutes.",
        inputSchema: schema({}),
        run: () => this.client.getNextActions(),
      },
      {
        name: "get_eligibility",
        description:
          "Per-role eligibility (executor, tester, arbitrator, publisher) with stake shortfall in wei, pool membership, online status and the missing onboarding steps. Thresholds come from params.json.",
        inputSchema: schema({}),
        run: () => this.client.getEligibility(),
      },
      {
        name: "heartbeat",
        description:
          "POST /agents/heartbeat so the network counts this agent online. Testers and arbitrators are only drawn while online.",
        inputSchema: schema({}),
        run: () => this.client.reportPresence(),
      },
      {
        name: "heartbeat_claim",
        description: "Renew an execution claim lease before leaseExpiresAt. Requires tasks:claim.",
        inputSchema: schema({ claimId: { type: "string" } }, ["claimId"]),
        run: (input) => this.client.heartbeatClaim(String(input.claimId)),
      },
      {
        name: "draw_testers",
        description:
          "Executor step right after submit_work: commit the tester draw seed and reveal it. If reveal returns 409 (seed block not mined yet) the commit result is returned with revealPending=true; call again in ~30s.",
        inputSchema: schema({ taskId: { type: "string" } }, ["taskId"]),
        run: async (input) => {
          const taskId = String(input.taskId);
          const committed = await this.client.commitTesterDraw(taskId);
          try {
            return { revealPending: false, draw: await this.client.revealTesterDraw(taskId) };
          } catch (error) {
            return {
              revealPending: true,
              draw: committed,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        },
      },
      {
        name: "get_submission",
        description:
          "Read a delivery (manifest, cid, typed data). Testers and jurors use this before judging. Requires tasks:read.",
        inputSchema: schema({ submissionId: { type: "string" } }, ["submissionId"]),
        run: (input) => this.client.getSubmission(String(input.submissionId)),
      },
      {
        name: "submit_test_report",
        description:
          "Tester: sign the TestReport typed data with the local wallet and submit it. criteria must cover every acceptance criterion id. Idempotency defaults to test-report:{taskId}:{submissionId}. Requires work:submit.",
        inputSchema: schema(
          {
            taskId: { type: "string" },
            submissionId: { type: "string" },
            approved: { type: "boolean" },
            criteria: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  criterionId: { type: "string" },
                  passed: { type: "boolean" },
                  note: { type: "string" },
                },
                required: ["criterionId", "passed", "note"],
              },
            },
            summary: { type: "string" },
          },
          ["taskId", "submissionId", "approved", "criteria", "summary"],
        ),
        run: (input) =>
          this.client.submitTestReport({
            taskId: String(input.taskId),
            submissionId: String(input.submissionId),
            approved: Boolean(input.approved),
            criteria: input.criteria as TestCriterionResult[],
            summary: String(input.summary),
          }),
      },
      {
        name: "get_final_result",
        description:
          "Return the caller-paid postResult transaction once every drawn tester has reported. 409 TASK_EXECUTION_WINDOW_OPEN means wait.",
        inputSchema: schema({ taskId: { type: "string" } }, ["taskId"]),
        run: (input) => this.client.getFinalResult(String(input.taskId)),
      },
      {
        name: "review_task",
        description:
          "Publisher review of a RESULT_POSTED task: accept, or reject with a reason and failed criterion ids. Returns a caller-paid transaction. Requires tasks:publish.",
        inputSchema: schema(
          {
            taskId: { type: "string" },
            accept: { type: "boolean" },
            reason: { type: "string" },
            criteria: { type: "array", items: { type: "string" } },
          },
          ["taskId", "accept"],
        ),
        run: (input) =>
          this.client.reviewTask(String(input.taskId), {
            accept: Boolean(input.accept),
            ...(input.reason === undefined ? {} : { reason: String(input.reason) }),
            ...(input.criteria === undefined ? {} : { criteria: input.criteria as string[] }),
          }),
      },
      {
        name: "join_arbitrator_pool",
        description:
          "Return the caller-paid ArbitrationCourt.joinArbitrator() intent with inPool, meetsMinimum, stakeAgt and canJoin. Does not send it.",
        inputSchema: schema({}),
        run: () => this.client.getJoinArbitratorPoolIntent(),
      },
      {
        name: "list_arbitrator_cases",
        description: "Cases where this wallet holds a seat, with phase and phaseDeadline.",
        inputSchema: schema({}),
        run: () => this.client.listArbitratorCases(),
      },
      {
        name: "get_dispute",
        description: "Full dispute: criteria, seats, fallback state and deadlines.",
        inputSchema: schema({ caseId: { type: "string" } }, ["caseId"]),
        run: (input) => this.client.getDispute(String(input.caseId)),
      },
      {
        name: "confirm_arbitration_seat",
        description:
          "Return the caller-paid seat confirmation transaction. Send within arbAcceptWindowHours.",
        inputSchema: schema({ caseId: { type: "string" } }, ["caseId"]),
        run: (input) => this.client.confirmArbitrationSeat(String(input.caseId)),
      },
      {
        name: "arbitration_vote_intent",
        description:
          "Build commitTx and revealTx for one vote per criterion. Omit salt on commit to get a fresh random salt; PERSIST the returned salt locally and pass the same salt and votes again at reveal time.",
        inputSchema: schema(
          {
            caseId: { type: "string" },
            salt: { type: "string" },
            votes: {
              type: "array",
              items: {
                type: "object",
                properties: { satisfied: { type: "boolean" }, reason: { type: "string" } },
                required: ["satisfied", "reason"],
              },
            },
          },
          ["caseId", "votes"],
        ),
        run: (input) =>
          this.client.createArbitrationVoteIntent(
            String(input.caseId),
            input.votes as ArbitrationVote[],
            ...(input.salt === undefined ? [] : [String(input.salt)]),
          ),
      },
      {
        name: "send_transaction",
        description:
          "Send a caller-paid transaction intent ({chainId,to,data,value}) from the local wallet. Only call after the user approved on-chain actions for this session.",
        inputSchema: schema(
          {
            chainId: { type: "integer" },
            to: { type: "string" },
            data: { type: "string" },
            value: { type: "string" },
          },
          ["chainId", "to", "data", "value"],
        ),
        run: async (input) => ({
          txHash: await this.client.sendTransaction({
            chainId: Number(input.chainId),
            to: String(input.to),
            data: String(input.data),
            value: String(input.value),
          }),
        }),
      },
      {
        name: "sign_delivery",
        description:
          "Resume helper: sign an already uploaded (STORED) delivery when submit_work was interrupted before the signature step. Requires work:submit.",
        inputSchema: schema({ submissionId: { type: "string" } }, ["submissionId"]),
        run: (input) => this.client.signDelivery(String(input.submissionId)),
      },
      {
        name: "get_submission_file",
        description:
          "Read one delivery file by index. Only the executor, drawn testers and case jurors may read it. Never paste decrypted contents into reports.",
        inputSchema: schema(
          { submissionId: { type: "string" }, index: { type: "integer", minimum: 0 } },
          ["submissionId", "index"],
        ),
        run: (input) =>
          this.client.getSubmissionFile(String(input.submissionId), Number(input.index)),
      },
      {
        name: "list_rewards",
        description:
          "List this wallet's executor mining vesting schedules and tranches. Requires rewards:claim.",
        inputSchema: schema({}),
        run: () => this.client.listRewards(),
      },
      {
        name: "get_rewards_breakdown",
        description:
          "Economic model v3: accruing / locked / claimable / claimed totals for this wallet. Prefer this over summing lists when available.",
        inputSchema: schema({}),
        run: () => this.client.getRewardsBreakdown(),
      },
      {
        name: "open_appeal",
        description:
          "Build a caller-paid TaskEscrow.openAppeal intent plus the appeal-fee approval. Does not send it.",
        inputSchema: schema(
          {
            taskId: { type: "string" },
            statement: { type: "string", minLength: 1 },
            criteria: { type: "array", items: { type: "string" } },
          },
          ["taskId", "statement"],
        ),
        run: (input) =>
          this.client.openAppeal(String(input.taskId), {
            statement: String(input.statement),
            ...(input.criteria === undefined ? {} : { criteria: input.criteria as string[] }),
          }),
      },
      {
        name: "waive_appeal",
        description:
          "Build a caller-paid TaskEscrow.waiveAppeal transaction for an awarded executor. Does not send it.",
        inputSchema: schema({ taskId: { type: "string" } }, ["taskId"]),
        run: (input) => this.client.waiveAppeal(String(input.taskId)),
      },
      {
        name: "get_arb_stream_pending",
        description: "Read this wallet's pending ArbitrationStream balance and weight.",
        inputSchema: schema({}),
        run: () => this.client.getArbStreamPending(),
      },
      {
        name: "claim_arb_stream",
        description:
          "Return a caller-paid arbitrator stream claim intent (10% emission). Does not send it.",
        inputSchema: schema({}),
        run: () => this.client.claimArbStream(),
      },
      {
        name: "claim_tester_seat",
        description:
          "Tester: return a caller-paid claim, with a Merkle proof against a settled hourly seat snapshot, for this wallet's seat mining (15% emission). Claims may repeat as later hours settle; FULLY_CLAIMED is terminal. Does not send it.",
        inputSchema: schema({ taskId: { type: "string" } }, ["taskId"]),
        run: (input) => this.client.claimTesterSeat(String(input.taskId)),
      },
      {
        name: "submit_fallback_report",
        description:
          "Fallback reviewer: build the caller-paid submitFallbackReport transaction for a dispute. Evaluate every criterion first. Does not send it.",
        inputSchema: schema(
          {
            caseId: { type: "string" },
            approved: { type: "boolean" },
            criteria: { type: "array" },
            summary: { type: "string" },
          },
          ["caseId", "approved", "criteria", "summary"],
        ),
        run: (input) =>
          this.client.createFallbackReportIntent(String(input.caseId), {
            approved: Boolean(input.approved),
            criteria: input.criteria as TestCriterionResult[],
            summary: String(input.summary),
          }),
      },
      {
        name: "get_role_guide",
        description:
          "Closed-loop playbook for one role (executor|tester|arbitrator|publisher): thresholds from params.json, steps, schedules and safety rules.",
        inputSchema: schema({ role: { type: "string", enum: [...ROLES] } }, ["role"]),
        run: async (input) => {
          const role = String(input.role);
          if (!isRole(role)) throw new Error(`Unknown role ${role}`);
          return { role, guide: roleGuide(role) };
        },
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
          capabilities: { tools: {}, prompts: {} },
          serverInfo: { name: "agentsgot", version: "1.1.0" },
          instructions: mcpInstructions(),
        },
      };
    if (request.method === "notifications/initialized") return null;
    if (request.method === "prompts/list")
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          prompts: ROLES.map((role) => ({
            name: `role_${role}`,
            description: `Closed-loop playbook, thresholds and schedules for the ${role} role.`,
            arguments: [],
          })),
        },
      };
    if (request.method === "prompts/get") {
      const params = object(request.params);
      const role = String(params.name ?? "").replace(/^role_/u, "");
      if (!isRole(role))
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32602, message: "Unknown prompt" },
        };
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          description: `agentsgot ${role} playbook`,
          messages: [{ role: "user", content: { type: "text", text: roleGuide(role) } }],
        },
      };
    }
    if (request.method === "tools/list")
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: this.tools.map(({ run: _run, ...tool }) => {
            const next = TOOL_NEXT_STEPS[tool.name];
            return next ? { ...tool, description: `${tool.description} Next: ${next}` } : tool;
          }),
        },
      };
    if (request.method === "tools/call") {
      const params = object(request.params);
      const tool = this.tools.find(({ name }) => name === params.name);
      if (!tool)
        return { jsonrpc: "2.0", id: request.id, error: { code: -32602, message: "Unknown tool" } };
      try {
        const result = await tool.run(object(params.arguments ?? {}));
        const next = TOOL_NEXT_STEPS[tool.name];
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [
              { type: "text", text: JSON.stringify(result) },
              ...(next ? [{ type: "text", text: `Next: ${next}` }] : []),
            ],
            structuredContent: result,
            ...(next ? { _meta: { next } } : {}),
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
