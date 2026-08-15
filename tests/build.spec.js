import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Build-level checks. The site is served from a domain root on Cloudflare
 * (https://vango.ee/) but from a subpath on GitHub Pages
 * (https://koorikla.github.io/vango/). Content lifted from the old WordPress
 * site contains root-absolute links, which silently 404 under a subpath —
 * so build both ways and assert every internal reference is correct.
 */

function build(baseURL) {
  const out = mkdtempSync(join(tmpdir(), 'vango-build-'));
  execFileSync('hugo', ['--gc', '--minify', '--baseURL', baseURL, '--destination', out], {
    stdio: 'pipe',
  });
  return out;
}

/** Every internal href/src in a (minified) page, quoted or not. */
function internalRefs(html) {
  return [...html.matchAll(/(?:href|src)=(?:"([^"]+)"|([^\s">]+))/g)]
    .map((m) => m[1] ?? m[2])
    .filter((u) => u.startsWith('/'));
}

test.describe('production build', () => {
  test('subpath build prefixes every internal link with the base path', () => {
    const dir = build('https://koorikla.github.io/vango/');
    try {
      for (const page of ['index.html', 'en/index.html']) {
        const html = readFileSync(join(dir, page), 'utf8');
        const bad = internalRefs(html).filter((u) => !u.startsWith('/vango/'));
        expect(bad, `${page} has links that ignore the base path:\n${bad.join('\n')}`).toEqual([]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('root build keeps links at the domain root', () => {
    const dir = build('https://vango.ee/');
    try {
      const html = readFileSync(join(dir, 'index.html'), 'utf8');
      const refs = internalRefs(html);
      expect(refs.some((u) => u.startsWith('/docs/'))).toBe(true);
      expect(refs.filter((u) => u.startsWith('/vango/'))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('builds with no Hugo warnings', () => {
    const out = mkdtempSync(join(tmpdir(), 'vango-warn-'));
    try {
      const res = execFileSync('hugo', ['--gc', '--minify', '--destination', out], {
        stdio: 'pipe',
        encoding: 'utf8',
      });
      expect(res, `Hugo emitted warnings:\n${res}`).not.toMatch(/^WARN/m);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
