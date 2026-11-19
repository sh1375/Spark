import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260811190000_close_remaining_ready_gates.sql',
  'utf8',
);
const helper = readFileSync('src/lib/chatAttachments.ts', 'utf8');
const chatInput = readFileSync('src/components/Chat/ChatInputBar.tsx', 'utf8');
const channelInput = readFileSync('src/components/Channels/ChannelInputBar.tsx', 'utf8');

test('legacy recovery is blocked for admin and security admin at the database boundary', () => {
  assert.match(migration, /before insert on public\.phone_password_reset_challenges/i);
  assert.match(migration, /p\.is_admin/i);
  assert.match(migration, /p\.is_security_admin/i);
  assert.match(migration, /PRIVILEGED_RECOVERY_REQUIRES_UNIFIED/);
});

test('profile escalation and old-session denial are deployment assertions', () => {
  assert.match(migration, /guard_protected_profile_fields/);
  assert.match(migration, /guard_security_role_columns/);
  assert.match(migration, /auth\.sessions/);
  assert.match(migration, /delete from auth\.sessions/i);
  assert.match(migration, /auth_global_full_access_gate/);
  assert.match(migration, /RESTRICTIVE/);
});

test('chat attachments use private membership-aware access and signed URLs', () => {
  assert.match(migration, /set public = false/i);
  assert.match(migration, /user_can_read_chat_attachment/);
  assert.match(migration, /participant_a = auth\.uid\(\)/);
  assert.match(migration, /cm\.user_id = auth\.uid\(\)/);
  assert.match(helper, /createSignedUrl/);
  assert.doesNotMatch(chatInput, /getPublicUrl/);
  assert.doesNotMatch(channelInput, /getPublicUrl/);
});
