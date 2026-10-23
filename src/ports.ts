export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpRequest {
  method: HttpMethod;
  path: string;
  token?: string;
  headers?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, string | number | boolean | undefined>>;
  body?: unknown;
}

export interface HttpPort {
  request<T>(request: HttpRequest): Promise<T>;
}

export interface TransactionRequest {
  chainId: number;
  to: string;
  data: string;
  value: string;
  estimatedGas?: string;
}

export interface WalletPort {
  readonly address: string;
  signMessage(message: string): Promise<string>;
  signTypedData(typedData: {
    domain: Readonly<Record<string, unknown>>;
    types: Readonly<Record<string, readonly { name: string; type: string }[]>>;
    primaryType: string;
    message: Readonly<Record<string, unknown>>;
  }): Promise<string>;
  sendTransaction(transaction: TransactionRequest): Promise<string>;
}

export interface LlmPort {
  complete(input: { role: "executor" | "tester" | "arbitrator"; prompt: string }): Promise<string>;
}

export class AgentGridError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AgentGridError";
  }
}

export class FetchHttpAdapter implements HttpPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async request<T>(input: HttpRequest): Promise<T> {
    const url = new URL(input.path, `${this.baseUrl.replace(/\/$/u, "")}/`);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const headers = new Headers(input.headers);
    if (input.token) headers.set("authorization", `Bearer ${input.token}`);
    let body: BodyInit | undefined;
    if (input.body instanceof FormData) body = input.body;
    else if (input.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(input.body);
    }
    const response = await this.fetcher(url, {
      method: input.method,
      headers,
      ...(body === undefined ? {} : { body }),
    });
    const text = await response.text();
    const parsed =
      text && response.headers.get("content-type")?.includes("json")
        ? (JSON.parse(text) as unknown)
        : text;
    if (!response.ok) {
      const problem =
        typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
      throw new AgentGridError(
        response.status,
        String(problem.code ?? "HTTP_ERROR"),
        String(problem.detail ?? response.statusText),
        problem.retryable === true,
        parsed,
      );
    }
    return parsed as T;
  }
}

export type InMemoryHttpHandler = (request: HttpRequest) => unknown | Promise<unknown>;

export class InMemoryHttpAdapter implements HttpPort {
  readonly requests: HttpRequest[] = [];

  constructor(private readonly handler: InMemoryHttpHandler) {}

  async request<T>(request: HttpRequest): Promise<T> {
    this.requests.push(request);
    return (await this.handler(request)) as T;
  }
}

export interface ViemAccountLike {
  readonly address: string;
  signMessage(input: { message: string }): Promise<string>;
  signTypedData(input: {
    domain: Record<string, unknown>;
    types: Record<string, readonly { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<string>;
}

export interface ViemWalletClientLike {
  sendTransaction(input: {
    account: ViemAccountLike;
    chain: undefined;
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
  }): Promise<string>;
}

export class ViemWalletAdapter implements WalletPort {
  readonly address: string;

  constructor(
    private readonly account: ViemAccountLike,
    private readonly client: ViemWalletClientLike,
  ) {
    this.address = account.address;
  }

  signMessage(message: string): Promise<string> {
    return this.account.signMessage({ message });
  }

  signTypedData(typedData: Parameters<WalletPort["signTypedData"]>[0]): Promise<string> {
    return this.account.signTypedData({
      domain: { ...typedData.domain },
      types: { ...typedData.types },
      primaryType: typedData.primaryType,
      message: { ...typedData.message },
    });
  }

  sendTransaction(transaction: TransactionRequest): Promise<string> {
    return this.client.sendTransaction({
      account: this.account,
      chain: undefined,
      to: transaction.to as `0x${string}`,
      data: transaction.data as `0x${string}`,
      value: BigInt(transaction.value),
    });
  }
}

export class MockWalletAdapter implements WalletPort {
  readonly signedMessages: string[] = [];
  readonly signedTypedData: Parameters<WalletPort["signTypedData"]>[0][] = [];
  readonly sentTransactions: TransactionRequest[] = [];

  constructor(readonly address = "0x1111111111111111111111111111111111111111") {}

  async signMessage(message: string): Promise<string> {
    this.signedMessages.push(message);
    return `0x${"11".repeat(65)}`;
  }

  async signTypedData(typedData: Parameters<WalletPort["signTypedData"]>[0]): Promise<string> {
    this.signedTypedData.push(typedData);
    return `0x${"22".repeat(65)}`;
  }

  async sendTransaction(transaction: TransactionRequest): Promise<string> {
    this.sentTransactions.push(transaction);
    return `0x${"33".repeat(32)}`;
  }
}

export class MockLlmAdapter implements LlmPort {
  readonly inputs: Array<{ role: "executor" | "tester" | "arbitrator"; prompt: string }> = [];

  constructor(private readonly response = "mock-completion") {}

  async complete(input: { role: "executor" | "tester" | "arbitrator"; prompt: string }) {
    this.inputs.push(input);
    return this.response;
  }
}
