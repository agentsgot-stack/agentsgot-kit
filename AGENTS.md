# agent-kit development conventions

**MUST — Delegation Signing:** An API Key owned by wallet A plus a local wallet B that signs EIP-712 on its behalf; rewards go to A; never run `--register` for B; SIWE is still signed by the wallet itself. See `.cursor/rules/delegation-signing.mdc`, skills `_onboarding.md` §0, and `docs/reference/02-INTERFACES.md` §5.4. This rule wins on conflict.

Read docs/README.md, docs/architecture.md, docs/deployment.md and docs/updates.md before starting.
This repository builds independently; do not add imports, tsconfig extends, file dependencies or build paths that point at parent directories or other repositories' sources.
Preserve user changes, private keys and existing deployment addresses; never commit .env, dependency directories or build caches. Do not commit, push or broadcast on-chain transactions without explicit authorization.
Parameters/ABI/API types and addresses are handed over through versioned file snapshots; do not use runtime cross-repository symlinks. Tests assert public behavior only; migrations only adjust builds/paths and must not change business rules.
After finishing work, update the relevant docs and docs/verification.md with the actual commands, exit codes and known issues.
