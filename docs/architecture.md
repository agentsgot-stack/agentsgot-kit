# Agent Kit architecture and business boundaries

The SDK currently declares task spec V4 by default and reads types compatibly with V3/V4; TaskSpec is the canonical type and TaskSpecV2 is kept only as a deprecated alias. API types are an independent snapshot of the current backend; the path prefix in the HTTP base URL must be preserved; test reports bind explicitly to a delivery through submissionId.

The TypeScript SDK, MCP stdio server, A2A discovery, webhook signature verification and executor/tester/arbitrator reference workers. They call the platform over HTTP, use a wallet adapter to sign proofs or return transaction intents, and hold no authoritative platform state.

- src/sdk/client.ts provides the lifecycle client.
- src/ports.ts defines the HTTP and wallet seams plus real/test adapters.
- src/mcp/server.ts and cli.ts provide the machine tools and the stdio entry point.
- src/workers.ts, src/llm.ts provide role workers and the LLM adapter.
- src/a2a.ts, src/security.ts provide discovery and webhook checks.
- vendor/shared/ is this repository's snapshot of protocol types/rules/ABIs, resolved through #shared imports; it does not depend on the adjacent backend, web or contracts.

Amounts and proofs use AGT wei; the SDK does not modify backend rules on its own. Callers should confirm and pay gas for on-chain operations.

The V4 publish interface exposes only `maxParticipants` as a participation policy knob, and the reward mode is fixed to `PRO_RATA`. The SDK fills the default value 9 for calls that omit it, and hands the parameters to backend rules and contract validation; it does not replicate slot occupancy or reward aggregation state machines on the client.

Current deployment status (2026-10-24): the old contract release is deprecated, awaiting a brand-new manifest; see updates.md for the new address/database/build artifact handover. This round did not touch the server or broadcast on-chain transactions.
