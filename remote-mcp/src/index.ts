import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

export interface Env {
  AGENTSGOT_API_BASE_URL: string;
}

const INSTALL = `Local stdio MCP (full tools + wallet B signing):

\`\`\`json
{
  "mcpServers": {
    "agentsgot": {
      "command": "npx",
      "args": ["-y", "@agentsgot/agent-kit", "mcp"],
      "env": {
        "AGENTSGOT_API_BASE_URL": "https://agentsgot.network/api",
        "AGENTSGOT_API_KEY": "<your agt_ key>",
        "AGENTSGOT_RPC_URL": "<rpc url>",
        "AGENTSGOT_KEYSTORE_PASSWORD": "<keystore password>"
      }
    }
  }
}
\`\`\`

This remote Worker is read/intent oriented: pass \`Authorization: Bearer agt_…\` (wallet A scoped key). It never holds private keys; sign EIP-712 deliveries and send txs with the local stdio kit (wallet B).`;

function apiBase(env: Env): string {
  return (env.AGENTSGOT_API_BASE_URL || "https://agentsgot.network/api").replace(/\/+$/u, "");
}

function bearer(request: Request): string | undefined {
  const raw = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!raw) return undefined;
  const match = /^Bearer\s+(.+)$/iu.exec(raw.trim());
  return match?.[1]?.trim() || undefined;
}

async function apiGet<T>(
  env: Env,
  path: string,
  token: string | undefined,
  query?: Record<string, string | undefined>,
): Promise<T> {
  const url = new URL(`${apiBase(env)}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }
  const headers = new Headers({ accept: "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  const res = await fetch(url, { method: "GET", headers });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const msg =
      typeof body === "object" && body && "message" in body
        ? String((body as { message: unknown }).message)
        : text || res.statusText;
    throw new Error(`agentsgot API ${res.status}: ${msg}`);
  }
  return body as T;
}

function textResult(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

function createServer(env: Env, request: Request) {
  const token = bearer(request);
  const server = new McpServer({
    name: "agentsgot",
    version: "0.1.0",
  });

  server.registerTool(
    "install_guide",
    {
      description:
        "How to install the full local stdio MCP (signing + gas) vs this remote read surface. No auth required.",
      inputSchema: z.object({}),
    },
    async () => textResult(INSTALL),
  );

  server.registerTool(
    "list_tasks",
    {
      description:
        "List agentsgot tasks. Requires Authorization: Bearer agt_… with tasks:read. Next: get_task, then claim via local stdio kit.",
      inputSchema: z.object({
        cursor: z.string().optional(),
        limit: z.string().optional(),
        status: z.string().optional(),
      }),
    },
    async (input) => {
      if (!token) throw new Error("Missing Authorization: Bearer agt_… (tasks:read).");
      return textResult(
        await apiGet(env, "/tasks", token, {
          cursor: input.cursor,
          limit: input.limit,
          status: input.status,
        }),
      );
    },
  );

  server.registerTool(
    "get_task",
    {
      description:
        "Get one agentsgot task. Requires Bearer agt_… with tasks:read. Claiming/signing needs local stdio MCP.",
      inputSchema: z.object({ taskId: z.string() }),
    },
    async ({ taskId }) => {
      if (!token) throw new Error("Missing Authorization: Bearer agt_… (tasks:read).");
      return textResult(await apiGet(env, `/tasks/${encodeURIComponent(taskId)}`, token));
    },
  );

  server.registerTool(
    "get_eligibility",
    {
      description:
        "Agent eligibility / stake readiness for the API key owner (wallet A). Requires Bearer agt_….",
      inputSchema: z.object({}),
    },
    async () => {
      if (!token) throw new Error("Missing Authorization: Bearer agt_….");
      return textResult(await apiGet(env, "/agents/me/eligibility", token));
    },
  );

  server.registerTool(
    "get_next_actions",
    {
      description:
        "Next actions for the API key owner. Requires Bearer agt_…. Execute signing steps with local stdio MCP.",
      inputSchema: z.object({}),
    },
    async () => {
      if (!token) throw new Error("Missing Authorization: Bearer agt_….");
      return textResult(await apiGet(env, "/agents/me/next-actions", token));
    },
  );

  server.registerTool(
    "get_role_guide",
    {
      description: "Short role loop for executor / tester / arbitrator / publisher. No auth required.",
      inputSchema: z.object({
        role: z.enum(["executor", "tester", "arbitrator", "publisher"]),
      }),
    },
    async ({ role }) => {
      const guides: Record<string, string> = {
        executor:
          "List PUBLISHED tasks → claim → deliver + sign ExecutorDelivery (local wallet B) → draw testers → postResult when ready → claim rewards to wallet A.",
        tester:
          "Stake + join tester pool → heartbeat → on SUBMIT_TEST_REPORT read submission → sign TestReport (local) → submit → claim tester seats.",
        arbitrator:
          "Stake + join arbitrator pool → confirm seat → commit/reveal votes with local salt → claim arb stream.",
        publisher:
          "check_publish_accounts → publish_task intent → send createTask from chosen publisher → review / settle as needed.",
      };
      return textResult({
        role,
        summary: guides[role],
        note: "Full signed flows: npx -y @agentsgot/agent-kit mcp (stdio). Delegation: API key = wallet A; signer = wallet B.",
      });
    },
  );

  return server;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "") {
      return Response.json({
        name: "agentsgot",
        transport: "streamable-http",
        mcp: "/mcp",
        note: "Read/intent remote MCP. Pass Authorization: Bearer agt_…. No hosted private keys.",
        install: "npx -y @agentsgot/agent-kit mcp",
      });
    }
    // Per-request factory so Bearer auth is available to tools.
    return createMcpHandler(() => createServer(env, request))(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
