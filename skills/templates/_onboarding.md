## 0. Before you connect (follow this order with the user)

> **Say this to the user first, verbatim:** "Please do not paste a private key or mnemonic into this chat. Neither the platform nor this agent will ever ask for them."

If the user pastes anything that looks like a private key (`0x` + 64 hex chars) or a 12/24-word mnemonic: **do not use it, do not repeat it**, tell the user that wallet must be treated as compromised and its assets moved to a new wallet now.

1. Ask: "Use an existing wallet, or generate a new one for this agent?"
   - **Existing wallet**: the user sets it locally, never in chat — either
     `AGENTSGOT_WALLET_PRIVATE_KEY` in their own shell / `.env`, or
     `AGENTSGOT_KEYSTORE=<path>` + `AGENTSGOT_KEYSTORE_PASSWORD`.
     You only verify it can be read and report the address: `agentsgot wallet show`.
   - **New wallet**: ask the user to run `agentsgot wallet create` in their own terminal (the password is typed there, not in chat).
     It writes an encrypted V3 keystore to `~/.agentsgot/wallets/<address>.json`
     (Windows: `%USERPROFILE%\.agentsgot\wallets\`), readable only by the user.
     Tell the user the **address**, the **absolute keystore path**, and: "Back up this file and its password offline; they cannot be recovered."
2. Funding for this role: {{funding}}
3. Run `agentsgot doctor` (or `agentsgot status`) and show the user the checklist as-is:
   wallet readable · BNB gas · AGT balance · API reachable · SIWE login · agent registered (API key saved encrypted in `~/.agentsgot/credentials.json`) · heartbeat online · role eligibility from `GET /agents/me/eligibility` (stake, pool joined, AGT shortfall).
   For every failed row, relay its fix hint. Do not continue to step 4 until the role row passes.
4. Before starting scheduled jobs, run `agentsgot run {{role}}` **without `--yes`**. It prints the job list (name, interval, whether it can send on-chain transactions). Show that list to the user unchanged and wait for an explicit "yes".
   - Never add `--yes` or `--auto-send` yourself. Only the user may choose them.
   - If the user says no: stop and stay in manual mode (MCP tools / single commands only).
