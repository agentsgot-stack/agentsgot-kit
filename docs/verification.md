# Current SDK/MCP verification log

## Skill 1.11.0: Agent-published tasks default to unlimited participants (2026-11-12)

- `pnpm run build:skills`: exit 0, wrote 5 files; `node scripts/build-skills.mjs --check`: exit 0, no drift.
- `npx vitest run`: exit 0, 13 files, 288 tests passed; `client.test.ts` asserts the draft field is `0` when `maxParticipants` is omitted and stays 5 when explicitly passed.
- `pnpm lint`: exit 0.
- `skills/dist` synced to web `public/skills/*/SKILL.md` and `public/.well-known/agent-skills.json` (1.11.0); backend and web publish logic unchanged; no backend connection, wallet or transactions.

## Official website v1.11.0 public documentation review (2026-11-12)

- Website snapshot time: `2026-11-12T08:59:54.273Z`; sources are `https://agentsgot.network/.well-known/agent-skills.json`, `https://agentsgot.network/llms.txt` and the corresponding role `SKILL.md` files. Skills list version `1.11.0`, SHA-256 `03f61a3c25d9354f7e5e55b23c43edaca44da97e694cde98038abcaa50689f00`.
- Executor source SHA-256: `6db1ec0738c8e1fbccde80ad1c698dd52f72fdde9b1561ac06c1e35b45b16d5a`; Tester source SHA-256: `aa6c22adab9420ae047d07a23ab95f0617c7cc406be5f08ff18d8e1349b68607`. Task filtering, seat descriptions and the Tester threshold were checked; on 2026-11-12 the project owner explicitly confirmed a minimum stake of **100,000 tAGT**.
- GitHub currently has `package.json` and `server.json` at `1.0.4`. This is not the website skills version; no npm or Registry publication was performed.
- Scope is 7 Markdown files: `README.md`, `skills/agentsgot-executor/SKILL.md`, `skills/templates/executor.md`, `skills/agentsgot-tester/SKILL.md`, `skills/templates/tester.md`, `docs/updates.md`, `docs/verification.md`. Existing body text, historical records, other parameter placeholders and safety confirmation rules are preserved.
- Verification method: read-only comparison of captured website text with the GitHub originals, checking textual differences item by item, committed through the GitHub web editor. No build, tests, lint, skills generator or install commands were run (exit codes: not applicable); no wallet, signing, staking or on-chain transactions; no code, license, contract or key changes.
- Known issues: the official `llms.txt` still has the old Tester 20,000 value and old API subdomain examples; do not copy them. The confirmed official API base URL is `https://agentsgot.network/api`. Opening the official Executor `SKILL.md` directly in a browser returns `net::ERR_BLOCKED_BY_CLIENT`; this review did not bypass it and used the traceable snapshot above.
- Documentation changes are not runtime parameter or package fixes. `vendor/shared`, the generator and published artifacts are unchanged; older packages and generated onboarding/schedules may still emit the old threshold; website and directory cache sync must be verified separately and is not automatically considered updated.

The records below are historical verification results by date; this change does not claim those commands were re-run.

## remote-mcp Worker testnet deployment (2026-11-09)

- `wrangler login`: `agentsgot@gmail.com` (Account `Agentsgot@gmail.com's Account`).
- `wrangler deploy`: Worker `agentsgot-mcp` is live.
  - Discovery: `https://agentsgot-mcp.agentsgot-remote-mcp.workers.dev/`
  - MCP: `https://agentsgot-mcp.agentsgot-remote-mcp.workers.dev/mcp`
  - `AGENTSGOT_API_BASE_URL=https://dev-agentgrid-api.openhub.network/api`
- Remote `GET /` (Cursor WebFetch) returned the expected JSON; local curl through the local proxy fails TLS (`--noproxy` still intermittent), so platform-side reachability is authoritative.
- During the skeleton phase a local `wrangler dev` smoke test passed (`initialize` / `get_role_guide`).

## remote-mcp Worker skeleton (2026-11-09)

- Added `remote-mcp/`: Cloudflare Workers + `createMcpHandler` (Streamable HTTP `/mcp`), read-only/guidance tools; Bearer `agt_…` calls the agentsgot API; no private keys hosted.
- `npm install` (independent npm in that directory, not the kit pnpm workspace): exit 0.
- Directory side: official Registry active; PulseMCP submission paused; Glama / SkillsMP / skills.pub still awaiting listing.

## Webhook read type sync (2026-11-07)

- `vendor/shared/types/api/index.d.ts` synced from backend `pnpm codegen:api`: `GetAgentWebhookResponse` adds `configured`, and `url` may be `null`.
- `pnpm typecheck`: exit 0; `npx vitest run`: exit 0, 13 files, 279 tests passed; `pnpm run check:independent`: exit 0, 90 source files.
- SDK/MCP do not call this endpoint, add no call entry points, and neither connect to the backend or wallet nor send transactions.

## Skill 1.5.0 risk control snippet (2026-11-04)

- `pnpm run build:skills`: exit 0; `node scripts/build-skills.mjs --check`: exit 0, 5 files with no drift.
- `npx vitest run`: exit 0, 13 files, 225 tests passed; `skills.test.ts` asserts each role contains "Risk control (MUST)" and the phishing link section.

## Delegation Signing rule and Skill 1.4.1 (2026-11-04)

- `pnpm run build:skills` → exit 0; `skills/dist` and web `public/skills` / `.well-known/agent-skills.json` are all **1.4.1**, and the executor SKILL contains `MUST — Delegation Signing`.
- Repo `.cursor/rules/delegation-signing.mdc` (`alwaysApply: true`) has been written into monorepo / kit / web / backend; each `AGENTS.md` has the top summary.

## Economy API type snapshot sync (2026-11-04)

- `vendor/shared/types/api/index.d.ts` synced from backend `pnpm codegen:api`.
- `pnpm typecheck` and `pnpm check:independent`: exit 0; the independent boundary check covers 87 source files.
- Added no SDK/MCP call entry points; neither connected to the backend or wallet nor sent transactions; nothing committed or pushed.

## Notification bulk read type sync (2026-11-03)

- `vendor/shared/types/api/index.d.ts` generated by backend `pnpm codegen:api`, adding `MarkAllNotificationsReadResponse` and the corresponding operation mapping.
- `pnpm typecheck` and `pnpm check:independent`: exit 0; the independent boundary check covers 87 source files, and `git diff --check` passes.
- Added no SDK/MCP call entry points; neither connected to the backend or wallet nor sent transactions.

## Dual claim capability and Skill 1.2.0 (2026-10-29)

- `pnpm typecheck`, `pnpm build:skills`: exit 0, generating 4 role Skills and 1 discovery manifest.
- `pnpm exec vitest run test/mcp.test.ts test/discovery-workers.test.ts`: exit 0, 2 files, 32 tests passed; covers the independent tool list, both batch limits and the Publisher exclusion boundary.
- `pnpm test` re-run exit 0, 11 files, 199 tests passed; `pnpm lint`, `pnpm check:skills`, `pnpm check:independent` all exit 0.
- API types and the EmissionController ABI snapshot are synced; no real backend, wallet or keeper connected, and no transactions broadcast.

## Daily mining claim Skills for the three emission roles (2026-10-28)

- Skill 1.1.0 splits coverage per the contracts' actual roles into Executor, Tester, Reviewer / Arbitrator, explicitly excluding the Publisher, which has no emission share; all three roles distinguish personal `EMISSION` from other `REWARD` and use only reward plans that are `CLAIMABLE` in the current wallet, at most 100 per batch. Protocol-level cumulative emission cannot serve as a personal claimable balance, and the Keeper does not claim on behalf of role wallets.
- `pnpm run build:skills`, `pnpm run check:skills`: exit 0; generated and verified 4 role Skills and the discovery manifest, 5 files in total. Executor / Tester / Arbitrator Skill SHA-256 are `0448569fa2aea4a7bcf4d1586a4bdf2b218cb6ff0fe06bdc51f3515d1c2ec6ea`, `a8bcf08c08b57691afe774b345d4f77784780bc5426e074535f009e4603954b3` and `0a754c17a16fd0ce767cca0dcd7c6fc2848036e99f9771796dfdf7a34879e9e8` respectively.
- `pnpm lint` first exited 1 because the newly added MCP tests did not match the format; after formatting per Biome's suggestion the re-run exited 0, and the final re-check again exited 0 with 34 files passing; `pnpm test`: exit 0, 11 test files, all 198 tests passed; `pnpm run check:independent`: exit 0, checking 82 source files.
- The API type snapshot syncs the reward source field `kind: REWARD | EMISSION`. This round did not modify contracts, the Keeper, backend state or wallet authorizations, and did not connect to remote services, broadcast transactions, commit or push.

## Task detail delivery voucher sync (2026-10-26)

- Synced `vendor/shared/types/api/index.d.ts` from the current backend, adding the optional `settlement.deliveries` to task detail and list types; the SDK adds `getTask(taskId)` and MCP adds `get_task`, returning the executor, result hash, status and submission time of signed deliveries.
- `pnpm exec biome check src/sdk/client.ts src/mcp/server.ts test/client.test.ts test/mcp.test.ts`: exit 0; `pnpm run typecheck`, `pnpm build`: exit 0.
- `pnpm exec vitest run test/client.test.ts test/mcp.test.ts`: exit 0, 2 files, 42 tests passed; `pnpm test`: exit 0, 8 files, 152 tests passed.
- `pnpm run check:independent`: exit 0, 60 source files; `git diff --check`: exit 0. No real backend connected, no remote MCP/Worker restart, no transactions broadcast, nothing committed or pushed.

## Current backend compatibility sync (2026-10-26)

- Synced the API type snapshot (task canClaimReason); fixed the loss of /api in the HTTP base URL; updated the spec declaration to V4, the V3/V4 compatibility list and the TaskSpec type; report requests carry submissionId. Preserved existing uncommitted doc changes and did not overwrite the real .env.
- `node node_modules/@biomejs/biome/bin/biome check --write src/index.ts src/ports.ts src/sdk/client.ts src/mcp/server.ts src/a2a.ts test/client.test.ts`: exit 0.
- `node node_modules/typescript/bin/tsc -p vendor/shared/tsconfig.json`, `node node_modules/typescript/bin/tsc -p vendor/shared/tsconfig.abi.json`, `node node_modules/typescript/bin/tsc -p tsconfig.json`: all exit 0, independent builds succeeded.
- `node node_modules/vitest/vitest.mjs run`: exit 0, 8 files, 150 tests passed (including shared rule/property tests), with new coverage for both base URL root-path and /api endings; report binding and V4 publish default slot assertions passed.
- `node scripts/check-independent.mjs`: exit 0, 60 source files; `git diff --check`: exit 0. No end-to-end verification against a real backend, no transactions broadcast, nothing committed or pushed.

Date 2026-10-24, code baseline 1d712de.

- Sequential TypeScript compilation of vendor/shared, ABI and tsconfig.json with this project: all exit 0.
- node node_modules/vitest/vitest.mjs run: exit 0, 8 files, 147 tests passed (including vendor/shared rule/property cases, not to be confused with the SDK's own cases).
- The current SDK has no deployment address directory or real contract snapshot record; after a new protocol release it must connect to the updated backend and must not reuse old task checkpoints.

## This round's cleanup and boundaries

With user confirmation that the old deployment is deprecated, deleted a total of 42 files — old manifests / layout copies / operations — under contracts/shared/deployments/97, backend/deployments/97 and web/deployments/97, along with old deployment dry-runs, restore/broadcast records, old doc archives and old package archives. Each release root keeps a README, awaiting the new manifest. Did not modify the real .env, private keys, Git history, or the 15 protocol/storage-layout source layouts; did not connect to servers, clear databases, migrate live state or broadcast transactions.

All four projects' check-independent exited 0 (contracts 177, backend 179, web 213, agent-kit 59 source files), and git diff --check exited 0 for all. params.json hashes are identical across the four; the 16 protocol ABI JSONs regenerated from the current Hardhat artifacts match the copies in backend/web/agent-kit item by item. This round needs no ABI or cross-project field changes.

This round changed no SDK business code, wallet keys or the real .env, and did not start a remote MCP/worker or sign real on-chain transactions.
