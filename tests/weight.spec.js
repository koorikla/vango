import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * What the site actually costs a visitor.
 *
 * Two things had gone wrong and neither was visible from the page: the
 * lightbox linked the untouched WordPress uploads, so tapping a room
 * photograph downloaded up to 1.4 MB, and the watercolour backdrop shipped
 * at its full 445 kB to phones — where the reading sheet then covers it at
 * 96% opacity.
 */

/** Bytes actually transferred for a page, by the browser's own accounting. */
async function transferred(page, path) {
  await page.goto(path, { waitUntil: 'networkidle' });
  return page.evaluate(() =>
    performance.getEntriesByType('resource')
      .reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), 0)
  );
}

test.describe('page weight', () => {
  test('the home page stays within budget', async ({ page, isMobile }) => {
    const bytes = await transferred(page, '/');
    // Measured after everything lazy has loaded: ~1.76 MB on a 1440px
    // desktop, most of it room photographs. The budget is set to catch a
    // regression of the order of the two faults above, not to police kilobytes.
    const budget = isMobile ? 1_400_000 : 2_100_000;
    expect(bytes, `home page transferred ${Math.round(bytes / 1000)} kB`).toBeLessThan(budget);
  });

  test('a phone gets the small backdrop, not the full one', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'small-viewport only');
    await page.goto('/', { waitUntil: 'networkidle' });
    const bg = await page.evaluate(() =>
      performance.getEntriesByType('resource')
        .filter((r) => r.name.includes('color-bg'))
        .map((r) => ({ name: r.name.split('/').pop(), kb: Math.round((r.transferSize || r.encodedBodySize) / 1000) }))
    );
    expect(bg.length, 'the backdrop loads once').toBe(1);
    expect(bg[0].kb, `phone loaded ${bg[0].name} at ${bg[0].kb} kB`).toBeLessThan(250);
  });
});

test.describe('images are processed, never served raw', () => {
  test('no untouched upload is published', () => {
    // Hugo only copies an asset into public/ when a template asks for its
    // .Permalink. Every one of these should be a resized derivative, which
    // Hugo marks with a _hu_ hash in the filename.
    const out = mkdtempSync(join(tmpdir(), 'vango-weight-'));
    try {
      execFileSync('hugo', ['--gc', '--minify', '--destination', out], { stdio: 'pipe' });
      const dir = join(out, 'img', 'uploads');
      if (!existsSync(dir)) return;
      // The room ornaments are 2-5 kB PNGs painted at their natural size, so
      // serving them raw is right. What must never ship raw is a photograph:
      // those are WordPress uploads up to 2560px and 1.4 MB.
      const raw = readdirSync(dir)
        .filter((f) => /\.(jpe?g|png)$/i.test(f) && !f.includes('_hu_'))
        .map((f) => ({ f, kb: Math.round(statSync(join(dir, f)).size / 1000) }))
        .filter((r) => r.kb > 200)
        .map((r) => `${r.f} (${r.kb} kB)`);
      expect(raw, `heavy uploads published untouched:\n${raw.join('\n')}`).toEqual([]);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('the lightbox opens a sized copy', async ({ page }) => {
    await page.goto('/');
    const hrefs = await page.locator('a[data-lightbox]').evaluateAll(
      (els) => els.map((e) => e.getAttribute('href'))
    );
    expect(hrefs.length).toBeGreaterThan(0);
    const raw = hrefs.filter((h) => !h.includes('_hu_'));
    expect(raw, `lightbox links to originals:\n${raw.join('\n')}`).toEqual([]);

    // and the heaviest of them is a sane size to open on mobile data
    const sizes = await page.evaluate(async (urls) => {
      const out = [];
      for (const u of urls.slice(0, 6)) {
        const r = await fetch(u, { method: 'HEAD' });
        out.push({ u: u.split('/').pop(), kb: Math.round(Number(r.headers.get('content-length') || 0) / 1000) });
      }
      return out;
    }, hrefs);
    const worst = sizes.sort((a, b) => b.kb - a.kb)[0];
    expect(worst.kb, `heaviest lightbox image: ${worst.u} at ${worst.kb} kB`).toBeLessThan(800);
  });
});
