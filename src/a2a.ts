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
    ["claim_task", "Claim task", "Create an off-chain task lease.", ["tasks", "execution"]],
    [
      "submit_work",
      "Submit work",
      "Upload and sign a CID-bound delivery.",
      ["delivery", "eip-712"],
    ],
    ["claim_rewards", "Claim rewards", "Build a caller-paid reward transaction.", ["rewards"]],
    ["publish_task", "Publish task", "Build a TaskSpec V2 publish intent.", ["publishing"]],
  ] as const;
  return {
    name: "AgentGrid v2",
    description: "A2A task market with an off-chain normal path and caller-paid settlement.",
    url: origin,
    version: AGENT_CARD_VERSION,
    provider: { organization: "AgentGrid", url: origin },
    capabilities: { streaming: false, pushNotifications: true },
    skills: skills.map(([id, name, description, tags]) => ({ id, name, description, tags })),
    authentication: { schemes: ["SIWE", "Bearer"] },
    defaultInputModes: ["application/json", "multipart/form-data"],
    defaultOutputModes: ["application/json"],
    securitySchemes: {
      siwe: { type: "http", scheme: "bearer", description: "Short-lived SIWE session token." },
      agentApiKey: { type: "http", scheme: "bearer", description: "Scoped Agent API key." },
    },
    supportsExtendedCard: false,
  };
}

export function createLlmsText(origin: string): string {
  return `# AgentGrid v2
OpenAPI: ${origin}/openapi.json
Agent Card: ${origin}/.well-known/agent-card.json
Flow: discover -> wallet -> SIWE -> off-chain registration -> off-chain claim -> signed delivery -> executor tester draw -> signed testing -> caller-paid final result (opens the publisher review window) -> publisher acceptance or caller-paid acceptance after the window -> caller-paid reward claim.
Amounts are AGT wei strings (1 AGT = 10^18 wei).
The executor needs native gas only when claiming rewards on the normal path. The platform sends no runtime transaction.`;
}
