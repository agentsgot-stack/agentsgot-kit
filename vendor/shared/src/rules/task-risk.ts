import type { RuleCheckResult, TaskInput } from "../schemas/index.js";

/** The publisher-written text a task risk scan reads; `null` marks a field that is not filled yet. */
export interface TaskRiskContent {
	title: string | null;
	summary: string | null;
	deliverables: readonly string[] | null;
	constraints: readonly string[] | null;
	inputs: readonly TaskInput[] | null;
	criteria:
		| readonly {
				description: string;
				machineCheck?:
					| { expected: string; commandOrSchema?: string | undefined }
					| null
					| undefined;
		  }[]
		| null;
}

export const TASK_RISK_CHECK_IDS = [
	"risk.fundTransfer",
	"risk.secretRequest",
	"risk.phishingLink",
] as const;
export type TaskRiskCheckId = (typeof TASK_RISK_CHECK_IDS)[number];

interface Segment {
	field: string;
	text: string;
}

/** Verbs that by themselves mean moving value; an amount, address or recipient makes them a transfer. */
const STRONG_TRANSFER_VERB =
	/转账|转入|转出|转给|转至|转到|转币|打款|打币|汇款|汇给|充值|充币|提币|提现|\b(?:transfer(?:s|red|ring)?|send(?:s|ing)?|deposit(?:s|ing)?|withdraw(?:s|ing)?|swap(?:s|ping)?|bridg(?:e|es|ing))\b/giu;
/** Verbs that also describe rewards or permissions; only an address or recipient makes them a transfer. */
const WEAK_TRANSFER_VERB =
	/付款|支付|付给|发送|发币|授权|兑换|跨链|存入|空投|\b(?:pay(?:s|ing)?|approv(?:e|es|ing)|airdrop(?:s|ping)?|donat(?:e|es|ing)|tip(?:s|ping)?)\b/giu;
const WALLET_ADDRESS =
	/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])|\b[a-z0-9-]{3,}\.eth\b|\bT[1-9A-HJ-NP-Za-km-z]{33}\b|\bbc1[02-9ac-hj-np-z]{11,71}\b/u;
const TOKEN_AMOUNT =
	/\d+(?:\.\d+)?\s*(?:AGT|t?BNB|ETH|USDT|USDC|BUSD|DAI|BTC|WBNB|WETH|TRX|SOL|MATIC|POL|wei|gwei|个?代币|个?币)(?![A-Za-z])/iu;
/**
 * Value-moving verbs in other languages. Scripts without spaces get no boundary; Latin and
 * Cyrillic stems must not continue a longer word on the left.
 */
const INTL_TRANSFER_VERB =
	/送金|振込|振り込|入金|出金|送付|송금|이체|입금|출금|전송|보내|تحويل|حوّل|أرسل|ارسل|إيداع|سحب|โอน|ฝาก|ถอน|भेज|ट्रांसफर|जमा\s*कर|(?<![\p{L}])(?:transfi[eé]r\p{L}*|transferi\p{L}*|transfira|transf[eé]r\p{L}*|virement|env[ií]a\p{L}*|envi[ae]\p{L}*|envoy\p{L}*|deposit[ae]\p{L}*|d[ée]pos\p{L}*|retir[ae]\p{L}*|sacar|saque|[üu]berweis\p{L}*|[üu]bertr[äa]g\p{L}*|einzahl\p{L}*|auszahl\p{L}*|sende\p{L}*|chuyển|gửi|nạp|rút|kirim\p{L}*|setor\p{L}*|tarik\p{L}*|g[öo]nder\p{L}*|yat[ıi]r\p{L}*|перев[еоa]\p{L}*|отправ\p{L}*|пополн\p{L}*|вывед\p{L}*|вывод\p{L}*|переказ\p{L}*|надіш\p{L}*)/iu;
const RECIPIENT =
	/收款地址|收款人|收款钱包|接收地址|目标地址|受取アドレス|受取人|宛先|送金先|수신\s*주소|받는\s*주소|수취인|\b(?:recipient|beneficiary|payee)\b|destinatari\p{L}*|b[ée]n[ée]ficiaire|empf[äa]nger|получател\p{L}*|địa\s+chỉ\s+nhận|người\s+nhận|penerima|al[ıi]c[ıi]|المستلم|ผู้รับ/iu;
const TX_PROOF =
	/交易哈希|交易\s*hash|转账截图|转账记录|转账凭证|取引ハッシュ|トランザクションハッシュ|트랜잭션\s*해시|거래\s*해시|\btx\s*hash\b|\btxid\b|\btransaction\s+hash\b|hash\s+de\s+(?:la\s+)?transac\p{L}*|transaktions-?hash|х[еэ]ш\s+транзакци\p{L}*|mã\s+giao\s+dịch|hash\s+giao\s+dịch|hash\s+transaksi|i[şs]lem\s+hash|\btx[._-]?(?:hash|id)?\.txt\b/iu;
/** A machine check that only accepts a 32-byte transaction hash, whatever language the task uses. */
const TX_HASH_CHECK = /0x[^\n]{0,24}\{64\}|\[0-9a-f[^\]]*\]\{64\}/iu;
/** A short gap inside one clause: no sentence punctuation or line break. */
const GAP = "[^，。、,.;；!！?？।\\n]{0,14}?";
const SHORT_GAP = "[^，。、,.;；!！?？।\\n]{0,6}?";
const WIDE_GAP = "[^，。、,.;；!！?？।\\n]{0,24}?";
/** Calling a value-moving method; only risky when the task is about a live chain or wallet. */
const CONTRACT_CALL = new RegExp(
	`(?:调用|执行|发起|签名|签署|\\bcall\\b|\\binvoke\\b|\\bexecute\\b|\\bsign\\b)${SHORT_GAP}\\b(?:transferFrom|safeTransferFrom|transfer|approve|permit|setApprovalForAll|increaseAllowance|sendTransaction|eth_sendTransaction|eth_sign|personal_sign|signTypedData(?:_v4)?)\\b`,
	"giu",
);
const CHAIN_CONTEXT =
	/链上|主网|测试网|钱包|bscscan|etherscan|0x[0-9a-fA-F]{40}|\b(?:on-?chain|mainnet|testnet|bsc|bnb\s*chain|wallet|metamask)\b/iu;
/** Signing with the executor's own wallet, or producing a permit-style approval signature. */
const SIGN_REQUEST = new RegExp(
	`(?:钱包|小狐狸|\\bwallet\\b|\\bmetamask\\b)${GAP}(?:签名|签署|\\bsign\\b)|(?:签名|签署|\\bsign\\b)${GAP}(?:钱包|\\bwallet\\b)|(?:签名|签署|\\bsign\\b)${SHORT_GAP}(?:许可|\\bpermit\\b|\\btyped\\s*data\\b|\\beth_sign\\b)`,
	"giu",
);

const SECRET =
	"(?:私钥|助记词|种子短语|恢复短语|钱包密码|keystore\\s*(?:文件|密码|file|password)|private\\s*keys?|mnemonic|seed\\s*phrase|recovery\\s*phrase|secret\\s*recovery|wallet\\s*password)";
const SECRET_VERB =
	"(?:提交|提供|发送|上传|填写|导出|粘贴|输入|附上|交出|\\bsubmit\\b|\\bprovide\\b|\\bsend\\b|\\bupload\\b|\\bpaste\\b|\\benter\\b|\\bexport\\b|\\bshare\\b|\\binclude\\b)";
const SECRET_REQUEST = new RegExp(
	`${SECRET_VERB}${GAP}${SECRET}|${SECRET}${GAP}${SECRET_VERB}`,
	"giu",
);
/**
 * Wallet secrets in other languages. Without a reliable negation for every language any mention
 * blocks; defensive wording belongs in `outOfScope`, which is not scanned.
 */
const INTL_SECRET =
	/秘密鍵|シードフレーズ|ニーモニック|復元フレーズ|개인\s*키|비밀\s*키|시드\s*구문|니모닉|복구\s*구문|clave\s+privada|frase\s+(?:semilla|de\s+recupera\p{L}*)|chave\s+privada|frase\s+de\s+recupera\p{L}*|cl[ée]\s+priv[ée]e|phrase\s+(?:de\s+r[ée]cup[ée]ration|secr[èe]te)|privat(?:er|en)?\s+schl[üu]ssel|seed-?phrase|wiederherstellungs\p{L}*|приватн\p{L}*\s+ключ|секретн\p{L}*\s+ключ|сид-?фраз\p{L}*|мнемоні?\p{L}*|khóa\s+riêng|cụm\s+từ\s+khôi\s+phục|kunci\s+pribadi|frasa\s+pemulihan|özel\s+anahtar|المفتاح\s+الخاص|عبارة\s+الاسترداد|คีย์ส่วนตัว|निजी\s+कुंजी/iu;
const INTL_WALLET =
	"(?:ウォレット|지갑|billetera|cartera|carteira|portefeuille|brieftasche|кошел\\p{L}*|гаманц\\p{L}*|ví\\s+(?:điện\\s+tử|tiền|crypto)|dompet|c[üu]zdan|محفظة|กระเป๋าเงิน|वॉलेट)";
const INTL_SIGN =
	"(?:署名|서명|firm[ae]\\p{L}*|assin\\p{L}*|sign(?:ez|er|ieren)\\p{L}*|unterschreib\\p{L}*|подпи\\p{L}*|ký\\s+(?:tên|giao\\s+dịch|tin\\s+nhắn|thông\\s+điệp)|tanda\\s*tangan|imzala\\p{L}*|توقيع|وقّع|ลงนาม|हस्ताक्षर)";
/** Wallet signing requests in other languages: a wallet word and a signing word in one clause. */
const INTL_SIGN_REQUEST = new RegExp(
	`${INTL_WALLET}${WIDE_GAP}${INTL_SIGN}|${INTL_SIGN}${WIDE_GAP}${INTL_WALLET}`,
	"iu",
);

/** Defensive wording ("不提交私钥", "never send funds") directly before a match keeps it harmless. */
const NEGATION_CN =
	/(?:不|勿|禁止|严禁|不得|不要|不能|无需|不需要|避免|切勿|请勿)[^，。,.;；!！?？\s]{0,3}$/u;
const NEGATION_EN =
	/\b(?:never|not|no|don't|do\s+not|must\s+not|without)\s+(?:\w+\s+){0,2}$/iu;

function negated(text: string, index: number): boolean {
	const prefix = text.slice(Math.max(0, index - 16), index);
	return NEGATION_CN.test(prefix) || NEGATION_EN.test(prefix);
}

/** Whether `pattern` (a global regex) matches somewhere that is not negated. */
function affirmed(text: string, pattern: RegExp): boolean {
	for (const match of text.matchAll(pattern)) {
		if (!negated(text, match.index ?? 0)) return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Phishing links
// ---------------------------------------------------------------------------

const URL_PATTERN =
	/\b[a-z][a-z0-9+.-]{1,15}:\/\/[^\s<>"'`）)】\]，。]+|\b(?:javascript|data|vbscript|ethereum|wc|metamask|trust|tronlink):[^\s<>"'`）)】\]，。]+/giu;
const SAFE_SCHEMES = new Set([
	"http:",
	"https:",
	"ipfs:",
	"ipns:",
	"ar:",
	"git:",
	"ssh:",
	"git+ssh:",
]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const SHORTENERS = new Set([
	"bit.ly",
	"t.co",
	"tinyurl.com",
	"goo.gl",
	"is.gd",
	"ow.ly",
	"cutt.ly",
	"t.ly",
	"rebrand.ly",
	"shorturl.at",
	"s.id",
	"tiny.cc",
	"rb.gy",
	"buff.ly",
	"lnkd.in",
	"dub.sh",
]);
/** Brand token → official registrable domains; a host carrying the token elsewhere is a lookalike. */
const BRANDS: Readonly<Record<string, readonly string[]>> = {
	metamask: ["metamask.io"],
	binance: ["binance.com", "binance.org", "bnbchain.org"],
	bscscan: ["bscscan.com"],
	etherscan: ["etherscan.io"],
	pancakeswap: ["pancakeswap.finance"],
	uniswap: ["uniswap.org"],
	trustwallet: ["trustwallet.com"],
	coinbase: ["coinbase.com"],
	okx: ["okx.com"],
	walletconnect: [
		"walletconnect.com",
		"walletconnect.network",
		"walletconnect.org",
	],
	opensea: ["opensea.io"],
	ledger: ["ledger.com"],
	trezor: ["trezor.io"],
	agentsgot: ["agentsgot.network"],
	github: ["github.com", "githubusercontent.com", "github.io"],
};
const WALLET_PHISH =
	/connect-?wallet|wallet-?connect|verify-?wallet|validate-?wallet|sync-?wallet|restore-?wallet|unlock-?wallet|rectif(?:y|ication)|claim-?(?:airdrop|reward|token)s?|airdrop-?claim|free-?(?:bnb|eth|usdt|crypto|tokens?)|giveaway|double-?your/iu;
const RISKY_TLDS = new Set([
	"zip",
	"mov",
	"top",
	"click",
	"country",
	"gq",
	"tk",
	"ml",
	"cf",
	"ga",
	"cyou",
	"rest",
	"monster",
]);

/** Host spellings with common digit homoglyphs undone; `1` may stand for either `i` or `l`. */
function homoglyphVariants(host: string): string[] {
	const base = host.replace(/0/gu, "o").replace(/3/gu, "e").replace(/5/gu, "s");
	return [base.replace(/1/gu, "i"), base.replace(/1/gu, "l")].map((value) =>
		value.replace(/[^a-z]/gu, ""),
	);
}

function hostMatches(host: string, domain: string): boolean {
	return host === domain || host.endsWith(`.${domain}`);
}

/** Why a URL looks like phishing (`block`) or merely unsafe (`warn`); `null` when it looks fine. */
export function linkRisk(
	raw: string,
): { level: "block" | "warn"; reason: string } | null {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (!SAFE_SCHEMES.has(url.protocol))
		return { level: "block", reason: `unsafe scheme ${url.protocol}` };
	if (url.username || url.password)
		return { level: "block", reason: "credentials in URL" };
	const host = url.hostname.toLowerCase();
	if (!host) return null;
	if (LOCAL_HOSTS.has(host)) return null;
	if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host) || host.startsWith("["))
		return { level: "block", reason: "raw IP host" };
	if (host.split(".").some((label) => label.startsWith("xn--")))
		return { level: "block", reason: "punycode host" };
	if (SHORTENERS.has(host)) return { level: "block", reason: "URL shortener" };
	const variants = homoglyphVariants(host);
	for (const [brand, domains] of Object.entries(BRANDS)) {
		if (!variants.some((variant) => variant.includes(brand))) continue;
		if (domains.some((domain) => hostMatches(host, domain))) continue;
		return { level: "block", reason: `lookalike of ${domains[0]}` };
	}
	if (WALLET_PHISH.test(`${host}${url.pathname}`))
		return { level: "block", reason: "wallet-drainer wording" };
	const tld = host.split(".").at(-1) ?? "";
	if (RISKY_TLDS.has(tld))
		return { level: "warn", reason: `high-risk TLD .${tld}` };
	if (url.protocol === "http:")
		return { level: "warn", reason: "unencrypted http" };
	return null;
}

export function extractLinks(text: string): string[] {
	return [...text.matchAll(URL_PATTERN)].map(([match]) =>
		match.replace(/[.,;:!?]+$/u, ""),
	);
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function segments(content: TaskRiskContent): Segment[] {
	const items: Segment[] = [];
	const push = (field: string, text: string | null | undefined) => {
		if (text) items.push({ field, text });
	};
	push("title", content.title);
	push("summary", content.summary);
	for (const item of content.deliverables ?? []) push("deliverables", item);
	for (const item of content.constraints ?? []) push("constraints", item);
	for (const input of content.inputs ?? []) push("inputs", input.ref);
	for (const criterion of content.criteria ?? []) {
		push("criteria", criterion.description);
		push("criteria", criterion.machineCheck?.expected);
	}
	return items;
}

function fundTransferFields(
	items: readonly Segment[],
	content: TaskRiskContent,
): Set<string> {
	const fields = new Set<string>();
	const strongVerb = (text: string) =>
		affirmed(text, STRONG_TRANSFER_VERB) || INTL_TRANSFER_VERB.test(text);
	const strongAnywhere = items.some(({ text }) => strongVerb(text));
	const onChain = items.some(({ text }) => CHAIN_CONTEXT.test(text));
	for (const { field, text } of items) {
		const target = WALLET_ADDRESS.test(text) || RECIPIENT.test(text);
		const transfer =
			(strongVerb(text) && (target || TOKEN_AMOUNT.test(text))) ||
			(affirmed(text, WEAK_TRANSFER_VERB) && target);
		const proof = strongAnywhere && TX_PROOF.test(text);
		const call = onChain && affirmed(text, CONTRACT_CALL);
		const sign = affirmed(text, SIGN_REQUEST) || INTL_SIGN_REQUEST.test(text);
		if (transfer || proof || call || sign) fields.add(field);
	}

	// Language-independent: a wallet address next to a token amount or a required transaction hash
	// is a transfer request in any language, so it blocks even when no verb is recognised.
	const txHashCheck = (content.criteria ?? []).some(({ machineCheck }) =>
		TX_HASH_CHECK.test(machineCheck?.commandOrSchema ?? ""),
	);
	const addressFields = items.filter(({ text }) => WALLET_ADDRESS.test(text));
	const valueFields = items.filter(
		({ text }) => TOKEN_AMOUNT.test(text) || TX_PROOF.test(text),
	);
	if (addressFields.length && (valueFields.length || txHashCheck)) {
		for (const { field } of [...addressFields, ...valueFields])
			fields.add(field);
		if (txHashCheck) fields.add("criteria");
	}
	return fields;
}

/**
 * Deterministic task risk control. A task may not make the executor move funds, approve or sign for
 * a wallet, hand over wallet secrets, or open a phishing link; these block publishing and claiming.
 */
export function checkTaskRisk(content: TaskRiskContent): RuleCheckResult[] {
	const items = segments(content);
	const transfer = fundTransferFields(items, content);
	const secret = new Set(
		items
			.filter(
				({ text }) => affirmed(text, SECRET_REQUEST) || INTL_SECRET.test(text),
			)
			.map(({ field }) => field),
	);
	const blockedLinks: string[] = [];
	const warnedLinks: string[] = [];
	const linkFields = new Set<string>();
	for (const { field, text } of items) {
		for (const link of extractLinks(text)) {
			const risk = linkRisk(link);
			if (!risk) continue;
			linkFields.add(field);
			(risk.level === "block" ? blockedLinks : warnedLinks).push(
				`${link} (${risk.reason})`,
			);
		}
	}
	const linkLevel = blockedLinks.length
		? "block"
		: warnedLinks.length
			? "warn"
			: "ok";
	const links = [...blockedLinks, ...warnedLinks];
	return [
		{
			id: "risk.fundTransfer",
			level: transfer.size ? "block" : "ok",
			message: transfer.size
				? `Tasks may not ask the executor to transfer funds, approve tokens, or sign wallet transactions: ${[...transfer].join(", ")}`
				: "No fund transfer or wallet action requested",
			fields: [...transfer],
		},
		{
			id: "risk.secretRequest",
			level: secret.size ? "block" : "ok",
			message: secret.size
				? `Tasks may not request private keys, mnemonics, or wallet passwords: ${[...secret].join(", ")}`
				: "No wallet secret requested",
			fields: [...secret],
		},
		{
			id: "risk.phishingLink",
			level: linkLevel,
			message: links.length
				? `Suspicious links: ${links.join("; ")}`
				: "No suspicious links",
			fields: [...linkFields],
			...(links.length
				? { params: { links: links.slice(0, 5).join("; ") } }
				: {}),
		},
	];
}

/** True when a published specification would fail risk control; claims on it are refused. */
export function taskRiskBlocked(content: TaskRiskContent): boolean {
	return checkTaskRisk(content).some(({ level }) => level === "block");
}
