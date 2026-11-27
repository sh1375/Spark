import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const hookSource = new URL('../../src/features/auth/hooks/useAuthSession.ts', import.meta.url);

function mountHook(supabase, localStorage, recordedSessions) {
  const slots = [];
  const effects = [];
  let cursor = 0;
  const sameDeps = (previous, next) => previous.length === next.length
    && previous.every((value, index) => Object.is(value, next[index]));
  const react = {
    useState(initial) {
      const slot = slots[cursor++] ??= { value: initial };
      return [slot.value, value => { slot.value = value; }];
    },
    useRef(initial) {
      return slots[cursor++] ??= { current: initial };
    },
    useCallback(callback, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || !sameDeps(previous.deps, deps)) slots[index] = { callback, deps };
      return slots[index].callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || !sameDeps(previous.deps, deps)) {
        const slot = { deps, cleanup: previous?.cleanup };
        slots[index] = slot;
        effects.push(() => {
          slot.cleanup?.();
          slot.cleanup = effect();
        });
      }
    },
  };
  const mocks = new Map([
    ['react', react],
    ['../../../lib/supabase', { supabase }],
    ['../services/clientHints', { collectClientHints: async () => ({}) }],
    ['../services/sessionEventContext', {
      createSessionContextRecorder: () => state => {
        recordedSessions.push(state.session_id);
      },
    }],
  ]);
  const { code: outputText } = transformSync(readFileSync(hookSource, 'utf8'), {loader: 'ts',format: 'cjs',target: 'es2022'});
  const exports = {};
  const module = { exports };
  runInNewContext(outputText, {
    exports, module,
    localStorage,
    require(id) {
      assert.ok(mocks.has(id), `Unexpected hook import: ${id}`);
      return mocks.get(id);
    },
  }, { filename: 'useAuthSession.js', timeout: 500 });
  assert.equal(typeof module.exports.useAuthSession, 'function');

  return {
    render() {
      cursor = 0;
      const state = module.exports.useAuthSession();
      for (const effect of effects.splice(0)) effect();
      return state;
    },
    cleanup() {
      for (const slot of slots) slot.cleanup?.();
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(settle => { resolve = settle; });
  return { promise, resolve };
}

async function until(predicate, description) {
  for (let turn = 0; turn < 32; turn++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail(`Microtask limit reached waiting for ${description}`);
}

async function completed(work, description) {
  let settled = false;
  let rejection;
  const observed = work.then(
    () => { settled = true; },
    error => { settled = true; rejection = { error }; },
  );
  await until(() => settled, description);
  await observed;
  if (rejection) throw rejection.error;
}

function snapshot({ refreshAccessState, ...state }) {
  return state;
}

const invalidBootstrap = { data: null, error: { code: '401', message: 'Invalid session' } };
const newerBootstrap = {
  data: {
    has_session: true,
    access_level: 'FULL',
    reason_code: 'AUTHORIZED',
    next_step: null,
    user_id: 'new-user',
    session_id: 'new-session',
    account_status: 'active',
    profile_completion_status: 'complete',
    mfa_required: true,
    has_verified_totp: true,
    current_aal: 'aal2',
    is_admin: true,
    permissions: { meetings: true },
  },
  error: null,
};

const invalidState = {
  loading: false,
  hasSession: false,
  isFullyAuthorized: false,
  isAuthenticated: false,
  accessLevel: 'BLOCKED',
  reasonCode: 'SESSION_INVALID',
  nextStep: 'login',
  currentUserId: null,
  sessionId: null,
  accountStatus: null,
  profileCompletionStatus: null,
  mfaRequired: false,
  hasVerifiedTotp: false,
  currentAal: null,
  isAdmin: false,
  userPermissions: undefined,
};

const newerState = {
  loading: false,
  hasSession: true,
  isFullyAuthorized: true,
  isAuthenticated: true,
  accessLevel: 'FULL',
  reasonCode: 'AUTHORIZED',
  nextStep: null,
  currentUserId: 'new-user',
  sessionId: 'new-session',
  accountStatus: 'active',
  profileCompletionStatus: 'complete',
  mfaRequired: true,
  hasVerifiedTotp: true,
  currentAal: 'aal2',
  isAdmin: true,
  userPermissions: { meetings: true },
};

test('a stale invalid bootstrap preserves the newer account after local sign-out resolves', { timeout: 3000 }, async () => {
  const currentLogout = deferred();
  const staleLogout = deferred();
  const logoutGates = [currentLogout, staleLogout];
  const bootstrapResults = [invalidBootstrap, invalidBootstrap, newerBootstrap];
  const logoutOptions = [];
  const removedKeys = [];
  const rpcCalls = [];
  const recordedSessions = [];
  const authKey = 'meeting-manager-auth';
  const storage = new Map([[authKey, 'synthetic-old-session']]);
  let session = { user: { id: 'old-user' } };
  let sessionReads = 0;
  let subscriptions = 0;
  const supabase = {
    auth: {
      async getSession() {
        sessionReads++;
        return { data: { session } };
      },
      onAuthStateChange() {
        subscriptions++;
        return { data: { subscription: { unsubscribe() { subscriptions--; } } } };
      },
      signOut(options) {
        const gate = logoutGates[logoutOptions.length];
        logoutOptions.push(options && { ...options });
        assert.ok(gate, 'Unexpected sign-out');
        return gate.promise;
      },
    },
    async rpc(name) {
      const result = bootstrapResults[rpcCalls.length];
      rpcCalls.push(name);
      assert.equal(name, 'get_my_app_bootstrap_v1');
      assert.ok(result, 'Unexpected bootstrap call');
      return result;
    },
  };
  const hook = mountHook(supabase, {
    removeItem(key) {
      removedKeys.push(key);
      storage.delete(key);
    },
  }, recordedSessions);

  try {
    const initial = hook.render();
    assert.equal(initial.loading, true);
    await until(() => logoutOptions.length === 1, 'initial local sign-out');
    assert.deepEqual(logoutOptions, [{ scope: 'local' }]);
    assert.deepEqual(removedKeys, [authKey]);
    assert.equal(storage.has(authKey), false);
    currentLogout.resolve({ error: null });
    await until(() => !hook.render().loading, 'current invalid session to fail closed');
    assert.deepEqual(snapshot(hook.render()), invalidState);

    storage.set(authKey, 'synthetic-old-session');
    const staleRefresh = hook.render().refreshAccessState();
    await until(() => logoutOptions.length === 2, 'stale refresh to reach local sign-out');
    assert.deepEqual(logoutOptions, [{ scope: 'local' }, { scope: 'local' }]);
    assert.deepEqual(removedKeys, [authKey, authKey]);
    assert.equal(storage.has(authKey), false);
    assert.deepEqual(snapshot(hook.render()), invalidState);

    session = { user: { id: 'new-user' } };
    storage.set(authKey, 'synthetic-new-session');
    await completed(hook.render().refreshAccessState(), 'new account refresh');
    assert.deepEqual(snapshot(hook.render()), newerState);
    assert.deepEqual(recordedSessions, ['new-session']);

    staleLogout.resolve({ error: null });
    await completed(staleRefresh, 'stale refresh after local sign-out');
    assert.equal(sessionReads, 3);
    assert.deepEqual(rpcCalls, Array(3).fill('get_my_app_bootstrap_v1'));
    assert.equal(subscriptions, 1);
    assert.deepEqual(logoutOptions, [{ scope: 'local' }, { scope: 'local' }]);
    assert.deepEqual(removedKeys, [authKey, authKey]);
    assert.equal(storage.get(authKey), 'synthetic-new-session');
    assert.deepEqual(snapshot(hook.render()), newerState,
      'the stale bootstrap must preserve the newer account after local sign-out resolves');
  } finally {
    currentLogout.resolve({ error: null });
    staleLogout.resolve({ error: null });
    hook.cleanup();
  }
});
