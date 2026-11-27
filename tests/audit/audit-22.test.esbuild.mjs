import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import test from 'node:test';
import { createContext, Script } from 'node:vm';

const timeout = 1_000;
const rendererUrl = new URL('../../src/app/navigation/PageRenderer.tsx', import.meta.url);

function compileRenderer() {
  const source = readFileSync(rendererUrl, 'utf8').replaceAll('import.meta', 'viteImportMeta');
  const { code } = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic', target: 'es2022' });
  return new Script(code, { filename: 'PageRenderer.tsx' });
}

const invokeRegistration = new Script(`
  const page = module.exports.renderContent(props);
  checkCalendar(page);
  page.props.onRegisterMinutes(meetingId, existingMinuteId);
`);

function exerciseRegistration(renderer, existingMinuteId) {
  const meetingId = 'meeting-from-calendar';
  const initialUrl = 'https://spark.example.test/calendar?view=week&meeting=prior-meeting&minute=prior-minute#agenda';
  const initialState = { calendar: { view: 'week', scrollTop: 240 } };
  const entries = [
    { href: 'https://spark.example.test/profile', state: null },
    { href: initialUrl, state: structuredClone(initialState) },
  ];
  const current = () => entries.at(-1);
  const history = {
    get state() { return current().state; },
    get length() { return entries.length; },
    replaceState(state, _title, url = current().href) {
      entries[entries.length - 1] = {
        href: new URL(url, current().href).href,
        state: structuredClone(state),
      };
    },
    pushState(state, _title, url = current().href) {
      entries.push({ href: new URL(url, current().href).href, state: structuredClone(state) });
    },
  };
  const attempts = [];
  const errors = [];
  const feedbackLocations = [];
  const lazyComponents = [];
  const exportObject = {};
  const jsx = (type, props) => ({ type, props });
  const modules = new Map([
    ['react', { lazy: (load) => {
      const component = { load };
      lazyComponents.push(component);
      return component;
    } }],
    ['react/jsx-runtime', { jsx, jsxs: jsx }],
    ['../../components/Chat/ChatWorkspace', { ChatWorkspace: Symbol('ChatWorkspace') }],
    ['../../features/permissions', {
      PAGE_PERMISSION_KEY: {},
      checkPermission: (_permission, isAdmin) => isAdmin,
      AccessDenied: Symbol('AccessDenied'),
    }],
    ['react-hot-toast', { __esModule: true, default: { error(message) {
      errors.push(message);
      feedbackLocations.push(current().href);
    } } }],
  ]);
  const context = createContext({
    exports: exportObject,
    module: { exports: exportObject },
    require(specifier) {
      assert.ok(modules.has(specifier), `Unexpected renderer import: ${specifier}`);
      return modules.get(specifier);
    },
    URL,
    window: {
      get location() { return new URL(current().href); },
      history,
    },
    viteImportMeta: { env: { DEV: false } },
    meetingId,
    existingMinuteId,
    props: {
      activePage: 'calendar',
      isAdmin: true,
      userPermissions: null,
      chatMentionParticipants: [],
      navigate(page) {
        attempts.push({ page, href: current().href });
        throw new Error('Synthetic navigation failure');
      },
    },
    checkCalendar(page) {
      assert.ok(lazyComponents.includes(page?.type), 'Expected a rendered lazy page');
      assert.equal(typeof page.props.onRegisterMinutes, 'function', 'Expected the rendered calendar registration callback');
    },
  });

  renderer.runInContext(context, { timeout });
  invokeRegistration.runInContext(context, { timeout });

  const expectedTarget = new URL(initialUrl);
  if (existingMinuteId) {
    expectedTarget.searchParams.set('minute', existingMinuteId);
    expectedTarget.searchParams.delete('meeting');
  } else {
    expectedTarget.searchParams.set('meeting', meetingId);
    expectedTarget.searchParams.delete('minute');
  }
  const recoveryInstruction = /دوباره\s+(?:تلاش|امتحان)\s+کن|مجدداً\s+تلاش\s+کن|از\s+(?:بخش\s+)?صورت[\s\u200c]*جلسات\s+.{0,60}(?:باز\s+کن|اقدام\s+کن|وارد\s+شو)|\b(?:try again|retry|open (?:it from )?(?:the )?minutes(?: page)?)\b/iu;
  return {
    actual: {
      attempts,
      entries,
      errorCount: errors.length,
      actionableFeedback: errors.length === 1 && typeof errors[0] === 'string' && recoveryInstruction.test(errors[0]),
      feedbackLocations,
    },
    expected: {
      attempts: [{ page: existingMinuteId ? 'minutes-detail' : 'minutes-new', href: expectedTarget.href }],
      entries: [
        { href: 'https://spark.example.test/profile', state: null },
        { href: initialUrl, state: initialState },
      ],
      errorCount: 1,
      actionableFeedback: true,
      feedbackLocations: [initialUrl],
    },
  };
}

test('registering minutes restores calendar history and reports how to recover when navigation throws (#22)', { timeout: 5_000 }, () => {
  const renderer = compileRenderer();
  const create = exerciseRegistration(renderer, undefined);
  const open = exerciseRegistration(renderer, 'existing-minute');
  assert.deepEqual(
    { create: create.actual, open: open.actual },
    { create: create.expected, open: open.expected },
  );
});
