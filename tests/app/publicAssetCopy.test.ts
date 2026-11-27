import assert from 'node:assert/strict';
import fs, { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import configFactory from '../../vite.config.ts';

function withFixture(fn: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'spark-public-assets-'));
  try { fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

function copyAssets(root: string) {
  assert.equal(typeof configFactory, 'function');
  if (typeof configFactory !== 'function') throw new Error('expected config factory');
  const config = configFactory({ command: 'build', mode: 'production' });
  if (config instanceof Promise) throw new Error('expected synchronous config');
  const plugin = (config.plugins ?? []).find(item => item && !Array.isArray(item) && 'name' in item && item.name === 'safe-copy-public-dir');
  assert.ok(plugin && !Array.isArray(plugin) && 'configResolved' in plugin && 'closeBundle' in plugin);
  assert.equal(typeof plugin.configResolved, 'function');
  assert.equal(typeof plugin.closeBundle, 'function');
  Reflect.apply(plugin.configResolved as Function, plugin, [{ root, command: 'build' }]);
  Reflect.apply(plugin.closeBundle as Function, plugin, []);
}

test('copies all source assets including nested files and compacts the logo', () => {
  withFixture(root => {
    mkdirSync(join(root, 'public', 'icons'), { recursive: true });
    writeFileSync(join(root, 'public', 'manifest.json'), '{}');
    writeFileSync(join(root, 'public', 'logo_spark.png'), 'original');
    writeFileSync(join(root, 'public', 'icons', 'icon-192x192.png'), 'compact');
    copyAssets(root);
    assert.equal(readFileSync(join(root, 'dist', 'manifest.json'), 'utf8'), '{}');
    assert.equal(readFileSync(join(root, 'dist', 'icons', 'icon-192x192.png'), 'utf8'), 'compact');
    assert.equal(readFileSync(join(root, 'dist', 'logo_spark.png'), 'utf8'), 'compact');
  });
});

test('fails rather than silently omitting an asset when the destination cannot be copied', () => {
  withFixture(root => {
    mkdirSync(join(root, 'public'), { recursive: true });
    writeFileSync(join(root, 'public', 'manifest.json'), '{}');
    mkdirSync(join(root, 'dist', 'manifest.json'), { recursive: true });
    assert.throws(() => copyAssets(root));
  });
});

test('fails when the required public source directory is missing', () => {
  withFixture(root => assert.throws(() => copyAssets(root)));
});

test('keeps the original logo when the optional compact source is absent', () => {
  withFixture(root => {
    mkdirSync(join(root, 'public'), { recursive: true });
    writeFileSync(join(root, 'public', 'logo_spark.png'), 'original');
    copyAssets(root);
    assert.equal(readFileSync(join(root, 'dist', 'logo_spark.png'), 'utf8'), 'original');
  });
});

test('fails the build if compact replacement throws instead of claiming a complete output', (t) => {
  withFixture(root => {
    mkdirSync(join(root, 'public', 'icons'), { recursive: true });
    writeFileSync(join(root, 'public', 'logo_spark.png'), 'original');
    const compact = join(root, 'public', 'icons', 'icon-192x192.png');
    const logo = join(root, 'dist', 'logo_spark.png');
    writeFileSync(compact, 'compact');
    const originalCopy = fs.copyFileSync;
    const mocked = t.mock.method(fs, 'copyFileSync', (src: Parameters<typeof fs.copyFileSync>[0], dst: Parameters<typeof fs.copyFileSync>[1], mode?: number) => {
      if (src === compact && dst === logo) throw new Error('injected logo copy failure');
      return originalCopy(src, dst, mode);
    });
    syncBuiltinESMExports();
    try {
      assert.throws(() => copyAssets(root), /injected logo copy failure/);
    } finally {
      mocked.mock.restore();
      syncBuiltinESMExports();
    }
  });
});

test('real Vite build exits nonzero when a required asset cannot be copied', () => {
  withFixture(root => {
    mkdirSync(join(root, 'public'), { recursive: true });
    writeFileSync(join(root, 'public', 'manifest.json'), '{}');
    writeFileSync(join(root, 'index.html'), '<!doctype html><html><body>test</body></html>');
    const script = `
      import { build } from 'vite';
      import configFactory from './vite.config.ts';
      const config = configFactory({ command: 'build', mode: 'production' });
      const plugin = config.plugins.find(p => p.name === 'safe-copy-public-dir');
      await build({ configFile: false, root: process.argv[1], logLevel: 'error',
        build: { copyPublicDir: false },
        plugins: [plugin, { name: 'force-copy-conflict', generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'manifest.json/conflict.txt', source: 'conflict' });
        }}] });
    `;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, root], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 30000,
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0, 'Vite unexpectedly reported success');
    assert.match(result.stderr, /manifest\.json/);
    assert.match(result.stderr, /EISDIR|EPERM|EACCES|ENOTDIR/);
  });
});
