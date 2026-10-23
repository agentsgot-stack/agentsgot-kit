/** 01-RULES §0.3: 1 AGT = 10^18 wei. Rule parameters are human AGT; contracts, HTTP and storage use wei. */
export const AGT_DECIMALS = 18;
export const WEI_PER_AGT = 10n ** 18n;

const AGT_DECIMAL = /^(0|[1-9]\d*)(\.\d{1,18})?$/u;

/** Parses a non-negative AGT decimal string (`"0.6"`, `"10"`) into wei without floating point. */
export function parseAgtToWei(value: string): bigint {
  const text = value.trim();
  if (!AGT_DECIMAL.test(text)) throw new RangeError(`invalid AGT amount: ${value}`);
  const [whole = "0", fraction = ""] = text.split(".");
  return BigInt(whole) * WEI_PER_AGT + BigInt(fraction.padEnd(AGT_DECIMALS, "0"));
}

/** Converts a fixed AGT rule parameter from params.json (for example `0.5`) into wei, exactly once. */
export function agtToWei(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`invalid AGT amount: ${value}`);
  return parseAgtToWei(plainDecimal(String(value)));
}

/** Expands the shortest round-trip form (`"1e-7"`, `"2e+21"`) into plain decimal digits. */
function plainDecimal(text: string): string {
  const match = /^(\d+)(?:\.(\d+))?e([+-]\d+)$/u.exec(text);
  if (!match) return text;
  const [, whole = "", fraction = "", exponentText = "0"] = match;
  const digits = whole + fraction;
  const point = whole.length + Number(exponentText);
  if (point <= 0) return `0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + "0".repeat(point - digits.length);
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/** Formats wei as a plain AGT decimal without unit or grouping (`600000000000000000n` → `"0.6"`). */
export function formatWeiAsAgt(wei: bigint): string {
  const negative = wei < 0n;
  const absolute = negative ? -wei : wei;
  const whole = absolute / WEI_PER_AGT;
  const fraction = (absolute % WEI_PER_AGT)
    .toString()
    .padStart(AGT_DECIMALS, "0")
    .replace(/0+$/u, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
