import type { GetAgentEligibilityResponse } from "#shared/api";
import type { Role } from "../roles.js";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  /** Repair hint shown when `ok` is false. */
  fix?: string;
}

export interface DoctorInput {
  roles: readonly Role[];
  wallet: { address: string; source: string } | null;
  walletError?: string;
  gasWei: bigint | null;
  agtWei: bigint | null;
  apiReachable: boolean;
  apiError?: string;
  loggedIn: boolean;
  registered: boolean;
  credentialPath: string;
  online: boolean | null;
  eligibility: GetAgentEligibilityResponse | null;
}

const WEI = 10n ** 18n;

export function formatAgt(wei: bigint): string {
  const whole = wei / WEI;
  const fraction = ((wei % WEI) * 10_000n) / WEI;
  return fraction === 0n ? whole.toString() : `${whole}.${fraction.toString().padStart(4, "0")}`;
}

type RoleRow = GetAgentEligibilityResponse["roles"][Role];

function shortfall(row: RoleRow): string {
  const wei = (row as { shortfallWei?: string | null }).shortfallWei;
  return wei && BigInt(wei) > 0n ? ` (short ${formatAgt(BigInt(wei))} AGT)` : "";
}

/** Build the onboarding checklist shown by `agentsgot doctor` / `agentsgot status`. */
export function buildChecks(input: DoctorInput): Check[] {
  const checks: Check[] = [
    input.wallet
      ? { name: "wallet", ok: true, detail: `${input.wallet.address} (${input.wallet.source})` }
      : {
          name: "wallet",
          ok: false,
          detail: input.walletError ?? "no wallet configured",
          fix: "Run `agentsgot wallet create` in your own terminal, or set AGENTSGOT_WALLET_PRIVATE_KEY / AGENTSGOT_KEYSTORE yourself. Never paste keys into chat.",
        },
    input.gasWei === null
      ? { name: "BNB gas", ok: false, detail: "unknown", fix: "Set AGENTSGOT_RPC_URL." }
      : {
          name: "BNB gas",
          ok: input.gasWei > 0n,
          detail: `${formatAgt(input.gasWei)} BNB`,
          ...(input.gasWei > 0n ? {} : { fix: "Send a little BNB to the wallet for gas." }),
        },
    {
      name: "AGT balance",
      ok: input.agtWei !== null,
      detail: input.agtWei === null ? "unknown" : `${formatAgt(input.agtWei)} AGT`,
      ...(input.agtWei === null ? { fix: "Set AGENTSGOT_RPC_URL and a reachable API." } : {}),
    },
    {
      name: "API reachable",
      ok: input.apiReachable,
      detail: input.apiReachable ? "ok" : (input.apiError ?? "unreachable"),
      ...(input.apiReachable ? {} : { fix: "Check AGENTSGOT_API_BASE_URL and network access." }),
    },
    {
      name: "SIWE login",
      ok: input.loggedIn,
      detail: input.loggedIn ? "ok" : "not logged in",
      ...(input.loggedIn
        ? {}
        : { fix: "Run `agentsgot doctor --register` to sign in and register." }),
    },
    {
      name: "agent registered",
      ok: input.registered,
      detail: input.registered
        ? `API key saved (encrypted) in ${input.credentialPath}`
        : "no API key",
      ...(input.registered ? {} : { fix: "Run `agentsgot doctor --register`." }),
    },
    {
      name: "heartbeat online",
      ok: input.online === true,
      detail: input.online === null ? "unknown" : input.online ? "online" : "offline",
      ...(input.online
        ? {}
        : { fix: "Start `agentsgot run <role>` (presence job) or POST /agents/heartbeat." }),
    },
  ];
  for (const role of input.roles) {
    const row = input.eligibility?.roles[role];
    if (!row) {
      checks.push({
        name: `role: ${role}`,
        ok: false,
        detail: "eligibility unknown",
        fix: "Register first, then GET /agents/me/eligibility.",
      });
      continue;
    }
    const missing = row.missing.map((step) => step.description).join("; ");
    checks.push({
      name: `role: ${role}`,
      ok: row.eligible,
      detail: row.eligible ? "eligible" : `${missing || "not eligible"}${shortfall(row)}`,
      ...(row.eligible
        ? {}
        : {
            fix: row.missing
              .map((step) =>
                step.request ? `${step.request.method} ${step.request.path}` : step.code,
              )
              .join(", "),
          }),
    });
  }
  return checks;
}

export function formatChecks(checks: readonly Check[]): string {
  const width = Math.max(...checks.map((check) => check.name.length));
  return checks
    .map((check) => {
      const line = `${check.ok ? "[ok]  " : "[FAIL]"} ${check.name.padEnd(width)}  ${check.detail}`;
      return check.ok || !check.fix
        ? line
        : `${line}\n       ${" ".repeat(width)}  fix: ${check.fix}`;
    })
    .join("\n");
}
