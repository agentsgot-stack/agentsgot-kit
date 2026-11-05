import type { GetAgentNextActionsResponse, GetDisputeResponse, GetTaskResponse } from "#shared/api";
import type { TransactionRequest } from "./ports.js";
import type { Role } from "./roles.js";
import {
  type AgentGridClient,
  type ArbitrationVote,
  randomSalt,
  type TestCriterionResult,
  testReportIdempotencyKey,
} from "./sdk/client.js";
import type { CheckpointStore } from "./workers.js";

export type NextAction = GetAgentNextActionsResponse["items"][number];

export interface Evaluation {
  approved: boolean;
  criteria: TestCriterionResult[];
  summary: string;
}

/**
 * Role-specific judgement supplied by the host agent (LLM, tool chain, human). Missing handlers
 * make the runner skip that duty and surface it in the tick report instead of guessing.
 */
export interface RoleHandlers {
  /** Executor: produce delivery files for a claimed task. */
  produceWork?(task: GetTaskResponse): Promise<{
    files: { name: string; content: Blob }[];
    evidence?: string;
  }>;
  /** Tester: judge a delivery against every acceptance criterion. */
  evaluateDelivery?(input: { task: GetTaskResponse; submissionId: string }): Promise<Evaluation>;
  /** Arbitrator: one vote per dispute criterion, in dispute.criteria order. */
  judgeDispute?(dispute: GetDisputeResponse): Promise<ArbitrationVote[]>;
  /** Fallback reviewer: judge a dispute like a tester. */
  evaluateDispute?(dispute: GetDisputeResponse): Promise<Evaluation>;
  /** Publisher: accept or reject a posted result. */
  reviewResult?(task: GetTaskResponse): Promise<{
    accept: boolean;
    reason?: string;
    criteria?: string[];
  }>;
  /**
   * Executor: after postResult, decide whether to waive the appeal window or open an appeal.
   * Waive must be sent from the posted executor wallet (wallet A); a delegated local signer
   * cannot submit waiveAppeal on-chain.
   */
  decideAppeal?(input: {
    task: GetTaskResponse;
    address: string;
  }): Promise<{ action: "waive" } | { action: "appeal"; statement: string }>;
}

export type Outcome = "done" | "pending-tx" | "skipped" | "error";

export interface HandledAction {
  kind: NextAction["kind"];
  subjectId: string;
  taskId: string | null;
  outcome: Outcome;
  detail: string;
  txHash?: string;
  /** Unsent transaction when autoSend is off; the user must approve and send it. */
  pendingTx?: TransactionRequest;
}

/** Events that trigger an immediate report (see skills section 3c). */
export type RunnerEventType =
  | "delivery_signed"
  | "testers_drawn"
  | "assigned_as_tester"
  | "report_submitted"
  | "result_posted"
  | "appeal_decision_needed"
  | "review_required"
  | "arbitration_case"
  | "vote_committed"
  | "vote_revealed"
  | "rewards_claimable"
  | "deadline_warning"
  | "tx_failed"
  | "tx_pending_approval";

export interface RunnerEvent {
  type: RunnerEventType;
  subjectId: string;
  taskId: string | null;
  detail: string;
}

export interface TickReport {
  asOf: string;
  roles: readonly Role[];
  /** True when any priority-0/1 duty is open: schedules switch to expedited intervals. */
  expedited: boolean;
  handled: HandledAction[];
  events: RunnerEvent[];
  warnings: string[];
}

export interface RoleRunnerOptions {
  client: AgentGridClient;
  roles: readonly Role[];
  checkpoints: CheckpointStore;
  handlers?: RoleHandlers;
  /**
   * Send caller-paid transactions automatically. Must only be enabled after the user explicitly
   * confirmed it; otherwise transactions are returned as `pendingTx` in the tick report.
   */
  autoSend?: boolean;
  /** Also send permissionless TRIGGER actions (settlement, timeouts). Default false. */
  sendTriggers?: boolean;
}

const ROLE_OF: Record<NextAction["role"], Role | "any"> = {
  executor: "executor",
  tester: "tester",
  arbitrator: "arbitrator",
  publisher: "publisher",
  any: "any",
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function httpStatus(error: unknown): number | null {
  const value = (error as { status?: unknown } | null)?.status;
  return typeof value === "number" ? value : null;
}

/** Persisted BEFORE commitTx is sent; reveal is impossible without it (100% slash). */
export interface VoteCheckpoint {
  caseId: string;
  salt: string;
  votes: ArbitrationVote[];
}

interface SentCheckpoint {
  txHash: string;
  sentAt: string;
}

/** Re-send a transaction for the same duty only after this long (the indexer may lag). */
export const RESEND_AFTER_MS = 10 * 60_000;
/** A deadline closer than this raises a deadline_warning event. */
export const DEADLINE_WARNING_MS = 6 * 3600_000;

/**
 * Next-actions driven runner for one or more roles. Each `tick()` pulls
 * GET /agents/me/next-actions, handles items for the enabled roles in priority order and returns
 * a sanitized report. Transactions are only surfaced as intents unless `autoSend` is on.
 */
export class RoleRunner {
  constructor(private readonly options: RoleRunnerOptions) {}

  private wants(item: NextAction): boolean {
    const role = ROLE_OF[item.role];
    return role === "any" || this.options.roles.includes(role);
  }

  async tick(now: Date = new Date()): Promise<TickReport> {
    const report: TickReport = {
      asOf: now.toISOString(),
      roles: this.options.roles,
      expedited: false,
      handled: [],
      events: [],
      warnings: [],
    };
    const next = await this.options.client.getNextActions();
    report.warnings.push(...next.warnings);
    const items = next.items.filter((item) => this.wants(item));
    report.expedited = items.some((item) => item.priority <= 1);
    for (const item of items) {
      if (item.deadline && new Date(item.deadline).getTime() - now.getTime() < DEADLINE_WARNING_MS)
        this.event(report, item, "deadline_warning", `${item.kind} due ${item.deadline}`);
      try {
        report.handled.push(await this.handle(item, report, next.address));
      } catch (error) {
        report.handled.push(this.result(item, "error", message(error)));
      }
    }
    return report;
  }

  private result(
    item: NextAction,
    outcome: Outcome,
    detail: string,
    extra: Partial<HandledAction> = {},
  ): HandledAction {
    return {
      kind: item.kind,
      subjectId: item.subject.id,
      taskId: item.taskId,
      outcome,
      detail,
      ...extra,
    };
  }

  private event(report: TickReport, item: NextAction, type: RunnerEventType, detail: string) {
    report.events.push({ type, subjectId: item.subject.id, taskId: item.taskId, detail });
  }

  /** Send (autoSend) or surface a transaction intent; de-duplicates resends per duty. */
  private async transact(
    item: NextAction,
    report: TickReport,
    tx: TransactionRequest,
    detail: string,
    key = `tx:${item.kind}:${item.subject.id}`,
  ): Promise<HandledAction> {
    const { checkpoints, client } = this.options;
    const previous = await checkpoints.get<SentCheckpoint>(key);
    if (previous && Date.now() - new Date(previous.sentAt).getTime() < RESEND_AFTER_MS)
      return this.result(item, "skipped", `already sent ${previous.txHash}; waiting for indexer`, {
        txHash: previous.txHash,
      });
    const permissionless = item.kind === "TRIGGER";
    if (!this.options.autoSend || (permissionless && !this.options.sendTriggers)) {
      this.event(report, item, "tx_pending_approval", detail);
      return this.result(item, "pending-tx", detail, { pendingTx: tx });
    }
    try {
      const txHash = await client.sendTransaction(tx);
      await checkpoints.set<SentCheckpoint>(key, { txHash, sentAt: new Date().toISOString() });
      return this.result(item, "done", detail, { txHash });
    } catch (error) {
      this.event(report, item, "tx_failed", `${detail}: ${message(error)}`);
      throw error;
    }
  }

  /** Executor duty right after signing: commit, then reveal the tester draw. */
  private async drawTesters(item: NextAction, report: TickReport, taskId: string) {
    const { client } = this.options;
    if (item.kind !== "TESTER_DRAW_REVEAL") {
      try {
        await client.commitTesterDraw(taskId);
      } catch (error) {
        // 409 = already committed (e.g. a previous tick); continue to reveal.
        if (httpStatus(error) !== 409) throw error;
      }
    }
    try {
      const draw = await client.revealTesterDraw(taskId);
      this.event(report, item, "testers_drawn", `testers: ${draw.testers.join(", ")}`);
      return this.result(item, "done", `drew ${draw.testers.length} testers`);
    } catch (error) {
      if (httpStatus(error) === 409)
        return this.result(item, "skipped", "seed block not mined yet; reveal on next tick");
      throw error;
    }
  }

  private async handle(
    item: NextAction,
    report: TickReport,
    principalAddress: string,
  ): Promise<HandledAction> {
    const { client, handlers = {} } = this.options;
    const taskId = item.taskId;
    const id = item.subject.id;
    switch (item.kind) {
      case "CLAIM_HEARTBEAT": {
        await client.heartbeatClaim(id);
        return this.result(item, "done", "claim lease renewed");
      }
      case "SUBMIT_DELIVERY": {
        if (!handlers.produceWork || !taskId)
          return this.result(item, "skipped", "no produceWork handler; deliver manually");
        const work = await handlers.produceWork(await client.getTask(taskId));
        const signed = await client.submitWork({
          claimId: id,
          files: work.files,
          ...(work.evidence === undefined ? {} : { evidence: work.evidence }),
          idempotencyKey: `delivery:${id}`,
        });
        this.event(report, item, "delivery_signed", `submission ${signed.id}`);
        return this.drawTesters(item, report, taskId);
      }
      case "SIGN_DELIVERY":
        await client.signDelivery(id);
        this.event(report, item, "delivery_signed", `submission ${id}`);
        return taskId
          ? this.drawTesters(item, report, taskId)
          : this.result(item, "done", "delivery signed");
      case "TESTER_DRAW_COMMIT":
      case "TESTER_DRAW_REVEAL":
        if (!taskId) return this.result(item, "skipped", "missing taskId");
        return this.drawTesters(item, report, taskId);
      case "SUBMIT_TEST_REPORT": {
        if (!taskId) return this.result(item, "skipped", "missing taskId");
        const retest = /retest/iu.test(item.hint);
        const seen = await this.options.checkpoints.get<boolean>(`assigned:${id}`);
        if (!seen) {
          this.event(
            report,
            item,
            "assigned_as_tester",
            retest ? `retest seat ${id}` : `submission ${id}`,
          );
          await this.options.checkpoints.set(`assigned:${id}`, true);
        }
        if (!handlers.evaluateDelivery)
          return this.result(item, "skipped", "no evaluateDelivery handler; evaluate manually");
        const task = await client.getTask(taskId);
        const evaluation = await handlers.evaluateDelivery({ task, submissionId: id });
        const expected = task.specification?.criteria.map((criterion) => criterion.id) ?? [];
        const covered = new Set(evaluation.criteria.map((criterion) => criterion.criterionId));
        const missing = expected.filter((criterionId) => !covered.has(criterionId));
        if (missing.length > 0)
          return this.result(item, "error", `evaluation misses criteria: ${missing.join(", ")}`);
        const submitted = await client.submitTestReport({
          taskId,
          submissionId: id,
          approved: evaluation.approved,
          criteria: evaluation.criteria,
          summary: evaluation.summary,
          idempotencyKey: retest
            ? `retest-report:${taskId}:${id}`
            : testReportIdempotencyKey(taskId, id),
        });
        this.event(report, item, "report_submitted", `report ${submitted.id}`);
        return this.result(
          item,
          "done",
          `${retest ? "retest " : ""}report ${submitted.id} approved=${evaluation.approved}`,
        );
      }
      case "SUBMIT_FALLBACK_REPORT": {
        if (!handlers.evaluateDispute)
          return this.result(item, "skipped", "no evaluateDispute handler; review manually");
        const evaluation = await handlers.evaluateDispute(await client.getDispute(id));
        const intent = await client.createFallbackReportIntent(id, evaluation);
        return this.transact(item, report, intent.tx, "submitFallbackReport");
      }
      case "POST_RESULT": {
        if (!taskId) return this.result(item, "skipped", "missing taskId");
        try {
          const intent = await client.getFinalResult(taskId);
          return this.transact(item, report, intent.tx, "postResult");
        } catch (error) {
          if (httpStatus(error) === 409)
            return this.result(item, "skipped", `not yet postable: ${message(error)}`);
          throw error;
        }
      }
      case "APPEAL_DECISION": {
        if (!taskId) return this.result(item, "skipped", "missing taskId");
        const task = await client.getTask(taskId);
        if (!handlers.decideAppeal) {
          this.event(
            report,
            item,
            "appeal_decision_needed",
            "verify the posted result; waiveAppeal if no objection, else openAppeal",
          );
          return this.result(
            item,
            "skipped",
            "no decideAppeal handler; verify the result and call waive_appeal or open_appeal",
          );
        }
        const decision = await handlers.decideAppeal({
          task,
          address: principalAddress.toLowerCase(),
        });
        if (decision.action === "waive") {
          const intent = await client.waiveAppeal(taskId);
          return this.transact(item, report, intent.tx, "waiveAppeal");
        }
        const intent = await client.openAppeal(taskId, { statement: decision.statement });
        this.event(report, item, "appeal_decision_needed", decision.statement);
        this.event(
          report,
          item,
          "tx_pending_approval",
          "openAppeal requires explicit user approval",
        );
        return this.result(
          item,
          "pending-tx",
          "openAppeal intent ready; send after user approval",
          {
            pendingTx: intent.tx,
          },
        );
      }
      case "REVIEW_RESULT": {
        if (!taskId) return this.result(item, "skipped", "missing taskId");
        this.event(report, item, "review_required", `review before ${item.deadline}`);
        if (!handlers.reviewResult)
          return this.result(item, "skipped", "awaiting the publisher's accept/reject decision");
        const decision = await handlers.reviewResult(await client.getTask(taskId));
        const review = await client.reviewTask(taskId, decision);
        return this.transact(item, report, review.tx, decision.accept ? "accept" : "reject");
      }
      case "CONFIRM_ARBITRATION_SEAT": {
        this.event(report, item, "arbitration_case", `confirm seat before ${item.deadline}`);
        const intent = await client.confirmArbitrationSeat(id);
        return this.transact(item, report, intent.tx, "confirm arbitration seat");
      }
      case "COMMIT_ARBITRATION_VOTE":
        return this.commitVote(item, report);
      case "REVEAL_ARBITRATION_VOTE":
        return this.revealVote(item, report);
      case "CLAIM_REWARDS": {
        const scheduleIds = (item.request.body?.scheduleIds as string[] | undefined) ?? [];
        this.event(report, item, "rewards_claimable", item.hint);
        const intent = await client.createRewardClaim(scheduleIds);
        return this.transact(item, report, intent.tx, "claim rewards");
      }
      case "TRIGGER": {
        const calldata = (item.trigger as { calldata?: TransactionRequest } | null)?.calldata;
        if (!calldata) return this.result(item, "skipped", "trigger without calldata");
        return this.transact(item, report, calldata, item.hint);
      }
    }
    return this.result(item, "skipped", "unknown action");
  }

  private async commitVote(item: NextAction, report: TickReport): Promise<HandledAction> {
    const { client, checkpoints, handlers = {} } = this.options;
    const caseId = item.subject.id;
    const key = `vote:${caseId}`;
    let vote = await checkpoints.get<VoteCheckpoint>(key);
    if (!vote) {
      if (!handlers.judgeDispute)
        return this.result(item, "skipped", "no judgeDispute handler; judge the case manually");
      const votes = await handlers.judgeDispute(await client.getDispute(caseId));
      vote = { caseId, salt: randomSalt(), votes };
      // Persist salt + votes before anything is sent: losing them makes reveal impossible.
      await checkpoints.set(key, vote);
    }
    const intent = await client.createArbitrationVoteIntent(caseId, vote.votes, vote.salt);
    const handled = await this.transact(item, report, intent.commitTx, "commit vote");
    if (handled.outcome === "done") this.event(report, item, "vote_committed", caseId);
    return handled;
  }

  private async revealVote(item: NextAction, report: TickReport): Promise<HandledAction> {
    const { client, checkpoints } = this.options;
    const caseId = item.subject.id;
    const vote = await checkpoints.get<VoteCheckpoint>(`vote:${caseId}`);
    if (!vote)
      return this.result(
        item,
        "error",
        "no persisted salt for this case; reveal needs the exact salt and votes used at commit",
      );
    const intent = await client.createArbitrationVoteIntent(caseId, vote.votes, vote.salt);
    const handled = await this.transact(item, report, intent.revealTx, "reveal vote");
    if (handled.outcome === "done") this.event(report, item, "vote_revealed", caseId);
    return handled;
  }
}
