import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it } from "vitest";
import { planApiKeyBinding } from "../src/cli/binding.js";
import { parseRoles } from "../src/cli/commands.js";
import { buildChecks, formatAgt, formatChecks } from "../src/cli/doctor.js";
import { agentHome, homePaths, loadCredential, saveCredential } from "../src/cli/home.js";
import { main, USAGE } from "../src/cli/index.js";
import { isTarget, mcpSnippet, skillDir } from "../src/cli/install.js";
import { decryptKeystore, encryptKeystore } from "../src/cli/keystore.js";
import { formatReport, parseDuration, sanitize, summarize } from "../src/cli/reports.js";
import { createWallet, describeWallet, loadPrivateKey } from "../src/cli/wallet.js";

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempHome() {
  const dir = mkdtempSync(join(tmpdir(), "agentsgot-"));
  temps.push(dir);
  return dir;
}

describe("cli helpers", () => {
  it("parses roles and rejects unknowns", () => {
    expect(parseRoles("executor,tester")).toEqual(["executor", "tester"]);
    expect(() => parseRoles("hacker")).toThrow(/Unknown role/);
  });

  it("parses durations", () => {
    expect(parseDuration("30m")).toBe(30 * 60_000);
    expect(parseDuration("24h")).toBe(24 * 3_600_000);
    expect(() => parseDuration("x")).toThrow(/Invalid duration/);
  });

  it("sanitizes private keys, API keys and mnemonics", () => {
    const key = `0x${"ab".repeat(32)}`;
    expect(
      sanitize(
        `pk=${key} agt_abcdefghi mnemonic=abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about`,
      ),
    ).not.toMatch(/0x[0-9a-f]{64}|agt_|abandon/u);
  });

  it("formats AGT wei", () => {
    expect(formatAgt(0n)).toBe("0");
    expect(formatAgt(10n ** 18n)).toBe("1");
    expect(formatAgt(15n * 10n ** 17n)).toBe("1.5000");
  });

  it("builds a failing checklist with fix hints", () => {
    const checks = buildChecks({
      roles: ["executor"],
      wallet: null,
      gasWei: null,
      agtWei: null,
      apiReachable: false,
      apiError: "offline",
      loggedIn: false,
      registered: false,
      credentialPath: "/tmp/c.json",
      online: null,
      eligibility: null,
    });
    const text = formatChecks(checks);
    expect(text).toMatch(/\[FAIL\].*wallet/u);
    expect(text).toMatch(/fix:/u);
  });

  it("explains an already registered wallet instead of telling the user to register again", () => {
    const hint = "This wallet is already registered. Do not register it again.";
    const text = formatChecks(
      buildChecks({
        roles: ["executor"],
        wallet: { address: "0xabc", source: "env" },
        gasWei: 1n,
        agtWei: 1n,
        apiReachable: true,
        loggedIn: false,
        loginFix: hint,
        registered: false,
        registeredFix: hint,
        credentialPath: "/tmp/c.json",
        online: false,
        eligibility: null,
      }),
    );
    expect(text).toContain(hint);
    expect(text).not.toMatch(/doctor --register/u);
  });

  it("asks before replacing a saved API key and keeps it when the keys match", () => {
    const saved = {
      apiBaseUrl: "https://dev.agentsgot.network/api",
      address: "0xabc",
      apiKey: "agt_aaaaaaaaaaaa_old",
    };
    expect(
      planApiKeyBinding({
        envKey: "agt_bbbbbbbbbbbb_new",
        saved,
        walletAddress: "0xAbC",
        apiBaseUrl: saved.apiBaseUrl,
      }).prompt,
    ).toMatch(/Current wallet 0xAbC/u);
    expect(
      planApiKeyBinding({
        saved,
        walletAddress: "0xabc",
        apiBaseUrl: saved.apiBaseUrl,
      }),
    ).toEqual({ key: saved.apiKey, onAccept: "keep" });
    const firstBind = planApiKeyBinding({
      envKey: "agt_cccccccccccc_other",
      saved: null,
      walletAddress: "0xabc",
      apiBaseUrl: saved.apiBaseUrl,
    });
    expect(firstBind.onAccept).toBe("use-env");
    expect(firstBind.prompt).toMatch(/Create a new wallet/u);
  });

  it("summarizes and formats a report without leaking secrets", () => {
    const summary = summarize(
      "executor",
      [
        {
          asOf: new Date().toISOString(),
          roles: ["executor"],
          expedited: false,
          handled: [
            {
              kind: "CLAIM_HEARTBEAT",
              subjectId: "c1",
              taskId: "t1",
              outcome: "pending-tx",
              detail: "approve me",
            },
          ],
          events: [{ type: "delivery_signed", subjectId: "s1", taskId: "t1", detail: "ok" }],
          warnings: [],
        },
      ],
      {
        online: true,
        lastHeartbeatAt: "2026-01-01T00:00:00.000Z",
        earnings: { claimedAgt: "0", claimableAgt: "1", lockedAgt: "2" },
        nextReportAt: "2026-01-01T01:00:00.000Z",
      },
    );
    expect(summary.counts.deliveries).toBe(1);
    expect(summary.waitingForUser[0]).toMatch(/CLAIM_HEARTBEAT/);
    expect(formatReport(summary)).toMatch(/agentsgot executor report/u);
  });
});

describe("wallet + home", () => {
  it("encrypts and decrypts a V3 keystore", () => {
    const key = generatePrivateKey();
    const ks = encryptKeystore(key, "password-123");
    expect(decryptKeystore(ks, "password-123")).toBe(key);
    expect(() => decryptKeystore(ks, "wrong")).toThrow();
  });

  it("creates a keystore and never exposes the private key via describeWallet", () => {
    const home = tempHome();
    const created = createWallet("password-123", homePaths(home).wallets);
    const env = { AGENTSGOT_HOME: home };
    const described = describeWallet(env, home);
    expect(described?.address.toLowerCase()).toBe(created.address.toLowerCase());
    expect(JSON.stringify(described)).not.toMatch(/0x[0-9a-fA-F]{64}/u);
    expect(loadPrivateKey(env, home, "password-123")).toMatch(/^0x[0-9a-fA-F]{64}$/u);
  });

  it("stores credentials encrypted under the home directory", () => {
    const home = tempHome();
    saveCredential(
      {
        apiBaseUrl: "https://agentsgot.network/api",
        address: "0x1111111111111111111111111111111111111111",
        agentId: "a1",
        apiKey: "agt_secret_value_here",
        savedAt: new Date().toISOString(),
      },
      home,
    );
    const raw = readFileSync(homePaths(home).credentials, "utf8");
    expect(raw).not.toMatch(/agt_secret/);
    expect(loadCredential(home)?.apiKey).toBe("agt_secret_value_here");
    expect(agentHome({ AGENTSGOT_HOME: home })).toBe(home);
  });
});

describe("skills install helpers", () => {
  it("resolves target skill dirs and MCP snippets", () => {
    expect(isTarget("cursor")).toBe(true);
    expect(skillDir("cursor", "executor", { cwd: "/proj" }).replaceAll("\\", "/")).toMatch(
      /\/\.cursor\/skills\/agentsgot-executor$/u,
    );
    expect(mcpSnippet("cursor")).toMatch(/@agentsgot\/agent-kit/);
    expect(mcpSnippet("codex")).toMatch(/\[mcp_servers\.agentsgot\]/);
  });

  it("exposes a bin named after the package so `npx @agentsgot/agent-kit` resolves", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      name: string;
      bin: Record<string, string>;
    };
    const unscoped = pkg.name.split("/").pop() ?? pkg.name;
    expect(pkg.bin[unscoped]).toBe(pkg.bin.agentsgot);
  });
});

describe("cli main", () => {
  it("prints usage for help / unknown", async () => {
    const writes: string[] = [];
    const stdout = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      expect(await main(["help"])).toBe(0);
      expect(writes.join("")).toContain("agentsgot");
      expect(USAGE).toMatch(/skills install/);
    } finally {
      process.stdout.write = stdout;
    }
  });

  it("wallet show reports missing wallet without crashing", async () => {
    const home = tempHome();
    const writes: string[] = [];
    const stdout = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      expect(await main(["wallet", "show"], { AGENTSGOT_HOME: home })).toBe(0);
      expect(writes.join("")).toMatch(/No wallet configured/u);
    } finally {
      process.stdout.write = stdout;
    }
  });

  it("loads env private key without printing it", () => {
    const key = generatePrivateKey();
    const address = privateKeyToAccount(key).address;
    const home = tempHome();
    const source = describeWallet({ AGENTSGOT_WALLET_PRIVATE_KEY: key }, home);
    expect(source).toEqual({ kind: "env", address });
  });
});
