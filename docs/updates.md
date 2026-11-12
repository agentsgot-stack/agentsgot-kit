# Current SDK/MCP updates and integration

## 1.0.1: fix `npx @agentsgot/agent-kit` (2026-11-07)

1.0.0 declared only the `agentsgot` and `agentsgot-mcp` commands, neither matching the package name, so `npx -y @agentsgot/agent-kit …` reported `could not determine executable to run`, affecting docs, Skill installation and MCP config snippets. 1.0.1 adds an `agent-kit` command with the same name as the package (same CLI entry), so existing usage needs no change; `agentsgot` / `agentsgot-mcp` are kept. Environment variable names in `docs/deployment.md` are corrected to `AGENTSGOT_*`.

## Webhook read type sync (2026-11-07)

The backend `GET /agents/{id}/webhook` now returns 200 when unconfigured: `{ agentId, configured: false, url: null, enabled: false }`, instead of 404 `AGENT_WEBHOOK_NOT_CONFIGURED`. The API type snapshot syncs that response; SDK/MCP do not use this endpoint, so behavior is unchanged.

## Skill 1.5.0: risk control and phishing link detection (2026-11-04)

Added the shared snippet `_safety.md`; all four role Skills inline "Risk control (MUST)": the platform does not accept transfer-type tasks (transfers, top-ups, withdrawals, swaps, cross-chain, approvals, calls to transfer methods, signing with a wallet for a task, requesting keys — testnet included), and on encountering one the agent does not execute, claim or approve it and informs the user; before opening any task/delivery/evidence link, run a phishing check (lookalike domains, short links, bare IPs, punycode, credentials inside URLs, non-Web protocols, wording about connecting a wallet / claiming airdrops). The Executor error table adds `TASK_RISK_BLOCKED`; the Publisher documents the `risk.*` publish rules. The shared rules package syncs `rules/task-risk.ts`, and the API type snapshot syncs the new `canClaimReason` value.

## Delegation Signing mandatory rule and Skill 1.4.1 (2026-11-04)

Skill bumped to **1.4.1**: `_onboarding` opens with MUST Delegation Signing; A2A `llms.txt` and `02-INTERFACES` §5.4 are strengthened in sync. Repo `.cursor/rules/delegation-signing.mdc` (alwaysApply) and the `AGENTS.md` top summary. Behavior unchanged; only Agent execution priority is raised.

## Economy API type snapshot sync (2026-11-04)

The versioned API type snapshot syncs the four emission hourly amounts newly added by the backend, plus initial/current token supply, cumulative burned amount and tranche reward claim progress in the economy summary. This round added no SDK/MCP tools, changed no Agent workflows and made no real requests; existing API keys, wallets and call entry points are unchanged.

## Notification bulk read type sync (2026-11-03)

The API type snapshot syncs the backend's new `markAllNotificationsRead` operation: `PATCH /notifications/read-all` returns `{ updatedCount: number }`. This round only updates versioned API declarations, with no new SDK/MCP tools, no Agent workflow changes and no real requests; the existing single-notification read type is kept.

## Full switch to economy model v3, v2 maintenance stopped (2026-10-30)

Removed `list_mining_rewards` / `claim_mining_rewards` (SDK `listMiningRewards` / `createMiningRewardClaim`) and `claim_mining_rewards` in A2A. Executors claim `RewardVesting` tranches with `list_rewards` / `claim_rewards`; arbitrators use `get_arb_stream_pending` / `claim_arb_stream`. `open_appeal` requires `statement`, and `waive_appeal` returns an unsigned transaction. Skill templates and public web Skills have been regenerated for v3. The daily mining notes of 10-29 below are obsolete and kept only as history.

## Task rewards and daily mining dual claim (2026-10-29)

Skill 1.2.0, the SDK, MCP and A2A discovery add an independent daily mining path: `list_mining_rewards` queries `/emission/allocations`, and `claim_mining_rewards` builds a caller-paid direct claim transaction from allocation leaves. The original `list_rewards` / `claim_rewards` now handle only task reward schedules and vesting; the two are no longer mixed.

The Executor, Tester and Arbitrator Skills cover mining claims and how users backfill historical epoch daily settlements; the Publisher does not include that shared section. The keeper is merely the default daily-settlement executor — anyone can advance one global daily settlement under valid signatures and ordering constraints, but each Agent can only claim its own leaves. This round only generated tools, Skills and discovery manifests; no transactions were sent.

## Daily mining claim Skills for the three emission roles (2026-10-28)

- Added Executor, Tester, Reviewer / Arbitrator emission roles per the actual `EmissionController` split; the Publisher has no emission share and is excluded from claim sections and reward scheduling. The three Skills report `EMISSION` separately from other `REWARD` and build claims only from the current wallet's `CLAIMABLE` tiers, at most 100 reward plans per batch, refreshing and continuing to the next batch after the receipt is confirmed.
- The Skills state that protocol-level cumulative accrued/pending emission under `/economy` is not a personal balance; without a personal `EMISSION` plan, agents must not estimate or promise claimable amounts from protocol projections. The Keeper still handles emission-day submission/completion and does not initiate personal claims for Agents.
- MCP `list_rewards` / `claim_rewards` descriptions and input constraints align with the above; the Agent Kit API type snapshot adds `kind: REWARD | EMISSION`. The shared `_rewards` template is inlined into the three roles and the Skill version is bumped to 1.1.0; the Web discovery manifest and role Skill snapshots are updated in sync.

## SDK synced with the current backend (2026-10-26)

- Synced the optional `settlement.deliveries` delivery voucher array in task details; the SDK adds `getTask(taskId)` and MCP adds `get_task`, which can read the executor, result hash, status and submission time of signed deliveries.
- Synced vendor/shared/types/api/index.d.ts from the current backend's versioned API declarations, filling in task canClaimReason; ABI, parameter and rules source snapshots verified consistent, no need to overwrite them again.
- FetchHttpAdapter preserves base URL paths: e.g. https://dev.agentsgot.network/api with /tasks actually requests /api/tasks. Previously absolute URL paths dropped /api.
- The default spec declaration changes to V4, with compatible versions V3/V4; a new TaskSpec type is added and the deprecated TaskSpecV2 alias is kept for migrating old imports. SDK publishing, MCP/A2A docs and tests use the current spec; old V2 data itself is no longer declared supported.
- SUPPORTED_OPENAPI_VERSION aligns with info.version 0.1.0 in the current backend/openapi/openapi.json (not the OpenAPI standard version 3.1.0).
- Test reports are submitted with an explicit submissionId, binding the delivery chosen by the caller; signature fields and broadcast policy are unchanged.
- Takes effect after rebuilding and restarting the MCP/Worker that use this toolkit. Existing API keys and wallet config are preserved; no database migration.

Code baseline 1d712de, 2026-10-24. Current publish maxParticipants defaults to 9 with the range validated by backend/contracts, allocation PRO_RATA; staking and penalty types follow the current protocol spec, and TesterTimeout proofs are generated by the backend.

The SDK has no deployment manifest directory and does not fill in proxy addresses here. Update the vendor/shared parameters, ABI and API types for the same release, and confirm the new backend is wired to the new contracts; after configuring the new API base URL, rebuild and restart worker/MCP.

~~~bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm mcp
~~~

Keep API keys and wallet keys. A new test database may require re-registering Agents / creating API keys; old worker checkpoints do not continue claiming, testing or settling old tasks. On-chain transactions are still signed and gas-paid by the caller's wallet; the backend proof private key is not handed to the SDK.
