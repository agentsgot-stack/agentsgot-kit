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

/** Sending value to someone; with an amount, address or recipient this is a direct transfer. */
const SEND_VERB =
	/转账|转入|转出|转走|转给|转至|转到|转币|打款|打币|汇款|汇给|付给|\b(?:transfer(?:s|red|ring)?|send(?:s|ing)?)\b/giu;
/** Paying or giving, which also describes rewards; only an address or recipient makes it a transfer. */
const PAY_VERB =
	/付款|支付|发送|发币|\b(?:pay(?:s|ing)?|donat(?:e|es|ing)|tip(?:s|ping)?)\b/giu;
/** Nouns that only mean a transfer; asking for its transaction hash asks for the transfer itself. */
const TRANSFER_NOUN =
	/转账|汇款|打款|转币|打币|送金|振込|振り込み|송금|이체|virement|[üu]berweisung|перевод\s+(?:средств|токенов|монет)/giu;
/** Token transfer methods; next to a wallet address they spell out a transfer through the contract. */
const TOKEN_TRANSFER_METHOD =
	/\b(?:safe)?transfer(?:From)?\b|\bsafeBatchTransferFrom\b|\btransferAndCall\b/giu;
/**
 * Function selectors of ERC-20/721/1155 transfers and spending approvals, as raw calldata:
 * transfer, transferFrom, safeTransferFrom (×2), safeBatchTransferFrom, approve, setApprovalForAll,
 * increaseAllowance, permit.
 */
const TRANSFER_SELECTOR =
	/0x(?:a9059cbb|23b872dd|42842e0e|b88d4fde|2eb2c2d6|095ea7b3|a22cb465|39509351|d505accf)/iu;
/** An approval call whose spender argument is a literal address: it hands spending to that address. */
const APPROVE_TO_ADDRESS =
	/\b(?:approve|increaseAllowance|setApprovalForAll|permit)\s*\(\s*["'`]?0x[0-9a-fA-F]{40}/giu;
/**
 * Moving value through a protocol with the executor's own wallet (swap, bridge, deposit, approve).
 * Legitimate testnet tasks do this, so it only warns.
 */
const PROTOCOL_VERB =
	/充值|充币|提币|提现|授权|兑换|跨链|存入|空投|\b(?:deposit(?:s|ing)?|withdraw(?:s|ing)?|swap(?:s|ping)?|bridg(?:e|es|ing)|approv(?:e|es|ing)|airdrop(?:s|ping)?)\b/giu;
const WALLET_ADDRESS =
	/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])|\b[a-z0-9-]{3,}\.eth\b|\bT[1-9A-HJ-NP-Za-km-z]{33}\b|\bbc1[02-9ac-hj-np-z]{11,71}\b/u;
const TOKEN_AMOUNT =
	/\d+(?:\.\d+)?\s*(?:AGT|t?BNB|ETH|USDT|USDC|BUSD|DAI|BTC|WBNB|WETH|TRX|SOL|MATIC|POL|wei|gwei|个?代币|个?币)(?![A-Za-z])/iu;
/**
 * Send/transfer verbs in other languages. Scripts without spaces get no boundary; Latin and
 * Cyrillic stems must not continue a longer word on the left.
 */
const INTL_SEND_VERB =
	/送金|振込|振り込|送付|송금|이체|전송|보내|تحويل|حوّل|أرسل|ارسل|โอน|भेज|ट्रांसफर|(?<![\p{L}])(?:transfi[eé]r\p{L}*|transferi\p{L}*|transfira|transf[eé]r\p{L}*|virement|env[ií]a\p{L}*|envi[ae]\p{L}*|envoy\p{L}*|[üu]berweis\p{L}*|[üu]bertr[äa]g\p{L}*|sende\p{L}*|chuyển|gửi|kirim\p{L}*|g[öo]nder\p{L}*|перев[еоa]\p{L}*|отправ\p{L}*|переказ\p{L}*|надіш\p{L}*)/iu;
/** Deposit/withdraw verbs in other languages; like `PROTOCOL_VERB` they only warn. */
const INTL_PROTOCOL_VERB =
	/入金|出金|입금|출금|إيداع|سحب|ฝาก|ถอน|जमा\s*कर|(?<![\p{L}])(?:deposit[ae]\p{L}*|d[ée]pos\p{L}*|retir[ae]\p{L}*|sacar|saque|einzahl\p{L}*|auszahl\p{L}*|nạp|rút|setor\p{L}*|tarik\p{L}*|yat[ıi]r\p{L}*|пополн\p{L}*|вывед\p{L}*|вывод\p{L}*)/iu;
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
/**
 * Calling a contract on chain. Even without a recipient in the text the contract may hard-code one,
 * so this warns whenever the task is about a live chain.
 */
const CONTRACT_WORD =
	/合约|\bcontracts?\b|コントラクト|컨트랙트|contrato|\bcontrat\b|vertrag|контракт|hợp\s+đồng|kontrak|sözleşme|عقد\s+ذكي|สัญญาอัจฉริยะ|कॉन्ट्रैक्ट/iu;
const CALL_WORD =
	/调用|执行|交互|触发|领取|铸造|\b(?:call|calls|calling|invoke|execute|interact|trigger|mint|claim)\b|呼び出|호출|llam[ae]\p{L}*|cham[ae]\p{L}*|appel\p{L}*|aufruf\p{L}*|вызов\p{L}*|вызв\p{L}*|gọi|panggil|çağır\p{L}*|استدعاء|เรียก|कॉल/iu;
const CHAIN_CONTEXT =
	/链上|主网|测试网|钱包|テストネット|メインネット|ウォレット|테스트넷|메인넷|지갑|bscscan|etherscan|0x[0-9a-fA-F]{40}|\b(?:on-?chain|mainnet|testnet|bsc|bnb\s*chain|wallet|metamask)\b/iu;
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
): { direct: Set<string>; other: Set<string> } {
	const direct = new Set<string>();
	const other = new Set<string>();
	const transferNounAnywhere = items.some(({ text }) =>
		affirmed(text, TRANSFER_NOUN),
	);
	const onChain = items.some(({ text }) => CHAIN_CONTEXT.test(text));
	for (const { field, text } of items) {
		const target = WALLET_ADDRESS.test(text) || RECIPIENT.test(text);
		const amount = TOKEN_AMOUNT.test(text);
		const send = affirmed(text, SEND_VERB) || INTL_SEND_VERB.test(text);
		const directTransfer =
			(send && (target || amount)) ||
			(affirmed(text, PAY_VERB) && target) ||
			(transferNounAnywhere && TX_PROOF.test(text)) ||
			(affirmed(text, TOKEN_TRANSFER_METHOD) && WALLET_ADDRESS.test(text)) ||
			TRANSFER_SELECTOR.test(text) ||
			affirmed(text, APPROVE_TO_ADDRESS);
		if (directTransfer) {
			direct.add(field);
			continue;
		}
		const protocol =
			(affirmed(text, PROTOCOL_VERB) || INTL_PROTOCOL_VERB.test(text)) &&
			(target || amount);
		const call =
			onChain &&
			(affirmed(text, CONTRACT_CALL) ||
				affirmed(text, TOKEN_TRANSFER_METHOD) ||
				(CONTRACT_WORD.test(text) && CALL_WORD.test(text)));
		const sign = affirmed(text, SIGN_REQUEST) || INTL_SIGN_REQUEST.test(text);
		if (protocol || call || sign) other.add(field);
	}

	// Language-independent hint: a wallet address next to a token amount or a required transaction
	// hash may be a transfer in a language the verbs above miss. Swaps look the same, so it warns.
	const txHashCheck = (content.criteria ?? []).some(({ machineCheck }) =>
		TX_HASH_CHECK.test(machineCheck?.commandOrSchema ?? ""),
	);
	const addressFields = items.filter(({ text }) => WALLET_ADDRESS.test(text));
	const valueFields = items.filter(
		({ text }) => TOKEN_AMOUNT.test(text) || TX_PROOF.test(text),
	);
	if (addressFields.length && (valueFields.length || txHashCheck)) {
		for (const { field } of [...addressFields, ...valueFields])
			other.add(field);
		if (txHashCheck) other.add("criteria");
	}
	for (const field of direct) other.delete(field);
	return { direct, other };
}

/**
 * Deterministic task risk control. Direct transfers to an address or recipient and wallet-secret
 * requests block publishing and claiming; other wallet actions and suspicious links only warn and
 * are left to the publisher and the executor.
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
	const links = [...blockedLinks, ...warnedLinks];
	const { direct, other } = transfer;
	return [
		{
			id: "risk.fundTransfer",
			level: direct.size ? "block" : other.size ? "warn" : "ok",
			message: direct.size
				? `Tasks may not ask the executor to transfer funds to an address or recipient: ${[...direct].join(", ")}`
				: other.size
					? `Wallet or contract action requested; the contract may hard-code a recipient, so publisher and executor must check it: ${[...other].join(", ")}`
					: "No fund transfer or wallet action requested",
			fields: [...(direct.size ? direct : other)],
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
			// Links are judged by the publisher and the executor; this only points them out.
			id: "risk.phishingLink",
			level: links.length ? "warn" : "ok",
			message: links.length
				? `Suspicious links: ${links.join("; ")}`
				: "No suspicious links",
			fields: [...linkFields],
			...(links.length
				? {
						params: {
							links: links.slice(0, 5).join("; "),
							suspected: blockedLinks.length ? "phishing" : "risky",
						},
					}
				: {}),
		},
	];
}

/** True when a published specification would fail risk control; claims on it are refused. */
export function taskRiskBlocked(content: TaskRiskContent): boolean {
	return checkTaskRisk(content).some(({ level }) => level === "block");
}
