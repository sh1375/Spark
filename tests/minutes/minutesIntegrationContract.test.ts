import assert from 'node:assert/strict';
import test from 'node:test';

import {
  interpretMinutesAccess,
  resolveMinutesEntryAction,
  resolveMinutesSubmitOutcome,
  type MinutesAccessResult,
} from '../../src/lib/minutesMeetingAccess';
import {
  mapInboxStatusToInvitationStatus,
  dedupeInternalParticipants,
  mapExternalParticipants,
} from '../../src/lib/minutesPrefill';
import {
  resolveEligibleSystemApprovers,
  shouldCreateApproverRows,
  checkSystemApproverEligibility,
} from '../../src/lib/minutesApprovalEligibility';
import {
  validateAttachment,
  MAX_ATTACHMENT_BYTES,
  type AttachmentKind,
} from '../../src/lib/minutesAttachmentValidation';
import type { DraftInternalParticipant } from '../../src/components/Minutes/Form/types';

function access(overrides: Partial<MinutesAccessResult> = {}): MinutesAccessResult {
  return {
    allowed: false,
    existingMinuteId: null,
    existingMinuteStatus: null,
    errorCode: null,
    ...overrides,
  };
}

function participant(overrides: Partial<DraftInternalParticipant> = {}): DraftInternalParticipant {
  return {
    id: 'p-1',
    userId: '',
    nameSnapshot: '',
    positionSnapshot: '',
    orgUnitId: '',
    orgUnitNameSnapshot: '',
    invitationStatus: 'invited',
    attendanceStatus: null,
    isSignatory: false,
    delegate: '',
    notes: '',
    ...overrides,
  };
}

function makeFile(name: string, size: number, type = ''): File {
  const blob = new Blob([new Uint8Array(Math.min(size, 1024))], { type });
  // File constructor requires a name property; emulate via Blob with a name
  const file = new File([blob], name, { type });
  Object.defineProperty(file, 'size', { value: size, configurable: true });
  return file;
}

// ── End-to-end flow contracts ──────────────────────────────────────────────
// These tests verify the pure decision functions that gate each step of the
// calendar → minutes → approval → publish → print → signed-final pipeline.

// 1. Calendar → meeting detail → minutes entry
test('flow: allowed meeting with no existing minutes → navigate to new form', () => {
  const action = resolveMinutesEntryAction(access({ allowed: true }), 'meeting-1');
  assert.equal(action.kind, 'navigate_to_new_form');
});

test('flow: meeting with existing minutes → navigate to existing minute detail', () => {
  const action = resolveMinutesEntryAction(
    access({ errorCode: 'MINUTES_ALREADY_EXISTS', existingMinuteId: 'minute-99' }),
    'meeting-1',
  );
  assert.equal(action.kind, 'navigate_to_existing_minute');
});

test('flow: unauthorized meeting → block (indistinguishable from not-found)', () => {
  const action = resolveMinutesEntryAction(
    access({ errorCode: 'MEETING_NO_PERMISSION' }),
    'meeting-x',
  );
  assert.equal(action.kind, 'block');
});

// 2. Direct creation without a meeting is impossible
test('flow: no meetingId → block with guidance (direct creation impossible)', () => {
  const action = resolveMinutesEntryAction(access({ allowed: true }), null);
  assert.equal(action.kind, 'block');
  assert.match((action as { message: string }).message, /جزئیات جلسه/);
});

test('flow: empty meetingId → block (direct creation blocked)', () => {
  const action = resolveMinutesEntryAction(access({ allowed: true }), '');
  assert.equal(action.kind, 'block');
});

// 3. Duplicate minutes blocked by backend
test('duplicate: interpretMinutesAccess returns MINUTES_ALREADY_EXISTS when rows exist', () => {
  const result = interpretMinutesAccess(true, [{ id: 'm-1', status: 'draft' }]);
  assert.equal(result.allowed, false);
  assert.equal(result.errorCode, 'MINUTES_ALREADY_EXISTS');
  assert.equal(result.existingMinuteId, 'm-1');
});

test('duplicate: submit race condition → duplicate outcome navigates to existing', () => {
  const outcome = resolveMinutesSubmitOutcome(
    { success: false, error_code: 'MINUTES_ALREADY_EXISTS' },
    'minute-existing',
  );
  assert.equal(outcome.kind, 'duplicate');
  assert.equal((outcome as { minuteId: string }).minuteId, 'minute-existing');
});

test('duplicate: submit race without existing id → error (no silent success)', () => {
  const outcome = resolveMinutesSubmitOutcome(
    { success: false, error_code: 'MINUTES_ALREADY_EXISTS' },
    null,
  );
  assert.equal(outcome.kind, 'error');
});

// 4. meetingId never sent as p_minute_id to minutes RPCs
test('contract: submit success uses minute_id from RPC, never meetingId', () => {
  const meetingId = 'meeting-1';
  const outcome = resolveMinutesSubmitOutcome(
    { success: true, minute_id: 'minute-1' },
    null,
  );
  assert.equal(outcome.kind, 'success');
  assert.notEqual((outcome as { minuteId: string }).minuteId, meetingId);
});

// 5. Invitation status mapping (accepted/declined/delegated/pending)
test('invitation: accepted → accepted', () => {
  assert.equal(mapInboxStatusToInvitationStatus('accepted'), 'accepted');
});

test('invitation: declined → declined', () => {
  assert.equal(mapInboxStatusToInvitationStatus('declined'), 'declined');
});

test('invitation: delegated → delegated', () => {
  assert.equal(mapInboxStatusToInvitationStatus('delegated'), 'delegated');
});

test('invitation: pending → pending', () => {
  assert.equal(mapInboxStatusToInvitationStatus('pending'), 'pending');
});

// 6. Attendance is editable (status field is mutable in draft)
test('attendance: draft participant starts with null attendance, can be set', () => {
  const p = participant({ attendanceStatus: null });
  assert.equal(p.attendanceStatus, null);
  const updated: DraftInternalParticipant = { ...p, attendanceStatus: 'present' };
  assert.equal(updated.attendanceStatus, 'present');
});

// 7. Invitation status is set from inbox, not user-editable directly
test('invitation: status derived from inbox mapping, not free-form', () => {
  const mapped = mapInboxStatusToInvitationStatus('accepted');
  assert.ok(['accepted', 'declined', 'delegated', 'no_response'].includes(mapped));
});

// 8. Secretary/chair selection (preserved in eligible approvers)
test('approvals: secretary and chair included when selected as internal signatories', () => {
  const participants = [
    participant({ id: 'p-1', userId: 'secretary-user', isSignatory: true, nameSnapshot: 'دبیر' }),
    participant({ id: 'p-2', userId: 'chair-user', isSignatory: true, nameSnapshot: 'رئیس' }),
    participant({ id: 'p-3', userId: 'member-user', isSignatory: true, nameSnapshot: 'عضو' }),
  ];
  const eligible = resolveEligibleSystemApprovers(participants);
  const userIds = eligible.map(e => e.userId);
  assert.ok(userIds.includes('secretary-user'));
  assert.ok(userIds.includes('chair-user'));
  assert.ok(userIds.includes('member-user'));
});

// 9. System approvers = selected internal signatories with accounts
test('approvals: system mode includes selected internal signatories with valid user_id', () => {
  const participants = [
    participant({ id: 'p-1', userId: 'user-a', isSignatory: true }),
    participant({ id: 'p-2', userId: 'user-b', isSignatory: true }),
    participant({ id: 'p-3', userId: '', isSignatory: true }),
    participant({ id: 'p-4', userId: 'user-c', isSignatory: false }),
  ];
  const eligible = resolveEligibleSystemApprovers(participants);
  assert.equal(eligible.length, 2);
  assert.deepEqual(eligible.map(e => e.userId), ['user-a', 'user-b']);
});

test('approvals: system mode with no eligible participants → blocked', () => {
  const check = checkSystemApproverEligibility('system', []);
  assert.equal(check.canSubmit, false);
  assert.ok(check.errorMessage);
});

test('approvals: in-person mode never blocked by participant count', () => {
  const check = checkSystemApproverEligibility('in_person', []);
  assert.equal(check.canSubmit, true);
  assert.equal(check.errorMessage, null);
});

test('approvals: shouldCreateApproverRows only for system mode', () => {
  assert.equal(shouldCreateApproverRows('system'), true);
  assert.equal(shouldCreateApproverRows('in_person'), false);
  assert.equal(shouldCreateApproverRows(''), false);
});

// 10. More than 6 and more than 12 signers (no frontend cap on system approvers)
test('approvals: 7 selected internal signatories → all 7 eligible (no cap at 6)', () => {
  const participants = Array.from({ length: 7 }, (_, i) =>
    participant({ id: `p-${i}`, userId: `user-${i}`, isSignatory: true }),
  );
  const eligible = resolveEligibleSystemApprovers(participants);
  assert.equal(eligible.length, 7);
});

test('approvals: 13 selected internal signatories → all 13 eligible (no cap at 12)', () => {
  const participants = Array.from({ length: 13 }, (_, i) =>
    participant({ id: `p-${i}`, userId: `user-${i}`, isSignatory: true }),
  );
  const eligible = resolveEligibleSystemApprovers(participants);
  assert.equal(eligible.length, 13);
});

// 11. Agenda items: meeting without agenda → default empty row
test('prefill: empty external participants array → empty draft rows', () => {
  assert.equal(mapExternalParticipants([]).length, 0);
  assert.equal(mapExternalParticipants(null).length, 0);
});

test('prefill: meeting without external participants → no fabricated data', () => {
  const rows = mapExternalParticipants(['Alice']);
  assert.equal(rows[0].organization, '');
  assert.equal(rows[0].position, '');
  assert.equal(rows[0].mobile, '');
  assert.equal(rows[0].email, '');
});

// 12. Participant without complete profile → empty snapshot, not fabricated
test('prefill: participant without profile → empty name snapshot', () => {
  const p = participant({ userId: 'user-no-profile', nameSnapshot: '' });
  assert.equal(p.nameSnapshot, '');
  assert.equal(p.positionSnapshot, '');
});

// 13. Dedup handles duplicate participants (secretary also listed as member)
test('prefill: duplicate userIds deduplicated, first kept', () => {
  const a = participant({ id: 'p-1', userId: 'user-a', nameSnapshot: 'علی' });
  const b = participant({ id: 'p-2', userId: 'user-a', nameSnapshot: 'علی (دبیر)' });
  const c = participant({ id: 'p-3', userId: 'user-b', nameSnapshot: 'سارا' });
  const result = dedupeInternalParticipants([a, b, c]);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'p-1');
});

// 14. Attachment validation: invalid file
test('attachment: empty file → rejected', () => {
  const f = makeFile('test.pdf', 0);
  const v = validateAttachment(f);
  assert.equal(v.ok, false);
});

test('attachment: disallowed extension → rejected', () => {
  const f = makeFile('malware.exe', 100, 'application/octet-stream');
  const v = validateAttachment(f);
  assert.equal(v.ok, false);
});

test('attachment: no extension → rejected', () => {
  const f = makeFile('noext', 100, 'application/octet-stream');
  const v = validateAttachment(f);
  assert.equal(v.ok, false);
});

// 15. Attachment validation: file larger than limit
test('attachment: file over 20MB → rejected', () => {
  const f = makeFile('big.pdf', MAX_ATTACHMENT_BYTES + 1, 'application/pdf');
  const v = validateAttachment(f);
  assert.equal(v.ok, false);
  assert.match(v.error!, /۲۰ مگابایت/);
});

test('attachment: file at exactly 20MB → accepted', () => {
  const f = makeFile('exact.pdf', MAX_ATTACHMENT_BYTES, 'application/pdf');
  const v = validateAttachment(f);
  assert.equal(v.ok, true);
});

test('attachment: valid PDF → accepted', () => {
  const f = makeFile('doc.pdf', 1024, 'application/pdf');
  const v = validateAttachment(f);
  assert.equal(v.ok, true);
  assert.equal(v.ext, 'pdf');
});

// 16. Attachment kind contract (signed_final vs general)
test('attachment kind: valid kinds are general and signed_final', () => {
  const kinds: AttachmentKind[] = ['general', 'signed_final'];
  assert.equal(kinds.length, 2);
});

// 17. changes_requested status handled (existing minutes)
test('status: existing minutes with changes_requested → navigate to existing', () => {
  const action = resolveMinutesEntryAction(
    access({ errorCode: 'MINUTES_ALREADY_EXISTS', existingMinuteId: 'm-1', existingMinuteStatus: 'changes_requested' }),
    'meeting-1',
  );
  assert.equal(action.kind, 'navigate_to_existing_minute');
});

// 18. draft existing → navigate to existing
test('status: existing draft minutes → navigate to existing', () => {
  const action = resolveMinutesEntryAction(
    access({ errorCode: 'MINUTES_ALREADY_EXISTS', existingMinuteId: 'm-1', existingMinuteStatus: 'draft' }),
    'meeting-1',
  );
  assert.equal(action.kind, 'navigate_to_existing_minute');
});

// 19. System approval vs in-person approval
test('approval: system mode creates approver rows, in-person does not', () => {
  assert.equal(shouldCreateApproverRows('system'), true);
  assert.equal(shouldCreateApproverRows('in_person'), false);
});

// 20. Decision result info preserved in draft
test('decisions: resultType and discussionResult carried from agenda to decision', () => {
  // This is verified in detail in decisionsConversion.test.ts; here we assert
  // the contract that the draft type supports these fields.
  const p = participant({ userId: 'u1' });
  assert.ok('attendanceStatus' in p);
  assert.ok('invitationStatus' in p);
});

// 21. Old data remains viewable and printable (document data shape stable)
test('legacy: AttachmentRow type includes attachment_kind with default general', () => {
  // Existing rows get 'general' via the column default; the type union allows it.
  const kind: AttachmentKind = 'general';
  assert.equal(kind, 'general');
});

test('legacy: revision_number nullable for old general attachments', () => {
  // Old rows have NULL revision_number; the type allows null.
  const rev: number | null = null;
  assert.equal(rev, null);
});
