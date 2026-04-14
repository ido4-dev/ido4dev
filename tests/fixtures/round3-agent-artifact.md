# ido4shape Enterprise Cloud Platform — Technical Spec
> Decomposed from: `specs/ido4shape-enterprise-cloud-spec.md`
> Canvas source: `specs/ido4shape-enterprise-cloud-canvas.md`

> Technical decomposition of the ido4shape enterprise cloud platform. Adds cloud-based collaboration (shared workspaces, multi-user sync, web viewer) to the ido4shape specification plugin while keeping local-only mode byte-identical to v0.4.2. Greenfield monorepo scoped to an API (Hono/Fastify on Cloud Run), a Next.js web viewer, a bundled JS plugin-cloud-client, and a PR-ready patch set against `/dev-projects/ido4shape`. Backs onto GCP managed services (Cloud Run, Cloud SQL Postgres, GCS) with third-party auth (Clerk/WorkOS/Auth0 — TBD) and email (Resend/Postmark — TBD). Four technical-only capabilities (INFRA-01 provisioning, PLAT-01 platform foundation, INFRA-02 operational baseline, PLAT-02 plugin parity harness) sit before the strategic capabilities because they carry the cross-cutting concerns the canvas flagged as horizontal gaps.

**Constraints:**
- Standalone parity (HARD): cloud mode is strictly additive; with `cloudMode.enabled=false` the plugin makes zero network calls and behaves byte-identically to v0.4.2. Enforced by `tests/validate-plugin.sh` plus a parity reference-run diff harness (PLAT-02).
- Strategic spec remains the handoff point: the cloud platform produces spec markdown; ido4 consumes it as a string parameter. No cloud→MCP wiring in v1; PROJ-04 export is the manual bridge.
- Session-based sync (D1): one stakeholder per project at a time; async push during session; reconcile on session close.
- Email delivery is load-bearing (D8 consequence): the 45-minute lock warning is on the critical path for session lock recovery. Email vendor reliability is a first-class reliability concern, not a notifications concern.
- No server-side canvas parsing (D9): the server treats workspace files as opaque blobs. The only structured knowledge the server keeps about canvas content is comment heading-paths, and even those are captured at create time, not parsed from content.
- Managed-services posture (D13): aggressive use of GCP managed services and third-party auth/email to minimize operational surface.
- Role enum is verbatim `PM | Architect | UX | Business | QA` — matches `ido4shape/skills/create-spec/references/stakeholder-profiles.md` exactly. No translation layer.
- Plugin language stays Bash; cloud sync logic lives in a bundled JS helper invoked via `scripts/cloud-sync.sh`, mirroring the `dist/spec-validator.js` pattern.
- API key is per-user (not shared org-wide) and never stored in `.ido4shape/` workspace files. Key lives in `${CLAUDE_PLUGIN_DATA}/cloud-api-key` with file mode 0600.
- Multi-tenant isolation is non-negotiable: every API query MUST filter by `org_id` derived from the authenticated key via a tenant-aware repository pattern (PLAT-01). A single missed filter is a cross-tenant data leak.
- All endpoints require HTTPS; all plugin↔cloud traffic uses `Authorization: Bearer {api_key}`.

**Non-goals:**
- Real-time collaborative editing (Google Docs-style) — session-based model is sufficient and simpler.
- Workflow orchestration engine (automated triggers, role-based stage gates) — v1 is notifications only.
- Replacing GitHub for code, technical specs, or issues — GitHub remains the home for execution.
- Degrading the standalone experience in any way — zero net-new friction for local-only users.
- GDPR compliance, deep audit logging for regulated industries, data export tooling, MFA — deferred to v2 but audit table kept generic enough to extend without schema migration.
- Direct cloud→ido4 integration in v1 — PROJ-04 export is the seam.
- Server-side markdown semantic parsing of any kind — the plugin is the sole canvas authority (D9).

**Open questions:**
- Auth vendor: Clerk vs WorkOS vs Auth0. Clerk is most 2-3-team-friendly; WorkOS scales to SSO for later enterprise tier; Auth0 lacks a first-class organization primitive. PLAT-01 resolves via a research spike before AUTH-01 lands.
- Email vendor: Resend vs Postmark. Postmark has historically higher transactional deliverability; Resend has better DX. Load-bearing for D8. PLAT-01 resolves via a research spike before STOR-05 lands.
- Lock-warning response convention: HTTP 418 overload vs standard 200 with `lock_warning: true` flag. Canvas recommends the 200 flag; STOR-05 makes the call.
- Push queue enqueue model: filesystem watcher sidecar vs hook-based enqueue from `PreToolUse(Write)`/`Stop`. Canvas recommends the hook-based fallback; PLUG-02 research spike confirms before coding.
- Orphan detection for comments: fully client-side in the web viewer vs a tightly bounded server helper that parses only heading hierarchy. STOR-04 research spike picks one.
- Role-relevant notification filtering: filter by filename server-side vs client-side at render time vs defer. VIEW-05 research spike resolves.

---

## Capability: INFRA-01 — Cloud Infrastructure Provisioning
> size: L | risk: medium

Greenfield cloud infrastructure expressed as Terraform. Part of Technical Foundation (must-have) — the canvas calls out "operational reliability → ecosystem reality" as a horizontal concern not tied to any strategic capability, and this capability is the foundation every strategic capability implicitly sits on. Without it there is no bucket for STOR-01, no database for AUTH/STOR/VIEW/PROJ, no Cloud Run service for the API, no DNS/TLS for the web UI, and no secret store for the auth/email vendor credentials that AUTH-01/STOR-05/VIEW-05 consume. The canvas projects a two-environment setup (`dev`, `prod`) on GCP with Cloud Run + Cloud SQL Postgres + GCS + Cloudflare per D13. Per D9, the GCS bucket MUST have object versioning enabled and the service account MUST NOT have `storage.objects.delete` permission — append-only semantics are IAM-enforced, not code-enforced. This capability does not implement application code; it produces the `infra/terraform/` directory the rest of the system deploys against.

### INFRA-01A: GCS workspace bucket with object versioning and append-only IAM
> effort: M | risk: medium | type: infrastructure | ai: assisted
> depends_on: -

Create the Terraform module at `infra/terraform/modules/gcs-workspace-bucket/` that provisions the workspace bucket `gs://ido4shape-cloud-{env}/` with object versioning enabled, a lifecycle policy that keeps all non-current versions indefinitely, and two service accounts: a read/write service account used by the API (grants `storage.objects.create`, `storage.objects.get`, `storage.objects.list` but NOT `storage.objects.delete`) and a privileged "purge" service account used only by the PROJ-01 hard-delete job (full delete permissions, used asynchronously). Bucket layout follows the canvas: `orgs/{org_id}/projects/{project_id}/files/{filename}` for workspace files (append-only), `orgs/{org_id}/projects/{project_id}/sources/{filename}` for mutable source materials (PROJ-02), `orgs/{org_id}/projects/{project_id}/artifacts/{filename}` for spec artifacts (PROJ-03). Per canvas, sources and workspace files must have different IAM policies because sources are mutable — express this as a path-prefix-scoped IAM binding.

**Success conditions:**
- `terraform apply` in the `dev` workspace creates a bucket with `versioning.enabled = true` and the read/write service account cannot delete objects (verified by an attempted delete call in a Terraform test).
- Write to `orgs/a/projects/b/files/canvas.md` succeeds; a second write produces a new GCS generation; the first generation is still retrievable via `generation=` query parameter.
- Write to `orgs/a/projects/b/sources/data.csv` succeeds and `delete` succeeds (sources bucket prefix allows delete).
- Purge service account credentials are stored in Secret Manager, not in Terraform state or environment variables.

### INFRA-01B: Cloud SQL Postgres instance with managed backups
> effort: M | risk: medium | type: infrastructure | ai: assisted
> depends_on: -

Terraform module at `infra/terraform/modules/cloud-sql/` that provisions a Cloud SQL Postgres 15 instance per environment with: automated daily backups retained 30 days (satisfies quality bar #5 from strategic spec), point-in-time recovery enabled, private IP with a VPC connector for Cloud Run access, a database user for the API with minimum privileges (CRUD on the `app` schema, no DDL outside migration windows), and a separate migration user with DDL rights used only by CI and the migration job. The instance tier for `dev` is `db-f1-micro`; `prod` tier is a parameter. Emit the connection string as a Secret Manager secret, not a Terraform output. Include a restore-from-backup runbook step in `infra/runbooks/db-restore.md` that is validated by a Terraform test.

**Success conditions:**
- `terraform apply` creates an instance with automated backups enabled and point-in-time recovery on.
- The API service account cannot execute `DROP TABLE` or `CREATE TABLE` — only the migration service account can.
- A smoke test restores `dev` from the most recent automated backup in under 10 minutes and the smoke test passes.
- Connection strings are only accessible via Secret Manager; no plaintext in Terraform state files (verified via `terraform state pull`).

### INFRA-01C: Cloud Run API + Web services with warm instance and VPC connector
> effort: M | risk: medium | type: infrastructure | ai: assisted
> depends_on: INFRA-01B

Terraform module at `infra/terraform/modules/cloud-run/` that provisions two Cloud Run services: `api-{env}` (for `apps/api/`) and `web-{env}` (for `apps/web/`). Both deploy via container images published from CI. The API service has a minimum instance count of 1 in `prod` to mitigate the STOR-03 500ms p95 latency concern from the canvas (cold starts otherwise blow the SLO). Both services use the VPC connector from INFRA-01B to reach Cloud SQL privately. The API service binds the workspace-bucket read/write service account from INFRA-01A and the Cloud SQL connection string from Secret Manager. A Cloud Tasks queue `lock-ttl-scans` is provisioned here (STOR-05 dispatches TTL warning scans through it). Per canvas, the email subsystem fan-out for VIEW-05 also goes through a Cloud Tasks queue `notification-fanout` — provision it here too.

**Success conditions:**
- `terraform apply` produces two Cloud Run services with min_instances=1 for `api-prod` and min_instances=0 for `api-dev`.
- API cold-start p95 measured against the lowest-tier endpoint stays below 800ms (leaves headroom for STOR-03's 500ms application-level SLO).
- Cloud Tasks queues `lock-ttl-scans` and `notification-fanout` exist and the API service account can enqueue to both.
- A deployment failure in `dev` does not affect `prod` traffic (separate service isolation verified by a smoke test).

### INFRA-01D: Cloudflare DNS, TLS, and CDN fronting
> effort: S | risk: low | type: infrastructure | ai: assisted
> depends_on: INFRA-01C

Terraform module at `infra/terraform/modules/cloudflare/` that sets up DNS records (`api.ido4shape.cloud`, `app.ido4shape.cloud`, `{env}.api.ido4shape.cloud`), TLS certificates via Cloudflare origin certificates, WAF rules that rate-limit the `/auth/*` endpoints (mitigates invite token guessing from AUTH-05 and API key brute force from AUTH-04), and a page rule that bypasses cache for all API paths. Per the canvas, the 418 lock-warning convention is fragile partly because of CDN middleware behavior — this is where that risk manifests, so explicitly disable cache on `/orgs/*/projects/*/lock` to avoid any middleware touching the response. Cloudflare secrets are stored in Secret Manager.

**Success conditions:**
- DNS resolution for `api.ido4shape.cloud` and `app.ido4shape.cloud` works end-to-end after `terraform apply`.
- Rate limit on `/auth/*` blocks more than 100 requests per minute from a single IP (validated via a synthetic request burst).
- Cache is bypassed for all `/orgs/*` paths (validated by checking `CF-Cache-Status: BYPASS` on a sample request).

### INFRA-01E: Secret Manager and environment variable strategy
> effort: S | risk: low | type: infrastructure | ai: assisted
> depends_on: INFRA-01B

Define the secrets convention in `infra/terraform/modules/secrets/` and document it in `infra/runbooks/secrets.md`. Secrets stored: Cloud SQL connection string, GCS service account JSON, auth vendor API keys, email vendor API keys, Cloudflare API token, webhook signing keys for PLUG-04 email delivery callbacks. Convention: one secret per `{purpose}-{env}` pair, mounted into Cloud Run as environment variables via the Cloud Run secret reference syntax. Per canvas, secrets rotation is a runbook step, not an automated feature in v1 — document the rotation procedure and validate it in `dev` once.

**Success conditions:**
- All secrets are accessible by the API service account via environment variable injection and not visible in Terraform state.
- Rotation runbook successfully rotates a secret in `dev` without downtime (tested by rotating the GCS SA key).
- No secret appears in any `.tf` file in plaintext (grep check in CI).

---

## Capability: PLAT-01 — Monorepo and API Platform Foundation
> size: L | risk: medium

TypeScript monorepo scaffolding, shared types, migration framework, and the API platform layer every strategic capability builds on. Part of Technical Foundation (must-have) — the canvas's "what's built" table enumerates cross-capability prerequisites (DB migration framework, shared-types package, tenant-aware repository pattern, auth/email vendor decisions) that do not belong to any single strategic capability. Without this capability there is no monorepo to add routes to, no migration framework for AUTH-01 to create `users` in, no `shared-types/Role` for AUTH-03/PLUG-04 to import, and no tenant-aware repository the canvas explicitly calls a "non-negotiable convention" for multi-tenant safety. Two research spikes live here too: auth vendor selection (blocks AUTH-01) and email vendor selection (blocks STOR-05 and VIEW-05) — the canvas flags both as blocking Discoveries.

### PLAT-01A: TypeScript monorepo scaffold with apps/api, apps/web, packages
> effort: M | risk: low | type: infrastructure | ai: full
> depends_on: -

Create the monorepo layout projected by the canvas: `apps/api/` (Hono or Fastify — pick in PLAT-01B), `apps/web/` (Next.js App Router), `packages/shared-types/`, `packages/api-client/`, `packages/plugin-cloud-client/`, `infra/`, `plugin-changes/`. Use pnpm workspaces or npm workspaces with TS project references so `apps/api` and `apps/web` can import `packages/shared-types` and `packages/api-client` with end-to-end type safety. Root `tsconfig.base.json` enforces strict mode, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. ESLint + Prettier configured at the root, CI runs `tsc --noEmit` across all packages plus lint on every PR. No runtime code in this task — it is the scaffold other tasks land code into.

**Success conditions:**
- `pnpm install` at the repo root installs all workspaces and produces zero type errors across `apps/` and `packages/`.
- A trivial import of `@ido4shape-cloud/shared-types` from `apps/api/src/` type-checks.
- CI job `typecheck` runs `tsc --noEmit` across all workspaces and is green.
- Root `package.json` declares `@ido4/mcp` as a dependency (preserved from the existing `package.json` in the repo root).

### PLAT-01B: API framework scaffold (Hono or Fastify) with middleware pipeline
> effort: M | risk: low | type: infrastructure | ai: assisted
> depends_on: PLAT-01A

Decide between Hono and Fastify (Hono preferred for Cloud Run cold-start friendliness per canvas) and scaffold `apps/api/src/` with: `index.ts` entry point, `routes/` directory (one file per endpoint group from the canvas API surface table), `services/`, `db/`, `storage/`, `auth/`, `notifications/`, `jobs/`. Middleware pipeline: request ID injection, structured JSON logging (for later Cloud Logging integration), error handler that maps thrown `ApiError` to structured responses, authentication resolver (both API key and OAuth session — stubbed, AUTH-01/AUTH-04 wire the real resolvers in), a tenant-resolver middleware that extracts `org_id` from the authenticated principal and attaches it to the request context. Health check at `/health` returns 200 with `{status:"ok", commit, uptime}`. All routes are typed end-to-end via shared-types.

**Success conditions:**
- `GET /health` returns 200 with commit SHA from the build metadata.
- A request without any auth header to a protected route returns 401 with a structured `ApiError` body.
- A request body that fails shared-types Zod validation returns 400 with field-level errors.
- Integration test verifies the middleware pipeline order: logger → error handler → auth resolver → tenant resolver → route handler.

### PLAT-01C: Database migration framework and baseline schema migration
> effort: M | risk: low | type: infrastructure | ai: full
> depends_on: PLAT-01A

Pick a migration framework (Drizzle or node-pg-migrate — Drizzle preferred for type safety with shared-types) and wire it in `apps/api/src/db/`. Baseline migration `0001_init.sql` creates the empty `app` schema and the `schema_migrations` tracking table only — actual tables come in per-capability migrations (AUTH-01 creates `users`, AUTH-02 creates `orgs`, etc). CI runs migrations against an ephemeral Postgres container on every PR. Include a `migrate:create`, `migrate:up`, `migrate:down`, `migrate:status` script in `package.json`. Document rollback policy: non-destructive forward migrations only in `prod`; rollbacks are expressed as new forward migrations. Connection string is resolved from the `DATABASE_URL` secret (INFRA-01E).

**Success conditions:**
- `pnpm migrate:up` against a fresh Postgres creates the `app` schema and `schema_migrations` table.
- `pnpm migrate:status` reports the current migration and any pending.
- CI integration test runs all migrations against a Postgres container and asserts the schema matches a committed snapshot.
- Attempting to run a migration as the API service account fails with permission denied (only the migration account has DDL).

### PLAT-01D: Shared-types package with tenant-aware repository pattern
> effort: M | risk: medium | type: infrastructure | ai: pair
> depends_on: PLAT-01B, PLAT-01C

Define the shared types the canvas calls out as cross-capability contracts in `packages/shared-types/src/`: `User`, `Org`, `OrgMember`, `Project`, `ProjectMember`, `Role` (string-literal union `'PM' | 'Architect' | 'UX' | 'Business' | 'QA'` — must match `ido4shape/skills/create-spec/references/stakeholder-profiles.md` casing exactly), `ApiError`, `Commit`, `CommitFile`, `Comment`, `HeadingPath` (opaque branded string, format agreed in STOR-04/VIEW-03), `SessionLock`, `LockAudit`, `Notification`, `NotificationPref`. Each exported as both a Zod schema and a TS type. Implement the tenant-aware repository pattern at `apps/api/src/db/repo.ts` — a base class that every repository MUST extend, whose `query()` and `exec()` methods require an `orgId` argument and automatically inject `AND org_id = $N` into every query. The canvas explicitly calls this "the most likely place for a security bug" — make bypassing it a type error, not a runtime check. Per Marcus (Architect persona in canvas, Cross-Cutting "Security & Access Control"): multi-tenant query discipline is non-negotiable.

**Success conditions:**
- `Role` literal union imported from `shared-types` matches the exact strings in `ido4shape/skills/create-spec/references/stakeholder-profiles.md` (verified by a runtime assertion test).
- `BaseRepo.query()` rejects at compile time any call that does not pass `orgId`.
- Integration test writes a row to `users` under `orgA` and a query from a `BaseRepo` instance scoped to `orgB` returns zero rows.
- All shared types have a Zod schema and a type exported side-by-side with matching names.

### PLAT-01E: Auth vendor selection and SDK integration spike
> effort: M | risk: high | type: research | ai: pair
> depends_on: PLAT-01B

Per canvas Discovery #9 ("AUTH vendor selection shapes AUTH-01 and AUTH-02"), produce a decision document at `docs/decisions/auth-vendor.md` evaluating Clerk, WorkOS, and Auth0 against: first-class organization primitive (Clerk/WorkOS yes, Auth0 no — Auth0 means building the org layer from scratch per canvas), SSO readiness for v2 enterprise tier, pricing at 15-30 user scale, Next.js App Router integration quality, and migration cost to a different vendor later. Resolve to one vendor. Produce a minimal working spike: an `/auth/callback` route in `apps/api/src/routes/auth.ts` that accepts the OAuth callback from the chosen provider and upserts a stub row in a temporary `_auth_spike` table. The spike is throwaway — AUTH-01 replaces it with the real `users` table integration. Per canvas, this is blocking: AUTH-01 cannot begin until the vendor is chosen.

**Success conditions:**
- `docs/decisions/auth-vendor.md` contains a decision with named trade-offs and a reversal cost estimate.
- The chosen vendor's SDK is installed in `apps/api/package.json` and `apps/web/package.json`.
- An end-to-end OAuth flow against the chosen vendor's test environment creates a stub row in `_auth_spike` when run locally.

### PLAT-01F: Email vendor selection and transactional template spike
> effort: S | risk: high | type: research | ai: assisted
> depends_on: PLAT-01B

Per canvas Discovery #8 ("Email vendor selection is on the critical path of D8"), produce a decision document at `docs/decisions/email-vendor.md` evaluating Resend vs Postmark against: historical transactional deliverability SLO, webhook for delivery callbacks (STOR-05 lock warning must be verifiable), template system for parameterized emails, pricing at the projected MAU scale, and incident history. Per canvas, email is load-bearing for D8 (45-minute lock warning) — pick the higher-deliverability provider and accept worse DX if that is the trade. Produce a minimal spike: a template + send call that delivers to a test address with the delivery webhook recorded. The spike is throwaway — AUTH-05 and STOR-05 replace it with real fan-out logic. Blocking for STOR-05 and VIEW-05.

**Success conditions:**
- `docs/decisions/email-vendor.md` contains a decision with the load-bearing-for-D8 framing explicitly weighed.
- A test send delivers to a configured test address and the delivery webhook fires within 5 seconds.
- Vendor API credentials are loaded from the Secret Manager secret conventions in INFRA-01E.

---

## Capability: INFRA-02 — Operational Baseline
> size: M | risk: medium

Uptime monitoring, backup verification, runbooks, on-call rotation, and the email-health SLO the canvas calls out as a horizontal investment not tied to any single capability. Part of Technical Foundation (must-have) — the canvas's "Operational Reliability → Ecosystem Reality" cross-cutting concern explicitly says "operational baseline is the spec's quality bar #5 but is NOT tied to any single capability — it's a horizontal investment that the technical spec writer must surface as ops/infrastructure tasks." ido4shape today has zero operational surface (ship plugin, done). Cloud platform means uptime pager, Postgres + GCS backup verification, on-call, incident runbooks, email-delivery SLO monitoring (because D8 makes email load-bearing so vendor uptime alone is necessary but not sufficient), and a cost dashboard per D13 trade-off. Everything here runs continuously in production and the PM persona (Bogdan) will be the first on-call.

### INFRA-02A: Uptime monitoring and alerting with on-call rotation
> effort: S | risk: low | type: infrastructure | ai: assisted
> depends_on: INFRA-01C

Set up synthetic uptime checks against `https://api.ido4shape.cloud/health`, `https://app.ido4shape.cloud/`, and the auth vendor's login endpoint (per canvas, auth vendor outage = users cannot sign in; monitor it even though we do not operate it). Use GCP Cloud Monitoring uptime checks with 1-minute probe frequency, alert on two consecutive failures. Alerts route to PagerDuty (or equivalent) and then to the on-call rotation. Create the initial on-call schedule at `infra/runbooks/on-call-rotation.md` with one person (Bogdan) for v1 plus the escalation runbook.

**Success conditions:**
- An uptime check failure triggers a PagerDuty alert within 3 minutes.
- The on-call runbook documents escalation paths and the acknowledge/resolve workflow.
- A synthetic failure test (take `dev` API down) fires and clears the alert cleanly.

### INFRA-02B: Automated Postgres and GCS backup verification job
> effort: M | risk: medium | type: infrastructure | ai: assisted
> depends_on: INFRA-01B, INFRA-01A

Cloud Run job at `apps/jobs/backup-verification/` that runs nightly: restores the most recent Cloud SQL automated backup into a throwaway verification instance, runs a SELECT-count sanity check against the `commits` and `comments` tables, and tears the verification instance down. Separately, lists the most recent N GCS object versions for each project and asserts they are retrievable. Failures alert to the on-call channel. Canvas quality bar #5: "Automated Postgres + GCS backup verification jobs" are explicitly called out as "what's built" that must ship alongside the baseline infrastructure.

**Success conditions:**
- Nightly job completes under 15 minutes and produces a structured success/failure record.
- A deliberately corrupted backup in `dev` causes the job to fail and alert the on-call.
- GCS object retrievability check covers the 10 most recent versions of `canvas.md` for each active project.

### INFRA-02C: Email delivery SLO monitoring and health dashboard
> effort: M | risk: high | type: infrastructure | ai: pair
> depends_on: PLAT-01F, INFRA-02A

Wire the email vendor's delivery webhook (Resend or Postmark — PLAT-01F) to a Cloud Run endpoint `/webhooks/email/delivery` that records every send → delivered/bounced/complained transition in a `email_delivery_events` table. Build a Grafana or Cloud Monitoring dashboard that tracks: delivery rate over 1h/24h windows, median delivery latency, bounce rate, and the 45-minute-lock-warning email-specific delivery rate (STOR-05 tags these emails). Alert rule: if delivery rate drops below 99% over 15 minutes for lock-warning emails, page on-call immediately. Per canvas "Operational Reliability → Ecosystem Reality" cross-cutting, email vendor uptime is necessary but not sufficient — we need our own SLO plus alert because D8 makes email load-bearing.

**Success conditions:**
- Webhook endpoint records a delivery event for every test send within 10 seconds.
- Dashboard shows delivery rate, median latency, and bounce rate with 15-minute granularity.
- Alert rule fires when lock-warning delivery rate drops below 99% in a synthetic test.

### INFRA-02D: Cost dashboard for per-MAU and per-message tracking
> effort: S | risk: low | type: infrastructure | ai: full
> depends_on: INFRA-02A

Per canvas D13 trade-off, a cost dashboard that surfaces managed-services spend broken down by: Cloud Run CPU-seconds, Cloud SQL CPU-hours, GCS storage + egress, auth vendor monthly cost, email vendor per-message cost. Implemented as a Cloud Monitoring dashboard consuming GCP billing export + custom metrics emitted by the API (email sends/day, MAU via auth vendor API). Used for quarterly pricing reviews. Not real-time.

**Success conditions:**
- Dashboard shows monthly spend by line item over the last 90 days.
- Per-MAU cost can be derived from the dashboard in under 5 minutes.
- A smoke test with synthetic traffic produces recognizable dashboard movement within 24 hours.

### INFRA-02E: Incident runbooks and customer support channel
> effort: S | risk: low | type: infrastructure | ai: assisted
> depends_on: INFRA-02A

Create `infra/runbooks/` with: `on-call-rotation.md`, `db-restore.md` (consumed by INFRA-01B's restore test), `gcs-recovery.md`, `email-delivery-incident.md` (how to fall back if the vendor is down — canvas flags this is load-bearing), `auth-vendor-incident.md`, `cloud-run-outage.md`. Also stand up a customer support channel (email address `support@ido4shape.cloud` routed through the auth vendor's helpdesk integration or a simple inbox). Per canvas, "customer support channel" is explicitly called out as "what's built" in the operational-reliability cross-cutting concern.

**Success conditions:**
- Each runbook includes a "decision tree" section and at least one validated recovery step.
- `email-delivery-incident.md` documents at least one concrete fallback path (e.g., switch to vendor B via a hot DNS switchover).
- `support@ido4shape.cloud` is live and test messages are received within 5 minutes.

---

## Capability: PLAT-02 — Plugin Standalone Parity Test Harness
> size: M | risk: medium

Test infrastructure that guarantees the hard constraint "cloud mode OFF = byte-identical v0.4.2 behavior." Part of Technical Foundation (must-have) — the canvas's "Standalone Parity → Plugin Integration Reality" cross-cutting concern explicitly states "the acceptance test infrastructure does not exist yet. Phase 2 must create a parity reference run capture step before the PLUG capabilities ship." Canvas Discovery #10 elevates this: "The parity reference run test infrastructure is the most under-scoped piece of work. Without it, PLUG-01 cannot ship credibly." This capability is the gate PLUG-01..04 cannot cross without. It lives in the cloud monorepo under `plugin-changes/tests/` because it tests the ido4shape plugin, not the cloud API.

### PLAT-02A: Capture v0.4.2 parity reference run
> effort: M | risk: medium | type: infrastructure | ai: pair
> depends_on: -

Build a capture harness at `plugin-changes/tests/parity/capture.sh` that runs ido4shape v0.4.2 through a deterministic end-to-end session and records every filesystem write to `.ido4shape/` (content + timestamps normalized to relative offsets), every hook-script stdout/stderr, every validator exit code, and every settings.json read — anything observable. Store the recorded run at `plugin-changes/tests/parity/fixtures/v0.4.2-reference/`. Deterministic inputs: a canned user prompt sequence and a seeded RNG for any randomness (session IDs — inject via env var override). Per canvas: without this reference, there is no baseline to diff against in PLAT-02B.

**Success conditions:**
- Running `capture.sh` against a clean v0.4.2 checkout produces a reference-run directory that is byte-stable across two runs with the same seed.
- The reference run covers at least one canvas synthesis, one validator invocation, and one session close.
- Capture script documented in `plugin-changes/tests/parity/README.md` with the canned prompt sequence committed.

### PLAT-02B: Parity diff harness comparing reference vs cloud-mode-OFF
> effort: M | risk: medium | type: infrastructure | ai: pair
> depends_on: PLAT-02A

Build the diff harness at `plugin-changes/tests/parity/diff.sh` that runs the modified plugin (with the PLUG-01..04 changes in place) with `cloudMode.enabled=false` through the same canned session as PLAT-02A and diffs the result against the reference run. Exits non-zero on any divergence except those in a committed allow-list of known-benign differences (e.g., absolute timestamps). Runs as part of `tests/validate-plugin.sh` via a new check and blocks plugin release if it fails. Exercises the hard constraint "zero network calls when cloud mode is OFF" by sandboxing the run behind a network namespace that rejects all egress and asserting no tool call was attempted.

**Success conditions:**
- Running `diff.sh` against an unmodified v0.4.2 returns zero differences.
- Introducing a deliberate `curl` call in `scripts/session-start.sh` makes `diff.sh` fail with a clear message.
- Running `diff.sh` in a network-sandboxed environment where all egress is rejected still passes (because cloud mode is OFF).
- `tests/validate-plugin.sh` includes a new check that invokes `diff.sh` and returns non-zero on failure.

### PLAT-02C: validate-plugin.sh extensions for cloud-mode assertions
> effort: S | risk: low | type: infrastructure | ai: full
> depends_on: PLAT-02B

Extend `tests/validate-plugin.sh` with new assertions beyond the existing 203 checks: (a) when `cloudMode.enabled=false`, no hook script executes any cloud-branch code path (verified by a dry-run that records branches taken); (b) the existing "no curl/wget/fetch/https" assertion is narrowed to apply only to non-cloud code paths (cloud scripts must contain network calls); (c) the `cloud-sync.sh` wrapper exists and is executable; (d) the `packages/plugin-cloud-client/dist/cloud-client.js` bundle is present and under 50KB. Maintain the existing 203-check count as a committed baseline — new checks push the count forward.

**Success conditions:**
- `tests/validate-plugin.sh` reports the updated check count and all checks pass on main.
- Removing the `cloud-sync.sh` wrapper causes a specific check to fail with a clear message.
- Adding a `curl` call to a non-cloud hook script fails the narrowed assertion.

---

## Capability: AUTH-01 — User Account Creation and Sign-In
> size: M | risk: low

OAuth-based account creation and authentication for the web UI via a third-party provider. Part of Auth, Organization & Roles (must-have) — the canvas calls this group "foundational: without it, the API has no concept of who can write where and no role context for the agent." Accounts are the first touch point; every downstream AUTH/STOR/PLUG/VIEW capability depends on the `users` row existing. Per D11, web UI uses OAuth (outsourced to the vendor chosen in PLAT-01E); plugin uses API key. Per canvas Complexity Assessment, the heavy lifting is done by the vendor SDK — the risk is vendor lock-in, not implementation.

### AUTH-01A: users table and profile schema migration
> effort: S | risk: low | type: infrastructure | ai: full
> depends_on: PLAT-01C, PLAT-01D

Migration `0002_users.sql` creating `app.users` with columns: `id` (UUID primary key), `email` (unique, citext), `display_name`, `avatar_url`, `provider_id` (the vendor's user identifier from PLAT-01E), `created_at`, `updated_at`. Also create `app.notification_prefs` with `(user_id, org_id, frequency)` — the canvas notes "the `notification_prefs` table needed by VIEW-05 should be created in this migration so AUTH-01 can persist preferences from day one." Create a `UserRepo` extending `BaseRepo` from PLAT-01D. Zod schema and TS type emitted into shared-types.

**Success conditions:**
- Migration creates `users` and `notification_prefs` tables with the listed columns.
- `UserRepo.findByProviderId(providerId)` returns a typed `User` or null.
- Inserting a duplicate email fails with a unique-constraint error.
- Shared-types exports `User` Zod schema matching the DB row shape.

### AUTH-01B: OAuth callback and idempotent user provisioning
> effort: M | risk: medium | type: feature | ai: pair
> depends_on: AUTH-01A, PLAT-01E

Replace the PLAT-01E spike with the real implementation: `apps/api/src/routes/auth.ts` `/auth/callback` handler that takes the OAuth code from the vendor, exchanges it for a session, and upserts a `users` row via `UserRepo` (idempotent on `provider_id`). On first-ever sign-up, redirect the user to the org-creation flow (AUTH-02); on returning sign-in, redirect to their org dashboard. Session management is delegated to the vendor SDK — the API never issues its own session cookie. Error states: vendor returns an error, email already exists with a different provider_id (surface "use the original sign-in method"), callback with missing parameters.

**Success conditions:**
- A new OAuth callback creates exactly one `users` row; a second callback for the same `provider_id` updates `updated_at` but creates no new row.
- First-time sign-up redirects to `/orgs/new`; returning sign-in redirects to the last accessed org dashboard.
- An OAuth error from the vendor is surfaced to the user as a structured error page with a retry link.
- Sign-up to first-click-into-org-dashboard completes under 30 seconds end-to-end (matches strategic spec success condition).

### AUTH-01C: Profile and notification-preferences edit page
> effort: S | risk: low | type: feature | ai: full
> depends_on: AUTH-01B

Next.js page at `apps/web/app/settings/profile/page.tsx` where the signed-in user edits `display_name` and `avatar_url` and sets per-org notification frequency (`all` | `role-relevant` | `none`). Does NOT allow self-delete — per canvas, "user cannot delete their own account (org admin action only)". Uses the typed API client from `packages/api-client/` to PATCH `/users/me` and `/users/me/notification-prefs`. Shows a red blocked-style UI element where the delete button would be with help text pointing at AUTH-06.

**Success conditions:**
- Editing display name and saving persists the change; reloading the page shows the new value.
- Notification frequency setter supports `all`, `role-relevant`, `none` and persists to the `notification_prefs` row.
- There is no "Delete my account" button on the page (verified by a test that asserts the button is absent).

---

## Capability: AUTH-02 — Organization Creation and Membership
> size: M | risk: low

Organization provisioning and member management. Part of Auth, Organization & Roles (must-have) — foundational; without it, the API has no concept of who can write where and no role context for the agent. After OAuth sign-up, user is prompted to create an org or join existing one via invite. Per canvas, if the vendor chosen in PLAT-01E provides a first-class org primitive (Clerk, WorkOS), use it; Auth0 does not, which means building the layer from scratch. Complexity Assessment per canvas: low; risk is whether vendor org primitive matches needs.

### AUTH-02A: orgs and org_members schema migration
> effort: S | risk: low | type: infrastructure | ai: full
> depends_on: AUTH-01A

Migration `0003_orgs.sql` creating `app.orgs` (`id` UUID PK, `name`, `description`, `owner_user_id` FK to users, `created_at`) and `app.org_members` (`org_id`, `user_id`, `org_role` enum with values `owner` | `member`, `status` enum `pending` | `active`, `invited_at`, `joined_at`, primary key `(org_id, user_id)`). Note: the per-project stakeholder role (PM/Architect/...) lives in AUTH-03's `project_members` table, NOT here — this table only tracks org-level ownership. Create `OrgRepo` extending `BaseRepo`. Emit Zod+TS types to shared-types.

**Success conditions:**
- Migration creates both tables; inserting a row without a valid `owner_user_id` fails the FK check.
- `OrgRepo.findById(orgId, orgId)` returns the row scoped via the tenant-aware base class.
- `status` transitions from `pending` to `active` only when joined_at is set (enforced by a check constraint or validated in the repo).

### AUTH-02B: Create-org flow and vendor-primitive integration
> effort: M | risk: medium | type: feature | ai: pair
> depends_on: AUTH-02A, PLAT-01E

If the PLAT-01E decision picked Clerk or WorkOS, integrate the vendor's org primitive: the vendor stores org membership and issues org-scoped sessions; the API mirrors the relevant rows into `orgs`/`org_members` on webhook events so our queries stay local. If the decision picked Auth0 (canvas notes this means building the org layer from scratch), implement `POST /orgs` that creates the row and makes the caller the `owner`. Next.js page `apps/web/app/orgs/new/page.tsx` with name + description form. After create, redirect to the org dashboard.

**Success conditions:**
- Creating an org in under 2 minutes (strategic spec success condition) via the web flow.
- The creator is `owner` in `org_members` with `status='active'`.
- A webhook-driven sync (if vendor provides one) reflects vendor state within 10 seconds.
- Attempting to create an org without being signed in returns 401.

### AUTH-02C: Org member list page with active/pending split
> effort: S | risk: low | type: feature | ai: full
> depends_on: AUTH-02B

Next.js page at `apps/web/app/orgs/[orgId]/members/page.tsx` that lists active members (with display name, avatar, org_role) and pending members (with invited_at and a resend button — the resend path is implemented in AUTH-05). Shows active member count and pending count at the top. Owner-only can see the "Invite" button; non-owners see only the list.

**Success conditions:**
- Members page renders active and pending lists correctly for an org with mixed status.
- Non-owners see the list but not the Invite button (verified by a role-gated render test).
- Loading the page does not expose other orgs' members (tenant-aware repo enforcement test).

---

## Capability: AUTH-03 — Role Assignment and Project Context
> size: M | risk: low

Per-project role assignment aligned with ido4shape's stakeholder profiles. Part of Auth, Organization & Roles (must-have) — canvas describes this as "a critical-path leaf: without AUTH-03, AUTH-06 has nothing to administer, STOR-03 has nothing to authorize, PLUG-04 has nothing to inject." Roles are project-specific (a person might be PM on Project A but Architect on Project B). Per D6, roles flow into the plugin as context so the agent adapts its conversation — not just access control but persona shaping. The role string MUST be exactly `PM | Architect | UX | Business | QA` to match `ido4shape/skills/create-spec/references/stakeholder-profiles.md` verbatim (PLAT-01D enforces this).

### AUTH-03A: project_members schema and role-resolution middleware
> effort: M | risk: medium | type: infrastructure | ai: pair
> depends_on: AUTH-02A, PLAT-01D

Migration `0004_project_members.sql` creating `app.project_members` (`project_id`, `user_id`, `role` enum referencing `PM | Architect | UX | Business | QA`, `assigned_at`, `assigned_by_user_id`, PK `(project_id, user_id)`). Implement a role-resolution middleware in `apps/api/src/auth/role.ts` that runs after tenant-resolver and, given `(userId, projectId)`, returns the role or 403. Canvas is explicit: "the subtle risk is *where* role resolution lives (middleware? per-route? service layer?) and whether revocations are honored mid-request. Spec writer should pick a single resolution point" — pick middleware, once per request, no caching beyond the request scope. "Per-project role IS the access control gate. No row in `project_members` = 403."

**Success conditions:**
- Migration creates the table with the 5-value role enum matching the Role literal union from shared-types.
- Middleware returns 403 when no row exists; returns the role when a row exists; logs a warning if the middleware runs twice in the same request.
- Revoking a role in the DB while a request is in flight is honored by the NEXT request (no caching).
- Integration test: user has no row, request returns 403 with ApiError `{code: 'NO_PROJECT_ACCESS'}`.

### AUTH-03B: Role assignment UI on project create and edit
> effort: M | risk: low | type: feature | ai: assisted
> depends_on: AUTH-03A, PROJ-01A

When creating or editing a project (PROJ-01), the PM assigns roles to org members via a picker that lists `org_members` where `status='active'` and shows the 5-value role dropdown per person. Changes are persisted via PATCH `/orgs/{orgId}/projects/{projectId}/members`. Canvas: "Role assignment is immediate and visible in the project dashboard" and "Role changes are immediate (no token refresh required)" — saved changes are reflected on next request without session invalidation.

**Success conditions:**
- PM can set 5 members with 5 different roles on a single project create.
- Changing a role is reflected on the next page load (no session clear needed).
- A non-PM attempting to reach the edit UI sees 403.

### AUTH-03C: "My roles across all projects" view
> effort: S | risk: low | type: feature | ai: full
> depends_on: AUTH-03A

Next.js page at `apps/web/app/roles/page.tsx` that lists every project the user has a row in, showing project name, org name, and the user's role on that project. Per canvas strategic spec success condition: "User can see their assigned role(s) across all projects in one view." Single query through the tenant-aware repo filtered by user_id.

**Success conditions:**
- Page lists all `(project, role)` pairs for the signed-in user across all orgs they belong to.
- Pagination supports 100+ project assignments without breaking.
- Projects where the user has no role do not appear.

---

## Capability: AUTH-04 — API Key Generation and Rotation
> size: M | risk: medium

Long-lived API key for plugin authentication (D11). Part of Auth, Organization & Roles (must-have) — the canvas notes "API key UI is table-stakes for the group (mentioned as undershoot risk)." Keys are per-user (not org-wide — canvas: "Crossing this would silently enable cross-tenant blast radius"), 32+ characters cryptographically random, displayed once, rotatable with a 5-minute grace window for the old key to keep working while the plugin detects the new key. Medium complexity per canvas: "The 5-minute grace window is the only non-trivial bit and is easy to get wrong (off-by-one on the rotation timestamp)."

### AUTH-04A: api_keys schema and hashing
> effort: S | risk: medium | type: infrastructure | ai: pair
> depends_on: AUTH-01A, PLAT-01D

Migration `0005_api_keys.sql` creating `app.api_keys` (`id`, `user_id`, `hash` (SHA-256 or argon2 — canvas suggests either), `created_at`, `rotated_at` nullable, `last_used_at` nullable, `name` optional user-provided label). Also `app.api_key_rotation_log` (`api_key_id`, `rotated_at`, `rotated_from_ip`, `rotated_from_user_agent`) per canvas: "Rotation is logged with timestamp and IP address." Keys are never stored plaintext (canvas: "Hash keys at rest — never store plaintext"). Create `ApiKeyRepo` extending `BaseRepo`.

**Success conditions:**
- Migration creates both tables with the correct columns.
- `ApiKeyRepo.findByHash(hash)` uses constant-time comparison.
- No plaintext key appears in the DB (verified by a grep against a test fixture after a rotate).

### AUTH-04B: Key generation, rotation, and 5-minute grace window
> effort: M | risk: high | type: feature | ai: pair
> depends_on: AUTH-04A

Endpoints: `POST /users/me/api-keys` generates a 32-byte base64url random key, returns it once in the response (display-once semantics), inserts the hashed row. `POST /users/me/api-keys/rotate` generates a new key, sets `rotated_at = now()` on the old row, returns the new key once. The auth middleware from PLAT-01B accepts the old key until `rotated_at + 5 minutes` (canvas: "both should hash-resolve to the same user during the window") — after the window, old rows are not deleted but auth rejects them with a clear error "Key has been rotated. Please update your plugin settings." Per canvas Complexity Assessment: "Test it explicitly" — write a test that advances time past the grace boundary using a clock abstraction.

**Success conditions:**
- Generated key is exactly 32 bytes, base64url-encoded, and shown to the user once in the HTTP response.
- Old key works for exactly 5 minutes after rotation (verified with a clock-abstracted test).
- Old key stops working at minute 5 + 1 second; error message directs user to rotate in settings.
- Every rotation writes a row to `api_key_rotation_log` with IP and user agent.

### AUTH-04C: API key management UI
> effort: S | risk: low | type: feature | ai: full
> depends_on: AUTH-04B

Next.js page at `apps/web/app/settings/api-keys/page.tsx` showing the user's active key (created_at, last_used_at), with Generate and Rotate buttons. Newly generated key is displayed in a modal with a copy-to-clipboard button and a "I have copied this key" checkbox that dismisses the modal (after dismissal, the key is unrecoverable — canvas "displayed once after generation; user must copy it immediately"). Rotate triggers a confirmation dialog explaining the 5-minute grace window.

**Success conditions:**
- Generating a key surfaces the plaintext in a modal with a single-use copy button.
- After modal dismiss, the plaintext is never re-rendered in the DOM.
- Rotate confirmation dialog explains the grace window before proceeding.

---

## Capability: AUTH-05 — Invite Flow and Pending Members
> size: M | risk: low

Email-based org invites with 7-day expiry, bulk send, and OAuth round-trip token preservation. Part of Auth, Organization & Roles (must-have) — canvas: "Invites are explicitly called out as table-stakes that expand the group beyond 'small service' framing." The tricky part per canvas is "token-survives-OAuth pattern" — the invite token must persist across the OAuth redirect to the chosen auth vendor and back. Email delivery here shares infrastructure with STOR-05 lock warnings; SLO failure predicts D8 failure per the cross-cutting concern mapping.

### AUTH-05A: org_invites schema with hashed single-use token
> effort: S | risk: low | type: infrastructure | ai: full
> depends_on: AUTH-02A

Migration `0006_org_invites.sql` creating `app.org_invites` (`id`, `org_id`, `email` citext, `role` for org-wide role (owner or member — per-project role is assigned after join), `token_hash` SHA-256, `invited_by_user_id`, `invited_at`, `expires_at` = `invited_at + 7 days`, `accepted_at` nullable, `accepted_by_user_id` nullable). Unique constraint on `(org_id, email, accepted_at IS NULL)` for dedup-on-send. Token is 32 bytes random, stored hashed, sent as query parameter in the invite URL. Create `OrgInviteRepo` extending `BaseRepo`.

**Success conditions:**
- Migration creates the table with the listed columns.
- Inserting a second pending invite for the same `(org_id, email)` fails the unique constraint.
- Token generation uses `crypto.randomBytes(32)` and stores SHA-256 hash.

### AUTH-05B: Bulk invite send endpoint with rate-limited email fan-out
> effort: M | risk: medium | type: feature | ai: pair
> depends_on: AUTH-05A, PLAT-01F

`POST /orgs/{orgId}/invites` accepts an array of `{email, role}` (up to 50 per call per canvas "multiple addresses at once"), deduplicates against pending rows by updating `invited_at` and re-sending, and fans out via the email vendor using a transactional template (canvas: "Use the email vendor's transactional template feature; don't hand-roll HTML emails"). Rate-limit per-org to 100 invite sends per hour to prevent abuse. Each send records an email-delivery event tagged `invite` for the INFRA-02C dashboard.

**Success conditions:**
- Sending 5 invites in one call produces 5 email deliveries and 5 `org_invites` rows (or updates to existing pending rows).
- A 51st invite in a single call is rejected with 400.
- An invite email arrives at the destination inbox within 5 minutes (strategic spec success condition).
- A second invite to the same email within 10 minutes re-uses the existing row and resends the email.

### AUTH-05C: Invite accept flow with OAuth round-trip token preservation
> effort: M | risk: high | type: feature | ai: pair
> depends_on: AUTH-05B, AUTH-01B

The invite accept URL is `https://app.ido4shape.cloud/invites/accept?token={plain_token}`. If the user is not signed in, store the token in a signed HttpOnly cookie before redirecting to the OAuth flow; on callback, read the cookie, look up the invite by `token_hash`, attach the user to `org_members` with `status='active'`, mark the invite `accepted_at`, and redirect to the org dashboard. Expired tokens (`expires_at < now()`) show "link expired, ask org owner to resend." Per canvas "the tricky bit — easy to lose the invite token across the redirect," the cookie approach is the canonical pattern.

**Success conditions:**
- Accepting an invite with no prior session: OAuth round-trip preserves the token and the user lands in the org with `status='active'`.
- Accepting an invite while already signed in as a different user in a different org attaches the current user to the new org (not the original OAuth user).
- Expired invite shows the "link expired" page and does not create a membership row.
- Token-guessing attempts are rate-limited at 10 per minute per IP (tied to the Cloudflare WAF rule from INFRA-01D).

### AUTH-05D: Invite expiry sweeper job
> effort: S | risk: low | type: infrastructure | ai: full
> depends_on: AUTH-05A

Nightly Cloud Run job at `apps/jobs/invite-sweeper/` that finds `org_invites` where `expires_at < now() AND accepted_at IS NULL` and records a structured log event for each. It does not delete rows (canvas: the row is preserved for audit); it simply flips a derived "expired" view column via UPDATE if a `status` column is added. The UI filters expired invites from the pending list.

**Success conditions:**
- Running the sweeper after expiry marks affected rows and does not delete any data.
- Pending-invites UI (AUTH-02C) no longer lists expired invites after the sweeper runs.

---

## Capability: AUTH-06 — Org Admin Capabilities
> size: M | risk: low

Org admin interface for member management, force-release of session locks, and audit log. Part of Auth, Organization & Roles (should-have) — canvas: "Force-release is the escape hatch from D8 — without it, dead sessions block projects." The only capability in the AUTH group that crosses into STOR-05. Complexity per canvas: low (single admin UI consuming endpoints from elsewhere); the audit query patterns may need indexing care if audit grows large.

### AUTH-06A: audit_events table and query endpoint
> effort: M | risk: medium | type: infrastructure | ai: pair
> depends_on: AUTH-02A, PLAT-01D

Migration `0007_audit_events.sql` creating `app.audit_events` (`id`, `org_id`, `actor_user_id`, `action` text, `target_type` text, `target_id`, `metadata` JSONB, `created_at` with index on `(org_id, created_at DESC)` and `(org_id, actor_user_id, created_at DESC)`). Per canvas cross-cutting "Security & Access Control" coverage gap: "Audit logging is in scope (AUTH-06) but the strategic spec explicitly defers GDPR compliance and MFA to v2. The technical spec writer should keep the audit table generic enough to extend without schema migration." — keep `metadata` JSONB and all type fields text so v2 GDPR can add new event types without DDL. Query endpoint `GET /orgs/{orgId}/audit?actor=&target_type=&from=&to=` supports the canvas success condition: "Audit log shows access by member and date, queryable by project and date range."

**Success conditions:**
- Migration creates the table with both compound indexes.
- Query endpoint returns results filtered by actor and date range in under 300ms for up to 100k rows.
- A new event type can be added without a migration (JSONB metadata carries it).

### AUTH-06B: lock_audit table and force-release endpoint
> effort: M | risk: medium | type: feature | ai: pair
> depends_on: AUTH-06A, STOR-05B

Migration `0008_lock_audit.sql` creating `app.lock_audit` (`id`, `project_id`, `action` enum `acquire` | `release` | `force_release`, `actor_user_id`, `reason` text nullable, `created_at`). `POST /orgs/{orgId}/projects/{projectId}/lock/force-release` (owner-only) clears `session_locks.lock_owner_user_id` and writes a `lock_audit` row with action `force_release` and the optional reason. Each regular acquire/release also writes a row so VIEW-04's activity feed can surface them. Canvas: "Force-release IS the escape hatch from D8. Failure here = dead sessions block projects."

**Success conditions:**
- Force-release endpoint clears the lock and writes an audit row atomically (single DB transaction).
- Non-owner users calling force-release receive 403.
- VIEW-04 activity feed surfaces force-release events with the reason text visible.
- A force-release does not destroy workspace data (asserted by test).

### AUTH-06C: Org admin dashboard with members, roles, locks, audit
> effort: M | risk: low | type: feature | ai: assisted
> depends_on: AUTH-06A, AUTH-06B, AUTH-02C, AUTH-03B

Next.js page at `apps/web/app/orgs/[orgId]/admin/page.tsx` with four tabs: Members (add/remove/change role), Locks (list active locks across all projects with a force-release button), Audit Log (paginated `audit_events` query with filter UI), Notification Preferences (org-wide default frequency that new members inherit). "Remove member" revokes all project access immediately per canvas — deletes the `project_members` rows for that user across all projects in the org AND revokes `api_keys` rows (canvas coverage gap: "Key revocation on org member removal is implied but not specified explicitly. Technical spec writer should make it a success condition").

**Success conditions:**
- Admin can add/remove members from a single page.
- Removing a member deletes all their `project_members` rows and revokes all their `api_keys` for projects in this org in one atomic operation.
- Force-release button on the Locks tab clears a lock and surfaces in the audit log within 5 seconds.
- Audit log filter by date range returns results in under 1 second for typical org sizes.

---

## Capability: STOR-01 — Versioned Markdown Object Store
> size: M | risk: medium

Append-only versioned blob storage for workspace files on GCS. Part of Cloud Storage & API (must-have) — canvas: "the foundation everything else writes to. Get the bucket layout, IAM, and lifecycle policy right *before* building STOR-02..06." Per D9, storage is versioned markdown blobs (not structured rows); the server does NOT parse canvas content. The bucket itself is provisioned in INFRA-01A; this capability adds the application-side client wrapper and commit-hash logic the rest of STOR builds on.

### STOR-01A: GCS client wrapper with generation-aware read and write
> effort: M | risk: medium | type: infrastructure | ai: pair
> depends_on: INFRA-01A, PLAT-01B

Create `apps/api/src/storage/gcs.ts` exposing `readFile(orgId, projectId, filename, generation?)` and `writeFile(orgId, projectId, filename, content)` that returns the new generation number. Uses `@google-cloud/storage`. Per canvas: "Use GCS native object versioning instead of writing per-version paths — generation numbers are atomic and dedup is automatic." Write path must NOT include a version suffix; GCS assigns the generation. Read path accepts an optional generation to retrieve historical versions. All operations are tenant-aware via `orgId` which becomes the path prefix. Streaming reads and writes for files up to 10MB per VIEW-01 performance bound.

**Success conditions:**
- `writeFile` returns a generation number; a second call to the same path returns a different generation.
- `readFile` with no generation returns the latest; with an explicit generation returns that historical version.
- A 10MB file round-trips via streaming without buffering the whole payload in memory.
- Attempting to delete via the read/write service account fails (enforced by INFRA-01A IAM).

### STOR-01B: Commit hash function and research spike for GCS scale
> effort: S | risk: medium | type: research | ai: pair
> depends_on: STOR-01A

Implement `computeCommitHash(timestamp, actorUserId, sortedFileGenerations)` as SHA-256 of a canonical serialization in `apps/api/src/storage/hash.ts`. Also execute the research task from canvas: "validate that GCS dedup actually scales linearly (large repos with many small files can hit listing-cost issues)." Benchmark a synthetic project with 1000 files × 100 versions and record: write latency, listing cost, storage cost. If listing cost is non-linear, document the mitigation (file-count cap per project, manual generation tracking in Postgres instead of GCS listing). Result recorded in `docs/decisions/stor-01-scale.md`.

**Success conditions:**
- `computeCommitHash` is deterministic — the same inputs produce the same hash.
- Benchmark results are recorded in the decision doc with raw numbers for 1000-file × 100-version projects.
- A mitigation is documented if benchmarks show super-linear scaling.

---

## Capability: STOR-02 — Commit Metadata and History
> size: M | risk: low

Postgres tables tracking commit metadata and indexes optimized for the query patterns the canvas calls out. Part of Cloud Storage & API (must-have) — canvas: "The `commits` and `commit_files` tables are the index into GCS. Without them, GCS is a versioned heap with no order. Indexing is critical: `(project_id, created_at DESC)` for the activity feed, `(project_id, file)` for file history queries." Complexity per canvas: low; risk is index discipline as commit volume grows.

### STOR-02A: commits and commit_files schema with discipline-enforcing indexes
> effort: S | risk: low | type: infrastructure | ai: full
> depends_on: PLAT-01C, PLAT-01D

Migration `0009_commits.sql` creating `app.commits` (`id`, `project_id`, `actor_user_id`, `created_at`, `commit_hash` unique per project, `message` nullable) and `app.commit_files` (`commit_id`, `filename`, `gcs_generation` bigint, PK `(commit_id, filename)`). Indexes: `commits(project_id, created_at DESC)`, `commits(project_id, actor_user_id, created_at DESC)`, `commit_files(commit_id, filename)`. Create `CommitRepo` extending `BaseRepo`.

**Success conditions:**
- Migration creates both tables with all three indexes.
- Inserting a commit with a duplicate `(project_id, commit_hash)` fails.
- `CommitRepo.listByProject(orgId, projectId, limit, offset)` uses the `(project_id, created_at DESC)` index (verified via EXPLAIN).

### STOR-02B: Commit query endpoints
> effort: M | risk: low | type: feature | ai: full
> depends_on: STOR-02A

Endpoints in `apps/api/src/routes/commits.ts`: `GET /orgs/{orgId}/projects/{projectId}/commits?actor=&file=&from=&to=&limit=&cursor=` returns paginated commit rows with the files touched. Uses cursor-based pagination on `(created_at, id)` — offset pagination would blow out at scale. Response shape is typed via shared-types. Per canvas success condition: "Commits are queryable by project, actor, file, and date range" and "Commit history is presented chronologically in UI (newest first)".

**Success conditions:**
- Listing commits returns newest-first with cursor pagination.
- Filter by actor returns only that actor's commits.
- Filter by file uses the `commit_files` join and returns commits that touched that filename.
- Query latency p95 is under 200ms for a project with 10k commits.

---

## Capability: STOR-03 — Read/Write API for Workspace Files
> size: L | risk: medium

REST API endpoints the plugin uses to read and write workspace files, scoped by org+project+role. Part of Cloud Storage & API (must-have) — canvas: "the seam between the plugin and the cloud. Everything the plugin reads/writes goes through here. Most-trafficked endpoint group in the system." Complexity per canvas: medium — the 500ms p95 SLO is the riskiest bit because Cloud Run cold starts and GCS round-trip latency must be measured, not assumed. INFRA-01C min_instances=1 in prod already mitigates the cold start concern.

### STOR-03A: File read endpoint with role-gated access
> effort: M | risk: medium | type: feature | ai: pair
> depends_on: STOR-01A, STOR-02A, AUTH-03A, AUTH-04B

`GET /orgs/{orgId}/projects/{projectId}/files/{filename}?generation=` — accepts API key OR session cookie, runs through the auth + tenant + role middleware (any of the 5 roles grants read), returns the file content from `STOR-01A.readFile()`. Streams the response for large files. Supports `If-None-Match` with the GCS generation as ETag for caching. Per canvas: "Stream large files rather than buffering — `canvas.md` can grow large." Also handles the `history` endpoint `GET /orgs/{orgId}/projects/{projectId}/history` returning the STOR-02B commit query.

**Success conditions:**
- Read request with a valid API key returns the latest file content.
- Read request without a project_members row returns 403.
- A 5MB file streams without buffering (verified by measuring memory during the read).
- `If-None-Match` with a matching generation returns 304.
- p95 latency is under 500ms in prod with min_instances=1 (strategic spec success condition).

### STOR-03B: File write endpoint with idempotency and commit creation
> effort: L | risk: high | type: feature | ai: pair
> depends_on: STOR-03A, STOR-02A

`POST /orgs/{orgId}/projects/{projectId}/files/{filename}` — accepts API key, requires write role (PM, Architect, UX, or Business — not QA per canvas "QA/Viewer roles are read-only"), writes the body to `STOR-01A.writeFile()`, creates a `commits` row plus `commit_files` rows in a single DB transaction. Accepts a client-provided `Idempotency-Key` header so the PLUG-02 retry policy is safe: a retry with the same key within 24 hours returns the original commit without re-writing. Per canvas: "a POST with a client-provided idempotency key should be safely retryable (the async push retry policy will retry the same payload on backoff)." Updates `session_locks.last_refresh_at` if a lock exists (STOR-05 dependency — this is the write-refreshes-lock trigger).

**Success conditions:**
- Write creates a new GCS generation and a new `commits` row atomically.
- Retrying with the same `Idempotency-Key` does not create a second commit; returns the original commit_hash.
- A QA-role user attempting to write receives 403.
- The write updates `last_refresh_at` on the project's lock when one exists.
- p95 write latency is under 500ms.

### STOR-03C: Cold-start latency benchmark research task
> effort: S | risk: medium | type: research | ai: pair
> depends_on: STOR-03B, INFRA-01C

Per canvas Complexity Assessment: "The 500ms p95 is the riskiest bit — Cloud Run cold starts and GCS round-trip latency must be measured, not assumed. Add a research task." Run a load test against `dev` and `prod` with cold and warm states, record p50/p95/p99 for read and write, and decide whether `min_instances=1` is sufficient or if `min_instances=2` is needed for prod. Document in `docs/decisions/stor-03-latency.md`.

**Success conditions:**
- Load test results recorded with p50/p95/p99 for cold and warm starts.
- Decision doc contains a recommended `min_instances` value backed by numbers.
- If numbers exceed the 500ms SLO, the doc proposes a mitigation (warm-up ping job, request hedging, accept higher SLO).

---

## Capability: STOR-04 — Comments with Heading-Path Anchoring
> size: L | risk: medium

Heading-anchored comments stored in Postgres with orphan detection. Part of Cloud Storage & API (should-have) — canvas: "the only place the server has structured knowledge derived from canvas content — and even here, the heading path is captured at create time, not parsed from content." Complexity per canvas: medium, because the orphan detection algorithm and the D9 "no server-side canvas parsing" rule are in tension. Canvas Discovery #4 calls out two viable resolutions; this capability picks one via a research spike and implements it.

### STOR-04A: comments schema with heading-path and threading
> effort: M | risk: medium | type: infrastructure | ai: pair
> depends_on: PLAT-01C, PLAT-01D, STOR-03A

Migration `0010_comments.sql` creating `app.comments` (`id`, `project_id`, `file` text, `heading_path` text, `body` text, `created_by_user_id`, `parent_comment_id` nullable for threading, `resolved_at` nullable, `orphaned_at` nullable, `created_at`). Heading-path format is captured at create time as a slash-separated string (e.g., `/Problem Understanding/Solution Concepts`) and exported as the `HeadingPath` branded type in shared-types (PLAT-01D) — same string format consumed by VIEW-03 so both sides agree. Index `(project_id, file, resolved_at, orphaned_at)` for the read patterns.

**Success conditions:**
- Migration creates the table with all indexes.
- `HeadingPath` in shared-types is imported by both STOR-04A and VIEW-03 and their tests assert the format string is identical.
- Threading query returns a comment and its direct replies in one round-trip.

### STOR-04B: Orphan detection decision spike
> effort: S | risk: high | type: research | ai: pair
> depends_on: STOR-04A

Per canvas Discovery #4 ("D9 and STOR-04 orphan detection are in tension"), pick one of two approaches and document in `docs/decisions/stor-04-orphan-detection.md`: (a) fully client-side — the web viewer parses headings on render and computes orphan status in the browser, the server only stores `heading_path` and never interprets it; or (b) tightly bounded server helper that parses ONLY heading hierarchy (not content) to compute orphan status server-side. Canvas recommends (a) to keep D9 clean. Include the decision rationale and the user-visible consequences of each. Blocks STOR-04C.

**Success conditions:**
- Decision doc exists with named trade-offs and a recommendation.
- Rationale explicitly references D9.
- The implementation in STOR-04C matches the decision.

### STOR-04C: Comments CRUD endpoints
> effort: M | risk: medium | type: feature | ai: assisted
> depends_on: STOR-04B

Endpoints in `apps/api/src/routes/comments.ts`: `POST` create a comment with heading_path; `GET` list comments by `(projectId, file)` returning threaded structure; `PATCH /comments/{id}/resolve` toggles `resolved_at`. Per canvas: "Don't auto-delete orphaned comments. Mark them with an `orphaned_at` timestamp and surface them for PM review." `orphaned_at` is set by the process chosen in STOR-04B. Comments are never deleted (create + resolve only; canvas: "no edit — deleted/recreated to maintain history"). Threading is single-level for v1 per canvas "single-level reply for v1; full nesting is overkill."

**Success conditions:**
- Create comment at a heading path and the row appears in the GET list under that heading.
- Resolve a comment and it is filtered out of the default list but included with `?include_resolved=true`.
- Reply to a comment creates a child row with `parent_comment_id` set.
- Orphaned comments are flagged per the STOR-04B implementation path, not deleted.

---

## Capability: STOR-05 — Session Lock Management
> size: L | risk: high

Session lock acquire/refresh/release, TTL scan, warning fan-out, and force-release. Part of Cloud Storage & API (must-have) — the only **high-risk** capability in STOR per canvas. Canvas: "This is rated **risk: high** — TTL semantics interact with email delivery; off-by-one in any of the three trigger points (write, message, scan) breaks the workflow." Per D8, the lock carries a 1-hour TTL that refreshes on canvas/decisions/tensions/sessions writes (via STOR-03B) and on user-message-received (via PLUG-03 through the UserPromptSubmit hook). At the 45-minute mark, a warning fires via both in-app notification and email. Force-release (AUTH-06B) is the escape hatch. Canvas Discovery #7 flags the 418 status convention as fragile and recommends a 200-with-flag alternative; this capability explicitly picks one.

### STOR-05A: session_locks schema with atomic acquire
> effort: S | risk: medium | type: infrastructure | ai: pair
> depends_on: PLAT-01C, PLAT-01D, AUTH-03A

Migration `0011_session_locks.sql` creating `app.session_locks` (`project_id` PK, `lock_owner_user_id` nullable, `acquired_at` nullable, `last_refresh_at` nullable, `ttl_seconds` default 3600, `warned_at` nullable) and a unique constraint on `(project_id)` (effectively one row per project). Per canvas: "Lock state lives in Postgres, not in memory — survives API restarts." Acquire uses `INSERT … ON CONFLICT DO UPDATE WHERE lock_owner_user_id IS NULL` for atomic acquire; canvas recommends `SELECT … FOR UPDATE` or unique constraint.

**Success conditions:**
- Migration creates the table with the unique constraint.
- Two concurrent acquire requests against the same project result in exactly one success and one 409.
- Lock row exists for every project from PROJ-01 creation with `lock_owner_user_id=NULL`.

### STOR-05B: Acquire, refresh, release, and the lock-warning response format
> effort: L | risk: high | type: feature | ai: pair
> depends_on: STOR-05A, STOR-03B

Endpoints: `POST /orgs/{orgId}/projects/{projectId}/lock` atomic acquire (409 on conflict with lock owner name + `acquired_at` in the response body per canvas "Locked by Bogdan since 14:32"); `PATCH .../lock` refresh TTL; `DELETE .../lock` release (owner-only, 403 for other users per canvas "only the lock owner or org admins can release"). Per canvas Discovery #7, the lock-warning response is standard 200 with a `lock_warning: true` flag in the JSON body — reject the 418 overload because Cloudflare WAF and middleware mangle non-standard status codes. Document the decision in `docs/decisions/stor-05-lock-warning-response.md`. STOR-03B already triggers refresh on every write; this capability exposes the explicit refresh endpoint too.

**Success conditions:**
- Acquire against an unlocked project succeeds and populates lock_owner, acquired_at, last_refresh_at.
- Acquire against a locked project returns 409 with `lock_owner_name` and `acquired_at` visible.
- Refresh by the owner extends `last_refresh_at`; refresh by a non-owner returns 403.
- Release by the owner clears the lock; release by a non-owner returns 403.
- Decision doc records the 200-with-flag choice and the 418-rejected rationale.

### STOR-05C: TTL scan job and dual-channel warning fan-out
> effort: M | risk: high | type: infrastructure | ai: pair
> depends_on: STOR-05B, INFRA-01C, PLAT-01F

Cloud Run job `apps/jobs/lock-ttl-scan/` triggered by the `lock-ttl-scans` Cloud Tasks queue (provisioned in INFRA-01C) that runs every minute. Finds locks where `(last_refresh_at + ttl_seconds - now()) <= 900` seconds AND `warned_at IS NULL`, enqueues an email via the email vendor (tagged `lock-warning` for INFRA-02C SLO tracking), enqueues an in-web notification via VIEW-05's fan-out queue, sets `warned_at = now()`. Per canvas: "The 'exactly 45 minutes' requirement is satisfied by a Cloud Tasks scheduled job that scans every minute, not by per-lock timers." Per D8 and canvas, email delivery is load-bearing — if the email vendor is down, log a structured error and page on-call (INFRA-02C alert rule picks it up).

**Success conditions:**
- Scan job runs every minute and identifies locks entering the 15-minute warning window.
- Warning emails are tagged `lock-warning` in the delivery event and surface in the INFRA-02C dashboard.
- A lock in the warning window that is refreshed before warning fires does not produce a warning (next scan sees the refreshed TTL).
- A lock at the exact 45-minute mark produces exactly one warning, not zero and not two.

### STOR-05D: Chaos test plan for lock management
> effort: M | risk: high | type: research | ai: pair
> depends_on: STOR-05C

Per canvas: "High. Three trigger points, async warning delivery, escape hatch — every edge case here is a real-world incident waiting to happen. This deserves dedicated test scenarios in Phase 2." Write a chaos test plan in `docs/tests/stor-05-chaos.md` covering: (1) network drops mid-refresh, (2) API restart while a lock is held, (3) email vendor outage during warning fan-out, (4) force-release race with a normal release, (5) clock skew between the API and the scan job, (6) the 45-minute boundary off-by-one. Run each scenario against `dev` and record the observed behavior. Fix any divergences from the expected behavior before shipping.

**Success conditions:**
- Chaos test plan document exists with 6+ scenarios.
- Each scenario has an expected outcome and observed outcome recorded.
- Any failing scenario has a linked bug fix or explicit deferral note with owner.

---

## Capability: STOR-06 — Diff Rendering Data
> size: M | risk: low

On-the-fly line-based diff generation with a 1-hour cache. Part of Cloud Storage & API (should-have) — canvas: "'Generated on-the-fly when needed by the web viewer, then cached for 1 hour' reads as: don't materialize diffs at write time. Read-time generation only." Complexity per canvas: low for the core algorithm; the 10MB × 10k commits performance bound is the unknown. Per D9, diff is line-based, not semantic markdown parsing. Consumer is VIEW-02.

### STOR-06A: Diff endpoint with jsdiff line-based comparison
> effort: M | risk: low | type: feature | ai: assisted
> depends_on: STOR-01A, STOR-02A

Endpoint `GET /orgs/{orgId}/projects/{projectId}/diff?from_commit=&to_commit=&file=` in `apps/api/src/routes/diffs.ts`. Fetches both commit_files rows, reads the two GCS generations via STOR-01A, runs `diffLines` from the `diff` package (canvas: "jsdiff (`diff` package) `diffLines` is the canonical line-based diff for Node"), returns JSON `{file, hunks: [{op, start, lines}]}`. For a cross-commit diff across multiple files, iterate over files touched in either commit. Streams the response for large result sets.

**Success conditions:**
- Diff between two single-file commits returns the jsdiff hunks in the documented JSON shape.
- A cross-commit diff spanning 20 files produces hunks for all of them.
- A commit with no actual line differences returns empty hunks (not an error).

### STOR-06B: Diff cache layer with 1-hour TTL
> effort: S | risk: low | type: infrastructure | ai: full
> depends_on: STOR-06A

Add a 1-hour cache keyed on `(project_id, from_commit, to_commit, file)`. Per canvas: "invalidation is straightforward (caches expire by TTL; new commits don't invalidate older cached diffs because they're between historical hashes)." Implement as in-memory LRU for v1 (bounded by Cloud Run instance memory); upgrade to Cloud Memorystore (Redis) only if the LRU evicts too often. Cache hit rate exported as a custom metric.

**Success conditions:**
- First request computes and caches; second request within 1 hour serves from cache.
- Cache key includes all four components; changing any field produces a cache miss.
- Cache hit rate metric is visible in the INFRA-02A monitoring stack.

### STOR-06C: Line-diff performance research spike
> effort: S | risk: medium | type: research | ai: pair
> depends_on: STOR-06A

Per canvas: "The 10MB / 10k commit performance bound suggests a research task — line-diff at that scale may need streaming." Benchmark `diffLines` against two 10MB markdown files with realistic density of changes. Measure time and memory. Decide whether streaming is needed or whether the in-memory approach is sufficient. Document in `docs/decisions/stor-06-diff-performance.md`.

**Success conditions:**
- Benchmark numbers are recorded in the decision doc.
- A recommendation (keep in-memory, switch to streaming, or cap file size at the diff endpoint) is documented.
- Implementation in STOR-06A matches the recommendation.

---

## Capability: PLUG-01 — Cloud Mode Configuration
> size: M | risk: low

Settings entry point for enabling cloud mode, pasting the API key, and testing the connection. Part of Plugin Dual-Mode (must-have) — canvas: "Standalone parity is a hard constraint — local mode is unchanged, cloud mode is additive with zero friction for local-only users." This capability is the gatekeeper: "If toggling cloud mode OFF doesn't restore byte-identical v0.4.2 behavior, the constraint is violated." Ships as a PR against `/dev-projects/ido4shape` from the `plugin-changes/` patch set.

### PLUG-01A: cloudMode block in settings.json and key storage
> effort: S | risk: medium | type: feature | ai: pair
> depends_on: PLAT-02C

Add a new top-level `cloudMode` block to `ido4shape/settings.json` with `enabled: false` default, `apiEndpoint: "https://api.ido4shape.cloud"`, `apiKeyPath: "${CLAUDE_PLUGIN_DATA}/cloud-api-key"`. The key itself is NEVER stored in settings.json — only the path. The file at `apiKeyPath` is mode 0600 and contains only the raw key. Per canvas: "Never store keys in `.ido4shape/` workspace files (would be exfiltrated via canvas ingest)." Ships as `plugin-changes/settings-cloud-mode.patch`. PLAT-02C's validate-plugin.sh extensions enforce this block's presence and defaults.

**Success conditions:**
- `settings.json` after the patch contains a `cloudMode` block with `enabled: false` by default.
- API key file lives in `${CLAUDE_PLUGIN_DATA}/cloud-api-key` with mode 0600 (verified by `stat`).
- No reference to the API key value appears anywhere under `.ido4shape/` (grep test).
- PLAT-02 parity harness reports zero divergence with `enabled: false`.

### PLUG-01B: Cloud-mode slash-command skill with Test Connection
> effort: M | risk: medium | type: feature | ai: assisted
> depends_on: PLUG-01A, AUTH-04B

Add `ido4shape/skills/cloud-mode/SKILL.md` — a slash command `/ido4shape:cloud-mode` that walks the user through: (1) confirm they want to enable cloud mode, (2) paste the API key, (3) run Test Connection which calls `GET /system/min-plugin-version` using the key (validates both the key AND the version-floor path end-to-end per canvas), (4) save settings. Per canvas: "The plugin has no UI today — there is no 'settings panel' abstraction." The slash command is the UX. Ships as `plugin-changes/skills/cloud-mode/SKILL.md`.

**Success conditions:**
- Running `/ido4shape:cloud-mode` starts the walkthrough and prompts for the key.
- Test Connection returns a green checkmark when the key is valid.
- A malformed key (less than 32 chars) is rejected before the network call.
- Cancelling the walkthrough leaves `cloudMode.enabled` unchanged.

### PLUG-01C: cloud-sync.sh wrapper and bundled cloud-client skeleton
> effort: S | risk: low | type: infrastructure | ai: full
> depends_on: PLUG-01A, PLAT-01A

Create `plugin-changes/scripts/cloud-sync.sh` — a thin Bash wrapper that reads `cloudMode.enabled` from settings.json via `jq`, exits 0 if disabled, otherwise spawns `node ${PLUGIN_DIR}/packages/plugin-cloud-client/dist/cloud-client.js <subcommand>`. Also create the initial `packages/plugin-cloud-client/` skeleton: a tsup or esbuild config that bundles `src/index.ts` into a single `dist/cloud-client.js` file under 50KB with zero runtime npm deps (mirrors the `dist/spec-validator.js` pattern per canvas). The bundle exports subcommands (`pull`, `push`, `lock-acquire`, `lock-refresh`, etc.) that PLUG-02..04 implement.

**Success conditions:**
- `cloud-sync.sh noop` exits 0 when `cloudMode.enabled=false` and never spawns node.
- Bundle size of `dist/cloud-client.js` is under 50KB.
- The bundle runs under Node 18 without any `node_modules` at runtime.
- PLAT-02C validate-plugin.sh checks for the wrapper and bundle presence.

---

## Capability: PLUG-02 — Session Sync Lifecycle
> size: XL | risk: high

Session sync: pull on open, async push queue during, drain on close, retry with backoff, conflict resolution, and the enqueue-model decision. Part of Plugin Dual-Mode (must-have) — the only **high-risk** capability in PLUG per canvas: "The queue + drain + retry semantics are easy to get wrong and the user-visible failure modes are bad (silent data loss, 'released lock with unpushed changes'). It deserves a dedicated test plan and a chaos test." Canvas Discovery #11 flags the enqueue model (filesystem watcher vs hook-based) as a research task that must resolve before coding.

### PLUG-02A: Enqueue-model research spike
> effort: S | risk: high | type: research | ai: pair
> depends_on: PLUG-01C

Per canvas Discovery #11: "Filesystem watching for the push queue is architecturally non-obvious in a Bash plugin. Phase 2 should resolve via a research task: validate FS-watch reliability under Cowork, or commit to the simpler hook-based enqueue (which loses some coverage but is robust)." Evaluate both approaches. Canvas recommends the hook-based fallback — instrument `PreToolUse(Write)` and `Stop` to enqueue from the existing hook paths. Document the decision in `docs/decisions/plug-02-enqueue-model.md`. This spike blocks the rest of PLUG-02.

**Success conditions:**
- Decision doc records the chosen model with a rationale referencing Cowork's process model.
- If hook-based is chosen, a concrete list of hooks to instrument is documented.
- If FS-watch is chosen, a working prototype under Cowork is demonstrated.

### PLUG-02B: Push queue with exponential-backoff retry
> effort: L | risk: high | type: feature | ai: pair
> depends_on: PLUG-02A, STOR-03B

Implement the queue in `packages/plugin-cloud-client/src/queue.ts` as a JSON file in the plugin data dir holding entries `{filename, local_path, idempotency_key, retry_count, next_retry_at}`. The push worker drains in-order, POSTs to STOR-03B with the idempotency key, marks success or schedules retry at exponential backoff `5s, 10s, 20s, 40s, ... max 5min` per the canvas spec. Retries across process restarts (queue file is the durable state). Instrumentation via the enqueue model chosen in PLUG-02A. Ships as a new subcommand in `cloud-client.js` invoked by `cloud-sync.sh push`.

**Success conditions:**
- A queued write is pushed within 5 seconds under normal network conditions.
- A failed push is retried with exponential backoff and succeeds on recovery.
- Queue state survives a plugin restart (tested by killing the process mid-retry).
- Idempotency key prevents duplicate commits on retry (asserted via STOR-03B integration test).

### PLUG-02C: Pull on session open with conflict resolution prompt
> effort: M | risk: medium | type: feature | ai: pair
> depends_on: PLUG-02B

Extend `scripts/session-start.sh` with a cloud-mode branch that calls `cloud-sync.sh pull`, compares cloud canvas/decisions/tensions/stakeholders against local copies, and if they differ prompts the user: "Cloud version is newer. Replace local with cloud?" (Yes/No). Yes overwrites local; No cancels the session open. Runs BEFORE lock acquire from PLUG-03. Per canvas: "Session opens and pulls latest cloud version within 5 seconds" — coupled to STOR-03A latency.

**Success conditions:**
- Session open in cloud mode fetches the latest canvas and writes it to `.ido4shape/`.
- When local and cloud differ, the user is prompted with a clear choice.
- Choosing No cancels the session without holding a lock.
- Pull-to-prompt latency is under 5 seconds (strategic spec success condition).

### PLUG-02D: Drain on session close with retry-or-release prompt
> effort: M | risk: high | type: feature | ai: pair
> depends_on: PLUG-02B, PLUG-03C

Extend the `Stop` hook (inline) with a cloud-mode branch that invokes `cloud-sync.sh drain` — drains the queue with a 30-second timeout per canvas. If the drain times out, prompt the user: "Unable to sync to cloud. Retry or release lock anyway?" Retry tries for another 30 seconds; Release abandons pending pushes (local changes preserved) and releases the lock via PLUG-03C. Per canvas "Drain MUST complete (or be explicitly abandoned) before lock release; otherwise the next user pulls a stale version." Drain reports the pending count in the prompt.

**Success conditions:**
- Session close drains all pending pushes under normal network conditions before releasing the lock.
- A 30-second drain timeout triggers the retry-or-release prompt.
- Release abandons the queue and releases the lock; local files remain untouched.
- Retry extends the drain window and releases cleanly if the network recovers.

### PLUG-02E: Chaos test plan for sync lifecycle
> effort: M | risk: high | type: research | ai: pair
> depends_on: PLUG-02D

Per canvas: "Deserves a dedicated test plan and a chaos test (drop the network mid-session, kill the plugin mid-drain, etc.)." Write `docs/tests/plug-02-chaos.md` covering: (1) network drop mid-session, (2) kill the plugin mid-drain, (3) API returns 500 on every push, (4) queue file corrupted, (5) cloud and local both edited between sessions (the reconcile prompt path), (6) lock held by another user when trying to acquire. Run each against a dev environment and fix any divergences.

**Success conditions:**
- Chaos test plan exists with 6+ scenarios.
- Each scenario has expected and observed outcomes recorded.
- Silent data loss scenarios are explicitly tested and cannot occur (queue state always durable).

---

## Capability: PLUG-03 — Version Check and Lock Lifecycle
> size: L | risk: medium

Plugin-side version floor check and session lock state machine (acquire / wait / refresh / warn / release). Part of Plugin Dual-Mode (must-have) — canvas: "The lock state machine is the bulk of the complexity; the version check is trivial." Canvas Discovery #7 flags the 418 status convention: "easy to break by HTTP middleware. Phase 2 should pick a less-magic alternative" — STOR-05B already picks the 200-with-`lock_warning`-flag approach, and this capability consumes that shape.

### PLUG-03A: Min-version check at session start
> effort: S | risk: low | type: feature | ai: full
> depends_on: PLUG-01C

Extend `scripts/session-start.sh` with a cloud-mode branch that calls `GET /system/min-plugin-version`, compares against the plugin's local semver from `.claude-plugin/plugin.json`, and if local < min shows a blocking dialog: "Your plugin version is outdated. Please upgrade to continue." with an Upgrade link to the marketplace and a Cancel that closes the session. Per canvas: "Version check is one-shot at session start; subsequent calls use the in-process cache for the duration of the session."

**Success conditions:**
- Version check runs exactly once at session start in cloud mode.
- Local version below the floor blocks the session with a clear upgrade dialog.
- Version check in local mode does not run (zero network calls).

### PLUG-03B: Lock acquire with wait-polling UI
> effort: M | risk: medium | type: feature | ai: pair
> depends_on: STOR-05B, PLUG-03A

Extend `scripts/session-start.sh` to invoke `cloud-sync.sh lock-acquire` after the version check. On success, display "Editing (1h lock until HH:MM)". On 409 (lock held by another), display "Project is locked by [user]. Locked since [time]." with two choices: "Contact them" (no-op, just closes) or "Wait" (polls every 10 seconds until released). During Wait, subsequent poll 409s refresh the displayed time; a successful acquire transitions to Editing. Per canvas: "The 'Wait' polling (10s) is a foreground action — during it, the plugin is essentially blocked. That's intentional per spec."

**Success conditions:**
- Acquire against an unlocked project succeeds and shows Editing status.
- Acquire against a locked project shows the lock owner and since-time.
- Wait polls every 10 seconds and acquires when the lock is released.
- Acquiring calls the STOR-05B acquire endpoint exactly once per attempt (verified by server logs).

### PLUG-03C: Lock refresh on write and message, release on close
> effort: M | risk: medium | type: feature | ai: pair
> depends_on: PLUG-03B

Extend `scripts/phase-gate.sh` (PreToolUse(Write) hook) to invoke `cloud-sync.sh lock-refresh` when a workspace write happens in cloud mode. Extend `scripts/canvas-context.sh` (UserPromptSubmit hook) to do the same on every user message. Extend the Stop hook to invoke `cloud-sync.sh lock-release` after drain (PLUG-02D). When any refresh response carries `lock_warning: true` (STOR-05B's 200-with-flag convention), display a banner: "Your session expires in 15 minutes. [Keep Working] [Save and Close]." Keep Working sends an explicit refresh. Canvas Discovery #7 decision is already made in STOR-05B; this capability consumes it.

**Success conditions:**
- Workspace writes and user messages refresh the lock TTL (verified via server-side `last_refresh_at` timestamps).
- A refresh response with `lock_warning: true` displays the warning banner.
- Session close releases the lock.
- In local mode, none of these hooks make network calls (verified by PLAT-02 parity harness).

---

## Capability: PLUG-04 — Session Context Ingestion
> size: M | risk: low

Injects unresolved comments and the current user's role into the UserPromptSubmit hook. Part of Plugin Dual-Mode (should-have) — canvas: "This is the bridge between the web viewer (where comments are created) and the plugin (where they steer the conversation)." Complexity per canvas: low. The "mark resolved when?" semantics is the only subtlety: mark on first user write in the session, NOT session start, per canvas "otherwise abandoned sessions silently swallow comments."

### PLUG-04A: canvas-context.sh cloud branch for role and comments injection
> effort: M | risk: medium | type: feature | ai: pair
> depends_on: STOR-04C, AUTH-03A, PLUG-02C

Extend `scripts/canvas-context.sh` with a cloud-mode branch that calls `cloud-sync.sh fetch-context` — fetches the current user's role on this project (AUTH-03) and the unresolved comments on all files in the project (STOR-04C). Formats them as: "Your role on this project: [role]. Recent feedback: [user] on [date]: [comment text]." and prepends to the existing canvas context injection. Canvas: "The role string MUST be one of {PM, Architect, UX, Business, QA} — same casing as the plugin's stakeholder profiles" — shared-types enforces this.

**Success conditions:**
- Session start in cloud mode fetches role and comments; agent sees them in the first prompt context.
- Role string is exactly one of the 5 profile names.
- Unresolved comments are listed with author name and date; resolved comments are not included.
- In local mode, canvas-context.sh behavior is byte-identical to v0.4.2 (PLAT-02 parity).

### PLUG-04B: Mark-resolved on first user write with state tracking
> effort: S | risk: medium | type: feature | ai: pair
> depends_on: PLUG-04A

Per canvas: "'Marked resolved after being ingested' is subtle: don't mark as resolved on session *start*, mark them on first user *write* in the session (otherwise abandoned sessions silently swallow comments)." Add a small per-session state file in plugin data dir that records "comments ingested for session X, first-write not yet happened." On first workspace write (PreToolUse(Write) hook), call `cloud-sync.sh mark-comments-resolved` with the ingested comment IDs. The state file is cleared on session close.

**Success conditions:**
- Abandoned sessions (no writes) leave comments unresolved (verified by checking the server after closing without writes).
- First write after ingestion marks the ingested comments resolved server-side.
- State file is cleared on session close regardless of whether the mark-resolved call fired.

---

## Capability: VIEW-01 — Workspace File Rendering
> size: M | risk: low

Client-side markdown rendering with TOC and historical version dropdown. Part of Web Viewer (must-have) — canvas: "This is the foundational web viewer cap — every other VIEW cap reuses its rendering machinery." Per D3, read-only: no in-web editing, no agent runs. Per D9, rendering is client-side — the server does not parse markdown. Complexity per canvas: low; the 10MB file bound is the only thing to verify.

### VIEW-01A: Markdown renderer component with remark/rehype and TOC
> effort: M | risk: low | type: feature | ai: assisted
> depends_on: PLAT-01A

Build `apps/web/components/markdown/` using remark + rehype-slug + rehype-highlight and a hand-rolled TOC component that extracts headings from the AST. Component takes a raw markdown string and renders it with heading IDs, anchor links, syntax highlighting on code blocks, and an auto-generated TOC. No server round-trip for rendering — everything runs in the browser. Used by VIEW-01B, VIEW-02, VIEW-03.

**Success conditions:**
- A 100KB markdown file renders with a navigable TOC.
- Clicking a TOC entry scrolls to that heading.
- Code blocks receive syntax highlighting.
- Heading IDs match the `HeadingPath` format used by STOR-04/VIEW-03.

### VIEW-01B: File viewer page with version dropdown
> effort: M | risk: low | type: feature | ai: assisted
> depends_on: VIEW-01A, STOR-03A, STOR-02B

Next.js page at `apps/web/app/orgs/[orgId]/projects/[projectId]/files/[filename]/page.tsx` that fetches the latest file via STOR-03A, renders it using VIEW-01A, and shows a version dropdown populated from STOR-02B's commit history for that file. Selecting a historical version re-fetches with the GCS generation from that commit. Per canvas: "Historical version dropdown is the simplest version of VIEW-02; sharing the commit-fetch query is good."

**Success conditions:**
- Opening a file renders the latest version with TOC.
- Version dropdown shows the last 50 commits that touched that file.
- Selecting an older version renders the historical content.
- Page loads (to rendered content) in under 2 seconds for a 1MB file.

### VIEW-01C: Large-file rendering performance research
> effort: S | risk: medium | type: research | ai: pair
> depends_on: VIEW-01B

Per canvas: "A research task: 10MB rendering performance in the browser — confirm it's tolerable or add virtualization." Benchmark 10MB markdown with 1000+ headings in the viewer. Record initial render time and scroll smoothness. Decide whether to ship as-is, add virtualization (react-virtualized or TanStack Virtual), or cap file size at 5MB. Document in `docs/decisions/view-01-large-files.md`.

**Success conditions:**
- Benchmark numbers recorded for 10MB × 1000-heading file.
- Decision documented (accept, virtualize, or cap).
- If capping, the cap is enforced at STOR-03A with a clear error message.

---

## Capability: VIEW-02 — Version History and Diff View
> size: M | risk: medium

Commit log with line-level diff rendering. Part of Web Viewer (should-have) — canvas: "VIEW-02 is the consumer of STOR-06. The 'loads within 2 seconds' SLO is split between the API call (cached after first hit) and the client render." Complexity per canvas: medium — UI subtlety in rendering large diffs cleanly.

### VIEW-02A: Commit list page for a project
> effort: S | risk: low | type: feature | ai: full
> depends_on: VIEW-01A, STOR-02B

Next.js page at `apps/web/app/orgs/[orgId]/projects/[projectId]/commits/page.tsx` listing commits newest-first from STOR-02B with actor, timestamp, files touched, optional message. Each row links to the diff view (VIEW-02B). Cursor-based pagination for projects with 10k+ commits.

**Success conditions:**
- Commit list loads and paginates without reloading the page.
- Each row links to the diff view with the commit pre-selected.
- Empty projects show "No commits yet" instead of an empty list.

### VIEW-02B: Diff viewer component with unified line layout
> effort: M | risk: medium | type: feature | ai: assisted
> depends_on: VIEW-02A, STOR-06A

Component `apps/web/components/diff/DiffViewer.tsx` that consumes the STOR-06A JSON shape and renders unified line-level diff (canvas: "side-by-side or unified — pick one for v1" — pick unified for simplicity). Added lines green, removed red, unchanged white. Collapsible hunks for long files per canvas "pagination matters for large projects." Takes from/to commit hashes from the URL.

**Success conditions:**
- Diff between two commits renders with added/removed/unchanged lines visible.
- Large diffs (1000+ lines) remain scrollable without hanging.
- Initial render completes within 2 seconds for typical diffs (strategic spec SLO).
- A commit with no changes to files shows an empty-but-clear state.

### VIEW-02C: Cross-commit file picker
> effort: S | risk: low | type: feature | ai: full
> depends_on: VIEW-02B

On the diff page, let the user pick any two commits (from the commit list pop-out) to compare, not just adjacent ones. Canvas: "Full-project diff between any two commits is essentially file-by-file diffs concatenated; pagination matters for large projects."

**Success conditions:**
- User can pick commit A and commit B and see the full file-by-file diff between them.
- Picking the same commit twice shows an empty diff with a clear label.

---

## Capability: VIEW-03 — Contextual Commenting UI
> size: M | risk: medium

Heading-hover comment affordance, threaded replies, resolve toggle, profile popover. Part of Web Viewer (should-have) — canvas: "Comments are the asynchronous input channel from non-technical stakeholders to the agent (via PLUG-04 ingestion)." Complexity per canvas: medium. The heading-path string format must be aligned with STOR-04 via `shared-types/HeadingPath` (PLAT-01D enforces the shared definition).

### VIEW-03A: Heading-hover comment affordance
> effort: M | risk: low | type: feature | ai: assisted
> depends_on: VIEW-01A, STOR-04A

Augment VIEW-01A's rendered output to show a "+" icon next to each heading on hover. Clicking opens an inline comment box. Submitting calls `POST /orgs/{orgId}/projects/{projectId}/comments` (STOR-04C) with the `HeadingPath` derived from the heading's computed path. Posted comments appear below the heading immediately (optimistic update), rolled back on API error.

**Success conditions:**
- Hovering any heading reveals the "+" affordance.
- Clicking opens a comment box; submitting posts to the API and the comment appears inline.
- HeadingPath string sent matches the format shared-types enforces.
- API errors roll back the optimistic update and show a toast.

### VIEW-03B: Comment thread component with resolve and profile popover
> effort: M | risk: low | type: feature | ai: assisted
> depends_on: VIEW-03A, AUTH-01C

Component `apps/web/components/comments/Thread.tsx` rendering a parent comment with child replies (single-level per STOR-04's v1 design). Each comment has a Reply button (creates a child), a Resolve button (toggles via STOR-04C PATCH), and author name + avatar linking to a profile popover that reads from AUTH-01 user rows. Resolved comments are collapsed by default with a "show resolved" toggle per canvas "The 'show resolved' toggle is per-page state, not persisted."

**Success conditions:**
- Threaded replies render under a parent comment.
- Resolve button toggles resolved_at and collapses the comment in the default view.
- Profile popover shows name, avatar, and role.
- Show resolved toggle reveals resolved comments on the current page only.

### VIEW-03C: Orphaned comment surfacing
> effort: S | risk: medium | type: feature | ai: pair
> depends_on: VIEW-03B, STOR-04B

Per the STOR-04B decision, orphaned comments are either computed client-side or fetched with an `orphaned_at` from the server. Either way, VIEW-03 renders them in a separate "Orphaned comments" panel with strikethrough heading paths and a "Heading was removed" note. Canvas: "orphaned comments are NOT auto-deleted — they're preserved for historical context and reviewed by the PM before next synthesis."

**Success conditions:**
- Orphaned comments appear in a separate panel, not inline.
- The panel shows the original heading path with strikethrough.
- Orphaned comments are never auto-deleted; they persist until a PM action deletes them.

---

## Capability: VIEW-04 — Project Dashboard and Activity Feed
> size: M | risk: low

Project landing page with members, lock status, and recent activity. Part of Web Viewer (should-have) — canvas: "This is the most user-visible page. Cold-start latency hits here first." Complexity per canvas: low. Canvas coverage gap: the strategic spec lists VIEW-02 in the dependencies but the actual data dependency includes STOR-05 for lock status — surfaced here as an explicit dependency.

### VIEW-04A: Composite dashboard endpoint
> effort: M | risk: low | type: feature | ai: full
> depends_on: STOR-02B, STOR-05B, AUTH-02A

Endpoint `GET /orgs/{orgId}/projects/{projectId}/dashboard` returning `{project, members, lock, recent_commits}` in a single round-trip per canvas: "Use a single combined endpoint to fetch project + members + lock + recent commits in one round-trip." Fetches 10 most recent commits from STOR-02B, the current lock state from STOR-05B, and the members from AUTH-02 via the tenant-aware repo.

**Success conditions:**
- Endpoint returns all four fields in a single response.
- Response p95 latency is under 500ms.
- Hitting the endpoint with an unauthorized user returns 403.

### VIEW-04B: Dashboard page with polling lock indicator
> effort: M | risk: low | type: feature | ai: assisted
> depends_on: VIEW-04A

Next.js page at `apps/web/app/orgs/[orgId]/projects/[projectId]/page.tsx` rendering project name, description, members (avatars + roles), the lock indicator ("Locked by X since HH:MM" or "No active session"), and the last 10 commits as an activity feed. Lock indicator polls `/dashboard` every 10 seconds per canvas "10s polling is fine for v1 scale." Each activity row links to VIEW-02B diff.

**Success conditions:**
- Dashboard loads within 2 seconds (strategic spec SLO).
- Lock indicator updates within 10 seconds of a server-side lock change.
- Activity feed shows the 10 most recent commits newest-first.
- Clicking a commit navigates to the diff view.

---

## Capability: VIEW-05 — Notification Delivery (Email + In-Web)
> size: L | risk: high

Email and in-web notification fan-out triggered by commits and comment events. Part of Web Viewer (should-have) — the only **high-risk** capability in VIEW per canvas: "Email delivery dependence + the role-relevant filtering ambiguity." Canvas Discovery #6 explicitly requires Phase 2 to pick one of three role-filter strategies; this capability carries that decision as a research spike and then implements it. Email infrastructure is shared with STOR-05 lock warnings — the same delivery SLO from INFRA-02C applies.

### VIEW-05A: notifications and notification_prefs schema
> effort: S | risk: low | type: infrastructure | ai: full
> depends_on: AUTH-01A, PLAT-01C

Migration `0012_notifications.sql` creating `app.notifications` (`id`, `user_id`, `project_id`, `type` enum `commit` | `comment` | `lock_warning`, `payload` JSONB, `is_read`, `created_at`). The `notification_prefs` table was already created in AUTH-01A (canvas explicit); this migration only adds the `notifications` table and any missing indexes.

**Success conditions:**
- Migration creates `notifications` with the listed columns.
- Query by `(user_id, is_read, created_at DESC)` uses an index.

### VIEW-05B: Role-relevant filtering strategy spike
> effort: S | risk: high | type: research | ai: pair
> depends_on: VIEW-05A

Per canvas Discovery #6: "Three options for Phase 2: filter by filename (server can do this), filter client-side at render time, or accept v1 notifies on all commits (defer the feature)." Decide and record in `docs/decisions/view-05-role-filter.md`. Canvas recommends filename-based server filtering as the least-code-change option that respects D9 (filename is metadata, not content). The decision blocks VIEW-05C.

**Success conditions:**
- Decision doc exists with the three options and chosen rationale.
- The choice explicitly respects D9 (no server-side canvas content parsing).

### VIEW-05C: Cloud Tasks fan-out worker for commits and comments
> effort: L | risk: high | type: feature | ai: pair
> depends_on: VIEW-05B, STOR-03B, STOR-04C, PLAT-01F, INFRA-02C

Cloud Run job `apps/jobs/notification-fanout/` subscribed to the `notification-fanout` Cloud Tasks queue (INFRA-01C). Enqueue points: STOR-03B after a commit is created, STOR-04C after a comment is created, STOR-05C after a lock warning. The worker enumerates users in `project_members` who should be notified per the role-filter strategy from VIEW-05B and the user's `notification_prefs`, inserts rows into `notifications`, and sends emails via the email vendor (tagged by event type for INFRA-02C SLO tracking). Per canvas: "Decouple commit-write from notification fan-out via a queue — the 10s SLO is tight; an in-line fan-out blocks the write."

**Success conditions:**
- A commit produces email notifications to all eligible project members within 10 seconds.
- A comment produces both email and in-web notifications within 10 seconds.
- Lock-warning emails are tagged `lock-warning` in the delivery event and trip INFRA-02C dashboard correctly.
- Users with `frequency=none` do not receive emails.
- Role-filter strategy from VIEW-05B is honored.

### VIEW-05D: In-web notification feed and mark-as-read
> effort: M | risk: low | type: feature | ai: full
> depends_on: VIEW-05C, AUTH-01C

Next.js component `apps/web/components/notifications/Feed.tsx` showing a badge with unread count and a dropdown with the latest notifications. Clicking a notification marks it read via `PATCH /users/me/notifications/{id}` and navigates to the underlying commit or comment. Prefs page under `apps/web/app/settings/notifications/page.tsx` lets the user set frequency per org (`all`, `role-relevant`, `none`) — writes to `notification_prefs`.

**Success conditions:**
- Unread count badge is visible in the main nav.
- Clicking a notification marks it read and navigates to the target.
- Notification prefs persist and affect subsequent fan-out.
- In-web notifications appear within 5 seconds of the triggering event (strategic spec SLO).

---

## Capability: PROJ-01 — Project Lifecycle
> size: M | risk: low

Project create, archive, restore, hard-delete. Part of Project & Artifact Management (must-have) — canvas: "Projects are created within orgs (AUTH-02 scope). This group is horizontal — project creation ships with Auth+Org." Complexity per canvas: low. The hard-delete path is the only subtle bit because workspace IAM is append-only — hard delete requires the privileged purge service account from INFRA-01A.

### PROJ-01A: projects schema with archived_at soft-delete
> effort: S | risk: low | type: infrastructure | ai: full
> depends_on: AUTH-02A, PLAT-01D

Migration `0013_projects.sql` creating `app.projects` (`id`, `org_id`, `name`, `description`, `archived_at` nullable, `created_by_user_id`, `created_at`). Create `ProjectRepo` extending `BaseRepo`. Default list views filter by `archived_at IS NULL`; archived views show `archived_at IS NOT NULL`. Per canvas: "Soft delete: archived_at timestamp on projects. UI filters by it."

**Success conditions:**
- Migration creates the table.
- `ProjectRepo.list(orgId)` filters by `archived_at IS NULL` by default.
- `ProjectRepo.listArchived(orgId)` returns the inverse.

### PROJ-01B: Create, archive, restore endpoints and wizard UI
> effort: M | risk: low | type: feature | ai: assisted
> depends_on: PROJ-01A, AUTH-03B, STOR-01A, STOR-05A

`POST /orgs/{orgId}/projects` creates a project, initializes the GCS folder prefix via STOR-01A, creates the `session_locks` row with NULL owner (STOR-05A), and triggers AUTH-03B's role assignment flow. `POST .../archive` sets `archived_at`; `POST .../restore` clears it. Next.js wizard at `apps/web/app/orgs/[orgId]/projects/new/page.tsx` walks through name, description, initial members + roles.

**Success conditions:**
- Creating a project in under 2 minutes (strategic spec SLO).
- Project creation atomically initializes the GCS folder and lock row (single transaction at the API layer).
- Archive hides the project from the default list.
- Restore brings it back.

### PROJ-01C: Hard-delete async job with privileged purge
> effort: M | risk: medium | type: feature | ai: pair
> depends_on: PROJ-01B, AUTH-02A

Per canvas: "Hard delete: enqueue a Cloud Tasks job that runs as a privileged service account; user-visible action returns immediately with 'deletion in progress'." `DELETE /orgs/{orgId}/projects/{projectId}` (org-owner only, requires a confirmation dialog showing the project name typed to match) enqueues to a new Cloud Tasks queue `project-purge`. Job at `apps/jobs/project-purge/` runs under the purge service account from INFRA-01A, deletes all GCS objects under the project prefix, deletes the Postgres rows, and records an audit event.

**Success conditions:**
- Hard delete requires typing the project name to confirm.
- Hard delete returns within 1 second with status "deletion in progress".
- Purge job deletes all GCS objects and DB rows atomically; failures are retryable.
- Non-owners attempting hard delete receive 403.

---

## Capability: PROJ-02 — Source Material Upload and Management
> size: M | risk: low

Mutable source-material upload using signed URLs and the cloud-mode "load sources into context" plugin branch. Part of Project & Artifact Management (should-have). Per canvas: "Sources live under the same project folder in GCS but can be deleted (unlike workspace files which are append-only). Need a separate IAM policy or path prefix." INFRA-01A already established the separate prefix. Canvas coverage gap: the plugin-side "Load sources into context" branch is under-specified in the strategic spec — this capability explicitly covers it.

### PROJ-02A: Sources API with signed URL issuance
> effort: M | risk: low | type: feature | ai: assisted
> depends_on: STOR-01A, AUTH-03A

Endpoints: `POST /orgs/{orgId}/projects/{projectId}/sources/upload-url` returns a signed GCS upload URL scoped to the project's `sources/` prefix (canvas: "Use signed URLs for uploads (browser → GCS direct) instead of streaming through the API"); `GET .../sources` lists sources with filename, upload date, uploader, size; `DELETE .../sources/{filename}` deletes the GCS object (allowed because the sources prefix has delete permission). Folder organization is just filename prefixes per canvas "Folder organization is just key prefixes in GCS — no server-side directory model."

**Success conditions:**
- Upload URL is valid for 10 minutes and upload succeeds directly to GCS.
- Listing returns all sources under the project prefix with metadata.
- Delete removes the object and the list no longer returns it.
- Non-project-members receive 403 on all endpoints.

### PROJ-02B: Upload UI with drag-and-drop
> effort: M | risk: low | type: feature | ai: full
> depends_on: PROJ-02A, VIEW-04B

Add a Sources tab to the project dashboard (VIEW-04B). Drag-and-drop multiple files; each upload uses the signed URL flow. Progress bars per file. Delete button per row with confirmation.

**Success conditions:**
- User can upload multiple files at once via drag-and-drop.
- Progress is visible per file.
- Delete removes the file and updates the list.

### PROJ-02C: Plugin "load sources into context" cloud branch
> effort: S | risk: low | type: feature | ai: pair
> depends_on: PROJ-02A, PLUG-01C

Per canvas: "The plugin's 'Load sources into context' button is an existing UX in ido4shape. In cloud mode, the plugin must pull from the cloud `sources/` instead." Add a cloud-mode branch to the corresponding plugin skill that, when cloud mode is enabled, invokes `cloud-sync.sh fetch-sources` to download the sources from the cloud to a temp dir before ingesting them. Ships as a patch under `plugin-changes/`.

**Success conditions:**
- In local mode, the existing behavior is byte-identical (PLAT-02 parity).
- In cloud mode, sources are pulled from the cloud before ingestion.
- The temp dir is cleaned up after ingestion.

---

## Capability: PROJ-03 — Strategic Spec Artifact Storage with Version History
> size: M | risk: low

Versioned strategic-spec artifact storage under `artifacts/`, version history UI, and the plugin cloud-mode branch in synthesize-spec. Part of Project & Artifact Management (should-have) — canvas: "This is the handoff point to the downstream pipeline (ido4)." Canvas Discovery #5 flags the auto-generated change summary as in tension with D9; this capability resolves by computing the summary plugin-side and passing it as the commit message.

### PROJ-03A: Artifact storage conventions reusing STOR-01
> effort: S | risk: low | type: infrastructure | ai: full
> depends_on: STOR-01A, STOR-02A

Define the `artifacts/` prefix convention: spec artifacts are stored at `orgs/{org_id}/projects/{project_id}/artifacts/{spec-name}.md` using the same STOR-01A append-only writeFile path. Each synthesis creates a new generation with a `commits` row tagged `type='artifact'` (extend the `commits` schema with a `type` column via a migration `0014_commit_type.sql`). No new storage layer — reuses existing machinery per canvas "Reuse STOR-01/STOR-02 — artifacts are not a separate storage layer."

**Success conditions:**
- Migration adds `type` column to `commits` with default `'workspace'`.
- Writing an artifact records a commit with `type='artifact'`.
- Existing queries continue to work without filter (type defaults to workspace).

### PROJ-03B: Artifact version history UI with compare
> effort: M | risk: low | type: feature | ai: assisted
> depends_on: PROJ-03A, VIEW-02B

Next.js page at `apps/web/app/orgs/[orgId]/projects/[projectId]/artifacts/[specName]/page.tsx` showing a version list of the spec with date, synthesizer, and the commit message (which carries the plugin-computed change summary). Clicking two versions shows the diff via VIEW-02B. Per canvas success condition: "Historical specs are viewable and comparable."

**Success conditions:**
- Version list shows all spec versions newest-first.
- Each version displays the plugin-provided change summary as the commit message.
- Compare view shows the line-level diff between two versions.

### PROJ-03C: Plugin synthesize-spec cloud branch
> effort: M | risk: medium | type: feature | ai: pair
> depends_on: PROJ-03A, PLUG-01C, STOR-03B

Per canvas Discovery #5: "Recommended: compute the summary plugin-side (the plugin already parses canvas) and pass it as the commit message to the cloud. The cloud just stores and displays it." Add a cloud-mode branch to the plugin's `synthesize-spec` skill that, after writing the spec locally, computes a change summary (N capabilities added/removed/changed since the last version — the plugin already has the canvas parser for this), then POSTs the spec to `STOR-03B` under the `artifacts/` prefix with the summary as the `message` field. Ships as a patch under `plugin-changes/`.

**Success conditions:**
- In local mode, synthesize-spec is byte-identical to v0.4.2 (PLAT-02 parity).
- In cloud mode, every synthesis pushes the spec to the cloud with a non-empty change summary.
- The change summary is computed client-side, never by the server (D9 preserved).

---

## Capability: PROJ-04 — Workspace Export
> size: M | risk: low

Streaming zip export with README pointing at the ido4 handoff. Part of Project & Artifact Management (should-have) — canvas: "This IS the manual handoff bridge to ido4. The README in the zip should explicitly say 'to import into ido4, run parse_strategic_spec against artifacts/{latest-spec}.md'." Complexity per canvas: low; the 30s SLO at file scale is the only unknown.

### PROJ-04A: Streaming zip export endpoint
> effort: M | risk: medium | type: feature | ai: pair
> depends_on: STOR-01A, STOR-02A, PROJ-02A

Endpoint `GET /orgs/{orgId}/projects/{projectId}/export` streams a zip containing: all workspace files at their latest generation, all sources, all artifact versions, and `commits.json` (the STOR-02 commit log serialized). Uses `archiver` for Node streaming directly from GCS reads per canvas "Stream the zip on-the-fly to the response — don't materialize on disk first." Zip name follows `{project-name}-ido4shape-export-{YYYY-MM-DD}.zip`. Includes a README at the zip root explaining the structure AND the ido4 handoff instruction verbatim.

**Success conditions:**
- Export completes in under 30 seconds for a typical project (strategic spec SLO).
- Zip contents match the canvas specification (files, sources, artifacts, commits.json, README).
- README explicitly references `parse_strategic_spec` and the `artifacts/` path.
- The endpoint streams without buffering the entire zip in memory.

### PROJ-04B: Export button on project dashboard and latency research
> effort: S | risk: medium | type: feature | ai: pair
> depends_on: PROJ-04A, VIEW-04B

Add an Export button to the project dashboard that triggers download. Per canvas "Research task: 30s SLO at file scale (10 MB workspace files × N) — confirm streaming holds." Benchmark the export endpoint with a synthetic project containing 10 × 10MB files and 100 commits. Record in `docs/decisions/proj-04-export-latency.md` whether the 30s SLO holds or needs mitigation (cap file count, background job with download link).

**Success conditions:**
- Export button downloads a working zip for a real project.
- Benchmark recorded for 10 × 10MB file project.
- If benchmark exceeds 30s, the decision doc proposes a mitigation.
