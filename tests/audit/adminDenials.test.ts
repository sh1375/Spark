import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';

for (const slug of ['admin-users', 'backup-data', 'restore-backup', 'admin-delete-user', 'admin-retire-user']) {
  test(`${slug}: denied non-admin is recorded before returning 403 without a mutation`, async () => {
    const calls: unknown[][] = [];
    let handler: ((request: Request) => Promise<Response>) | undefined;
    let mutations = 0;
    const query = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({
      data: { is_admin: false, is_security_admin: false, is_active: true, account_status: 'ACTIVE' },
    }), insert() { mutations++; throw new Error('must not write'); }, delete() { mutations++; throw new Error('must not delete'); } };
    const client = { from: () => query };
    const code = (await transform(readFileSync(`supabase/functions/${slug}/index.ts`, 'utf8').replace(/^import .*;\r?\n/gm, ''), { loader: 'ts', format: 'cjs' })).code;
    vm.runInNewContext(code, {
      module: { exports: {} }, exports: {}, Request, Response, URL, console,
      Deno: { serve: (callback: typeof handler) => { handler = callback; }, env: { get: () => 'test-only' } },
      createClient: () => client, adminClient: () => client,
      requireFullAuthAccess: async () => ({ ok: true, userId: 'verified-user', userClient: {} }),
      deniedResponse: () => new Response('{}', { status: 403 }),
      recordAccessDenial: async (...args: unknown[]) => calls.push(args),
      getAllowedOrigins: async () => ['https://example.test'], baseCorsHeaders: {}, createJsonResponseHeaders: () => () => ({}),
      tokenClaims: () => ({ session_id: 'test-session' }),
    });
    assert.ok(handler);
    const response = await handler(new Request(`https://example.test/functions/v1/${slug}${slug === 'admin-users' ? '/create' : ''}`, { method: 'POST' }));
    assert.equal(response.status, 403);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1], 'verified-user');
    assert.match(String(calls[0][2]), /ADMIN/);
    assert.equal(mutations, 0);
  });
}
