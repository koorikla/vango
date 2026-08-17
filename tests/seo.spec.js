import { test, expect } from '@playwright/test';

/**
 * What the site tells search engines and chat apps about itself.
 *
 * The og:image used to be a WebP, which Facebook's crawler will not process:
 * a link shared into Messenger rendered with a title, a description and no
 * picture at all. That is invisible from inside the site — nothing looks
 * broken when you load the page — so it is asserted here.
 */

const PAGES = ['/', '/en/', '/uudised/', '/sundmused/'];

const meta = (page, sel, attr = 'content') => page.locator(sel).first().getAttribute(attr);

test.describe('social share cards', () => {
  for (const path of PAGES) {
    test(`${path} offers a share image a crawler can actually read`, async ({ page, request }) => {
      await page.goto(path);

      const src = await meta(page, 'meta[property="og:image"]');
      expect(src, 'og:image is declared').toBeTruthy();

      // Facebook, Messenger and LinkedIn accept JPEG/PNG/GIF. WebP is what
      // silently produced a picture-less card.
      expect(src, 'og:image must not be WebP').not.toMatch(/\.webp($|\?)/i);
      expect(await meta(page, 'meta[property="og:image:type"]')).toMatch(/^image\/(jpeg|png|gif)$/);

      const res = await request.get(src);
      expect(res.ok(), `og:image is fetchable: ${src}`).toBeTruthy();
      expect(res.headers()['content-type']).toMatch(/^image\/(jpeg|png|gif)/);

      // Large-card minimum is 600x315; 1200x630 is what the card is built for.
      const w = Number(await meta(page, 'meta[property="og:image:width"]'));
      const h = Number(await meta(page, 'meta[property="og:image:height"]'));
      expect(w).toBeGreaterThanOrEqual(600);
      expect(h).toBeGreaterThanOrEqual(315);
      expect(await meta(page, 'meta[property="og:image:alt"]')).toBeTruthy();
    });
  }

  test('the share image is not upscaled past its source', async ({ page, request }) => {
    await page.goto('/');
    const src = await meta(page, 'meta[property="og:image"]');
    const bytes = (await (await request.get(src)).body()).length;
    // A 1200x630 photograph that has been upscaled from something small
    // compresses to almost nothing. This is a crude but effective guard.
    expect(bytes, 'share image has real detail in it').toBeGreaterThan(40_000);
  });

  test('a page declares only the other language as an alternate locale', async ({ page }) => {
    for (const path of ['/', '/en/']) {
      await page.goto(path);
      const own = await meta(page, 'meta[property="og:locale"]');
      const alts = await page.locator('meta[property="og:locale:alternate"]')
        .evaluateAll((els) => els.map((e) => e.content));
      expect(alts, `${path} must not list its own locale`).not.toContain(own);
      expect(alts.length).toBe(1);
    }
  });
});

test.describe('search metadata', () => {
  test('titles and descriptions fit what a result actually shows', async ({ page }) => {
    for (const path of ['/', '/en/']) {
      await page.goto(path);
      const title = await page.title();
      const desc = await meta(page, 'meta[name="description"]');

      // Google truncates around 60 and 155; over that is wasted, and it was
      // 149 characters of repeated keywords before.
      expect(title.length, `${path} title length`).toBeLessThanOrEqual(70);
      expect(desc.length, `${path} description length`).toBeLessThanOrEqual(165);
      expect(desc.length, `${path} description is substantial`).toBeGreaterThan(70);

      // the old title said "Vango Imedemaa" three times over
      const name = title.match(/Vango \w+/i)?.[0];
      const repeats = title.split(name).length - 1;
      expect(repeats, `${path} repeats "${name}" in its title`).toBe(1);

      expect(desc, 'descriptions are prose, not hashtags').not.toMatch(/#\w/);
    }
  });

  test('x-default resolves to the same URL in both languages', async ({ page }) => {
    const seen = [];
    for (const path of ['/', '/en/']) {
      await page.goto(path);
      seen.push(await meta(page, 'link[rel="alternate"][hreflang="x-default"]', 'href'));
    }
    expect(seen[0]).toBe(seen[1]);
  });

  test('the phone number is given in a dialable international form', async ({ page }) => {
    await page.goto('/');
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    expect(ld.telephone, 'schema telephone is E.164-ish').toMatch(/^\+\d{7,15}$/);
    expect(ld.image, 'the place carries a picture').toBeTruthy();
  });

  test('every page states a theme colour', async ({ page }) => {
    await page.goto('/');
    expect(await meta(page, 'meta[name="theme-color"]')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
