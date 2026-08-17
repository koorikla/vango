import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';

/**
 * Guards against WordPress residue returning.
 *
 * The site was migrated off WordPress and the migration left a layer of
 * artefacts behind: paragraph soup inside markdown files, numeric HTML
 * entities where characters belong, empty tags standing in for spaces,
 * slugs naming rooms that no longer exist. Those are cleaned; these tests
 * fail if any of it comes back, because none of it is visible from the
 * rendered page — a `&#8217;` looks exactly like an apostrophe.
 */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const contentFiles = walk('content').filter((p) => extname(p) === '.md');
const dataFiles = walk('data').filter((p) => extname(p) === '.json');

test.describe('content is markdown, not WordPress output', () => {
  test('no markdown file contains raw HTML', () => {
    // Room bodies used to be <p> soup, which is the only reason
    // markup.goldmark.renderer.unsafe was ever switched on.
    const offenders = [];
    for (const f of contentFiles) {
      const body = readFileSync(f, 'utf8').split(/^---$/m).slice(2).join('---');
      const tags = body.match(/<\/?[a-zA-Z][a-zA-Z0-9]*(\s[^>]*)?>/g);
      if (tags) offenders.push(`${f}: ${[...new Set(tags)].join(' ')}`);
    }
    expect(offenders, `raw HTML in content:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('rendering of raw HTML stays disabled', () => {
    const cfg = readFileSync('hugo.toml', 'utf8');
    expect(cfg, 'goldmark unsafe must stay off').toMatch(/unsafe\s*=\s*false/);
  });

  test('no numeric HTML entities anywhere in content or data', () => {
    // WordPress stored ’ “ ” – as &#8217; &#8220; &#8221; &#8211;. They render
    // identically, so nothing looks wrong until something reads the text —
    // a search snippet, an RSS reader, a share card.
    const offenders = [];
    for (const f of [...contentFiles, ...dataFiles]) {
      const s = readFileSync(f, 'utf8');
      const hits = s.match(/&#\d+;|&nbsp;/g);
      if (hits) offenders.push(`${f}: ${[...new Set(hits)].join(' ')}`);
    }
    expect(offenders, `entities left by WordPress:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('no empty tags left behind by the old editor', () => {
    // <b></b> was standing where a space belonged, gluing two sentences
    // together once the tag was stripped.
    const offenders = [];
    for (const f of [...contentFiles, ...dataFiles]) {
      const hits = readFileSync(f, 'utf8').match(/<([a-z]+)[^>]*>\s*<\/\1>/g);
      if (hits) offenders.push(`${f}: ${[...new Set(hits)].join(' ')}`);
    }
    expect(offenders, `empty tags:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('a room file is named after its room', () => {
    // content/et/ruumid/tiigimaja.md held Kuukoda: the same mismatch the URLs
    // had, one layer down, and just as confusing to whoever edits next.
    const offenders = [];
    for (const lang of ['et', 'en']) {
      for (const f of readdirSync(`content/${lang}/ruumid`)) {
        if (f === '_index.md') continue;
        const fm = readFileSync(`content/${lang}/ruumid/${f}`, 'utf8').split('---')[1];
        const key = fm.match(/translationKey:\s*"([^"]+)"/)[1];
        if (f.replace('.md', '') !== key) offenders.push(`${lang}/${f} has translationKey "${key}"`);
      }
    }
    expect(offenders, `filename and translationKey disagree:\n${offenders.join('\n')}`).toEqual([]);
  });
});

test.describe('what the site publishes', () => {
  test('a 404 gives the reader a way back', async ({ page }) => {
    // A decade of WordPress URLs are still out in the world and only the ones
    // we knew about are redirected. Whatever we missed lands here.
    const res = await page.goto('/ruumid/this-page-does-not-exist/');
    expect(res.status()).toBe(404);

    const body = await page.locator('body').innerText();
    expect(body.length, 'the 404 says something').toBeGreaterThan(40);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('.not-found__ways a[href="/"]')).toHaveCount(1);
    await expect(page.locator('.cta__book')).toHaveAttribute('href', /freetobook\.com/);
  });

  test('only the sections that are streams publish a feed', () => {
    // Checked against the build: `hugo server` renders every output format a
    // section could have, so /ruumid/index.xml answers there whatever the
    // config says. Only what lands in public/ is deployed.
    const out = mkdtempSync(join(tmpdir(), 'vango-feeds-'));
    try {
      execFileSync('hugo', ['--gc', '--minify', '--destination', out], { stdio: 'pipe' });
      for (const path of ['uudised', 'sundmused', 'galerii']) {
        expect(existsSync(join(out, path, 'index.xml')), `${path} feed`).toBe(true);
      }
      // Rooms change once a decade. A feed of them is noise, and every room
      // page was advertising one in <head>.
      for (const dir of [join(out, 'ruumid'), join(out, 'en', 'ruumid')]) {
        expect(existsSync(join(dir, 'index.xml')), `${dir} must not publish a feed`).toBe(false);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('a room page does not advertise a feed', async ({ page }) => {
    await page.goto('/ruumid/kuukoda/');
    await expect(page.locator('link[type="application/rss+xml"]')).toHaveCount(0);
  });
});
