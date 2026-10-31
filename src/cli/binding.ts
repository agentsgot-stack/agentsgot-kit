import type { StoredCredential } from "./home.js";

export interface BindingPlan {
  /** Key to keep using when the user does not switch. */
  key?: string;
  /** Printed on the user's terminal before anything is overwritten. */
  prompt?: string;
  /** What a `yes` answer does. `keep` means the current key is already the one to use. */
  onAccept: "use-env" | "register" | "keep";
}

/** Ask which wallet signs when an API key is bound. `replacing` is the saved key prefix. */
export function walletBindPrompt(
  walletAddress: string,
  apiKey: string,
  replacing?: string,
): string {
  const previous = replacing
    ? `This machine is already bound to ${replacing}. Choosing 1 rebinds to the new key. `
    : "";
  return (
    `${previous}Bind API key ${keyPrefix(apiKey)}. Rewards stay with the wallet that owns this key.\n` +
    "Which wallet should sign and pay gas?\n" +
    `  1) Current wallet ${walletAddress}\n` +
    "  2) Create a new wallet first (`agentsgot wallet create`), then run this command again\n" +
    "Type 1 or 2: "
  );
}

/** Show `agt_` plus the public prefix, never the secret. */
export function keyPrefix(key: string): string {
  const prefix = /^agt_([0-9a-fA-F]+)/u.exec(key)?.[1];
  return prefix ? `agt_${prefix.slice(0, 12)}` : "agt_…";
}

/**
 * Decide whether this machine should keep its saved API key, use one from the
 * environment, or register. A different saved binding always asks before switching.
 */
export function planApiKeyBinding(input: {
  envKey?: string;
  saved: Pick<StoredCredential, "apiBaseUrl" | "address" | "apiKey"> | null;
  walletAddress: string;
  apiBaseUrl: string;
}): BindingPlan {
  const envKey = input.envKey?.trim() || undefined;
  const saved = input.saved;
  const savedMatches = Boolean(
    saved &&
      saved.address.toLowerCase() === input.walletAddress.toLowerCase() &&
      saved.apiBaseUrl === input.apiBaseUrl,
  );

  if (!saved) {
    return envKey
      ? { key: envKey, onAccept: "use-env", prompt: walletBindPrompt(input.walletAddress, envKey) }
      : { onAccept: "register" };
  }
  if (envKey && envKey === saved.apiKey && savedMatches) {
    return { key: envKey, onAccept: "keep" };
  }
  if (envKey && envKey !== saved.apiKey) {
    return {
      key: saved.apiKey,
      onAccept: "use-env",
      prompt: walletBindPrompt(input.walletAddress, envKey, keyPrefix(saved.apiKey)),
    };
  }
  if (savedMatches) return { key: saved.apiKey, onAccept: "keep" };
  return {
    key: saved.apiKey,
    onAccept: "register",
    prompt:
      `This machine is already bound to API key ${keyPrefix(saved.apiKey)} for ${saved.address} at ${saved.apiBaseUrl}. ` +
      `The current wallet is ${input.walletAddress} and the API is ${input.apiBaseUrl}. ` +
      "Rebind this machine to the current wallet? Type yes to switch, or no to keep the saved key: ",
  };
}
