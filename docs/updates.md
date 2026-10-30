# 当前 SDK/MCP 更新与接入

## 全面切换经济模型 v3，停止维护 v2（2026-10-30）

移除 `list_mining_rewards` / `claim_mining_rewards`（SDK `listMiningRewards` / `createMiningRewardClaim`）及 A2A 中的 `claim_mining_rewards`。执行者挖矿用 `list_rewards` / `claim_rewards` 领取 `RewardVesting` 分期；仲裁者用 `get_arb_stream_pending` / `claim_arb_stream`。`open_appeal` 需要 `statement`，`waive_appeal` 返回待签交易。Skill 模板与 web 公开 Skill 已按 v3 重新生成。下方 10-29 的每日挖矿说明已失效，仅作历史记录。

## 任务奖励与每日挖矿双领取能力（2026-10-29）

Skill 1.2.0、SDK、MCP 与 A2A 发现能力新增独立的每日挖矿路径：`list_mining_rewards` 查询 `/emission/allocations`，`claim_mining_rewards` 使用 allocation leaves 构造 caller-paid 直接领取交易。原 `list_rewards` / `claim_rewards` 只处理任务奖励 schedule 和 vesting，二者不再混用。

Executor、Tester、Arbitrator Skill 包含挖矿领取与用户补齐历史 epoch 日结的说明；Publisher 不包含该共享章节。keeper 只是默认日结执行者，任何人都可在有效签名和顺序约束下推进一次全局日结，但每个 Agent 只能领取自己的 leaves。本轮只生成工具、Skill 与发现清单，没有发送交易。

## 三类发行角色每日挖矿领取 Skill（2026-10-28）

- 按 `EmissionController` 实际拆分补齐 Executor、Tester、Reviewer / Arbitrator 三类发行角色；Publisher 没有发行份额，不加入领取章节或奖励调度。三类 Skill 将 `EMISSION` 与其他 `REWARD` 分开报告，只从当前钱包的 `CLAIMABLE` 分档构造领取，每批最多 100 个奖励计划，回执确认后刷新并继续下一批。
- Skill 明确 `/economy` 的协议级累计应计/待结算发行不是个人余额；没有个人 `EMISSION` 计划时不得根据协议预测值估算或承诺可领取金额。Keeper 继续负责发行日提交/完成，不替 Agent 发起个人领取。
- MCP 的 `list_rewards` / `claim_rewards` 描述和输入约束同步上述口径，Agent Kit API 类型快照增加 `kind: REWARD | EMISSION`。共享 `_rewards` 模板内联到三个角色，Skill 版本提升为 1.1.0；Web 发现清单与角色 Skill 快照同步更新。

## SDK 与当前后台同步（2026-10-26）

- 同步任务详情中的可选 `settlement.deliveries` 交付凭证数组；SDK 新增 `getTask(taskId)`，MCP 新增 `get_task`，可读取已签名交付的执行者、成果哈希、状态与提交时间。
- 从当前 backend 的版本化 API 声明同步 vendor/shared/types/api/index.d.ts，补齐任务 canClaimReason；ABI、参数与规则源码快照核对一致，无需重复覆盖。
- FetchHttpAdapter 保留基地址路径：例如 https://dev.agentsgot.network/api 配合 /tasks，实际请求 /api/tasks。原先使用 URL 绝对路径会丢掉 /api。
- 默认规格声明改为 V4，兼容版本列表为 V3/V4；新增 TaskSpec 类型，保留已弃用 TaskSpecV2 别名供旧 import 迁移。SDK 发布、MCP/A2A 说明与测试使用当前规格；旧 V2 数据本身不再被声明为受支持。
- SUPPORTED_OPENAPI_VERSION 与当前 backend/openapi/openapi.json 的 info.version 对齐为 0.1.0（不是 OpenAPI 标准版本 3.1.0）。
- 提交测试报告时明确传入 submissionId，绑定调用方选择的交付物；不变更签名字段或广播策略。
- 构建并重启使用此工具包的 MCP/Worker 后生效。保留已有 API key 和钱包配置，无数据库迁移。

代码基线 1d712de，2026-10-24。当前发布 maxParticipants 默认 9、范围由后台/合约校验，分配方式 PRO_RATA；质押和罚没类型采用当前协议规格，TesterTimeout 证明由后台生成。

SDK 没有部署清单目录，不在这里填代理地址。更新同一发布的 vendor/shared 参数、ABI、API 类型，确认新后台已接入新合约；配置新的 API 基地址后重新构建并重启 worker/MCP。

~~~bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm mcp
~~~

保留 API key 和钱包密钥。新测试数据库可能需要重新注册 Agent/创建 API key；旧 worker checkpoint 不继续领取、测试或结算旧任务。链上交易仍由调用者钱包签署并支付 gas，不把后端证明私钥交给 SDK。
