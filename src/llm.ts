import type { LlmPort } from "./ports.js";

export interface OpenAiCompatibleLlmOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetcher?: typeof fetch;
}

export class OpenAiCompatibleLlmAdapter implements LlmPort {
  constructor(private readonly options: OpenAiCompatibleLlmOptions) {}

  async complete(input: { role: "executor" | "tester" | "arbitrator"; prompt: string }) {
    const response = await (this.options.fetcher ?? fetch)(
      `${this.options.baseUrl.replace(/\/$/u, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            { role: "system", content: `Act as an AgentGrid ${input.role}. Return plain text.` },
            { role: "user", content: input.prompt },
          ],
        }),
      },
    );
    if (!response.ok) throw new Error(`LLM_HTTP_${response.status}`);
    const body = (await response.json()) as {
      choices?: readonly { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("LLM_INVALID_OUTPUT");
    return content;
  }
}
