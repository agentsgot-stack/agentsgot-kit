import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { homePaths, writePrivate } from "./home.js";
import { decryptKeystore, encryptKeystore, type KeystoreV3 } from "./keystore.js";

export type Env = Record<string, string | undefined>;

export interface WalletSource {
  kind: "env" | "keystore";
  address: `0x${string}`;
  /** Absolute keystore path when kind = keystore. */
  path?: string;
}

const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/u;

/** Default keystore: AGENTSGOT_KEYSTORE, else the only file in ~/.agentsgot/wallets. */
export function findKeystore(env: Env, home: string): string | null {
  if (env.AGENTSGOT_KEYSTORE) return resolve(env.AGENTSGOT_KEYSTORE);
  const dir = homePaths(home).wallets;
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((file) => file.endsWith(".json"));
  return files.length === 1 && files[0] ? join(dir, files[0]) : null;
}

/** Describe the configured wallet without decrypting anything. Never returns key material. */
export function describeWallet(env: Env, home: string): WalletSource | null {
  const key = env.AGENTSGOT_WALLET_PRIVATE_KEY;
  if (key) {
    if (!PRIVATE_KEY.test(key))
      throw new Error("AGENTSGOT_WALLET_PRIVATE_KEY is not a 32-byte hex key.");
    return { kind: "env", address: privateKeyToAccount(key as `0x${string}`).address };
  }
  const path = findKeystore(env, home);
  if (!path || !existsSync(path)) return null;
  const keystore = JSON.parse(readFileSync(path, "utf8")) as KeystoreV3;
  return { kind: "keystore", address: `0x${keystore.address}` as `0x${string}`, path };
}

/** Load the private key from env or keystore + password; the caller must never print it. */
export function loadPrivateKey(env: Env, home: string, password?: string): `0x${string}` {
  const key = env.AGENTSGOT_WALLET_PRIVATE_KEY;
  if (key) {
    if (!PRIVATE_KEY.test(key))
      throw new Error("AGENTSGOT_WALLET_PRIVATE_KEY is not a 32-byte hex key.");
    return key as `0x${string}`;
  }
  const path = findKeystore(env, home);
  if (!path || !existsSync(path))
    throw new Error(
      "No wallet configured. Run `agentsgot wallet create`, or set AGENTSGOT_WALLET_PRIVATE_KEY / AGENTSGOT_KEYSTORE in your own shell.",
    );
  const pass = password ?? env.AGENTSGOT_KEYSTORE_PASSWORD;
  if (!pass) throw new Error("Set AGENTSGOT_KEYSTORE_PASSWORD or enter the keystore password.");
  return decryptKeystore(JSON.parse(readFileSync(path, "utf8")) as KeystoreV3, pass);
}

/** Generate a fresh wallet and write it as an encrypted V3 keystore (0600). */
export function createWallet(password: string, dir: string): { address: string; path: string } {
  const key = generatePrivateKey();
  const keystore = encryptKeystore(key, password);
  const address = privateKeyToAccount(key).address;
  const path = resolve(join(dir, `${address}.json`));
  if (existsSync(path)) throw new Error(`Keystore already exists: ${path}`);
  writePrivate(path, `${JSON.stringify(keystore, null, 2)}\n`);
  return { address, path };
}
