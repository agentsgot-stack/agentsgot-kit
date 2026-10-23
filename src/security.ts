function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  const size = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < size; index += 1)
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}

export async function signWebhook(
  secret: string,
  timestamp: string,
  rawBody: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  return `sha256=${hex(new Uint8Array(signature))}`;
}

export async function verifyWebhook(input: {
  secret: string;
  timestamp: string;
  rawBody: string;
  signature: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): Promise<boolean> {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const timestamp = Number(input.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > (input.toleranceSeconds ?? 300))
    return false;
  const expected = await signWebhook(input.secret, input.timestamp, input.rawBody);
  return constantTimeEqual(expected, input.signature.toLowerCase());
}
