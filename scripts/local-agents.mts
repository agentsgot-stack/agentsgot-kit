/**
 * Autonomous local tester and arbitrator agents for Anvil (chain 31337).
 *
 * Each agent owns an HD wallet, registers through SIWE, stakes on chain and then only reacts to
 * protocol state: drawn testers review deliveries and sign reports; drawn jurors confirm, commit
 * and reveal votes; the first arbitrator also sends permissionless arbitration progress actions.
 *
 *   node scripts/local-agents.mts            bootstrap (idempotent) + run forever
 *   node scripts/local-agents.mts --setup    bootstrap only
 *
 * Local-only: AGT is provisioned once by impersonating the Anvil LP pair, which the chain allows
 * only on development nodes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  formatEther,
  type Hex,
  http,
  keccak256,
  parseAbi,
  parseEther,
  toBytes,
  toHex,
} from "viem";
import { type HDAccount, mnemonicToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { createSiweMessage } from "viem/siwe";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
// Reuse the backend's local LLM settings instead of duplicating the key; only LLM_* entries are read.
const llmEnvFile = resolve(root, process.env.AGENTGRID_LLM_ENV_FILE ?? "../agent-grid-backend/.env");
if (!process.env.LLM_API_KEY && existsSync(llmEnvFile))
  for (const line of readFileSync(llmEnvFile, "utf8").split(/\r?\n/u)) {
    const match = /^(LLM_(?:API_KEY|BASE_URL|MODEL))=(.*)$/u.exec(line.trim());
    if (match?.[1] && match[2] && !process.env[match[1]]) process.env[match[1]] = match[2];
  }

const BACKEND = (process.env.AGENTGRID_API_URL ?? "http://127.0.0.1:3001").replace(/\/$/u, "");
const RPC_URL = process.env.AGENTGRID_RPC_URL ?? "http://127.0.0.1:8545";
const DEPLOYMENT_DIR = resolve(
  root,
  process.env.AGENTGRID_DEPLOYMENT_DIR ?? "../agent-grid-backend/deployments/31337",
);
const MNEMONIC =
  process.env.AGENT_MNEMONIC ?? "test test test test test test test test test test test junk";
const TESTER_COUNT = Number(process.env.AGENT_TESTERS ?? 5);
const ARBITRATOR_COUNT = Number(process.env.AGENT_ARBITRATORS ?? 18);
const TESTER_STAKE = parseEther(process.env.AGENT_TESTER_STAKE ?? "50000");
const ARBITRATOR_STAKE = parseEther(process.env.AGENT_ARBITRATOR_STAKE ?? "1200000");
const POLL_MS = Number(process.env.AGENT_POLL_MS ?? 20_000);
const LLM_BASE_URL = (process.env.LLM_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/u, "");
const LLM_MODEL = process.env.LLM_MODEL ?? "deepseek-flash";
const LLM_API_KEY = process.env.LLM_API_KEY ?? "";
/** When the configured LLM is unreachable, fall back to a local heuristic so local agents still advance. */
const LLM_HEURISTIC_FALLBACK = (process.env.AGENT_LLM_FALLBACK ?? "1") !== "0";
const STATE_FILE = resolve(root, ".data/local-agents/state.json");

function formatError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts = [error.message];
  let cause: unknown = error.cause;
  for (let depth = 0; cause && depth < 4; depth += 1) {
    if (cause instanceof Error) {
      if (cause.message && !parts.includes(cause.message)) parts.push(cause.message);
      const code = (cause as NodeJS.ErrnoException).code;
      if (code) parts.push(String(code));
      cause = cause.cause;
      continue;
    }
    parts.push(String(cause));
    break;
  }
  return parts.join(" | ");
}
const MAX_FILE_CHARS = 40_000;
const MAX_EVIDENCE_CHARS = 120_000;
const SCOPES = ["tasks:read", "tasks:claim", "work:submit", "rewards:claim"];

const protocol = JSON.parse(readFileSync(resolve(DEPLOYMENT_DIR, "protocol.json"), "utf8"));
const tokenManifest = JSON.parse(readFileSync(resolve(DEPLOYMENT_DIR, "token.json"), "utf8"));
const AGT = protocol.token as Address;
const addressOf = (key: string) => protocol.contracts[key].address as Address;
const VALIDATOR_STAKING = addressOf("validatorStaking");
const TESTER_ASSIGNMENT = addressOf("testerAssignment");
const ARBITRATION_COURT = addressOf("arbitrationCourt");
const ARBITRATION_SELECTION = addressOf("arbitrationSelection");
const AGENT_REGISTRY = addressOf("agentRegistry");
const LP_PAIR = tokenManifest.market?.pair as Address | undefined;

const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
]);
const stakingAbi = parseAbi([
  "function deposit(uint256)",
  "function stakeOf(address) view returns (uint256)",
]);
const assignmentAbi = parseAbi(["function joinPool()", "function inPool(address) view returns (bool)"]);
const courtAbi = parseAbi(["function joinArbitrator()"]);
const selectionAbi = parseAbi([
  "function inPool(address) view returns (bool)",
  "function eligibleArbitratorCount() view returns (uint256)",
]);
const pairAbi = parseAbi(["function sync()"]);

const transport = http(RPC_URL);
const chain = createPublicClient({ chain: anvil, transport });

type Role = "tester" | "arbitrator";
type Agent = { role: Role; index: number; label: string; account: HDAccount; apiKey?: string };
type SavedVote = { salt: Hex; votes: { satisfied: boolean; reason: string }[] };
type State = {
  apiKeys: Record<string, string>;
  votes: Record<string, SavedVote>;
  done: Record<string, string>;
};

const state: State = existsSync(STATE_FILE)
  ? JSON.parse(readFileSync(STATE_FILE, "utf8"))
  : { apiKeys: {}, votes: {}, done: {} };
function saveState() {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function log(agent: Agent | string, message: string) {
  const label = typeof agent === "string" ? agent : agent.label;
  console.log(`${new Date().toISOString()} [${label}] ${message}`);
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function makeAgents(): Agent[] {
  const agents: Agent[] = [];
  for (let i = 0; i < TESTER_COUNT; i++)
    agents.push({
      role: "tester",
      index: i,
      label: `tester-${i}`,
      account: mnemonicToAccount(MNEMONIC, { addressIndex: 100 + i }),
    });
  for (let i = 0; i < ARBITRATOR_COUNT; i++)
    agents.push({
      role: "arbitrator",
      index: i,
      label: `arbitrator-${i}`,
      account: mnemonicToAccount(MNEMONIC, { addressIndex: 200 + i }),
    });
  return agents;
}

// ---------------------------------------------------------------------------
// Chain helpers
// ---------------------------------------------------------------------------

async function send(agent: Agent, tx: { to: Address; data: Hex }, what: string) {
  const wallet = createWalletClient({ account: agent.account, chain: anvil, transport });
  const hash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: 0n });
  const receipt = await chain.waitForTransactionReceipt({ hash });
  log(agent, `${what}: ${receipt.status} (${hash.slice(0, 10)}…, block ${receipt.blockNumber})`);
  if (receipt.status !== "success") throw new Error(`${what} reverted`);
  return hash;
}

async function write(
  agent: Agent,
  call: { address: Address; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] },
  what: string,
) {
  const wallet = createWalletClient({ account: agent.account, chain: anvil, transport });
  // biome-ignore lint/suspicious/noExplicitAny: viem's generic contract call signature
  const hash = await wallet.writeContract(call as any);
  const receipt = await chain.waitForTransactionReceipt({ hash });
  log(agent, `${what}: ${receipt.status}`);
  if (receipt.status !== "success") throw new Error(`${what} reverted`);
}

async function fundAgents(agents: Agent[]) {
  const funder = mnemonicToAccount(MNEMONIC, { addressIndex: 1 });
  const funderWallet = createWalletClient({ account: funder, chain: anvil, transport });
  for (const agent of agents) {
    const eth = await chain.getBalance({ address: agent.account.address });
    if (eth < parseEther("1")) {
      const hash = await funderWallet.sendTransaction({
        to: agent.account.address,
        value: parseEther("5"),
      });
      await chain.waitForTransactionReceipt({ hash });
    }
  }
  const shortfalls: { agent: Agent; amount: bigint }[] = [];
  for (const agent of agents) {
    const target = agent.role === "tester" ? TESTER_STAKE : ARBITRATOR_STAKE;
    const [staked, held] = await Promise.all([
      chain.readContract({
        address: VALIDATOR_STAKING,
        abi: stakingAbi,
        functionName: "stakeOf",
        args: [agent.account.address],
      }),
      chain.readContract({
        address: AGT,
        abi: erc20,
        functionName: "balanceOf",
        args: [agent.account.address],
      }),
    ]);
    // Transfers out of the pair pay the AGT trade fee, so gross the top-up up by 5%.
    if (staked + held < target) shortfalls.push({ agent, amount: ((target - staked - held) * 105n) / 100n });
  }
  if (!shortfalls.length) return;
  if (!LP_PAIR) throw new Error("token.json has no market.pair to provision AGT from");
  const total = shortfalls.reduce((sum, item) => sum + item.amount, 0n);
  log("setup", `provisioning ${formatEther(total)} AGT from LP pair ${LP_PAIR}`);
  await chain.request({ method: "anvil_impersonateAccount" as never, params: [LP_PAIR] as never });
  await chain.request({
    method: "anvil_setBalance" as never,
    params: [LP_PAIR, toHex(parseEther("10"))] as never,
  });
  const pairWallet = createWalletClient({ account: LP_PAIR, chain: anvil, transport });
  try {
    for (const { agent, amount } of shortfalls) {
      const hash = await pairWallet.writeContract({
        address: AGT,
        abi: erc20,
        functionName: "transfer",
        args: [agent.account.address, amount],
      });
      await chain.waitForTransactionReceipt({ hash });
    }
  } finally {
    await chain.request({
      method: "anvil_stopImpersonatingAccount" as never,
      params: [LP_PAIR] as never,
    });
  }
  const hash = await funderWallet.writeContract({ address: LP_PAIR, abi: pairAbi, functionName: "sync" });
  await chain.waitForTransactionReceipt({ hash });
}

async function stakeAndJoin(agent: Agent) {
  const me = agent.account.address;
  const target = agent.role === "tester" ? TESTER_STAKE : ARBITRATOR_STAKE;
  const staked = await chain.readContract({
    address: VALIDATOR_STAKING,
    abi: stakingAbi,
    functionName: "stakeOf",
    args: [me],
  });
  const held = await chain.readContract({ address: AGT, abi: erc20, functionName: "balanceOf", args: [me] });
  if (staked < target && held > 0n) {
    const amount = target - staked < held ? target - staked : held;
    await write(
      agent,
      { address: AGT, abi: erc20, functionName: "approve", args: [VALIDATOR_STAKING, amount] },
      "approve AGT",
    );
    await write(
      agent,
      { address: VALIDATOR_STAKING, abi: stakingAbi, functionName: "deposit", args: [amount] },
      `deposit ${formatEther(amount)} AGT`,
    );
  }
  if (agent.role === "tester") {
    const inPool = await chain.readContract({
      address: TESTER_ASSIGNMENT,
      abi: assignmentAbi,
      functionName: "inPool",
      args: [me],
    });
    if (!inPool)
      await write(agent, { address: TESTER_ASSIGNMENT, abi: assignmentAbi, functionName: "joinPool" }, "join tester pool");
  } else {
    const inPool = await chain.readContract({
      address: ARBITRATION_SELECTION,
      abi: selectionAbi,
      functionName: "inPool",
      args: [me],
    });
    if (!inPool)
      await write(agent, { address: ARBITRATION_COURT, abi: courtAbi, functionName: "joinArbitrator" }, "join arbitrator pool");
  }
}

// ---------------------------------------------------------------------------
// Backend helpers
// ---------------------------------------------------------------------------

class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function api<T>(
  path: string,
  init: { method?: string; token?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.idempotencyKey) headers["idempotency-key"] = init.idempotencyKey;
  const response = await fetch(`${BACKEND}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok)
    throw new ApiError(
      response.status,
      String(payload?.code ?? "HTTP_ERROR"),
      `${init.method ?? "GET"} ${path} -> ${response.status} ${payload?.code ?? ""} ${payload?.detail ?? ""}`,
    );
  return payload as T;
}

async function download(path: string, token: string) {
  const response = await fetch(`${BACKEND}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new ApiError(response.status, "DOWNLOAD_FAILED", `GET ${path} -> ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function ensureApiKey(agent: Agent) {
  const address = agent.account.address.toLowerCase();
  if (state.apiKeys[address]) {
    agent.apiKey = state.apiKeys[address];
    return;
  }
  const { nonce } = await api<{ nonce: string }>("/auth/nonce", { method: "POST" });
  const url = new URL(BACKEND);
  const message = createSiweMessage({
    address: agent.account.address,
    chainId: anvil.id,
    domain: url.host,
    nonce,
    uri: url.origin,
    version: "1",
    statement: "Sign in to AgentGrid",
    issuedAt: new Date(),
  });
  const signature = await agent.account.signMessage({ message });
  const session = await api<{ sessionToken: string }>("/auth/verify", {
    method: "POST",
    body: { message, signature },
  });
  try {
    const registered = await api<{ apiKey: { key: string } }>("/agents/register", {
      method: "POST",
      token: session.sessionToken,
    });
    agent.apiKey = registered.apiKey.key;
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "AGENT_ALREADY_REGISTERED") throw error;
    const created = await api<{ key: string }>(`/agents/${address}/keys`, {
      method: "POST",
      token: session.sessionToken,
      body: { name: `local-${agent.label}`, scopes: SCOPES },
    });
    agent.apiKey = created.key;
  }
  state.apiKeys[address] = agent.apiKey as string;
  saveState();
  log(agent, `registered ${address}`);
}

// ---------------------------------------------------------------------------
// LLM
// ---------------------------------------------------------------------------

async function askJson<T>(system: string, user: string): Promise<T> {
  if (!LLM_API_KEY) throw new Error("LLM_API_KEY is not set (agent-grid-backend/.env or AGENTGRID_LLM_ENV_FILE)");
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${LLM_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: LLM_MODEL,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!response.ok) throw new Error(`LLM_HTTP_${response.status}: ${(await response.text()).slice(0, 200)}`);
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = body.choices?.[0]?.message?.content ?? "";
      return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/gu, "")) as T;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(1_500 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function heuristicVerdict(spec: Specification, delivery: string): Verdict {
  const haystack = delivery.toLowerCase();
  const criteria = spec.criteria.map((criterion) => {
    const needles = [
      criterion.id,
      criterion.description.slice(0, 40),
      ...(typeof criterion.machineCheck === "object" &&
      criterion.machineCheck &&
      "expected" in criterion.machineCheck
        ? [String((criterion.machineCheck as { expected?: string }).expected ?? "")]
        : []),
    ]
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length >= 2);
    const passed =
      haystack.length >= 40 &&
      (needles.some((needle) => haystack.includes(needle)) ||
        criterion.description
          .split(/[\s,，。；;、/]+/u)
          .filter((token) => token.length >= 4)
          .slice(0, 3)
          .some((token) => haystack.includes(token.toLowerCase())));
    return {
      criterionId: criterion.id,
      passed,
      note: passed
        ? "Heuristic review: delivery appears to address this criterion (LLM unreachable)."
        : "Heuristic review: no clear evidence found for this criterion (LLM unreachable).",
    };
  });
  const passedWeight = spec.criteria.reduce(
    (sum, criterion, index) => sum + (criteria[index]?.passed ? criterion.weightBps : 0),
    0,
  );
  return {
    approved: passedWeight >= (spec.passingThreshold ?? 60) * 100,
    criteria,
    summary: "Local heuristic review used because the configured LLM endpoint was unreachable.",
  };
}

type Criterion = { id: string; description: string; grade: string; weightBps: number; machineCheck?: unknown };
type Specification = {
  title: string;
  summary: string;
  deliverables: string[];
  constraints: string[];
  outOfScope: string[];
  inputs: { kind: string; ref: string }[];
  criteria: Criterion[];
  passingThreshold?: number;
};

function specText(spec: Specification) {
  return JSON.stringify(
    {
      title: spec.title,
      summary: spec.summary,
      deliverables: spec.deliverables,
      constraints: spec.constraints,
      outOfScope: spec.outOfScope,
      inputs: spec.inputs,
      criteria: spec.criteria.map(({ id, description, grade, weightBps, machineCheck }) => ({
        id,
        description,
        grade,
        weightBps,
        machineCheck,
      })),
    },
    null,
    2,
  );
}

async function deliveryText(submissionId: string, token: string) {
  const submission = await api<{
    cidHash: Hex;
    manifest: { files: { name: string; size: number }[] };
  }>(`/submissions/${submissionId}`, { token });
  const parts: string[] = [];
  let used = 0;
  for (const [index, file] of submission.manifest.files.entries()) {
    const bytes = await download(`/submissions/${submissionId}/files/${index}`, token);
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = `[binary file, ${bytes.length} bytes, not inspectable as text]`;
    }
    const budget = Math.max(0, Math.min(MAX_FILE_CHARS, MAX_EVIDENCE_CHARS - used));
    const clipped = text.length > budget ? `${text.slice(0, budget)}\n[... truncated ...]` : text;
    used += clipped.length;
    parts.push(`### File ${index}: ${file.name} (${file.size} bytes)\n${clipped}`);
  }
  return { submission, text: parts.join("\n\n") || "[no files delivered]" };
}

// ---------------------------------------------------------------------------
// Tester behaviour
// ---------------------------------------------------------------------------

type Verdict = { approved: boolean; criteria: { criterionId: string; passed: boolean; note: string }[]; summary: string };

async function reviewDelivery(spec: Specification, delivery: string): Promise<Verdict> {
  try {
    const answer = await askJson<{
      criteria?: { criterionId?: string; passed?: boolean; note?: string }[];
      summary?: string;
    }>(
      "You are an independent AgentGrid tester. Judge the delivered files strictly against each acceptance criterion of the task specification. Do not assume content that is not in the delivery. Reply with JSON: {\"criteria\":[{\"criterionId\":string,\"passed\":boolean,\"note\":string}],\"summary\":string}. Use every criterion id exactly once. Notes and summary must be concise and written in the language of the specification.",
      `Task specification:\n${specText(spec)}\n\nDelivered files:\n${delivery}`,
    );
    const byId = new Map((answer.criteria ?? []).map((item) => [item.criterionId, item]));
    const criteria = spec.criteria.map((criterion) => {
      const item = byId.get(criterion.id);
      return {
        criterionId: criterion.id,
        passed: item?.passed === true,
        note: String(item?.note ?? "Not assessed by the model; treated as failed.").slice(0, 1_900),
      };
    });
    const passedWeight = spec.criteria.reduce(
      (sum, criterion, index) => sum + (criteria[index]?.passed ? criterion.weightBps : 0),
      0,
    );
    return {
      approved: passedWeight >= (spec.passingThreshold ?? 60) * 100,
      criteria,
      summary: String(answer.summary ?? "Review completed.").slice(0, 3_900) || "Review completed.",
    };
  } catch (error) {
    if (!LLM_HEURISTIC_FALLBACK) throw error;
    console.warn(`[llm] ${formatError(error)}; falling back to heuristic review`);
    return heuristicVerdict(spec, delivery);
  }
}

function conclusionsHash(verdict: Verdict): Hex {
  return keccak256(
    toBytes(
      JSON.stringify({
        approved: verdict.approved,
        criteria: verdict.criteria
          .map((item) => ({
            criterionId: item.criterionId.normalize("NFC").trim(),
            passed: item.passed,
            note: item.note.normalize("NFC").trim(),
          }))
          .sort((left, right) => left.criterionId.localeCompare(right.criterionId, "en")),
        summary: verdict.summary.normalize("NFC").trim(),
      }),
    ),
  );
}

type TaskResource = {
  taskId: Hex;
  status: string;
  executor: string | null;
  specification: Specification | null;
  viewer: {
    submission: { id: string } | null;
    testerSeats?: { submissionId: string; executor: Address; cidHash: Hex; reported: boolean }[];
  } | null;
};

async function testerTick(agent: Agent) {
  const token = agent.apiKey as string;
  const assigned = await api<{ items: { taskId: Hex }[] }>("/tasks?relation=tester&limit=50", { token });
  for (const { taskId } of assigned.items) {
    const task = await api<TaskResource>(`/tasks/${taskId}`, { token });
    if (!task.specification) continue;
    for (const seat of task.viewer?.testerSeats ?? []) {
      const doneKey = `report:${agent.account.address}:${seat.submissionId}`;
      if (seat.reported || state.done[doneKey]) continue;
      log(agent, `reviewing task ${taskId.slice(0, 10)}… submission ${seat.submissionId}`);
      const { text } = await deliveryText(seat.submissionId, token);
      const verdict = await reviewDelivery(task.specification, text);
      const signature = await agent.account.signTypedData({
        domain: { name: "AgentGrid Protocol", version: "1", chainId: anvil.id, verifyingContract: AGENT_REGISTRY },
        types: {
          TestReport: [
            { name: "taskId", type: "bytes32" },
            { name: "cidHash", type: "bytes32" },
            { name: "executor", type: "address" },
            { name: "conclusionsHash", type: "bytes32" },
            { name: "approved", type: "bool" },
          ],
        },
        primaryType: "TestReport",
        message: {
          taskId,
          cidHash: seat.cidHash,
          executor: seat.executor,
          conclusionsHash: conclusionsHash(verdict),
          approved: verdict.approved,
        },
      });
      try {
        await api(`/tasks/${taskId}/test-reports`, {
          method: "POST",
          token,
          idempotencyKey: `local-${agent.label}-${seat.submissionId}`,
          body: { submissionId: seat.submissionId, ...verdict, signature },
        });
        const passed = verdict.criteria.filter((item) => item.passed).length;
        log(agent, `report submitted: approved=${verdict.approved} (${passed}/${verdict.criteria.length} criteria)`);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
        log(agent, `report not accepted: ${error.code}`);
      }
      state.done[doneKey] = new Date().toISOString();
      saveState();
    }
  }
}

// ---------------------------------------------------------------------------
// Arbitrator behaviour
// ---------------------------------------------------------------------------

type Seat = { juror: string; finalRound: boolean; confirmed: boolean; committed: boolean; revealed: boolean };
type CaseItem = {
  caseId: Hex;
  taskId: Hex;
  publisher: string;
  executor: string;
  phase: string;
  finalRound: boolean;
  criteria: { id: Hex; weightBps: number }[];
  seats: Seat[];
  fallback: {
    phase: string;
    testers: { address: string; status: string }[];
  } | null;
};

async function caseEvidence(item: CaseItem, token: string) {
  const task = await api<TaskResource>(`/tasks/${item.taskId}`, { token });
  const spec = task.specification;
  if (!spec) throw new Error(`task ${item.taskId} has no specification`);
  const reviews = await api<{ items?: unknown[] }>(`/tasks/${item.taskId}/reviews`, { token }).catch(() => ({ items: [] }));
  const reports = await api<{ seats: { report: { submissionId: string; executor: string; approved: boolean; criteria: unknown; summary: string } | null }[] }>(
    `/tasks/${item.taskId}/test-reports`,
    { token },
  ).catch(() => ({ seats: [] }));
  const executorReports = reports.seats
    .map((seat) => seat.report)
    .filter((report): report is NonNullable<typeof report> => Boolean(report))
    .filter((report) => report.executor.toLowerCase() === item.executor.toLowerCase());
  const submissionId = executorReports[0]?.submissionId;
  const delivery = submissionId ? (await deliveryText(submissionId, token)).text : "[delivery not available to the juror]";
  return { spec, reviews: reviews.items ?? [], reports: executorReports, delivery };
}

async function decideVotes(item: CaseItem, token: string) {
  const evidence = await caseEvidence(item, token);
  const ordered = item.criteria.map((criterion) => {
    const match = evidence.spec.criteria.find((candidate) => keccak256(toBytes(candidate.id)) === criterion.id);
    return { hash: criterion.id, weightBps: criterion.weightBps, criterion: match };
  });
  try {
    const answer = await askJson<{ votes?: { criterionId?: string; satisfied?: boolean; reason?: string }[] }>(
      "You are an impartial AgentGrid juror. A publisher rejected an executor's delivery and the case is under arbitration. For every criterion decide whether the delivery satisfies it, using only the specification, the delivered files, tester reports and the publisher's review reasons. Reply with JSON: {\"votes\":[{\"criterionId\":string,\"satisfied\":boolean,\"reason\":string}]}. Use every criterion id exactly once and keep each reason under 600 characters, in the language of the specification.",
      [
        `Task specification:\n${specText(evidence.spec)}`,
        `Criteria under arbitration (ids): ${JSON.stringify(ordered.map((entry) => entry.criterion?.id ?? entry.hash))}`,
        `Publisher reviews:\n${JSON.stringify(evidence.reviews).slice(0, 8_000)}`,
        `Tester reports:\n${JSON.stringify(evidence.reports).slice(0, 12_000)}`,
        `Delivered files:\n${evidence.delivery}`,
      ].join("\n\n"),
    );
    const byId = new Map((answer.votes ?? []).map((vote) => [vote.criterionId, vote]));
    return ordered.map((entry) => {
      const vote = byId.get(entry.criterion?.id ?? entry.hash);
      return {
        satisfied: vote?.satisfied === true,
        reason:
          String(vote?.reason ?? "No assessment produced; treated as not satisfied.").trim().slice(0, 1_000) ||
          "n/a",
      };
    });
  } catch (error) {
    if (!LLM_HEURISTIC_FALLBACK) throw error;
    console.warn(`[llm] ${formatError(error)}; falling back to tester-majority heuristic votes`);
    return ordered.map((entry) => {
      const criterionId = entry.criterion?.id;
      const votes = evidence.reports.flatMap((report) => {
        const rows = Array.isArray(report.criteria) ? report.criteria : [];
        const hit = rows.find(
          (row) =>
            typeof row === "object" &&
            row &&
            "criterionId" in row &&
            String((row as { criterionId: string }).criterionId) === criterionId,
        ) as { passed?: boolean } | undefined;
        return hit ? [hit.passed === true] : [];
      });
      const yes = votes.filter(Boolean).length;
      const satisfied = votes.length === 0 ? evidence.reports.some((report) => report.approved) : yes * 2 >= votes.length;
      return {
        satisfied,
        reason: `Heuristic vote from ${votes.length || evidence.reports.length} tester report(s); LLM unreachable.`,
      };
    });
  }
}

async function jurorTick(agent: Agent) {
  const token = agent.apiKey as string;
  const me = agent.account.address.toLowerCase();
  const cases = await api<{ items: CaseItem[] }>("/arbitrator/cases?role=juror", { token });
  for (const item of cases.items) {
    const seat = item.seats.find((entry) => entry.juror.toLowerCase() === me && entry.finalRound === item.finalRound);
    if (!seat) continue;
    const voteKey = `${item.caseId}:${me}:${item.finalRound}`;
    if (item.phase === "CONFIRMING" && !seat.confirmed) {
      const intent = await api<{ tx: { to: Address; data: Hex } }>(`/disputes/${item.caseId}/confirm`, {
        method: "POST",
        token,
      }).catch((error) => {
        if (error instanceof ApiError && error.status === 409) return null;
        throw error;
      });
      if (intent) await send(agent, intent.tx, `confirm seat ${item.caseId.slice(0, 10)}…`);
    } else if (item.phase === "COMMIT" && seat.confirmed && !seat.committed) {
      let saved = state.votes[voteKey];
      if (!saved) {
        log(agent, `deliberating case ${item.caseId.slice(0, 10)}…`);
        saved = { salt: keccak256(crypto.getRandomValues(new Uint8Array(32))), votes: await decideVotes(item, token) };
        state.votes[voteKey] = saved;
        saveState();
      }
      const intent = await api<{ commitTx: { to: Address; data: Hex } }>(`/disputes/${item.caseId}/vote-intent`, {
        method: "POST",
        token,
        body: saved,
      });
      const yes = saved.votes.filter((vote) => vote.satisfied).length;
      await send(agent, intent.commitTx, `commit vote (${yes}/${saved.votes.length} satisfied)`);
    } else if (item.phase === "REVEAL" && seat.committed && !seat.revealed) {
      const saved = state.votes[voteKey];
      if (!saved) {
        log(agent, `cannot reveal ${item.caseId.slice(0, 10)}…: salt lost`);
        continue;
      }
      const intent = await api<{ revealTx: { to: Address; data: Hex } }>(`/disputes/${item.caseId}/vote-intent`, {
        method: "POST",
        token,
        body: saved,
      });
      await send(agent, intent.revealTx, `reveal vote ${item.caseId.slice(0, 10)}…`);
    }
  }
}

const ARBITRATION_ACTIONS = new Set([
  "DRAW_OR_RESEED",
  "ADVANCE_CONFIRMATION",
  "ADVANCE_COMMIT",
  "TALLY",
  "EXECUTE_RULING",
  "ADVANCE_ARBITRATION",
  "FINALIZE_FALLBACK_REVIEW",
  "REDRAW_FALLBACK_REVIEW",
  "TALLY_FALLBACK_REVIEW",
]);
const attempted = new Map<string, number>();

async function keeperTick(agent: Agent) {
  const actions = await api<{
    items: { action: string; subject: { kind: string; id: string }; calldata: { to: Address; data: Hex } }[];
  }>("/actions/available", { token: agent.apiKey });
  for (const action of actions.items) {
    if (action.subject.kind !== "ARBITRATION_CASE" || !ARBITRATION_ACTIONS.has(action.action)) continue;
    const key = `${action.action}:${action.subject.id}`;
    if (Date.now() - (attempted.get(key) ?? 0) < 60_000) continue;
    attempted.set(key, Date.now());
    await send(agent, action.calldata, `${action.action} ${action.subject.id.slice(0, 10)}…`).catch((error) =>
      log(agent, `${action.action} skipped: ${error instanceof Error ? error.message.split("\n")[0] : error}`),
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runLoop(agent: Agent) {
  let lastHeartbeat = 0;
  await sleep(Math.random() * POLL_MS);
  for (;;) {
    try {
      if (Date.now() - lastHeartbeat > 10 * 60_000) {
        await api("/agents/heartbeat", { method: "POST", token: agent.apiKey });
        lastHeartbeat = Date.now();
      }
      if (agent.role === "tester") await testerTick(agent);
      else {
        await jurorTick(agent);
        if (agent.index === 0) await keeperTick(agent);
      }
    } catch (error) {
      log(agent, `error: ${formatError(error)}`);
    }
    await sleep(agent.role === "tester" ? POLL_MS : POLL_MS * 1.5);
  }
}

const agents = makeAgents();
log("setup", `backend ${BACKEND}, rpc ${RPC_URL}, ${TESTER_COUNT} testers, ${ARBITRATOR_COUNT} arbitrators`);
await fundAgents(agents);
for (const agent of agents) {
  await stakeAndJoin(agent);
  await ensureApiKey(agent);
}
const eligible = await chain.readContract({
  address: ARBITRATION_SELECTION,
  abi: selectionAbi,
  functionName: "eligibleArbitratorCount",
});
log("setup", `ready: eligible arbitrators on chain = ${eligible}`);
for (const agent of agents) log(agent, agent.account.address);
if (!process.argv.includes("--setup")) await Promise.all(agents.map(runLoop));
