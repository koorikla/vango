import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * The things a browser is told about the site before it renders anything:
 * its icons, its manifest, the fonts it should start fetching, the pages it
 * may prepare in advance, and the policy it should hold the page to.
 *
 * Two of these are invisible from inside a page, which is why they are
 * asserted here rather than looked at:
 *
 *   - The icons are composited onto paper at build time. The mark is black
 *     line art, and every earlier version of it was transparent: fine on a
 *     light tab strip, gone on a dark one, and composited onto black by iOS.
 *     Nothing about the site looks wrong when that regresses.
 *
 *   - static/_headers is read by Cloudflare and by nothing else, so no local
 *     run and no GitHub Pages deploy will ever tell you the policy in it has
 *     started blocking the site's own stylesheet. The CSP is parsed out of
 *     that file and applied to the responses here so that it does.
 */

/** The `/*` block of static/_headers, as a map of header name to value. */
const siteHeaders = (() => {
  // Playwright runs with the project root as its working directory.
  const src = readFileSync('static/_headers', 'utf8');
  const out = {};
  let inBlock = false;
  for (const line of src.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { inBlock = line.trim() === '/*'; continue; }
    if (!inBlock) continue;
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
})();

/**
 * Serve every HTML response with the production Content-Security-Policy, and
 * record anything it blocks. Returns a getter for the violations so far.
 */
async function underProductionCSP(page) {
  const csp = siteHeaders['content-security-policy'];
  expect(csp, 'static/_headers declares a CSP for /*').toBeTruthy();

  await page.route('**/*', async (route) => {
    const res = await route.fetch();
    const headers = { ...res.headers() };
    if ((headers['content-type'] || '').includes('text/html')) {
      headers['content-security-policy'] = csp;
    }
    await route.fulfill({ response: res, headers });
  });

  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push(`${e.violatedDirective} blocked ${e.blockedURI || 'inline'} (${e.sourceFile}:${e.lineNumber})`);
    });
  });

  return () => page.evaluate(() => window.__cspViolations || []);
}

test.describe('icons', () => {
  test('the tab icon is opaque, so it survives a dark tab strip', async ({ page }) => {
    await page.goto('/');

    const href = await page.locator('link[rel="icon"]').first().getAttribute('href');
    expect(href, 'a favicon is declared').toBeTruthy();

    // Read the corner back out of a canvas: the circular mark never reaches
    // it, so whatever is there is the ground the mark was composited onto.
    const corner = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return { size: [img.width, img.height], px: [...ctx.getImageData(0, 0, 1, 1).data] };
    }, href);

    expect(corner.size).toEqual([32, 32]);
    expect(corner.px[3], `favicon corner is opaque, got alpha ${corner.px[3]}`).toBe(255);
    // Paper (#fdfaf6), give or take what Lanczos does to a flat colour.
    const [r, g, b] = corner.px;
    expect(Math.min(r, g, b), `favicon corner is paper, got rgb(${r},${g},${b})`).toBeGreaterThan(230);
  });

  test('iOS gets a 180px touch icon', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect(href).toBeTruthy();
    expect((await request.get(href)).ok()).toBeTruthy();
  });

  test('no icon large enough to hurt is offered for the tab strip', async ({ page }) => {
    await page.goto('/');
    // Some browsers fetch the largest declared rel=icon whatever size they
    // asked for. The 192 and 512 belong to the manifest, where they are only
    // fetched by someone actually installing the site.
    const sizes = await page.locator('link[rel="icon"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('sizes')));
    for (const s of sizes) {
      expect(Number(String(s).split('x')[0]), `rel=icon ${s} is small`).toBeLessThanOrEqual(48);
    }
  });
});

test.describe('web app manifest', () => {
  for (const [path, lang, start] of [['/', 'et-EE', '/'], ['/en/', 'en-GB', '/en/']]) {
    test(`${path} names a manifest describing this language`, async ({ page, request }) => {
      await page.goto(path);

      const href = await page.locator('link[rel="manifest"]').getAttribute('href');
      expect(href, 'a manifest is linked').toBeTruthy();

      const res = await request.get(href);
      expect(res.ok()).toBeTruthy();
      expect(res.headers()['content-type']).toContain('application/manifest+json');

      const m = await res.json();
      expect(m.lang).toBe(lang);
      expect(m.start_url).toBe(start);
      expect(m.name).toBeTruthy();
      expect(m.short_name.length, 'short_name fits under a home-screen icon').toBeLessThanOrEqual(12);
      expect(m.background_color).toBe('#fdfaf6');
      expect(m.theme_color).toBe('#fdfaf6');
      // Both languages are one app as far as navigation goes, so following
      // the language switch from a home-screen copy stays inside it.
      expect(m.scope).toBe('/');

      const purposes = m.icons.map((i) => i.purpose);
      expect(purposes, 'an icon Android may crop to its own shape').toContain('maskable');
      expect(m.icons.some((i) => i.sizes === '192x192')).toBeTruthy();
      expect(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBeTruthy();

      for (const icon of m.icons) {
        const r = await request.get(icon.src);
        expect(r.ok(), `manifest icon is fetchable: ${icon.src}`).toBeTruthy();
        expect(r.headers()['content-type']).toContain(icon.type);
      }
    });
  }
});

test.describe('fonts', () => {
  test('the two faces that draw the first screenful are preloaded', async ({ page }) => {
    await page.goto('/');
    const links = await page.locator('link[rel="preload"][as="font"]').evaluateAll((els) =>
      els.map((e) => ({ href: e.getAttribute('href'), cors: e.hasAttribute('crossorigin') })));

    expect(links.length, 'only what the first screenful needs is preloaded').toBeGreaterThan(0);
    expect(links.length).toBeLessThanOrEqual(2);
    expect(links.some((l) => /fraunces-latin\.woff2/.test(l.href)), 'the display face').toBeTruthy();

    for (const l of links) {
      // Without crossorigin a font preload is simply downloaded twice.
      expect(l.cors, `${l.href} preloads with crossorigin`).toBeTruthy();
    }
  });

  test('a preloaded font is the one the stylesheet then asks for', async ({ page }) => {
    const requested = [];
    page.on('request', (r) => { if (r.resourceType() === 'font') requested.push(new URL(r.url()).pathname); });

    await page.goto('/', { waitUntil: 'networkidle' });
    const preloaded = await page.locator('link[rel="preload"][as="font"]').evaluateAll((els) =>
      els.map((e) => new URL(e.href).pathname));

    for (const p of preloaded) {
      expect(requested.filter((r) => r === p).length, `${p} is fetched once, not twice`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('speculation rules', () => {
  test('pages are prerendered, images and downloads are not', async ({ page }) => {
    await page.goto('/');

    const raw = await page.locator('script[type="speculationrules"]').textContent();
    expect(raw, 'the document carries speculation rules').toBeTruthy();

    const rules = JSON.parse(raw);
    const [rule] = rules.prerender;
    expect(rule.eagerness).toBe('moderate');

    const clauses = rule.where.and;
    expect(clauses.some((c) => c.href_matches === '/*'), 'same-origin pages only').toBeTruthy();

    const excluded = clauses.find((c) => c.not)?.not.selector_matches;
    expect(excluded, 'something is excluded').toBeTruthy();
    // Lightbox anchors point at same-origin .webp files. Without this, hovering
    // a room photograph prerenders an image as though it were a page.
    expect(excluded).toContain('[data-lightbox]');
    expect(excluded).toContain('.pdf');

    // Every excluded selector matches something, or it is guarding nothing.
    for (const sel of excluded.split(',').map((s) => s.trim())) {
      const hits = await page.locator(sel).count();
      expect(hits, `${sel} matches links on the home page`).toBeGreaterThan(0);
    }
  });
});

test.describe('content security policy', () => {
  const PAGES = ['/', '/ruumid/', '/ruumid/kuukoda/', '/uudised/', '/galerii/', '/en/'];

  for (const path of PAGES) {
    test(`${path} renders under the production CSP`, async ({ page }) => {
      const violations = await underProductionCSP(page);
      await page.goto(path, { waitUntil: 'networkidle' });
      expect(await violations()).toEqual([]);
    });
  }

  test('the lightbox still opens under it', async ({ page }) => {
    const violations = await underProductionCSP(page);
    await page.goto('/ruumid/kuukoda/');
    await page.locator('[data-lightbox]').first().click();
    await expect(page.locator('.lightbox, [class*="lightbox"]').first()).toBeVisible();
    expect(await violations()).toEqual([]);
  });

  test('it forbids what the site does not use', async () => {
    const csp = siteHeaders['content-security-policy'];
    // The site loads nothing it does not serve itself. Anything that changes
    // that should have to change this line too.
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    // Inline scripts stay blocked; the keyword permits speculation rules and
    // nothing else.
    expect(csp).toMatch(/script-src 'self' 'inline-speculation-rules'/);
    expect(csp, 'no blanket unsafe-inline for scripts').not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp, 'no eval').not.toContain("'unsafe-eval'");
  });

  test('the other headers are set', async () => {
    expect(siteHeaders['x-content-type-options']).toBe('nosniff');
    expect(siteHeaders['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(siteHeaders['permissions-policy']).toContain('geolocation=()');
  });
});

test.describe('image formats', () => {
  // AVIF measured on this site's own photographs at 1600px: q55 lands about
  // 30% under the WebP q80 it replaces, with nothing visible at 1:1. What it
  // must never do is quietly stop being emitted, because the WebP fallback
  // means the page looks identical either way.
  for (const path of ['/', '/ruumid/', '/ruumid/kuukoda/', '/uudised/', '/galerii/aastaajad-imedemaal/']) {
    test(`${path} offers AVIF for its photographs`, async ({ page }) => {
      await page.goto(path);

      const sources = await page.locator('picture source[type="image/avif"]').count();
      expect(sources, 'AVIF sources are emitted').toBeGreaterThan(0);

      // Every <picture> that offers AVIF must still offer something else, or
      // a browser without AVIF gets nothing at all.
      const orphans = await page.locator('picture').evaluateAll((pics) =>
        pics.filter((p) => p.querySelector('source[type="image/avif"]') && !p.querySelector('img[src]')).length);
      expect(orphans, 'every AVIF source has a fallback <img>').toBe(0);
    });
  }

  test('a browser that takes AVIF is actually served it', async ({ page }) => {
    const served = [];
    page.on('response', (r) => {
      const ext = new URL(r.url()).pathname.split('.').pop();
      if (['avif', 'webp', 'jpg', 'jpeg', 'png'].includes(ext)) served.push(ext);
    });
    await page.goto('/ruumid/kuukoda/', { waitUntil: 'networkidle' });

    expect(served.filter((e) => e === 'avif').length, 'Chromium picks the AVIF sources').toBeGreaterThan(0);
    // The JPEG fallbacks exist for browsers that need them and should not be
    // downloaded by one that does not.
    expect(served.filter((e) => e === 'jpg' || e === 'jpeg').length, 'no fallback JPEG is fetched as well').toBe(0);
  });

  test('flat artwork is left as PNG', async ({ page }) => {
    await page.goto('/');
    // The room ornaments are flat line art. WebP already made three of the
    // four theme PNGs bigger; AVIF is the wrong tool for the same reason.
    const avifSrcs = await page.locator('picture source[type="image/avif"]').evaluateAll((els) =>
      els.flatMap((e) => (e.getAttribute('srcset') || '').split(',').map((s) => s.trim().split(' ')[0])));
    expect(avifSrcs.length).toBeGreaterThan(0);
    for (const src of avifSrcs) {
      expect(src, `${src} came from a photograph, not a PNG`).not.toMatch(/\.png\b/);
    }
  });
});

test.describe('deployment artefacts', () => {
  test('the headers file ships with the build', async ({ request }) => {
    const res = await request.get('/_headers');
    expect(res.ok(), '_headers is published for Cloudflare to read').toBeTruthy();
    expect(await res.text()).toContain('Content-Security-Policy');
  });
});
