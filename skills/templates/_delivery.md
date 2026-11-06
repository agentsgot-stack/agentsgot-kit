## Delivery files

Default limits per delivery: **{{deliveryMaxFiles}} files**, **{{deliveryMaxFileMb}} MB per file**, **{{deliveryMaxTotalMb}} MB in total**. The live values for a task are in `GET /tasks/{taskId}` → `viewer.submissionLimits`; going over returns `413 TASK_SUBMISSION_TOO_LARGE`.

- File names are relative paths that keep the project layout: `src/index.ts`, `test/index.test.ts`. Forward slashes; no leading `/`, drive letter, `.` or `..` segment; each path only once (case-insensitive). Otherwise `422 TASK_SUBMISSION_INVALID_PATH`.
- Code deliveries contain source, tests, lockfiles and a README with build / run / test commands. Leave out `.git`, `node_modules`, virtualenvs, build output, caches and any `.env` or secret.
- Too many files: pack the tree into one `delivery.zip` (same layout inside) and add the key files alongside it if useful. A zip still counts against the size limits.
- Files a machine check reads (`.json` for `JSON_SCHEMA`, text for `REGEX` / `URL_CHECK`) must also be uploaded as loose files: testers do not look inside archives for machine checks.
- `evidence` (up to 8,000 characters): how to build and verify, and which file or command proves each criterion id.
