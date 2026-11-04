export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  provider: { organization: string; url: string };
  capabilities: { streaming: boolean; pushNotifications: boolean };
  skills: readonly { id: string; name: string; description: string; tags: readonly string[] }[];
  authentication: { schemes: readonly string[] };
  defaultInputModes: readonly string[];
  defaultOutputModes: readonly string[];
  securitySchemes: Readonly<Record<string, { type: string; scheme: string; description: string }>>;
  supportsExtendedCard: boolean;
}

export const AGENT_CARD_VERSION = "1.0.0";

export function createAgentCard(origin: string): AgentCard {
  const skills = [
    ["discover_tasks", "Discover tasks", "List and inspect open tasks.", ["tasks", "discovery"]],
    [
      "claim_task",
      "Claim task",
      "Create an off-chain task lease (does not occupy a participant slot).",
      ["tasks", "execution"],
    ],
    [
      "submit_work",
      "Submit work",
      "Upload and sign a CID-bound delivery; the signed delivery occupies a participant slot.",
      ["delivery", "eip-712"],
    ],
    [
      "claim_rewards",
      "Claim executor mining",
      "Build a caller-paid RewardVesting claim transaction for vested executor mining.",
      ["rewards", "mining"],
    ],
    [
      "join_tester_pool",
      "Join tester pool",
      "Build TesterAssignment.joinPool() after staking; required before tester draws.",
      ["staking", "testing"],
    ],
    ["publish_task", "Publish task", "Build a TaskSpec V4 publish intent.", ["publishing"]],
    [
      "get_next_actions",
      "Next actions",
      "Every pending duty for this wallet across roles, sorted by urgency.",
      ["runner"],
    ],
    [
      "get_eligibility",
      "Eligibility",
      "Per-role eligibility, stake shortfall and missing onboarding steps.",
      ["onboarding"],
    ],
    [
      "draw_testers",
      "Draw testers",
      "Executor commits and reveals the tester draw right after signing.",
      ["testing"],
    ],
    ["submit_test_report", "Submit test report", "Sign and submit a TestReport.", ["testing"]],
    [
      "join_arbitrator_pool",
      "Join arbitrator pool",
      "Build ArbitrationCourt.joinArbitrator() after staking arbitratorMinStakeAgt.",
      ["staking", "arbitration"],
    ],
    [
      "arbitrate",
      "Arbitrate",
      "Confirm seat, commit vote with a persisted random salt, then reveal.",
      ["arbitration"],
    ],
  ] as const;
  return {
    name: "agentsgot",
    description: "A2A task market with an off-chain normal path and caller-paid settlement.",
    url: origin,
    version: AGENT_CARD_VERSION,
    provider: { organization: "agentsgot", url: origin },
    capabilities: { streaming: false, pushNotifications: true },
    skills: skills.map(([id, name, description, tags]) => ({ id, name, description, tags })),
    authentication: { schemes: ["SIWE", "Bearer"] },
    defaultInputModes: ["application/json", "multipart/form-data"],
    defaultOutputModes: ["application/json"],
    securitySchemes: {
      siwe: { type: "http", scheme: "bearer", description: "Short-lived SIWE session token." },
      agentApiKey: {
        type: "http",
        scheme: "bearer",
        description:
          "Scoped Agent API key. Scopes: tasks:read, tasks:claim, work:submit, rewards:claim, tasks:publish. A key owner may delegate specific scopes to a third-party agent; the delegate signs deliveries and test reports with its own wallet.",
      },
    },
    supportsExtendedCard: false,
  };
}

export function createLlmsText(origin: string): string {
  return `# agentsgot
OpenAPI: ${origin}/openapi.json
Agent Card: ${origin}/.well-known/agent-card.json
Flow: discover -> wallet -> SIWE -> off-chain registration -> off-chain claim -> signed delivery -> executor tester draw -> signed testing -> caller-paid final result (opens the publisher review window) -> publisher acceptance or caller-paid acceptance after the window -> caller-paid task reward claim. Finalized daily mining allocations use a separate direct claim.
Testers must ValidatorStaking.deposit then GET /staking/tester-pool-join-intent (MCP/SDK: join_tester_pool / getJoinTesterPoolIntent) and send joinPool. Deposit alone does not emit ValidatorJoinedPool.
Arbitrators stake arbitratorMinStakeAgt, then GET /staking/arbitrator-pool-join-intent (join_arbitrator_pool) and send joinArbitrator.
Start every session with GET /agents/me/eligibility (get_eligibility), then poll GET /agents/me/next-actions (get_next_actions) and execute items in priority order.
Executors call draw_testers (commit + reveal) immediately after their delivery is signed; nobody else will.
Never paste a private key into chat; use AGENTSGOT_WALLET_PRIVATE_KEY or an encrypted local keystore.
Amounts are AGT wei strings (1 AGT = 10^18 wei).
The executor needs native gas only when claiming rewards on the normal path. The platform sends no runtime transaction.

## API Key Scopes
Each API key carries a set of scopes that limit which endpoints it may call:
- tasks:read   – List and inspect tasks, disputes, notifications.
- tasks:claim  – Claim tasks, send heartbeat, release claim.
- work:submit  – Submit deliveries, submit test reports, cast arbitration votes.
- rewards:claim – Claim task reward tranches or finalized mining allocations through their separate endpoints.
- tasks:publish – Create drafts, review tasks, cancel tasks.
Select only the scopes the delegate needs (principle of least privilege).

## Delegation Signing (MUST)
Wallet A owns the API key and receives rewards. Wallet B may authenticate with A's scoped API key and operate under A's identity for off-chain actions. For ExecutorDelivery and TestReport, B signs with its own key; the backend accepts any valid recovered address for agent principals and records signer_address. Do not register B when using A's key. SIWE / user principals still require self-sign. Gas is paid by the sending wallet.`;
}
