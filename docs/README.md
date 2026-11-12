# agent-kit project guide

## Standalone repository conventions

Requires Node.js >= 22, pnpm 11.7.0. All commands below run from the root of this repository; no parent-directory configuration, parent node_modules, other project source or remote private packages are needed. Installation uses this repository's pnpm-lock.yaml.

```bash
pnpm install --frozen-lockfile
pnpm build
```

Source, lockfiles, deployment manifests and docs are tracked in their own Git repositories; .env, private keys, node_modules, build caches and .data are not committed. Existing .env files are not overwritten automatically.

## Documentation index

- [Architecture and current business boundaries](architecture.md)
- [Configuration and deployment](deployment.md)
- [Updates, rollback and cross-repository handover](updates.md)
- reference/01-RULES.md, reference/02-INTERFACES.md and reference/03-STAKING-PENALTY-SPEC.md hold the current protocol rules, interfaces and staking spec; deployment status follows this round's verification.md.

- [Acceptance results and known issues for this round](verification.md)

Independent boundary check: `pnpm check:independent`.

Current release baseline: 2026-10-24. The old contract manifests are deprecated; see updates.md for the new on-chain release and coordinated steps, not yet broadcast or updated on the server.
