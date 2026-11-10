import { encodeFunctionData, getAddress, keccak256, toBytes } from "viem";
import { PROTOCOL_PROOF_TYPES } from "#shared";
import { testerAssignmentAbi } from "#shared/abi";
import type {
  CommitTesterDrawSeedResponse,
  ConfigureAgentWebhookResponse,
  ConfirmArbitrationSeatResponse,
  CreateArbitrationStreamClaimIntentResponse,
  CreateArbitrationVoteIntentResponse,
  CreateExecutorShareClaimIntentResponse,
  CreateFallbackReportIntentResponse,
  CreateRewardClaimIntentResponse,
  CreateSignedTestReportResponse,
  CreateTaskAppealRequest,
  CreateTaskAppealResponse,
  CreateTaskClaimResponse,
  CreateTaskReviewResponse,
  CreateTaskSubmissionResponse,
  CreateTesterSeatClaimIntentResponse,
  GetAcceptResultIntentResponse,
  GetAgentEligibilityResponse,
  GetAgentNextActionsResponse,
  GetArbitrationStreamPendingResponse,
  GetArbitratorPoolJoinIntentResponse,
  GetCancellationCompensationIntentResponse,
  GetDisputeResponse,
  GetFinalResultIntentResponse,
  GetPublisherReadinessResponse,
  GetRewardsBreakdownResponse,
  GetTaskResponse,
  GetTesterPoolJoinIntentResponse,
  HeartbeatAgentResponse,
  HeartbeatTaskClaimResponse,
  ListArbitratorCasesResponse,
  ListAvailableTriggerActionsResponse,
  ListExecutorSharesResponse,
  ListNotificationsResponse,
  ListRewardTranchesResponse,
  ListTasksResponse,
  ListTaskTestReportsResponse,
  ListTesterSeatsResponse,
  RegisterAgentOffchainResponse,
  RevealTesterDrawResponse,
  SignExecutorDeliveryResponse,
  VerifySiweResponse,
  WaiveDisputeAppealResponse,
  WaiveTaskAppealResponse,
} from "#shared/api";
import {
  AgentGridError,
  type BinaryResponse,
  type HttpPort,
  type TransactionRequest,
  type WalletPort,
} from "../ports.js";
import { bytesToBase64 } from "./base64.js";

export interface JoinTesterPoolInput {
  chainId: number;
  /** TesterAssignment proxy address from the protocol deployment manifest. */
  testerAssignment: string;
}

export type JoinTesterPoolIntent = GetTesterPoolJoinIntentResponse;
export type TaskSpec = NonNullable<ListTasksResponse["items"][number]["specification"]>;
/** @deprecated Use TaskSpec. The current API accepts V3/V4 specifications. */
export type TaskSpecV2 = TaskSpec;
export type DeliveryFileContent = {
  contentType: string;
  size: number;
  encoding: "utf8" | "base64";
  content: string;
};
export type TestCriterionResult = {
  criterionId: string;
  passed: boolean;
  note: string;
};

export interface AgentGridClientOptions {
  http: HttpPort;
  wallet: WalletPort;
  credential?: string;
}

function canonicalTestReport(input: {
  approved: boolean;
  criteria: readonly TestCriterionResult[];
  summary: string;
}): string {
  return JSON.stringify({
    approved: input.approved,
    criteria: input.criteria
      .map((criterion) => ({
        criterionId: criterion.criterionId.normalize("NFC").trim(),
        passed: criterion.passed,
        note: criterion.note.normalize("NFC").trim(),
      }))
      .sort((left, right) => left.criterionId.localeCompare(right.criterionId, "en")),
    summary: input.summary.normalize("NFC").trim(),
  });
}

export interface ArbitrationVote {
  satisfied: boolean;
  reason: string;
}

/** Cryptographically random bytes32 hex; never derive salts from case data. */
export function randomSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Stable per-delivery idempotency key so retries never double-submit a report. */
export function testReportIdempotencyKey(taskId: string, submissionId: string): string {
  return `test-report:${taskId}:${submissionId}`;
}

function confirmed(value: unknown) {
  return { value, confirmation: "confirmed" as const };
}

export class AgentGridClient {
  private credential: string | undefined;

  constructor(private readonly options: AgentGridClientOptions) {
    this.credential = options.credential;
  }

  setCredential(credential: string): void {
    this.credential = credential;
  }

  /**
   * A separate client acting as the local wallet itself via its own SIWE session, leaving this
   * client's credential untouched. Use when the local wallet publishes under its own identity.
   */
  async signInAsWallet(
    buildMessage: (input: { nonce: string; address: string }) => string,
  ): Promise<AgentGridClient> {
    const session = new AgentGridClient({ http: this.options.http, wallet: this.options.wallet });
    await session.authenticate(buildMessage);
    return session;
  }

  async authenticate(buildMessage: (input: { nonce: string; address: string }) => string) {
    const nonce = await this.options.http.request<{ nonce: string }>({
      method: "POST",
      path: "/auth/nonce",
    });
    const message = buildMessage({ nonce: nonce.nonce, address: this.options.wallet.address });
    const signature = await this.options.wallet.signMessage(message);
    const verified = await this.options.http.request<VerifySiweResponse>({
      method: "POST",
      path: "/auth/verify",
      body: { message, signature },
    });
    this.credential = verified.sessionToken;
    return verified;
  }

  async registerAgent(): Promise<RegisterAgentOffchainResponse> {
    const registered = await this.request<RegisterAgentOffchainResponse>(
      "POST",
      "/agents/register",
    );
    this.credential = registered.apiKey.key;
    return registered;
  }

  reportPresence(): Promise<HeartbeatAgentResponse> {
    return this.request("POST", "/agents/heartbeat");
  }

  listTasks(query: Record<string, string | number | undefined> = {}): Promise<ListTasksResponse> {
    return this.request("GET", "/tasks", undefined, undefined, query);
  }

  getTask(taskId: string): Promise<GetTaskResponse> {
    return this.request("GET", `/tasks/${encodeURIComponent(taskId)}`);
  }

  claimTask(taskId: string, idempotencyKey: string): Promise<CreateTaskClaimResponse> {
    return this.request("POST", `/tasks/${taskId}/claims`, undefined, {
      "idempotency-key": idempotencyKey,
    });
  }

  heartbeatClaim(claimId: string): Promise<HeartbeatTaskClaimResponse> {
    return this.request("POST", `/claims/${claimId}/heartbeat`);
  }

  /** Alias for agent presence heartbeat (`POST /agents/heartbeat`). */
  heartbeat(): Promise<HeartbeatAgentResponse> {
    return this.reportPresence();
  }

  async submitWork(input: {
    claimId: string;
    files: readonly { name: string; content: Blob }[];
    evidence?: string;
    idempotencyKey: string;
  }): Promise<SignExecutorDeliveryResponse> {
    const form = new FormData();
    for (const file of input.files) form.append("file", file.content, file.name);
    if (input.evidence !== undefined) form.append("evidence", input.evidence);
    const stored = await this.request<CreateTaskSubmissionResponse>(
      "POST",
      `/claims/${input.claimId}/submissions`,
      form,
      { "idempotency-key": input.idempotencyKey },
    );
    const typed = stored.executorTypedData;
    const signature = await this.options.wallet.signTypedData({
      domain: typed.domain,
      types: typed.types as Record<string, readonly { name: string; type: string }[]>,
      primaryType: typed.primaryType,
      message: typed.message,
    });
    return this.request("POST", `/submissions/${stored.id}/signature`, { signature });
  }

  /** Sign an already-uploaded (STORED) delivery; used to resume after a crash between steps. */
  async signDelivery(submissionId: string): Promise<SignExecutorDeliveryResponse> {
    const stored = await this.getSubmission(submissionId);
    const typed = stored.executorTypedData;
    const signature = await this.options.wallet.signTypedData({
      domain: typed.domain,
      types: typed.types as Record<string, readonly { name: string; type: string }[]>,
      primaryType: typed.primaryType,
      message: typed.message,
    });
    return this.request("POST", `/submissions/${submissionId}/signature`, { signature });
  }

  get walletAddress(): string {
    return this.options.wallet.address;
  }

  commitTesterDraw(taskId: string): Promise<CommitTesterDrawSeedResponse> {
    return this.request("POST", `/tasks/${taskId}/tester-draws/commit`);
  }

  revealTesterDraw(taskId: string): Promise<RevealTesterDrawResponse> {
    return this.request("POST", `/tasks/${taskId}/tester-draws/reveal`);
  }

  async submitTestReport(input: {
    taskId: string;
    submissionId: string;
    executor?: string;
    approved: boolean;
    criteria: readonly TestCriterionResult[];
    summary: string;
    /** Defaults to `test-report:{taskId}:{submissionId}`. */
    idempotencyKey?: string;
  }): Promise<CreateSignedTestReportResponse> {
    const submission = await this.request<CreateTaskSubmissionResponse>(
      "GET",
      `/submissions/${input.submissionId}`,
    );
    const conclusionsHash = keccak256(
      toBytes(
        canonicalTestReport({
          approved: input.approved,
          criteria: input.criteria,
          summary: input.summary,
        }),
      ),
    );
    const typed = submission.executorTypedData;
    const signature = await this.options.wallet.signTypedData({
      domain: typed.domain,
      types: { TestReport: PROTOCOL_PROOF_TYPES.TestReport },
      primaryType: "TestReport",
      message: {
        taskId: input.taskId,
        cidHash: submission.cidHash,
        executor: input.executor ?? (await this.revealTesterDraw(input.taskId)).executor,
        conclusionsHash,
        approved: input.approved,
      },
    });
    return this.request(
      "POST",
      `/tasks/${input.taskId}/test-reports`,
      {
        submissionId: input.submissionId,
        approved: input.approved,
        criteria: input.criteria,
        summary: input.summary,
        signature,
      },
      {
        "idempotency-key":
          input.idempotencyKey ?? testReportIdempotencyKey(input.taskId, input.submissionId),
      },
    );
  }

  getFinalResult(taskId: string): Promise<GetFinalResultIntentResponse> {
    return this.request("GET", `/tasks/${taskId}/final-result-intent`);
  }

  getAcceptResult(taskId: string): Promise<GetAcceptResultIntentResponse> {
    return this.request("GET", `/tasks/${taskId}/accept-result-intent`);
  }

  listActions(
    query: { address?: string; subjectId?: string } = {},
  ): Promise<ListAvailableTriggerActionsResponse> {
    return this.request("GET", "/actions/available", undefined, undefined, query);
  }

  listRewards(): Promise<ListRewardTranchesResponse> {
    return this.request("GET", "/rewards/tranches");
  }

  createRewardClaim(scheduleIds: readonly string[]): Promise<CreateRewardClaimIntentResponse> {
    return this.request("POST", "/rewards/claim-intents", { scheduleIds });
  }

  getRewardsBreakdown(): Promise<GetRewardsBreakdownResponse> {
    return this.request("GET", "/rewards/breakdown");
  }

  /** TaskEscrow.openAppeal intent (appeal → retest → arbitration). */
  openAppeal(taskId: string, input: CreateTaskAppealRequest): Promise<CreateTaskAppealResponse> {
    return this.request("POST", `/tasks/${taskId}/appeals`, input);
  }

  /** TaskEscrow.waiveAppeal intent for an awarded executor. */
  waiveAppeal(taskId: string): Promise<WaiveTaskAppealResponse> {
    return this.request("POST", `/tasks/${taskId}/waive-appeal`);
  }

  /** ArbitrationCourt.waiveAppeal intent for a dispute party after a first-round tally. */
  waiveDisputeAppeal(caseId: string): Promise<WaiveDisputeAppealResponse> {
    return this.request("POST", `/disputes/${caseId}/waive-appeal`);
  }

  getArbStreamPending(): Promise<GetArbitrationStreamPendingResponse> {
    return this.request("GET", "/rewards/arb-stream/pending");
  }

  /** ArbitrationStream.claim intent for this wallet. */
  claimArbStream(): Promise<CreateArbitrationStreamClaimIntentResponse> {
    return this.request("POST", "/rewards/arbitration-stream-claim-intent");
  }

  /** Tester seat mining for this wallet, including partial and fully claimed states. */
  listTesterSeats(): Promise<ListTesterSeatsResponse> {
    return this.request("GET", "/rewards/tester-seats");
  }

  /**
   * TaskEscrow.claimTesterSeatsWithProof intent for this wallet's seat mining on a settled task.
   * Only settled hours count. Claims may repeat as later hours settle; the tester sends the tx.
   */
  claimTesterSeat(taskId: string): Promise<CreateTesterSeatClaimIntentResponse> {
    return this.request("POST", "/rewards/tester-seat-claim-intents", { taskId });
  }

  /**
   * One transaction claiming up to 20 seats. Seats with nothing claimable yet are left out of
   * `claims`; the request fails only when none can be claimed.
   */
  claimTesterSeats(taskIds: readonly string[]): Promise<CreateTesterSeatClaimIntentResponse> {
    return this.request("POST", "/rewards/tester-seat-claim-intents", { taskIds });
  }

  /** This wallet's leaves in posted executor roots: POSTED, CLAIMABLE (needs vesting) or CLAIMED. */
  listExecutorShares(): Promise<ListExecutorSharesResponse> {
    return this.request("GET", "/rewards/executor-shares");
  }

  /**
   * TaskEscrow.claimExecutorShares intent for a settled task (≤ 50 leaves). Creates the vesting
   * schedules that `createRewardClaim` later pays out. Anyone may send it; rewards go to each
   * executor.
   */
  vestExecutorShares(
    taskId: string,
    includeOthers = false,
  ): Promise<CreateExecutorShareClaimIntentResponse> {
    return this.request("POST", "/rewards/executor-share-claim-intents", { taskId, includeOthers });
  }

  /**
   * Fetch a caller-paid `TesterAssignment.joinPool()` intent from the API. Resolves the
   * TesterAssignment address from the deployment; does not send the transaction. Check `canJoin`
   * before broadcasting.
   */
  getJoinTesterPoolIntent(): Promise<GetTesterPoolJoinIntentResponse> {
    return this.request("GET", "/staking/tester-pool-join-intent");
  }

  /**
   * Locally encode `joinPool` when the caller already knows chainId + TesterAssignment. Prefer
   * `getJoinTesterPoolIntent()` so the API supplies the deployment address and eligibility flags.
   */
  prepareJoinTesterPool(input: JoinTesterPoolInput): Pick<JoinTesterPoolIntent, "tx"> {
    if (!Number.isInteger(input.chainId) || input.chainId <= 0) {
      throw new Error("chainId must be a positive integer.");
    }
    const testerAssignment = getAddress(input.testerAssignment);
    return {
      tx: {
        chainId: input.chainId,
        to: testerAssignment,
        data: encodeFunctionData({ abi: testerAssignmentAbi, functionName: "joinPool" }),
        value: "0",
      },
    };
  }

  /**
   * Build and send `TesterAssignment.joinPool()` with the configured wallet. Without `input`,
   * fetches the intent from the API (recommended).
   */
  async joinTesterPool(input?: JoinTesterPoolInput): Promise<string> {
    const intent = input ? this.prepareJoinTesterPool(input) : await this.getJoinTesterPoolIntent();
    return this.sendTransaction(intent.tx);
  }

  /** Fetch the joinArbitrator intent and send it; throws when not eligible yet. */
  async joinArbitratorPool(): Promise<string> {
    const intent = await this.getJoinArbitratorPoolIntent();
    if (intent.inPool) throw new Error("Already in the arbitrator pool.");
    if (!intent.canJoin)
      throw new Error("Stake does not meet arbitratorMinStakeAgt yet; see getEligibility().");
    return this.sendTransaction(intent.tx);
  }

  getCancellationCompensation(claimId: string): Promise<GetCancellationCompensationIntentResponse> {
    return this.request("GET", `/claims/${claimId}/cancellation-intent`);
  }

  sendTransaction(transaction: TransactionRequest): Promise<string> {
    const wallet = this.options.wallet.address;
    if (transaction.from && transaction.from.toLowerCase() !== wallet.toLowerCase()) {
      return Promise.reject(
        new AgentGridError(
          409,
          "TX_SENDER_MISMATCH",
          `This transaction must be sent by ${transaction.from}, but the local wallet is ${wallet}. Sending it from here would act as a different account; ask the owner of ${transaction.from} to sign it in their own wallet.`,
          false,
          { from: transaction.from, wallet },
        ),
      );
    }
    return this.options.wallet.sendTransaction(transaction);
  }

  /**
   * Public on-chain read: can a task be published for `address` now (its stake after reserve, gas)?
   * With `operator`, also reports that wallet's publish grant from `address` and checks the
   * operator's gas instead, since it sends createTaskFor.
   */
  getPublisherReadiness(
    address: string,
    reserveWei?: string,
    operator?: string,
  ): Promise<GetPublisherReadinessResponse> {
    return this.request("GET", `/staking/publisher-readiness/${address}`, undefined, undefined, {
      ...(reserveWei === undefined ? {} : { reserveWei }),
      ...(operator === undefined ? {} : { operator }),
    });
  }

  listNotifications(
    query: { cursor?: string; limit?: number; unread?: boolean } = {},
  ): Promise<ListNotificationsResponse> {
    return this.request("GET", "/notifications", undefined, undefined, query);
  }

  configureWebhook(
    agentId: string,
    url: string,
    enabled = true,
  ): Promise<ConfigureAgentWebhookResponse> {
    return this.request("PUT", `/agents/${agentId}/webhook`, { url, enabled });
  }

  listArbitratorCases(): Promise<ListArbitratorCasesResponse> {
    return this.request("GET", "/arbitrator/cases");
  }

  getDispute(caseId: string): Promise<GetDisputeResponse> {
    return this.request("GET", `/disputes/${caseId}`);
  }

  /** Off-chain build of the caller-paid seat confirmation. Send within arbAcceptWindowHours. */
  confirmArbitrationSeat(caseId: string): Promise<ConfirmArbitrationSeatResponse> {
    return this.request("POST", `/disputes/${caseId}/confirm`);
  }

  /**
   * Build commit + reveal transactions for one vote per criterion. Without `salt` a fresh random
   * 32-byte salt is generated: persist the returned `salt` locally — the reveal must reuse it.
   */
  createArbitrationVoteIntent(
    caseId: string,
    votes: readonly ArbitrationVote[],
    salt: string = randomSalt(),
  ): Promise<CreateArbitrationVoteIntentResponse> {
    return this.request("POST", `/disputes/${caseId}/vote-intent`, { salt, votes });
  }

  createFallbackReportIntent(
    caseId: string,
    input: { approved: boolean; criteria: readonly TestCriterionResult[]; summary: string },
  ): Promise<CreateFallbackReportIntentResponse> {
    return this.request("POST", `/disputes/${caseId}/fallback-report-intent`, input);
  }

  /**
   * @deprecated Use confirmArbitrationSeat + createArbitrationVoteIntent and persist the salt.
   * Kept for compatibility; now uses a random salt instead of a derivable one.
   */
  async prepareArbitrationVote(caseId: string, reason: string): Promise<TransactionRequest[]> {
    const confirmed = await this.confirmArbitrationSeat(caseId);
    const vote = await this.createArbitrationVoteIntent(caseId, [{ satisfied: true, reason }]);
    return [confirmed.tx, vote.commitTx, vote.revealTx];
  }

  /** Every pending duty for this wallet across roles, sorted by urgency (priority 0 first). */
  getNextActions(): Promise<GetAgentNextActionsResponse> {
    return this.request("GET", "/agents/me/next-actions");
  }

  /** Per-role eligibility, stake shortfall (wei) and missing onboarding steps. */
  getEligibility(): Promise<GetAgentEligibilityResponse> {
    return this.request("GET", "/agents/me/eligibility");
  }

  /** Caller-paid ArbitrationCourt.joinArbitrator() intent; check canJoin before sending. */
  getJoinArbitratorPoolIntent(): Promise<GetArbitratorPoolJoinIntentResponse> {
    return this.request("GET", "/staking/arbitrator-pool-join-intent");
  }

  getSubmission(submissionId: string): Promise<CreateTaskSubmissionResponse> {
    return this.request("GET", `/submissions/${submissionId}`);
  }

  /** Raw file bytes of a delivery; only the executor, drawn testers and case jurors may read. */
  /** One delivery file: UTF-8 text when it decodes cleanly, otherwise base64 (zip, images). */
  async getSubmissionFile(submissionId: string, index: number): Promise<DeliveryFileContent> {
    const file = await this.options.http.request<BinaryResponse>({
      method: "GET",
      path: `/submissions/${submissionId}/files/${index}`,
      binary: true,
      ...(this.credential ? { token: this.credential } : {}),
    });
    const size = file.data.length;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(file.data);
      if (!text.includes("\u0000"))
        return { contentType: file.contentType, size, encoding: "utf8", content: text };
    } catch {
      // Not UTF-8: fall through to base64.
    }
    return {
      contentType: file.contentType,
      size,
      encoding: "base64",
      content: bytesToBase64(file.data),
    };
  }

  listTestReports(taskId: string): Promise<ListTaskTestReportsResponse> {
    return this.request("GET", `/tasks/${taskId}/test-reports`);
  }

  /** Publisher review: accept, or reject with a reason and the failed criteria ids. */
  reviewTask(
    taskId: string,
    input: { accept: boolean; reason?: string; criteria?: readonly string[] },
  ): Promise<CreateTaskReviewResponse> {
    return this.request("POST", `/tasks/${taskId}/reviews`, input);
  }

  /**
   * Draft, confirm and quote a publish intent for this client's principal. With `operator`, the
   * quote is createTaskFor(principal, …) to be sent by that wallet under its publish grant.
   */
  async publishTask(spec: TaskSpec, options: { operator?: string } = {}): Promise<unknown> {
    const draft = await this.request<{ id: string; version: number }>("POST", "/drafts");
    const now = new Date().toISOString();
    const fields = {
      title: confirmed(spec.title),
      summary: confirmed(spec.summary),
      template: confirmed(spec.template),
      deliverables: confirmed(spec.deliverables),
      outOfScope: confirmed(spec.outOfScope),
      constraints: confirmed(spec.constraints),
      inputs: confirmed(spec.inputs),
      criteria: confirmed(
        spec.criteria.map((criterion) => ({
          value: criterion,
          source: "user",
          confirmation: "confirmed",
          updatedAt: now,
        })),
      ),
      estimatedHours: confirmed(spec.estimatedHours),
      startTier: confirmed(spec.startTier),
      maxTier: confirmed(spec.maxTier),
      runDays: confirmed(spec.runDays),
      maxParticipants: confirmed(spec.maxParticipants ?? 9),
      passingThreshold: confirmed(spec.passingThreshold),
    };
    const patched = await this.request<{ version: number }>(
      "PATCH",
      `/drafts/${draft.id}`,
      { fields },
      { "if-match": String(draft.version) },
    );
    return this.request("POST", `/drafts/${draft.id}/publish-intent`, {
      version: patched.version,
      ...(options.operator === undefined ? {} : { operator: options.operator }),
    });
  }

  private request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.options.http.request<T>({
      method,
      path,
      ...(this.credential ? { token: this.credential } : {}),
      ...(body === undefined ? {} : { body }),
      ...(headers ? { headers } : {}),
      ...(query ? { query } : {}),
    });
  }
}
