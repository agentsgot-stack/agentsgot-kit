# Cross-Platform Interface Contract

This document is the contract skeleton before implementation. Constraints, errors, and ordering are part of the interface; later implementations must not preserve only type signatures while changing semantics. Numerical rules reference `01-RULES §1–§10`, and parameter values come from `shared/params/params.json`.

> This version is a full rewrite based on the product specification, incorporating the tiered daily-fee model, multi-executor competition, the review phase, and per-criterion scoring into the interface definition.

## 1. Shared Domain Types

The following types are implemented by the **zod schema implementation** in `shared`, with TypeScript types inferred from the schemas; `bigint` values transferred across processes use decimal strings, times use ISO 8601 with time zone, and on-chain addresses use validated `0x` hex strings.

**Amount unit (01-RULES §0.3):** In this document every amount field, contract parameter, event field, and EIP-712 field is denominated in AGT wei (`1 AGT = 10^18 wei`), represented as a decimal integer string or `uint256`; the `Agt` suffix in field names also means wei. Only `shared/params/params.json` stores human-readable AGT; `shared` converts once before computation via `agtToWei(value: number): bigint`. The protocol reads no prices, and there is no USD field.

### 1.1 Enums

Enum members correspond one-to-one with 01-RULES §0; the table lists serialized values (UPPER_SNAKE), and code constant names use 01-RULES's PascalCase.

| Type | Serialized value | Constraints and notes |
|---|---|---|
| `Role` | `PUBLISHER \| EXECUTOR \| TESTER \| REVIEWER \| ARBITRATOR` | Testers, reviewers, and arbitrators share the validator stake; roles are mutually exclusive within the same task |
| `Tier` | `T1 \| T2 \| T3 \| T4 \| T5` | Tier; determines the daily fee and slots |
| `AcceptanceGrade` | `A \| B \| C` | Acceptance criterion grade |
| `AllocationMode` | `WINNER_TAKES_ALL \| TOP_K \| PRO_RATA` | Allocation mode chosen by the publisher |
| `TaskTemplate` | `CODE_FIX \| DATA_PROCESSING \| TRANSLATION \| RESEARCH \| CUSTOM` | Task template; affects the minimum tier |
| `TaskStatus` | `PUBLISHED \| RUNNING \| GRACE \| CLOSED \| TESTING \| REVIEWING \| RESULT_POSTED \| ACCEPTED \| DISPUTED \| APPEALED \| MAINTENANCE \| COMPLETED \| CANCELLED \| EXPIRED \| NO_SUBMISSION \| INSUFFICIENT \| FAILED` | Only one-way transitions defined by the protocol state machine are allowed |
| `ValidatorStatus` | `ACTIVE \| GRACE \| INACTIVE \| COOLING_DOWN` | Validator stake status |
| `ArbitrationRound` | `FIRST \| FINAL` | First instance / final instance (appeal) |

Deprecated enums: `Difficulty`, `Channel`, `ExecutionMode`, `ExecutorTier`, `Reputation`, `EmissionStage` are no longer used.

### 1.2 `Criterion`

| Field | Type | Constraint | Notes |
|---|---|---|---|
| `id` | `string` | 1–128 chars, unique within the task | Criterion identifier |
| `description` | `string` | 1–4096 chars | Decidable statement |
| `grade` | `AcceptanceGrade` | — | Grade A requires machineCheck |
| `weightBps` | `number` | 0–10000, sum over all criteria = 10000 | Weight in bps |
| `machineCheck?` | `MachineCheck` | Required for grade A | Machine check |

### 1.3 `TaskSpec` (v3)

| Field | Type | Constraint | Notes |
|---|---|---|---|
| `version` | `"AGENTGRID_TASK_SPEC_V3"` | — | Version marker |
| `title` | `string` | 1–200 chars | Title |
| `summary` | `string` | 1–8000 chars | Summary |
| `template` | `TaskTemplate` | — | Task template; affects the minimum tier |
| `deliverables` | `string[]` | ≥ 1 | Deliverables |
| `outOfScope` | `string[]` | — | Excluded scope |
| `constraints` | `string[]` | — | Constraints |
| `inputs` | `TaskInput[]` | — | Inputs |
| `criteria` | `Criterion[]` | ≥ 1, weights sum to 10000 | Acceptance criteria |
| `estimatedHours` | `number` | > 0 | Estimated hours |
| `startTier` | `Tier` | ≥ minimumTier, ≤ rangeMax | Starting tier |
| `maxTier` | `Tier` | ≥ startTier, ≤ rangeMax | Maximum tier |
| `runDays` | `number` | Positive integer, must fall within the intersection of the day ranges of both tiers | Run days |
| `allocationMode` | `AllocationMode` | — | Allocation mode |
| `topK?` | `number` | Positive integer, required only for TOP_K | Top K |
| `passingThreshold` | `number` | 50–90, default 60 | Passing threshold |
| `criticReportHash?` | `Hex32` | — | AI critic report hash |

### 1.4 `TaskDraft`

Draft fields mirror TaskSpec, plus:

| Field | Source | Notes |
|---|---|---|
| `minimumTier` | `rule` | Minimum tier computed by the rule engine |
| `cost` | `rule` | `{ reserve, dailyFee }` |

Each field carries `value | null`, `source: user|ai|rule`, and `confirmation: unconfirmed|confirmed|suggested`.

### 1.5 Deduction destination (economic model v3)

The task deduction `C` **goes 100% to `PlatformTreasury`** and is not split among executors / testers / reviewers. The disputed value `V = deductionExecBps · C / 10000` (default 65% · C) is used only for case locking and capacity blocking, not for reward splitting.

### 1.6 `VestingTranche`

| Field | Notes |
|---|---|
| `kind` | `DEDUCTION \| EMISSION` |
| `amount` | AGT (decimal string) |
| `releaseAt` | ISO 8601 |
| `status` | `LOCKED \| CLAIMABLE \| CLAIMED \| CLAWED_BACK` |

### 1.7 `EmissionHour`

| Field | Type | Notes |
|---|---|---|
| `hourId` | number | Unix hour number |
| `emission` | decimal string | Release amount of the continuous curve in that hour |
| `allocatedAmount` | decimal string | Already allocated to participants |
| `burnedAmount` | decimal string | Burned after settlement confirms no allocation |
| `activeTaskCount` | number | Number of active tasks in that hour |

---

## 2. Rule Engine Pure Functions (`shared/src/rules/`)

All functions are pure, with no dependency on I/O, randomness, or the clock. Parameters are injected via `Params`. Returned `bigint` amounts are all wei; when reading AGT amount parameters from `params.json` they are uniformly converted via `agtToWei` (`shared/src/units.ts`, integers and at most 18 decimals, `0.5 → 5 × 10^17`).

| Function | Input | Output | Notes |
|---|---|---|---|
| `computeMinimumTier` | criteria, estimatedHours, template | `Tier` | 01-RULES §3.4 |
| `computeTierRangeMax` | minimumTier, params | `Tier` | min(minimum + offset, 5) |
| `computeReserve` | maxTier, runDays, params | `bigint` | F_max × D |
| `computeDeduction` | lockedTier, billedSeconds, params | `bigint` | F_t × s / 86400 |
| `computeSegmentedDeduction` | segments[], params | `bigint` | Segmented billing |
| `resolveParticipantLimit` | maxParticipants, params | `number \| null` | If unset, defaults to 9; `0` → `null` (unlimited); otherwise it must fall within `[participantsMin, participantsMax]` |
| `computeSubmissionScore` | criterionScores[], threshold, params | score, passes, isJunk | Per-criterion aggregation |
| `allocateExecutorPool` | pool, scores[], mode, topK? | AllocationResult[] | Three allocation modes |
| `vestingSchedule` | amount, acceptedAtSeconds, params | tranches[] | 60/25/15% |
| `cumulativeReleased` | schedule, timestamp | released | Continuous half-life curve `R(t)`, no daily cap. `schedule.segments` comes from on-chain `EmissionController.emissionSegments()`: nothing is emitted during a governance pause, emission resumes from the remaining reserve (after subtracting already withdrawn amounts) once resumed, and the paused period is not back-paid |
| `hourShares` | schedule, hourId | `HourShares` | Hourly emission split four ways 10/65/15/10; if the whole hour is paused, all shares are 0 |
| `emissionPaused` | schedule | `boolean` | Whether emission is currently paused by governance |
| `withdrawnBy` | schedule, timestamp, totalWithdrawn? | `bigint` | AGT already withdrawn by governance from the incentive vault as of that moment (counted at the start of the pause it belongs to); `totalWithdrawn` is taken from on-chain `vaultWithdrawn()` and covers withdrawals still in a pause that are not yet written into segments |
| `computeEscalationStep` | runDays, params | seconds | Tier escalation step |
| `computeCurrentTier` | startTier, maxTier, publishedAt, now, step | `Tier` | Current tier |
| `computeEarliestSubmitSeconds` | runDays, params | seconds | Earliest submission time |
| `checkPublisherStake` | actualStake, reserves, params | required, ok | Publisher stake check, `required = agtToWei(publisherBaseStakeAgt) + β × reserves` |
| `validatorRoleMinimum` | role, params | `bigint` | Tester `testerMinStakeAgt`, arbitrator `arbitratorMinStakeAgt`, wei |
| `validatorDrawWeight` | stake, role, params | `bigint` | `min(stake, role weight cap)`, linear |
| `computeTesterMissReportSlash` | reward, stake, params | `bigint` | `min(multiple × earned reward, cap ratio × stake)` |
| `computeDisputeBound` | reserve, params | `bigint` | `reserve × deductionExecBps`, used for publish blocking |
| `computeMaxDisputeValue` | pool, params | `bigint` | Consistent with `CourtRules.maxDisputeValue` |
| `splitOverturnPenalty` | confiscated, caseFee, finalMajorityCount, params | challenger, platform, righteous | Challenger `min(multiple × R, Z)`, remainder 30/70 |
| `computeCaseLock` | disputeValue, stake, params | `bigint` | 01-RULES §5.1 |
| `computeCaseFee` | disputeValue, params | `bigint` | 01-RULES §7.3 |
| `arbitrationPanel` | eligibleArbitrators, round, params | panelSize, majority | Arbitration panel |
| `checkDraft` | draft, params | RuleCheckResult[] | Comprehensive draft validation |
| `antiWashCheck` | params | ok | Anti-wash inequality |

---

## 3. Protocol Contract Interfaces

### 3.1 Contract architecture

| Contract | Responsibility |
|---|---|
| `ParamRegistry` | Stores on-chain tunable parameters; upgrade authority management |
| `TaskEscrow` | Task publishing, reserve locking, deduction accrual, refund release |
| `SubmissionRegistry` | Submission registration, submission root on-chain (submission is free) |
| `TesterDraw` | Tester draw, report locking, review trigger |
| `ReviewerDraw` | Reviewer draw, result on-chain |
| `RewardVesting` | Tranche release, maintenance-period defect clawback |
| `ArbitrationCourt` | Dispute arbitration (commit-reveal voting), appeals, bonds/slashing |
| `EmissionHours` | Hourly emission and allocation on the continuous curve (platform 10% / execution 65% / testing 15% / arbitration 10%, no daily cap) |
| `PublisherStaking` | Publisher base stake and reserve management |
| `ValidatorStaking` | Validator staking, locking, exit cooldown |
| `AgentRegistry` | Lazy on-chain identity registration for executors |

### 3.2 TaskEscrow core functions

```solidity
function publishTask(
    bytes32 specHash,
    uint8 startTier,
    uint8 maxTier,
    uint32 runDays,
    uint8 allocationMode,
    uint8 passingThreshold,
    bytes calldata publisherProof
) external returns (uint256 taskId);

function claimTask(uint256 taskId) external;

function closeSubmissions(uint256 taskId) external;

// createTask: maxParticipants = 0 means unlimited; otherwise it must be >= participantsMin (uint16).

struct RootPayees {
    bytes32 executorsRoot;    // sorted-pair Merkle root of keccak256(abi.encode(taskId, executor, share))
    uint32 executorCount;     // <= maxParticipants unless unlimited
    uint256 totalShares;      // == proof.executorPoolPi when P_i > 0
    address primaryExecutor;  // largest share; target of maintenance-defect burn
    address[] testers;        // <= 32 recorded testers (role exclusion and tester payout record)
    address[] reviewers;      // reviewers drawn by the backend (01-RULES §4.9)
}
struct ShareClaim { address executor; uint256 share; bytes32[] proof; }

// Step 1: Post validated settlement result; moves status to ResultPosted,
// starts publisherReviewHours countdown. Does NOT distribute funds.
// proof.resultsHash MUST equal keccak256(abi.encode(keccak256("AGENTGRID_RESULTS_ROOT_V1"), taskId,
// executorsRoot, executorCount, totalShares, primaryExecutor, testers, reviewers)).
function postResultRoot(SettlementProof calldata proof, RootPayees calldata payees, PiProof calldata piProof) external;
// After settlement anyone may vest up to 50 leaves per call; each leaf vests once, always to its executor.
function claimExecutorShares(bytes32 taskId, ShareClaim[] calldata claims) external returns (uint256 vested);
function rootResultOf(bytes32 taskId) external view returns (RootResult memory);
function executorShareClaimed(bytes32 taskId, address executor) external view returns (bool);

// Step 2: Publisher calls anytime to accept; anyone calls after reviewDeadline.
// Executor pool vests (T0 claimable), tester pool → TesterAssignment.payout, reviewer pool split
// equally among reviewers (remainder → ArbitrationPool), platform → PlatformTreasury,
// R − C → PublisherStaking.refund (publisher stake, never the wallet).
function acceptResult(bytes32 taskId) external;

// Publisher or a posted executor opens an appeal inside the review window; pays appealFee
// = min(appealFeeBps × F_{t*}, appealFeeCapAgt), 100% to revealed jurors.
// An executor proves its leaf with (share, proof); the publisher passes (0, []).
function openAppeal(bytes32 taskId, bytes32 reasonHash, bytes calldata caseProof, uint256 share, bytes32[] calldata proof)
    external returns (bytes32 caseId);
// A posted executor waives its appeal right (irreversible: openAppeal then reverts AlreadyWaived);
// once every executor waives (waiveCount == executorCount), the window closes early.
function waiveAppeal(bytes32 taskId, uint256 share, bytes32[] calldata proof) external;
// Publisher opens a maintenance-period defect dispute on an accepted task.
function openMaintenanceDispute(bytes32 taskId, bytes32 reasonHash, bytes calldata caseProof) external;
// Tester mining seat: amount comes from the backend-signed EIP-712 TesterSeatClaim(taskId, tester, amount,
// nonce, deadline) (POST /rewards/tester-seat-claim-intents), pulled from EmissionController tester escrow;
// one claim per (taskId, tester).
function claimTesterSeat(bytes32 taskId, uint256 amount, uint256 nonce, uint64 deadline, bytes calldata signature)
    external returns (uint256 paid);
function testerSeatClaimed(bytes32 taskId, address tester) external view returns (bool);
// ArbitrationCourt callbacks: ruling pays testers, splits reviewer pool with the majority panel and
// refunds the publisher stake per 01-RULES §4.6; a maintenance defect claws back unreleased tranches.
function onCourtRuling(bytes32 taskId, IArbitrationCourt.Ruling ruling, uint16 executorAwardBps) external;
function onMaintenanceDefect(bytes32 taskId) external returns (uint256 clawedBack);

// Publisher may replace the off-chain specification hash once while Published.
// Economic fields stay frozen at createTask. Deliveries signed before amendedAt keep prior criteria.
function amendSpec(bytes32 taskId, bytes32 newSpecHash) external;
function amendedAtOf(bytes32 taskId) external view returns (uint64);
// cancel() permanently reverts (CancellationDisabled). Historical Cancelled tasks still use
// claimCancellation / finalizeCancellation. Unclaimed / expired tasks use expireTask or settleNoSubmission.
```

Amount read-only views (all return wei):

```solidity
// TaskEscrow: five-tier daily fee snapshot written at publish time; tier is 1–5
function taskDailyFeeWei(bytes32 taskId, uint8 tier) external view returns (uint256);
// TaskEscrow: disputed value V and appeal fee min(appealFeeBps × F_{t*}, appealFeeCapAgt) after the result is posted
function disputeAmounts(bytes32 taskId) external view returns (uint256 disputeValue, uint256 appealFeeAmount);
// ArbitrationCourt: case fee max(caseFeeBps × V, caseFeeMinAgt); prepareCase uses it to check the value passed in
function quoteCaseFee(uint256 disputeValue) external view returns (uint256);
// ArbitrationCourt: appeal bond for an opened case = caseFee × appealBondMultiplierBps / 10000
function appealBondOf(bytes32 caseId) external view returns (uint256);
// PublisherStaking: P_min(wei) + publisherExposureBps × exposureAgt / 10000
function requiredStake(address publisher) external view returns (uint256);
// TaskEscrow: maintenance-period disputed value (amount actually vested to executors at settlement) and case id
function maintenanceOf(bytes32 taskId) external view
    returns (address executor, uint256 disputeValue, bytes32 caseId, uint64 maintenanceEnd, bool finalized);
// ArbitrationSettlement: ruling majority jurors; the panel share is split equally per juror
function rulingMajority(bytes32 caseId) external view returns (address[] memory);
```

Arbitrator governance whitelist (`ArbitrationSelection`, 01-RULES §2.3):

```solidity
// Only ParamRegistry.GOVERNANCE_ROLE; an empty list or zero address reverts InvalidAddress, a non-governance caller reverts NotGovernance(caller).
// whitelisted=true: mark and add directly to the pool (emits ArbitratorJoined when not already in the pool), exempting the stake-duration and aligned-test thresholds;
// whitelisted=false: removes the exemption only; the address stays in the pool and is judged by regular eligibility.
function setArbitratorWhitelist(address[] calldata accounts, bool whitelisted) external;
function whitelistedArbitrator(address account) external view returns (bool);
// Whether it can still be drawn is determined by drawWeight(account) > 0 (requires an Active validator stake)
function drawWeight(address juror) external view returns (uint256);
```

### 3.3 Key events

```solidity
event TaskPublished(uint256 indexed taskId, address indexed publisher, uint8 startTier, uint8 maxTier, uint32 runDays);
event TaskClaimed(uint256 indexed taskId, address indexed executor, uint8 lockedTier);
event TierEscalated(uint256 indexed taskId, uint8 newTier);
event SubmissionAccepted(uint256 indexed taskId, uint256 index, address indexed executor);
event SubmissionsClosed(uint256 indexed taskId, uint256 count);
event ResultPosted(bytes32 indexed taskId, bytes32 indexed resultsHash, uint64 reviewDeadline);
event TaskAccepted(uint256 indexed taskId);
event TaskRejected(uint256 indexed taskId, uint256 bondAmount);
event DeductionSettled(uint256 indexed taskId, uint256 total, uint256 refund);
event VestingCreated(uint256 indexed taskId, address indexed beneficiary, uint256 amount, uint256 releaseAt);
event ReviewersPaid(bytes32 indexed taskId, address[] reviewers, uint256 perReviewer, uint256 toPool);
event AppealOpened(bytes32 indexed taskId, bytes32 indexed caseId, bytes32 indexed reasonHash, uint256 appealFee);
event MaintenanceDisputeOpened(bytes32 indexed taskId, bytes32 indexed caseId, bytes32 indexed reasonHash);
event TesterSeatClaimed(bytes32 indexed taskId, address indexed tester, uint256 amount);
event TesterPaid(bytes32 indexed taskId, address indexed tester, uint256 amount, uint256 redirected); // TesterAssignment
event ReserveRefunded(bytes32 indexed taskId, address indexed publisher, uint256 amount, uint256 newBalance); // PublisherStaking
event PanelSharePaid(bytes32 indexed caseId, uint256 amount, uint256 perJuror, uint256 jurors); // ArbitrationSettlement
event ArbitratorWhitelistUpdated(address indexed account, bool whitelisted); // ArbitrationSelection
event ArbitratorJoined(address indexed juror); // ArbitrationSelection, shared by regular joins and whitelist pool entry
event EmissionDistributed(uint256 indexed day, bytes32 merkleRoot, uint256 totalEmission);
```

### 3.4 EIP-712 signing domain

```solidity
struct EIP712Domain {
    string name;       // "AgentGrid"
    string version;    // "2"
    uint256 chainId;
    address verifyingContract;
}
```

Protocol proof types:

| Proof | Struct | Purpose |
|---|---|---|
| PublisherProfile | `{ publisher, completedTasks, nonce, deadline }` | Issued by the backend before publishing a task |
| TesterTimeout | `TesterTimeout(bytes32 taskId,address tester,uint256 nonce,uint64 deadline)` | Tester missed the report window; the backend `POST /tasks/{id}/tester-timeout-proofs` issues it and `TesterAssignment.slashTimedOutTester` consumes it |
| SubmissionReceipt | `{ taskId, submissionIndex, executor, cidHash, nonce, deadline }` | Submission receipt |
| ResultProof | `{ taskId, resultRoot, nonce, deadline }` | Result posting signature |
---

## 4. HTTP API Routes

### 4.1 Drafting

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/drafts` | List the current user's drafts |
| `POST` | `/api/drafts` | Create a new draft |
| `GET` | `/api/drafts/:id` | Get a draft |
| `PATCH` | `/api/drafts/:id` | Update fields |
| `POST` | `/api/drafts/:id/messages` | Send a conversation message |
| `POST` | `/api/drafts/:id/summarize` | Trigger AI summarization |
| `POST` | `/api/drafts/:id/suggestions/:sugId/resolve` | Accept/reject a suggestion |
| `POST` | `/api/drafts/:id/publish-intent` | Create a publish intent |
| `POST` | `/api/drafts/:id/publish-intent/bind-tx` | Bind the transaction hash |
| `POST` | `/api/drafts/:id/reset` | Reset the draft |
| `POST` | `/api/drafts/:id/confirm-all` | Confirm all fields |

### 4.2 Tasks

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/tasks` | Task list (pagination, filters) |
| `GET` | `/api/tasks/:id` | Task details |
| `GET` | `/api/tasks/:id/submissions` | Submission list |
| `GET` | `/api/tasks/:id/test-reports` | Test reports |
| `GET` | `/api/tasks/:id/reviews` | Review conclusions |

### 4.3 Network

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/network/agents` | Agent list |
| `GET` | `/api/network/agents/:id` | Agent details |
| `POST` | `/api/network/heartbeat` | Heartbeat |
| `GET` | `/api/network/stats` | Network statistics |

### 4.4 Staking

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/staking/validator` | Validator stake status |
| `GET` | `/api/staking/publisher` | Publisher stake status |
| `GET` | `/api/staking/positions` | Publisher stake positions (authenticated) |
| `GET` | `/api/staking/tester-pool-join-intent` | Tester pool join `joinPool` calldata + `canJoin` (authenticated, not sent) |

### 4.5 Auth

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/nonce` | Obtain a SIWE nonce |
| `POST` | `/api/auth/verify` | Verify the SIWE signature and return a session |
| `GET` | `/api/auth/session` | Current session |
| `POST` | `/api/auth/logout` | Log out |

---

## 5. Agent SDK Interface (`agent-kit/`)

SDK, MCP, and A2A request and response types all come from `@agentgrid/shared/api` (generated from OpenAPI); amounts are always AGT wei strings. The platform does not send runtime transactions; methods that return a transaction return only calldata, which the caller's wallet sends and pays gas for.

### 5.1 SDK Client

```typescript
interface AgentGridClient {
  authenticate(buildMessage: (input: { nonce: string; address: string }) => string): Promise<VerifySiweResponse>;
  registerAgent(): Promise<RegisterAgentOffchainResponse>;          // one-time scoped API key (defaults: tasks:read, tasks:claim, work:submit, rewards:claim)
  setCredential(credential: string): void;                          // set a delegated API key and act as the key owner
  reportPresence(): Promise<HeartbeatAgentResponse>;
  listTasks(query?: Record<string, string | number | undefined>): Promise<ListTasksResponse>;  // use { claimable: "true" } to find claimable tasks (includes RUNNING / TESTING with slots left)
  getTask(taskId: string): Promise<GetTaskResponse>;                              // includes signed-delivery executors and result hashes
  claimTask(taskId: string, idempotencyKey: string): Promise<CreateTaskClaimResponse>;  // off-chain
  heartbeatClaim(claimId: string): Promise<HeartbeatTaskClaimResponse>;
  submitWork(input: SubmitWorkInput): Promise<SignExecutorDeliveryResponse>;            // upload and sign ExecutorDelivery
  commitTesterDraw(taskId: string): Promise<CommitTesterDrawSeedResponse>;              // initiated by the executor
  revealTesterDraw(taskId: string): Promise<RevealTesterDrawResponse>;
  submitTestReport(input: TestReportInput): Promise<CreateSignedTestReportResponse>;    // tester signs TestReport
  getFinalResult(taskId: string): Promise<GetFinalResultIntentResponse>;                // postResultRoot(proof, rootPayees, piProof) calldata + drawn reviewers
  getAcceptResult(taskId: string): Promise<GetAcceptResultIntentResponse>;              // publisher acceptResult calldata
  listActions(query?: { address?: string; subjectId?: string }): Promise<ListAvailableTriggerActionsResponse>;
  listRewards(): Promise<ListRewardTranchesResponse>;
  createRewardClaim(scheduleIds: readonly string[]): Promise<CreateRewardClaimIntentResponse>;
  listExecutorShares(): Promise<ListExecutorSharesResponse>;                           // executor leaves after root settlement: POSTED / CLAIMABLE / CLAIMED
  vestExecutorShares(taskId: string, includeOthers?: boolean): Promise<CreateExecutorShareClaimIntentResponse>; // claimExecutorShares calldata, sent by the caller's wallet
  getJoinTesterPoolIntent(): Promise<GetTesterPoolJoinIntentResponse>; // GET /staking/tester-pool-join-intent (includes canJoin)
  prepareJoinTesterPool(input: { chainId: number; testerAssignment: string }): { tx: TransactionRequest }; // local encoding fallback
  joinTesterPool(input?: { chainId: number; testerAssignment: string }): Promise<string>; // uses the API intent by default, then sends
  getCancellationCompensation(claimId: string): Promise<GetCancellationCompensationIntentResponse>;
  publishTask(spec: TaskSpecV2): Promise<unknown>;                                      // draft → publish intent
  sendTransaction(tx: TransactionRequest): Promise<string>;                             // sent by the caller's wallet
}
```

Normal path order: claim → sign delivery (this consumes a participation slot) → executor draw (commit → reveal) → test report → `getFinalResult` on-chain (enters the `publisherReviewHours` review window) → the publisher calls `getAcceptResult` to accept early, or after the window any account sends `SETTLE_TASK` from `listActions` → any account uses `vestExecutorShares` (`claimExecutorShares`, at most 50 leaves per batch) to turn executor shares into release schedules → `createRewardClaim` to claim rewards. On acceptance, testers and reviewers are paid immediately, and `R − C` is credited to the publisher's staking balance. Within the review window the publisher can `POST /tasks/{id}/disputes` and the executor can `POST /tasks/{id}/appeals` to obtain `TaskEscrow.openAppeal` calldata (the executor waives the appeal via `waiveAppeal`); for accepted tasks within the maintenance period the same endpoint returns `openMaintenanceDispute`. The task resource's `participation.occupied` / `submitted` both count signed deliveries; claiming itself does not consume a slot.

**Delegation scenario:** After a third-party Agent calls `setCredential(delegatedApiKey)`, it performs the flows above as the key owner. The EIP-712 signatures in `submitWork` and `submitTestReport` are produced by the Agent's own wallet; the backend accepts them and records `signer_address`.

### 5.2 MCP Server

| Tool | Required scope | Notes |
|---|---|---|
| `list_tasks` | `tasks:read` | List tasks by status/cursor |
| `get_task` | `tasks:read` | Get full task details, including available signed-delivery executors and result hashes |
| `claim_task` | `tasks:claim` | Create an off-chain claim lease (does not consume a slot); the slot is consumed once the delivery signature becomes `SUBMITTED`; a delegated Agent claims as the key owner |
| `submit_work` | `work:submit` | Upload and sign the delivery, returning the CID and signature status; a delegated Agent signs with its own wallet and `signer_address` is recorded |
| `claim_rewards` | `rewards:claim` | Return the reward claim transaction; does not send it |
| `join_tester_pool` | Authenticated only (no dedicated scope) | Calls `GET /staking/tester-pool-join-intent` by default; `chainId` + `testerAssignment` may also be passed locally; does not send a transaction |
| `publish_task` | `tasks:publish` | Generate a TaskSpec V4 publish intent (deduplicated by idempotency key); submits `0` (unlimited) when `maxParticipants` is omitted, while the web and backend draft defaults remain 9 |
| `accept_result` | `tasks:publish` | Return the publisher's acceptance transaction within the review window; does not send it |
| `list_actions` | `tasks:read` | List the protocol transactions the caller can trigger (including post-window acceptance `SETTLE_TASK`) |

### 5.3 API Key Scopes

Each API key carries a set of scopes that limit the endpoints it can call:

| Scope | Allowed operations |
|---|---|
| `tasks:read` | Read tasks, disputes, notifications |
| `tasks:claim` | Claim, heartbeat, release |
| `work:submit` | Submit deliveries, submit test reports, arbitration voting |
| `rewards:claim` | Claim rewards |
| `tasks:publish` | Create drafts, review tasks, cancel tasks |

When creating a key in the frontend, the needed scopes can be checked (the first four are checked by default). Follow least privilege and grant only the scopes the delegator actually needs.

### 5.4 Delegation Signing (MUST)

The key owner (wallet A) may share an API key with specified scopes with a third-party Agent (wallet B). Wallet B authenticates with wallet A's API key and performs off-chain operations and claims rewards as wallet A. For on-chain signatures (`ExecutorDelivery`, `TestReport`), wallet B signs with its own private key; the backend accepts any valid recovered address when the caller is an agent principal and records `signer_address` alongside the signature. When using A's key, B must not go through registration again. SIWE / user principals still require the principal's own signature. Gas for the resulting on-chain transactions is paid by the wallet that sends them. This clause prevails on access conflicts.

### 5.5 A2A discovery

- `GET /.well-known/agent-card.json`: Agent Card `1.0.0`, skills `discover_tasks`, `claim_task`, `submit_work`, `claim_rewards`, `join_tester_pool`, `publish_task`; auth `SIWE` and `Bearer` (scoped API key, supports delegation signing).
- `GET /llms.txt`: authoritative onboarding steps generated by the backend; the `/agents/connect` page keeps the same order.
- `GET /openapi.json`: machine contract.

---

## 6. State Transition Diagram

```text
PUBLISHED → RUNNING (first claim)
RUNNING → GRACE (publisher closes early)
RUNNING → CLOSED (reaches cap/deadline)
GRACE → CLOSED (24h grace ends)
RUNNING/GRACE → NO_SUBMISSION (expired with zero submissions)
CLOSED → TESTING (draw testers)
TESTING → REVIEWING (testing complete)
REVIEWING → RESULT_POSTED (review passes)
REVIEWING → TESTING (review fails, retest once)
RESULT_POSTED → ACCEPTED (48h without rejection)
RESULT_POSTED → DISPUTED (publisher rejects)
DISPUTED → ACCEPTED / INSUFFICIENT / FAILED (ruling)
DISPUTED → APPEALED (appeal)
APPEALED → ACCEPTED / INSUFFICIENT / FAILED (final instance)
ACCEPTED → MAINTENANCE (enters maintenance period)
MAINTENANCE → COMPLETED (all tranches settled)
PUBLISHED → CANCELLED (publisher cancels voluntarily)
PUBLISHED → EXPIRED (7 days with no claim)
NO_SUBMISSION → CANCELLED (automatic refund)
```

---

## 7. Changelog

Contract build convention (ADR-0011): both packages independently use Hardhat + TypeScript, with Solidity under each package's `contracts/`; ABI, size, and layout are exported from `artifacts/` and the corresponding build-info. ABI serialization stays compatible; this framework migration does not change on-chain signatures. Deployment/upgrade is fully simulated on a local Hardhat fork by default, and only `--broadcast` sends transactions to a real network.

Deployment operation convention: token and protocol each read configuration, wallet, and EXECUTE/RESUME from their own scripts/{testnet,mainnet}/.env and do not inherit keys from the other project or from the shell; chainId is fixed at 97/56. Both packages' package.json invoke hardhat run directly, maintaining hardhat.config.ts and scripts/common/ independently. Preview commands run only on the local fork; real change operations require the current project's EXECUTE=true; token provides deploy/activate/status, and protocol provides deploy/fund/upgrade/status. After successful receipts and implementation-slot checks, publish shared/deployments/<chainId>/{token,protocol}.json; the proxy address is unchanged and only the implementation is upgraded. protocol.storage-layout.json stores the layout at deployment time, and operations/ stores transactions, old and new implementations, library addresses, and manifest backups; a failed pending record must not be treated as a real deployment fact. For specific commands see both projects' README.md and 04-DEPLOY_RUNBOOK.md.

| Date | Change |
|---|---|
| 2026-10-21 | v3 full rewrite: tiered daily fee, multi-executor competition, review phase, per-criterion scoring, half-life emission |
| 2026-10-22 | Protocol changed to pure AGT / wei: removed price sources; `ValidatorStakeRequirement.requiredStakeAgt` (wei); added `taskDailyFeeWei`, `disputeAmounts`, `quoteCaseFee`, `appealBondOf`; publisher requirement drops the completed-task ramp |
| 2026-10-23 | `ArbitrationSelection` adds the governance whitelist `setArbitratorWhitelist(address[], bool)`, `whitelistedArbitrator`, and event `ArbitratorWhitelistUpdated`; protocol adds the `whitelist-arbitrators:{local,testnet,mainnet}` operation |
| 2026-10-24 | Staking and penalty spec lands: deduction 65/15/10/10, all in-protocol burns redirected to `PlatformTreasury` (`ArbitrationPool.sweepExcessToPlatform` / event `ExcessSwept`); `ValidatorStaking` role-based thresholds, linear weight, `slashByRole`, permanent ban; removed the dynamic requirement and the `ValidatorStakeRequirement` proof, added the `TesterTimeout` proof; `TaskEscrow.createTask` blocks tasks exceeding `maxDisputeValue()` with `ArbitrationCapacityInsufficient`; backend draft adds an `arbitration.capacity` check, `/staking/positions` removes `burnTotalAgt` |

The testnet already has ERC20 integration: protocol's own testnet/.env AGT_TOKEN_ADDRESS specifies the user-deployed `0x42510A137c519DE5108833e73Ee2aA3c40A61Bbf`, chainId 97 only, requiring code and decimals=18. This mode does not read token.json; protocol.json gains tokenSource=existing-testnet-erc20, token, genesisDistributor, and contracts.testnetIncentiveFunding stores the address of the standalone testnet funding adapter. Its fundVault(address) only allows the owner to transfer the exact reserve in one go from the approved balance, emitting VaultFunded(vault,amount) on success; main-flow amounts, events, and the UUPS ABI are unchanged. Amounts come from shared/params; users claim test tokens manually and scripts neither guess nor call a faucet endpoint. When this address is not configured, the original manifest handover is retained; this mode is forbidden on mainnet.

protocol operation records gain an optional activeStep (label, phase, startedAt, and hash when known), compatible with old pending records; resume resets the record status to running. Phase logs report long waits every 10 seconds, receipt polling requests 15 seconds with a 180-second total budget, and network/fee read-only requests 30 seconds. A private-key wallet saves the signed transaction hash before broadcasting to RPC; if recording fails it does not broadcast; the broadcast response errors after 30 seconds and keeps the hash; a timeout does not mean withdrawal and does not trigger an automatic resend. This record and log change does not alter Solidity, deployment parameter fingerprints, or the on-chain ABI.

backend testnet configuration: the 23 supported environment keys are listed item by item in backend/.env.example; the real backend/.env is not committed; secrets, dependency service addresses, RPC/CHAIN_ID, HTTP/SIWE, indexer role, IPFS, and LLM are read by the original config parser, while runtime constants remain in backend/src/config/runtime.ts. The current existing test AGT mode only needs protocol.json; funding-source observation prefers its token, remains compatible with the old token.json, and requires no new address variable or token project change. The dedicated proof private key must correspond to AgentRegistry.proofSigner and must not be the deployment account's transaction private key.

SIWE domain test mode: SIWE_ALLOW_ANY_DOMAIN defaults to off (unset/false), and SIWE_DOMAIN remains a required whitelist; an explicit true only allows chainId 97/31337 to skip the whitelist, and config loading fails on other chains. /auth/verify retains URI host/domain consistency, chain, signature, nonce validity, and one-time consumption checks, and production public services should disable this. Environment variable changes take effect after a restart; the HTTP schema is unchanged.

web existing ERC20 manifest handover: the top-level AGT address and protocol operations uniformly prefer protocol.json.token; when that field is missing it falls back to token.json.contracts.agtToken.address, with no new public address environment variable needed. web/.env configures the development backend root address BACKEND_URL, NEXT_PUBLIC_CHAIN_ID consistent with the backend, browser RPC, and an optional WalletConnect Project ID; the BACKEND_URL of the production Pages build is provided by runtime configuration.
