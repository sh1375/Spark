import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';

// Exercise the installed SDK with separate device storage and a simulated Auth server.
async function devices() {
  const active = new Set(['device-a', 'device-b']);
  const requests: string[] = [];
  const clients = ['device-a', 'device-b'].map(id => {
    const key = `logout-test-${id}`;
    const session = { access_token: `test-${id}`, refresh_token: `refresh-${id}`,
      token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600, user: { id: 'same-user', aud: 'authenticated' } };
    const storage = new Map([[key, JSON.stringify(session)]]);
    return createClient('https://auth.example.test', 'test-key', {
      auth: { storageKey: key, storage: { getItem: k => storage.get(k) ?? null,
        setItem: (k, v) => { storage.set(k, v); }, removeItem: k => { storage.delete(k); } },
        autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async input => {
        const url = new URL(String(input));
        assert.equal(url.pathname, '/auth/v1/logout');
        const scope = url.searchParams.get('scope');
        requests.push(scope!);
        if (scope === 'global') active.clear();
        else if (scope === 'local') active.delete(id);
        return new Response(null, { status: 204 });
      } },
    });
  });
  await Promise.all(clients.map(c => c.auth.getSession()));
  return { active, requests, clients };
}

test('local logout clears only this device and preserves the second device session', async () => {
  const { active, requests, clients: [a, b] } = await devices();
  assert.equal((await a.auth.signOut({ scope: 'local' })).error, null);
  assert.deepEqual(requests, ['local']);
  assert.deepEqual([...active], ['device-b']);
  assert.equal((await a.auth.getSession()).data.session, null);
  assert.equal((await b.auth.getSession()).data.session?.user.id, 'same-user');
});

test('explicit global logout still invalidates both server sessions', async () => {
  const { active, requests, clients: [a] } = await devices();
  assert.equal((await a.auth.signOut({ scope: 'global' })).error, null);
  assert.deepEqual(requests, ['global']);
  assert.equal(active.size, 0);
});

test('all frontend logout calls declare scope; global logout is confined to revokeAll', () => {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);
  for (const file of walk('src')) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\.auth\.signOut\(\s*\)/, file);
    if (/\.auth\.signOut\(\{ scope: 'global' \}\)/.test(source)) {
      assert.equal(file, join('src', 'features', 'auth', 'components', 'SessionManagementPanel.tsx'));
      const revokeAll = source.slice(source.indexOf('const revokeAll ='), source.indexOf('const visibleSessions'));
      assert.match(revokeAll, /mode: 'revoke_all'/);
      assert.match(revokeAll, /scope: 'global'/);
      assert.equal((source.match(/scope: 'global'/g) ?? []).length, 1);
    }
  }
});
