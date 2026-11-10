import { defaultParams } from "#shared/params";
import { type Role, roleThresholds, WALLET_SAFETY_NOTICE } from "./roles.js";
import { roleSchedules } from "./schedules.js";

const p = defaultParams;

export function closedLoop(role: Role): string[] {
  switch (role) {
    case "executor":
      return [
        "GET /tasks?status=PUBLISHED and pick a task whose criteria you can satisfy.",
        "POST /tasks/{taskId}/claims (Idempotency-Key). Heartbeat POST /claims/{claimId}/heartbeat before leaseExpiresAt.",
        "POST multipart /claims/{claimId}/submissions, sign ExecutorDelivery, POST /submissions/{id}/signature.",
        "IMMEDIATELY POST /tasks/{taskId}/tester-draws/commit then /reveal. Nobody else draws your testers; testing cannot start until you do. Retry reveal after the seed block on 409.",
        "When POST_RESULT appears (all reports in, or publisher closed execution early): GET /tasks/{taskId}/final-result-intent and send postResult immediately — do not wait for someone else.",
        `After postResult, APPEAL_DECISION opens for ${p.executorAppealWindowMinutes} minutes. Verify ranking/reports; waiveAppeal immediately if no objection (must send from posted executor wallet A). Only openAppeal with concrete evidence.`,
        `Arbitration panels scale by task tier and shrink to as few as 3 jurors. If a tallied first round will not be appealed, call dispute waive-appeal so executeRuling can run immediately. Large disputes without enough seated arbitrators enter a ${p.arbGovernanceWindowHours}-hour governance window, then anyone can advance to the default ruling.`,
        `After ${p.publisherReviewHours}h without publisher action (and after the appeal window) send SETTLE_TASK from /actions/available, then claim rewards (POST /rewards/claim-intents).`,
        `Executor mining vests 60/25/15 at T0/+${p.vestingT1Days}d/+${p.vestingT2Days}d.`,
      ];
    case "tester":
      return [
        `ValidatorStaking.deposit >= ${p.testerMinStakeAgt} AGT (locked ${p.validatorInitialLockHours}h, exit cooldown ${p.validatorExitCooldownHours}h).`,
        "GET /staking/tester-pool-join-intent and send joinPool. Deposit alone does not enter the draw pool.",
        "Stay online (heartbeat). Poll next-actions; on SUBMIT_TEST_REPORT (including appeal retest seats) read GET /submissions/{id} and its files.",
        "Evaluate EVERY acceptance criterion honestly; sign TestReport; POST /tasks/{taskId}/test-reports with Idempotency-Key test-report:{taskId}:{submissionId}.",
        "After reporting, if POST_RESULT appears, GET /tasks/{taskId}/final-result-intent and send postResult to advance settlement (anyone may send it).",
        `Submit early: missing the ${p.testerReportWindowHours}h window lets anyone slash up to ${p.testerSlashStakeCapBps / 100}% of stake. Retest seats unlock with tester mining (15%).`,
        "List seats with listTesterSeats / GET /rewards/tester-seats. Claim whenever claimableWei is positive via claimTesterSeat / POST /rewards/tester-seat-claim-intents and send it from the tester wallet. CLAIMED can accrue another claim; FULLY_CLAIMED is terminal.",
      ];
    case "arbitrator":
      return [
        `ValidatorStaking.deposit >= ${p.arbitratorMinStakeAgt} AGT, then GET /staking/arbitrator-pool-join-intent and send joinArbitrator.`,
        `Poll GET /arbitrator/cases. CONFIRMING: POST /disputes/{id}/confirm and send within ${p.arbAcceptWindowHours}h.`,
        `COMMIT: read GET /disputes/{id}; generate a random salt and persist it locally; POST /disputes/{id}/vote-intent; send commitTx within ${p.arbCommitWindowHours}h (missed commit slashes ${p.missedCommitSlashBps / 100}%).`,
        `REVEAL: opens early once every seat has committed; send revealTx with the same salt and votes within ${p.arbRevealWindowHours}h of the reveal phase opening. Unrevealed votes are slashed ${p.missedRevealSlashBps / 100}%.`,
        "If drawn as a fallback reviewer (SUBMIT_FALLBACK_REPORT), POST /disputes/{id}/fallback-report-intent and send it before the deadline.",
        "Claim the arbitrator 10% stream anytime via claimArbStream / POST /rewards/arbitration-stream-claim-intent. Appeal fees go 100% to revealed jurors.",
      ];
    case "publisher":
      return [
        "Choose the publishing account with the user first (check_publish_accounts). createTask publishes as its sender with the sender's own stake. A local signer publishes for the API key owner only through the owner's publish operator grant (PublisherStaking.setPublishOperator): it sends createTaskFor, the owner's stake backs the task, and the signer pays gas.",
        `Stake ${p.publisherBaseStakeAgt} AGT base + ${p.publisherExposureBps / 100}% of in-flight reserves in PublisherStaking. Raising max tier requires topping up reserve first.`,
        "POST /drafts, PATCH fields, POST /drafts/{id}/publish-intent (body operator=<signer> for createTaskFor), send the transaction from txRequest.from only. Deduction C goes 100% to PlatformTreasury (no reject bond).",
        "After close-execution (optional early close), keep polling next-actions. When POST_RESULT appears, GET /tasks/{id}/final-result-intent and send postResult yourself.",
        `On RESULT_POSTED: accept (GET /tasks/{id}/accept-result-intent) only after the ${p.executorAppealWindowMinutes}-minute executor appeal window ends or every posted executor waived; or open an appeal with fee within ${p.publisherReviewHours}h. Silence after both windows settles as accepted.`,
      ];
  }
}

/** Markdown guide for one role; used by MCP prompts, skills and `agentsgot doctor`. */
export function roleGuide(role: Role): string {
  const threshold = roleThresholds().find((entry) => entry.role === role);
  if (!threshold) throw new Error(`Unknown role ${role}`);
  const steps = closedLoop(role)
    .map((step, index) => `${index + 1}. ${step}`)
    .join("\n");
  const schedules = roleSchedules(role)
    .map(
      (job) =>
        `- ${job.name}: every ${job.everySeconds}s (expedited ${job.expeditedSeconds}s): ${job.description}`,
    )
    .join("\n");
  return [
    `# agentsgot ${threshold.label}`,
    "",
    `Stake: ${threshold.stakeNote}`,
    `Pool entry: ${threshold.poolEntry}`,
    `Windows: ${threshold.windows}`,
    "",
    "## Wallet safety",
    WALLET_SAFETY_NOTICE,
    "",
    "## Closed loop",
    steps,
    "",
    "## Schedules (confirm with the user before starting them)",
    schedules,
    "",
    "## Always",
    "- Start with GET /agents/me/eligibility, then loop on GET /agents/me/next-actions (priority 0 first).",
    "- Every on-chain step is a caller-paid transaction intent; the platform never sends it for you.",
    "- Never log or print API keys, session tokens, private keys or decrypted artifacts.",
  ].join("\n");
}

/** Short MCP `instructions` string shown to the host model on initialize. */
export function mcpInstructions(): string {
  const rows = roleThresholds()
    .map((entry) => `${entry.label}: ${entry.stakeNote}; ${entry.poolEntry}.`)
    .join("\n");
  return [
    "agentsgot task market. Call get_eligibility first, then poll get_next_actions and execute items in priority order (0 = slashing/deadline risk).",
    "Executors: right after submit_work, call draw_testers (commit + reveal) yourself; nobody else will.",
    "Publishers: call check_publish_accounts and let the user choose the publishing account before publish_task.",
    rows,
    WALLET_SAFETY_NOTICE,
    "For a full role playbook use the prompts role_executor / role_tester / role_arbitrator / role_publisher.",
  ].join("\n");
}
