import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Everything local lives under ~/.agentsgot (override with AGENTSGOT_HOME). */
export function agentHome(env: Record<string, string | undefined> = process.env): string {
  return env.AGENTSGOT_HOME ?? join(homedir(), ".agentsgot");
}

export const homePaths = (home = agentHome()) => ({
  home,
  wallets: join(home, "wallets"),
  credentials: join(home, "credentials.json"),
  secretKey: join(home, ".secret"),
  checkpoints: join(home, "checkpoints"),
  reports: join(home, "reports"),
  config: join(home, "config.json"),
});

/** Write a file readable only by the current user (0600; best effort on Windows). */
export function writePrivate(path: string, content: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, content, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows ignores POSIX modes; the file lives in the user's profile directory.
  }
}

function secret(home: string): Buffer {
  const path = homePaths(home).secretKey;
  if (!existsSync(path)) writePrivate(path, randomBytes(32).toString("hex"));
  return Buffer.from(readFileSync(path, "utf8").trim(), "hex");
}

export interface StoredCredential {
  apiBaseUrl: string;
  address: string;
  agentId?: string;
  apiKey: string;
  savedAt: string;
}

/** credentials.json holds AES-256-GCM ciphertext; the key is a local 0600 secret file. */
export function saveCredential(credential: StoredCredential, home = agentHome()): void {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret(home), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(credential), "utf8"), cipher.final()]);
  writePrivate(
    homePaths(home).credentials,
    `${JSON.stringify(
      {
        version: 1,
        cipher: "aes-256-gcm",
        iv: iv.toString("hex"),
        tag: cipher.getAuthTag().toString("hex"),
        data: data.toString("hex"),
      },
      null,
      2,
    )}\n`,
  );
}

export function loadCredential(home = agentHome()): StoredCredential | null {
  const path = homePaths(home).credentials;
  if (!existsSync(path)) return null;
  try {
    const file = JSON.parse(readFileSync(path, "utf8")) as {
      iv: string;
      tag: string;
      data: string;
    };
    const decipher = createDecipheriv("aes-256-gcm", secret(home), Buffer.from(file.iv, "hex"));
    decipher.setAuthTag(Buffer.from(file.tag, "hex"));
    const plain = Buffer.concat([decipher.update(Buffer.from(file.data, "hex")), decipher.final()]);
    return JSON.parse(plain.toString("utf8")) as StoredCredential;
  } catch {
    return null;
  }
}

export interface LocalConfig {
  roles?: string[];
  apiBaseUrl?: string;
  reportChannels?: ("terminal" | "file" | "webhook")[];
  reportIntervalSeconds?: number;
  /** Executor auto-claim rule: only tasks matching these templates / max tier. */
  autoClaim?: { templates?: string[]; maxTier?: string } | null;
}

export function loadConfig(home = agentHome()): LocalConfig {
  const path = homePaths(home).config;
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LocalConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: LocalConfig, home = agentHome()): void {
  writePrivate(homePaths(home).config, `${JSON.stringify(config, null, 2)}\n`);
}
