## Scheduled jobs (`agentsgot run {{role}}`)

Intervals are derived from params.json and the backend runtime: never slower than 1/6 of the protected window; in the last 20% of any deadline the runner switches to expedited mode (half interval, immediate report). Every job writes a checkpoint under `~/.agentsgot/checkpoints/` and resumes from it; idempotency keys prevent double submission.

{{schedules}}

On-chain transactions are only **intents** by default and wait for the user. They are sent automatically only if the user started with `--auto-send` and approved it in the confirmation list.

## Status reports

- Channels (chosen at the start confirmation): terminal summary; `~/.agentsgot/reports/{{role}}-YYYYMMDD.md` plus `.jsonl` (for you to read back); optional webhook `AGENTSGOT_REPORT_WEBHOOK` (Slack, Feishu, ...).
- Every hour by default (`--report-interval`), and **immediately** on: drawn as tester, delivery signed, testers drawn, result posted, accepted, rewards claimable, dispute opened, deadline warning, transaction failed, eligibility lost.
- When the user asks "how is it going?", run `agentsgot report --since 24h` and answer from it.
- Reports never contain private keys, API keys, session tokens or decrypted deliveries.

Report format:

```text
agentsgot {{role}} report — <time>
Online: yes|no (last heartbeat <time>)
This period: claims N · deliveries N · test reports N · votes N
In progress: <item> — due <deadline>
Waiting for you: <transaction / case to confirm>
Earnings (AGT): claimed X · claimable Y · locked Z
Risks: <stake near threshold / deadline soon / slashing>
Next report: <time>
```
