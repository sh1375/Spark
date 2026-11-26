import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260811165000_close_auth_runtime_p0_gates.sql', 'utf8');
const hook = readFileSync('supabase/functions/auth-send-sms-hook/index.ts', 'utf8');
const health = readFileSync('supabase/functions/auth-health-check/index.ts', 'utf8');
const bulkPhoneSync = readFileSync('supabase/functions/bulk-sync-profile-phones/index.ts', 'utf8');
const recoveryMigration = readFileSync('supabase/migrations/20260811172000_legacy_recovery_session_revocation.sql', 'utf8');
const serviceWorker = readFileSync('public/sw.js', 'utf8');

test('native SMS delivery requires an atomic, expiring, service-only grant', () => {
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /consumed_at = now\(\)/i);
  assert.match(migration, /revoke all on function public\.consume_native_auth_sms_send_grant_v1.*anon, authenticated/i);
  assert.match(hook, /SMS_GRANT_REQUIRED/);
  assert.match(hook, /consume_native_auth_sms_send_grant_v1/);
});

test('legacy recovery revokes native and custom sessions after password reset', () => {
  assert.match(recoveryMigration, /delete from auth\.sessions where user_id = v_challenge\.user_id/i);
  assert.match(recoveryMigration, /auth_epoch = coalesce\(auth_epoch, 1\) \+ 1/i);
  assert.match(recoveryMigration, /revoke_reason = coalesce\(revoke_reason, 'password_reset'\)/i);
});

test('PWA only caches explicit static assets and never arbitrary JSON responses', () => {
  assert.match(serviceWorker, /outside the explicit static allowlist is network-only/i);
  assert.doesNotMatch(serviceWorker, /caches\.open\(RUNTIME_CACHE\)[\s\S]{0,200}cache\.put\(request/i);
});

test('auth health check requires security admin, aal2, recent step-up, and audit', () => {
  assert.match(health, /claims\.aal !== "aal2"/);
  assert.match(health, /is_security_admin/);
  assert.match(health, /has_recent_totp_stepup_grant/);
  assert.match(health, /auth_health_check_executed/);
  assert.doesNotMatch(health, /security_admin_roles/);
});

test('bulk phone sync uses the database audit taxonomy and logs write failures server-side', () => {
  assert.match(bulkPhoneSync, /event_category:\s*"access"/);
  assert.doesNotMatch(bulkPhoneSync, /event_category:\s*"security_admin"/);
  assert.match(bulkPhoneSync, /console\.error\("bulk-sync-profile-phones audit write failed"/);
  assert.match(bulkPhoneSync, /code:\s*auditError\.code/);
  assert.match(bulkPhoneSync, /message:\s*auditError\.message/);
  assert.match(bulkPhoneSync, /details:\s*auditError\.details/);
  assert.match(bulkPhoneSync, /error:\s*"AUDIT_WRITE_FAILED"/);
});
