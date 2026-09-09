import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

/* A truncated service worker fails silently in the browser with
   "SyntaxError: Unexpected end of script" and kills push for everyone,
   so every shipped script in public/ has to parse. */
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

test('every script in public/ parses', () => {
  const scripts = readdirSync(publicDir).filter((f) => f.endsWith('.js'));
  assert.ok(scripts.length > 0, 'expected at least one script in public/');
  for (const file of scripts) {
    const source = readFileSync(path.join(publicDir, file), 'utf8');
    assert.doesNotThrow(() => new vm.Script(source, { filename: file }), `${file} does not parse`);
  }
});

test('the service worker still handles push and notification clicks', () => {
  const sw = readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /addEventListener\('notificationclick'/);
  assert.match(sw, /showNotification/);
});
