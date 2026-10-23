# @agentgrid/shared Architecture

## 1. 职责与 interface

本包是参数、领域 schema 与确定性规则的唯一共享 module。公开 interface 包含五个 subpath：
`@agentgrid/shared`（汇总）、`@agentgrid/shared/params`、`@agentgrid/shared/schemas`、
`@agentgrid/shared/rules`、`@agentgrid/shared/abi`。它以少量 schema 和纯函数隐藏单位换算、阈值、舍入、范围校验、
资金守恒和发行上限的 implementation，为合约部署脚本、backend、web 与 agent-kit 提供同一
规则 surface。

本包不访问链、数据库、网络、系统时钟或 LLM，不依赖任何内部包。规则函数只接收 `Params`
和领域输入值，不依赖价格源。`checkDraft` 验证草稿完整性和层级约束。

## 2. 真实目录

```text
params/params.json          01-RULES §八的 158 个默认值
params/ranges.json          每个参数的固定/最小/最大范围
scripts/generate-params.mjs 从规则参数表机械生成以上 JSON
src/params/                 zod 加载、覆盖与跨参数不变量
src/schemas/                枚举、TaskSpec、TaskDraft、争议、投票、分档、发行
src/rules/                  层级、储备金、扣款、质押、仲裁、发行与草稿检查
test/                       公开 interface 的示例、边界与 fast-check 性质测试
abi/token/                  token Hardhat 产物生成的 JSON ABI 与 TypeScript `as const` 导出
abi/protocol/               protocol Hardhat 产物生成的 JSON ABI 与 TypeScript `as const` 导出
```

`abi/` 由根 `pnpm codegen:abi` 从两个 Hardhat `artifacts/` 机械生成，禁止手改；`check:codegen` 会在同一工作树
快照生成前后内容并拒绝漂移。`deployments/31337/` 是本地临时产物，不入库；其他链清单按治理流程提交。

## 3. 数值与舍入

- AGT 金额在纯函数内一律为 `bigint` wei（18 位小数）；跨进程 schema 使用非负十进制字符串。
- `params.json` 中 `*Agt` 参数是人类可读 AGT（可带小数），只经 `units.ts` 的 `agtToWei` / `parseAgtToWei`
  换算一次为 wei；禁止浮点乘 `1e18`。展示用 `formatWeiAsAgt`。规则与证明不涉及 USD 或价格（01-RULES §0.3）。
- 所有整数乘除向下取整（另有注明向上取整的除外）。拆分余数归仲裁池，报酬拆分的
  剩余项归发布者，发行工作者内部余数归仲裁者，因此资金始终守恒。
- 比例一律为整数 bps。时间输入一律为秒 `number`；规则参数中治理口径的小时保留原参数单位，
  只在使用处换为秒。
- 发行的指数衰减与 1.5 次方刹车只计算无量纲比例，再量化为十亿分比后作用于 `bigint` 金额；
  不把链上金额转换为 JavaScript 浮点数。

## 4. Params module

`params.json` 使用与 01-RULES §八完全相同的键，包括点号复合键，例如
`tierDailyFee.T1`。`loadParams(overrides?)` 合并覆盖后用 zod 校验有限数字/null、逐键范围、
固定值、费用/分配和、阶段阈值、平台硬上限与防刷量不变量。module 初始化时同样验证默认值，
因此损坏的事实源会在导入时失败。`Params` 与 `RuleParams` 从 JSON 推导。

## 5. Schemas module

枚举常量使用 PascalCase 成员和 UPPER_SNAKE 序列化值。`TaskSpecSchema` 负责条件 ID 唯一、
权重合计 10000 bps 和 A 级机器检查等跨字段约束。`TaskDraftSchema` 保留每个字段的值、来源、
确认状态和更新时间；`finalizeDraft` 只接受所有可编辑必填字段已确认、所有系统字段来自 rule
的草稿，并再次通过 `TaskSpecSchema`。

`RuleCheckResult` 是一条稳定检查结果 `{id,level,message,fields}`。`checkDraft` 返回全部检查，
不在首个错误短路，供 RuleCheckBar 和 publish-intent 使用。

## 6. Rules module

规则 module 是 deep module：调用者注入任务与 `Params`，implementation 私有地处理
定点数、边界和余数。公开函数覆盖 01-RULES §一至§七的计算类规则：

- 层级：`computeMinimumTier`、`computeTierRangeMax`、`tierDailyFee`、`tierDaysRange`；
- 发布：`checkDraft`、`checkPublisherStake`；
- 资金：`computeReserve`、`computeDeduction`、`splitDeduction`、`computeAssessmentFee`、案件费/锁定额；
- 评分与分配：`computeSubmissionScore`、`allocateExecutorPool`；
- 资格与质押：发布者基础/敞口、验证者动态质押；
- 仲裁：`arbitrationPanel`、`t1FallbackPanel`；
- 发行：`computeDailyEmission`、`computeTaskDailyEmission`、`antiWashCheck`。

## 7. 测试 interface

测试只从公开 interface 观察结果，不导出内部 helper。示例测试覆盖所有公开规则以及
层级边界、储备金计算和 `N_arb=13/14/39/40` 边界；fast-check 验证扣款拆分、所有终局、
层级单调、发行上限和防刷量不变量。参数同步测试直接解析 01-RULES §八键名列并与
`params.json` 比较。

## 8. 构建与消费

TypeScript 以 ESM 输出 JavaScript、source map 与 `.d.ts`。JSON import 使用 Node 22 支持的
import attribute；`dist/params/index.js` 从包根的 `params/*.json` 读取事实源。规则实现只使用
标准 ECMAScript、zod 和注入值，可被浏览器 bundler 直接打包，不使用 Node 专有 API。
ABI subpath 直接导出生成的 `as const` TypeScript 常量，供 viem 保留函数、事件和错误的字面量推断。

```bash
pnpm --filter @agentgrid/shared lint
pnpm --filter @agentgrid/shared typecheck
pnpm --filter @agentgrid/shared build
pnpm --filter @agentgrid/shared test
```

## 9. 对应规则

规则行为引用 01-RULES §一至§十；本文件只记录 module interface、单位和 implementation
边界，不复制可调数值。
