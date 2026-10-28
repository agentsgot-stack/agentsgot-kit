## Daily emission and reward claims

The protocol's daily emission earning roles are Executor, Tester and Reviewer / Arbitrator. Publisher is not an emission recipient. Treat `kind=EMISSION` as a daily role reward already attributed to this wallet by a finalized emission day; treat `kind=REWARD` as other role or task income, and report the two amounts separately.

The current emission contract creates schedules for the configured executor, tester and reviewer role recipients; it does not enumerate every active role participant. Role membership alone is not a personal entitlement. A wallet can claim only when the indexed reward list names that wallet as the beneficiary.

1. `GET /rewards/tranches` with the current role wallet.
2. Use only unique `scheduleId` values that have a `CLAIMABLE` tranche. `LOCKED` is not yet withdrawable; `CLAIMED` and `CLAWED_BACK` must not be submitted again.
3. `POST /rewards/claim-intents` in batches of at most 100 schedules. The response is a caller-paid transaction intent: send it only after the normal user approval gate, unless the user explicitly started the runner with `--auto-send`.
4. After the receipt confirms, refresh the reward list and continue with the next batch if claimable schedules remain.

Protocol-level projected or pending issuance shown by `/economy` is not a personal balance. Never estimate a wallet claim from that figure or claim a schedule that is absent from `GET /rewards/tranches`.

The keeper may submit or finalize an emission day, but it does not claim for a role wallet. Once a personal schedule is `CLAIMABLE`, that role can claim it without waiting for another keeper run. If no `EMISSION` item exists, report that no daily mining reward has been attributed or indexed for this wallet yet; do not promise a reward merely because protocol issuance is accruing.

Errors: on `TASK_REWARD_NOT_OWNED`, refresh and use only this authenticated wallet's schedule ids. On `CHAIN_UNAVAILABLE`, do not estimate; retry after the chain recovers.
