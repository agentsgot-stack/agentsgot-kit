import type { LlmPort } from "./ports.js";
import type { AgentGridClient, TestCriterionResult } from "./sdk/client.js";

export interface CheckpointStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

export class InMemoryCheckpointAdapter implements CheckpointStore {
  private readonly values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class LocalStorageCheckpointAdapter implements CheckpointStore {
  constructor(
    private readonly storage: StorageLike,
    private readonly prefix = "agentgrid:",
  ) {}
  async get<T>(key: string): Promise<T | null> {
    const value = this.storage.getItem(`${this.prefix}${key}`);
    return value === null ? null : (JSON.parse(value) as T);
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.storage.setItem(`${this.prefix}${key}`, JSON.stringify(value));
  }
}

/** @deprecated Use RoleRunner, which follows /agents/me/next-actions and draws testers. */
export class ExecutorWorker {
  constructor(
    private readonly client: AgentGridClient,
    private readonly llm: LlmPort,
    private readonly checkpoints: CheckpointStore,
  ) {}

  async runOnce(): Promise<{ taskId: string; claimId: string; submissionId: string } | null> {
    const tasks = await this.client.listTasks({ status: "PUBLISHED", limit: 1 });
    const task = tasks.items[0];
    if (!task) return null;
    const previous = await this.checkpoints.get<{ claimId: string; submissionId?: string }>(
      `executor:${task.taskId}`,
    );
    const claim = previous?.claimId
      ? { id: previous.claimId }
      : await this.client.claimTask(task.taskId, `worker-claim-${task.taskId}`);
    await this.client.heartbeatClaim(claim.id);
    const output = await this.llm.complete({
      role: "executor",
      prompt: task.specification?.summary ?? `Complete task ${task.taskId}`,
    });
    const submission = await this.client.submitWork({
      claimId: claim.id,
      files: [{ name: "result.txt", content: new Blob([output], { type: "text/plain" }) }],
      evidence: task.specification?.criteria.map(({ id }) => id).join("\n") ?? "completed",
      idempotencyKey: `worker-delivery-${task.taskId}`,
    });
    await this.checkpoints.set(`executor:${task.taskId}`, {
      claimId: claim.id,
      submissionId: submission.id,
    });
    return { taskId: task.taskId, claimId: claim.id, submissionId: submission.id };
  }
}

/** @deprecated Use RoleRunner with role "tester". */
export class TesterWorker {
  constructor(
    private readonly client: AgentGridClient,
    private readonly llm: LlmPort,
    private readonly checkpoints: CheckpointStore,
  ) {}

  async run(input: {
    taskId: string;
    submissionId: string;
    criteria: readonly Omit<TestCriterionResult, "passed" | "note">[];
    /** Appeal retest seats use the same report path with a distinct idempotency key. */
    retest?: boolean;
  }): Promise<CreateTesterResult> {
    const summary = await this.llm.complete({
      role: "tester",
      prompt: input.retest
        ? `Retest appealed criteria for task ${input.taskId} submission ${input.submissionId}.`
        : `Verify task ${input.taskId} submission ${input.submissionId}.`,
    });
    const criteria = input.criteria.map(({ criterionId }) => ({
      criterionId,
      passed: true,
      note: summary,
    }));
    const report = await this.client.submitTestReport({
      taskId: input.taskId,
      submissionId: input.submissionId,
      approved: true,
      criteria,
      summary,
      idempotencyKey: input.retest
        ? `worker-retest-${input.taskId}-${input.submissionId}`
        : `worker-report-${input.taskId}`,
    });
    await this.checkpoints.set(
      input.retest ? `tester-retest:${input.taskId}` : `tester:${input.taskId}`,
      report,
    );
    return { reportId: report.id, approved: report.approved };
  }
}

export type CreateTesterResult = { reportId: string; approved: boolean };

/** @deprecated Use RoleRunner with role "arbitrator" (persists the vote salt across phases). */
export class ArbitratorWorker {
  constructor(
    private readonly client: AgentGridClient,
    private readonly llm: LlmPort,
    private readonly checkpoints: CheckpointStore,
  ) {}

  async runOnce(): Promise<{ caseId: string; transactionHashes: string[] } | null> {
    const cases = await this.client.listArbitratorCases();
    const arbitrationCase = cases.items[0];
    if (!arbitrationCase) return null;
    const record = arbitrationCase as { caseId?: string; id?: string };
    const caseId = String(record.caseId ?? record.id);
    const reasoning = await this.llm.complete({
      role: "arbitrator",
      prompt: `Evaluate arbitration case ${caseId}.`,
    });
    const transactions = await this.client.prepareArbitrationVote(caseId, reasoning);
    const hashes: string[] = [];
    for (const transaction of transactions)
      hashes.push(await this.client.sendTransaction(transaction));
    await this.checkpoints.set(`arbitrator:${caseId}`, { hashes });
    return { caseId, transactionHashes: hashes };
  }
}
