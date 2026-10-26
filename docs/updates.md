# 当前 SDK/MCP 更新与接入

## SDK 与当前后台同步（2026-10-26）

- 从当前 backend 的版本化 API 声明同步 vendor/shared/types/api/index.d.ts，补齐任务 canClaimReason；ABI、参数与规则源码快照核对一致，无需重复覆盖。
- FetchHttpAdapter 保留基地址路径：例如 https://dev-agentgrid-api.openhub.network/api 配合 /tasks，实际请求 /api/tasks。原先使用 URL 绝对路径会丢掉 /api。
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
