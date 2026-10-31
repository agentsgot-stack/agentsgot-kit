import { createInterface } from "node:readline";

/** `1` uses the current wallet. `2` stops so the user can create one. A non-interactive shell uses the current wallet. */
export async function chooseWallet(question: string): Promise<"current" | "new"> {
  if (!process.stdin.isTTY) {
    process.stderr.write(`${question}\nNo interactive terminal; using the current wallet.\n`);
    return "current";
  }
  const answer = (await ask(question)).trim().toLowerCase();
  if (answer === "2" || answer === "new") return "new";
  return "current";
}

/** Yes keeps the proposed change. A non-interactive shell keeps the saved binding. */
export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    process.stderr.write(`${question}\nNo interactive terminal; keeping the saved API key.\n`);
    return false;
  }
  const answer = (await ask(question)).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

/** Ask a question on the user's own terminal. */
export async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  try {
    return await new Promise((resolve) => rl.question(question, resolve));
  } finally {
    rl.close();
  }
}

/** Read a password without echo; requires an interactive terminal. */
export async function askHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY)
    throw new Error("A password prompt needs an interactive terminal. Run this command yourself.");
  process.stderr.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  let value = "";
  return new Promise((resolve, reject) => {
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          cleanup();
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Cancelled."));
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on("data", onData);
  });
}

export const SAFETY_NOTICE =
  "Please do not paste a private key or mnemonic into a chat window. Neither the platform nor any agent will ever ask for them.";
