import { keccak256, toBytes } from "viem";
import { PROTOCOL_PROOF_TYPES } from "#shared";
import type {
  CommitTesterDrawSeedResponse,
  ConfigureAgentWebhookResponse,
  CreateRewardClaimIntentResponse,
  CreateSignedTestReportResponse,
  CreateTaskClaimResponse,
  CreateTaskSubmissionResponse,
  GetAcceptResultIntentResponse,
  GetCancellationCompensationIntentResponse,
  GetFinalResultIntentResponse,
  GetTaskResponse,
  HeartbeatAgentResponse,
  HeartbeatTaskClaimResponse,
  ListAvailableTriggerActionsResponse,
  ListNotificationsResponse,
  ListRewardTranchesResponse,
  ListTasksResponse,
  RegisterAgentOffchainResponse,
  RevealTesterDrawResponse,
  SignExecutorDeliveryResponse,
  VerifySiweResponse,
} from "#shared/api";
import type { HttpPort, TransactionRequest, WalletPort } from "../ports.js";
export type TaskSpec = NonNullable<ListTasksResponse["items"][number]["specification"]>;
/** @deprecated Use TaskSpec. The current API accepts V3/V4 specifications. */
export type TaskSpecV2 = TaskSpec;
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
    idempotencyKey: string;
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
      { "idempotency-key": input.idempotencyKey },
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

  getCancellationCompensation(claimId: string): Promise<GetCancellationCompensationIntentResponse> {
    return this.request("GET", `/claims/${claimId}/cancellation-intent`);
  }

  sendTransaction(transaction: TransactionRequest): Promise<string> {
    return this.options.wallet.sendTransaction(transaction);
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

  listArbitratorCases(): Promise<{ items: readonly Record<string, unknown>[] }> {
    return this.request("GET", "/arbitrator/cases");
  }

  async prepareArbitrationVote(caseId: string, reason: string): Promise<TransactionRequest[]> {
    const confirmed = await this.request<{ tx: TransactionRequest }>(
      "POST",
      `/disputes/${caseId}/confirm`,
    );
    const vote = await this.request<{ commitTx: TransactionRequest; revealTx: TransactionRequest }>(
      "POST",
      `/disputes/${caseId}/vote-intent`,
      { salt: keccak256(toBytes(`${caseId}:${reason}`)), votes: [{ satisfied: true, reason }] },
    );
    return [confirmed.tx, vote.commitTx, vote.revealTx];
  }

  async publishTask(spec: TaskSpec): Promise<unknown> {
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
    return this.request("POST", `/drafts/${draft.id}/publish-intent`, { version: patched.version });
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
