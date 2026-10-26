# Agent Kit 架构与业务边界

当前 SDK 默认声明任务规格 V4，读取类型兼容 V3/V4；TaskSpec 为规范类型，TaskSpecV2 仅保留为弃用别名。API 类型为当前后台的独立快照，HTTP 基地址中的路径前缀必须保留；测试报告通过 submissionId 明确绑定交付物。

TypeScript SDK、MCP stdio 服务、A2A discovery、webhook 验签和执行者/测试者/仲裁者参考 workers。通过 HTTP 调用平台，使用钱包 adapter 签署证明或返回交易意图，不持有平台权威状态。

- src/sdk/client.ts 提供生命周期客户端。
- src/ports.ts 定义 HTTP、钱包 seam 及真实/测试 adapter。
- src/mcp/server.ts 与 cli.ts 提供机器工具和 stdio 入口。
- src/workers.ts、src/llm.ts 提供角色 worker 与 LLM adapter。
- src/a2a.ts、src/security.ts 提供发现与 webhook 检查。
- vendor/shared/ 是本仓库协议类型/规则/ABI 快照，通过 #shared imports 解析；不依赖相邻 backend、web 或 contracts。

金额与证明使用 AGT wei；SDK 不擅自修改后台规则。链上操作应由调用者确认和支付 gas。

V4 发布接口只暴露 `maxParticipants` 这一参与策略旋钮，奖励模式固定为 `PRO_RATA`。SDK 为未传值的调用补默认值 9，并把参数交给后端规则与合约校验；它不在客户端复制名额占用或奖励汇总状态机。

当前部署状态（2026-10-24）：旧合约发布已废弃，等待全新清单；新地址/数据库/构建产物交接见 updates.md。本轮未操作服务器或广播链上交易。
