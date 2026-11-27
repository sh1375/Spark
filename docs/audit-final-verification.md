# Audit verification and deployment acceptance

Run the focused audit suite (npm run test:audit-focused) and the rollback helper tests (python tests/audit/airgapRollback.test.py, with Git Bash on Windows or Bash on Linux). The focused suite does not replace npm test or integration acceptance. Historic SQL migrations are intentionally removed from the working tree after deployment; do not weaken the old assertions or invent replacement historical files to obtain a passing full suite.

| Issue | Source changes / verification | Remaining acceptance |
| --- | --- | --- |
| #13 | Authenticated inbound linking; private new messages only for Bale, synthetic invalid/group/edited-message fixtures; no raw provider diagnostics. | Confirm registered provider URL and private test-account linking; ensure ingress does not log the proof query parameter. |
| #15 | Reserved attachment paths, guarded finalization, recoverable Storage failure and honest deletion counts; mocked failure/retry coverage. | Isolated PostgreSQL and Storage concurrency test with synthetic uploads; in-flight signed uploads need real integration evidence. |
| #16 | Register rename intent before moving; reverse completed moves, preserve backups on ambiguous collisions; handle INT/TERM/HUP. Temporary-path helper tests reproduce post-rename failure. | Full Linux bundle installation failure injection, abrupt SIGKILL/power loss and operator recovery. |
| #17 | Focused behavioral fixtures and portable admin denial test harness. | Full historic regression gate and isolated database behavior; missing historical artifacts remain explicit blockers. |
| #19 | Retry profile verification for the same identity, fail closed on lookup failure and metadata update failure; no destructive compensation or repeat create. | Auth integration with repeated requests, ambiguous create responses and repair/reconciliation of existing incomplete accounts. |
| #23 | OTP gateway/session-security transaction was deployed; focused gateway and notification error checks. | Real OTP, recovery, session revocation, recurring notification and provider acceptance. |
| #24 | Restrict outbound push destinations; report queue completion errors; prior ownership, backup reporting and external-call fixes retained. | Test real account switching, provider delivery, external-call idempotency, and database/Storage backup restoration. |

Push worker accepts HTTPS URLs on the supported FCM, Apple, Mozilla, observed Google push host and Windows notification service domains. It rejects IP addresses, userinfo, non-default ports, fragments and unapproved hosts before delivery. New legitimate provider hosts require explicit review before allowlisting. This is a delivery-side defense, not proof of comprehensive egress isolation. Queue completion errors are reported as ambiguous, not successful delivery records.

No production database mutations or test containers are required for this focused source-only release. No new SQL migration is included in this batch. Keep broader issues open until the remaining acceptance checks have evidence.
