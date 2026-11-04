import { describe, expect, it } from "vitest";
import {
	checkTaskRisk,
	linkRisk,
	type TaskRiskContent,
	taskRiskBlocked,
} from "../src/index.js";

const empty: TaskRiskContent = {
	title: null,
	summary: null,
	deliverables: null,
	constraints: null,
	inputs: null,
	criteria: null,
};

function level(content: Partial<TaskRiskContent>, id: string) {
	return checkTaskRisk({ ...empty, ...content }).find(
		(check) => check.id === id,
	)?.level;
}

/** Task 0x8735…57a7 on dev: the executor is asked to send AGT to a fixed address. */
const transferTask: TaskRiskContent = {
	title: "向 0x258784BE0B6ad93458A20b6D74C4Da4DB64Bec8A 转入 100 AGT",
	summary:
		"在 BSC Testnet 上向 0x258784BE0B6ad93458A20b6D74C4Da4DB64Bec8A 转入 100 AGT。提交转账交易哈希、转账成功截图和操作说明。禁止主网和真实资金。",
	deliverables: [
		"tx.txt：BSC Testnet 转账交易哈希",
		"notes.md：发送方地址、收款地址、金额",
	],
	constraints: [
		"收款地址固定为 0x258784BE0B6ad93458A20b6D74C4Da4DB64Bec8A。",
		"转账金额为 100 AGT。",
	],
	inputs: [
		{
			kind: "URL",
			ref: "https://testnet.bscscan.com/address/0x258784BE0B6ad93458A20b6D74C4Da4DB64Bec8A",
		},
	],
	criteria: [
		{
			description: "notes.md 包含指定收款地址。",
			machineCheck: { expected: "notes 含收款地址" },
		},
	],
};

describe("task risk: fund transfers", () => {
	it("blocks the published transfer-to-address task", () => {
		const check = checkTaskRisk(transferTask).find(
			({ id }) => id === "risk.fundTransfer",
		);
		expect(check?.level).toBe("block");
		expect(check?.fields).toEqual(
			expect.arrayContaining(["title", "summary", "constraints"]),
		);
		expect(taskRiskBlocked(transferTask)).toBe(true);
	});

	it("blocks English transfers, approvals and contract calls", () => {
		expect(
			level(
				{ summary: "Send 5 BNB to 0x258784BE0B6ad93458A20b6D74C4Da4DB64Bec8A" },
				"risk.fundTransfer",
			),
		).toBe("block");
		expect(
			level(
				{ summary: "Approve the recipient to spend your USDT" },
				"risk.fundTransfer",
			),
		).toBe("block");
		expect(
			level(
				{ summary: "Call setApprovalForAll on the BSC testnet NFT contract" },
				"risk.fundTransfer",
			),
		).toBe("block");
		expect(
			level(
				{ summary: "在链上调用 transferFrom 把余额转走" },
				"risk.fundTransfer",
			),
		).toBe("block");
		expect(
			level(
				{ summary: "用钱包签名这条授权消息并提交签名" },
				"risk.fundTransfer",
			),
		).toBe("block");
		expect(
			level(
				{ summary: "Sign the permit with MetaMask and paste the result" },
				"risk.fundTransfer",
			),
		).toBe("block");
		expect(
			level(
				{ summary: "Withdraw 20 USDC from the vault" },
				"risk.fundTransfer",
			),
		).toBe("block");
	});

	it("blocks a transfer disguised as a proof-of-transaction deliverable", () => {
		expect(
			level(
				{ summary: "完成一次转账操作", deliverables: ["tx.txt：交易哈希"] },
				"risk.fundTransfer",
			),
		).toBe("block");
	});

	it("blocks the same transfer task written in any language", () => {
		const address = "0x258784BE0B6ad93458A20b6D74C4Da4DB64Bec8A";
		const summaries = [
			`BSC Testnet で ${address} に 100 AGT を送金し、取引ハッシュを提出してください。`,
			`BSC 테스트넷에서 ${address} 로 100 AGT 를 송금하고 트랜잭션 해시를 제출하세요.`,
			`Transfiere 100 AGT a ${address} en BSC Testnet y envía el hash de la transacción.`,
			`Transfira 100 AGT para ${address} na BSC Testnet e envie o hash da transação.`,
			`Переведите 100 AGT на ${address} в BSC Testnet и пришлите хеш транзакции.`,
			`Envoyez 100 AGT à ${address} sur BSC Testnet et fournissez le hash de la transaction.`,
			`Überweisen Sie 100 AGT an ${address} im BSC Testnet und reichen Sie den Transaktionshash ein.`,
			`Chuyển 100 AGT đến ${address} trên BSC Testnet và gửi mã giao dịch.`,
			`Kirim 100 AGT ke ${address} di BSC Testnet dan serahkan hash transaksi.`,
			`BSC Testnet üzerinde ${address} adresine 100 AGT gönderin.`,
			`حوّل 100 AGT إلى ${address} على شبكة BSC التجريبية.`,
			`โอน 100 AGT ไปที่ ${address} บน BSC Testnet`,
			`BSC Testnet पर ${address} को 100 AGT भेजें।`,
			// A language with no recognised verb still pairs an address with an amount.
			`${address} 100 AGT mwenye kutuma na uthibitisho.`,
		];
		for (const summary of summaries)
			expect(level({ summary }, "risk.fundTransfer"), summary).toBe("block");
	});

	it("blocks address-plus-proof tasks split across fields, whatever the language", () => {
		expect(
			level(
				{
					summary: "Haga la operación indicada en la red de pruebas.",
					constraints: ["0x258784BE0B6ad93458A20b6D74C4Da4DB64Bec8A"],
					criteria: [
						{
							description: "tx.txt válido",
							machineCheck: {
								expected: "ok",
								commandOrSchema: "^0x[0-9a-fA-F]{64}$",
							},
						},
					],
				},
				"risk.fundTransfer",
			),
		).toBe("block");
		expect(
			level(
				{
					summary: "受取人 0x258784BE0B6ad93458A20b6D74C4Da4DB64Bec8A",
					deliverables: ["50 USDT"],
				},
				"risk.fundTransfer",
			),
		).toBe("block");
	});

	it("blocks wallet signing requests in other languages", () => {
		for (const summary of [
			"MetaMask ウォレットでこのメッセージに署名してください",
			"지갑으로 이 메시지에 서명하세요",
			"Firme este mensaje con su billetera",
			"Подпишите сообщение своим кошельком",
		])
			expect(level({ summary }, "risk.fundTransfer"), summary).toBe("block");
	});

	it("keeps ordinary non-English engineering tasks publishable", () => {
		const ok = [
			{
				summary:
					"ERC20 コントラクトの transfer 関数のバグを修正し、テストを追加する",
			},
			{
				summary:
					"Escribe pruebas unitarias para la función transfer() en Hardhat",
			},
			{
				summary:
					"Напишите отчёт о производительности API и отправьте его в репозиторий",
			},
			{ summary: "Ví dụ: đăng ký tài khoản và viết tài liệu hướng dẫn" },
			{
				summary:
					"Deploy en BSC Testnet y entrega el hash de la transacción de despliegue",
			},
		];
		for (const content of ok)
			expect(level(content, "risk.fundTransfer"), content.summary).toBe("ok");
	});

	it("keeps ordinary engineering and reward wording publishable", () => {
		const ok = [
			{ summary: "修复 ERC20 合约 transfer() 函数的溢出 bug 并补充单元测试" },
			{
				summary:
					"Write Hardhat unit tests that call transfer() and approve() locally",
			},
			{ summary: "实现 EIP-712 签名验证逻辑来校验交易请求" },
			{ summary: "执行单元测试覆盖 transfer 函数" },
			{ summary: "完成后支付 100 AGT 报酬" },
			{ summary: "Send HTTP requests with at most 500 tokens per prompt" },
			{ summary: "部署合约到 BSC Testnet 并提交部署交易哈希" },
			{ constraints: ["禁止转账到任何地址。", "不使用主网资产或真实资金。"] },
			{
				constraints: [
					"Never send funds to 0x258784BE0B6ad93458A20b6D74C4Da4DB64Bec8A",
				],
			},
		];
		for (const content of ok)
			expect(level(content, "risk.fundTransfer")).toBe("ok");
	});
});

describe("task risk: wallet secrets", () => {
	it("blocks requests for private keys and mnemonics", () => {
		expect(
			level({ deliverables: ["提交钱包私钥用于核验"] }, "risk.secretRequest"),
		).toBe("block");
		expect(
			level(
				{ summary: "Please provide your seed phrase" },
				"risk.secretRequest",
			),
		).toBe("block");
		expect(
			level({ summary: "助记词请填写到 notes.md" }, "risk.secretRequest"),
		).toBe("block");
	});

	it("blocks wallet secrets mentioned in other languages", () => {
		for (const summary of [
			"秘密鍵を notes.md に記入してください",
			"시드 구문을 제출하세요",
			"Envíe su clave privada",
			"Отправьте сид-фразу",
			"Gửi cụm từ khôi phục của ví",
		])
			expect(level({ summary }, "risk.secretRequest"), summary).toBe("block");
	});

	it("allows defensive wording", () => {
		expect(
			level(
				{ constraints: ["不提交私钥、助记词或签名消息。"] },
				"risk.secretRequest",
			),
		).toBe("ok");
		expect(
			level(
				{ constraints: ["Do not share your private key"] },
				"risk.secretRequest",
			),
		).toBe("ok");
	});
});

describe("task risk: phishing links", () => {
	it("accepts official and local links", () => {
		expect(linkRisk("https://testnet.bscscan.com/address/0x0")).toBeNull();
		expect(linkRisk("https://github.com/org/repo")).toBeNull();
		expect(linkRisk("http://localhost:3000/health")).toBeNull();
		expect(linkRisk("https://dev.agentsgot.network/zh-CN/tasks")).toBeNull();
	});

	it("blocks lookalikes, shorteners, raw IPs, punycode and wallet schemes", () => {
		for (const url of [
			"https://metamask-wallet.io/login",
			"https://bscscan.com.verify-tx.app/",
			"https://b1nance.com/airdrop",
			"https://bit.ly/3abcd",
			"http://45.12.8.9/claim",
			"https://xn--pancakewap-9fb.finance",
			"https://user:pass@example.com",
			"https://example.com/connect-wallet",
			"https://claim-airdrop.site/",
			"javascript:alert(1)",
			"ethereum:0x258784BE0B6ad93458A20b6D74C4Da4DB64Bec8A@97/transfer?value=1",
		]) {
			expect(linkRisk(url)?.level, url).toBe("block");
		}
	});

	it("warns on plain http and high-risk TLDs", () => {
		expect(linkRisk("http://example.com/data.csv")?.level).toBe("warn");
		expect(linkRisk("https://files.example.zip/a")?.level).toBe("warn");
	});

	it("scans links inside free text and inputs", () => {
		expect(
			level(
				{ summary: "打开 https://metamask-verify.app 完成验证" },
				"risk.phishingLink",
			),
		).toBe("block");
		expect(
			level(
				{ inputs: [{ kind: "URL", ref: "https://bit.ly/x" }] },
				"risk.phishingLink",
			),
		).toBe("block");
		expect(
			level(
				{ inputs: [{ kind: "URL", ref: "http://example.com/a.csv" }] },
				"risk.phishingLink",
			),
		).toBe("warn");
		expect(level(transferTask, "risk.phishingLink")).toBe("ok");
	});
});
