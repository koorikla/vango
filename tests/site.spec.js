import { test, expect } from '@playwright/test';

/**
 * Content contract — the facts that were true on the old WordPress site and
 * must stay true after the migration. If a room is dropped or a phone number
 * changes, these fail.
 */
const LANGS = {
  et: {
    path: '/',
    heading: 'Vango Imedemaa',
    nav: ['Ruumid', 'Toitlustus', 'Tegevused', 'Partnerid', 'Kontakt', 'Broneeri'],
    firstRoom: 'Imedemaa',
    lastRoom: 'Kodumaja',
    contactHeads: ['Aadress', 'Kontaktid', 'Koordinaadid'],
    other: { label: 'English', path: '/en/' },
  },
  en: {
    path: '/en/',
    heading: 'Vango Wonderland',
    nav: ['Rooms', 'Meals', 'Activities', 'Partners', 'Contact', 'Book'],
    firstRoom: 'Wonderland',
    lastRoom: 'Homehouse',
    contactHeads: ['Address', 'Contacts', 'Coordinates'],
    other: { label: 'Eesti', path: '/' },
  },
};

const ROOM_COUNT = 12;
const PARTNER_COUNT = 10;
const SECTIONS = ['ruumid', 'toitlustus', 'tegevused', 'partnerid', 'kontakt'];

/** Fail the test on any console error or failed network request. */
function watchForErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
  });
  return errors;
}

for (const [lang, cfg] of Object.entries(LANGS)) {
  test.describe(`[${lang}]`, () => {

    test('loads without console or network errors', async ({ page }) => {
      const errors = watchForErrors(page);
      await page.goto(cfg.path, { waitUntil: 'networkidle' });
      expect(errors, `unexpected errors:\n${errors.join('\n')}`).toEqual([]);
    });

    test('has correct document metadata', async ({ page }) => {
      await page.goto(cfg.path);
      await expect(page).toHaveTitle(/Vango/);
      await expect(page.locator('html')).toHaveAttribute('lang', lang === 'et' ? 'et-EE' : 'en-GB');
      const desc = page.locator('meta[name="description"]');
      await expect(desc).toHaveAttribute('content', /.{40,}/);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
      // both languages cross-declared
      await expect(page.locator('link[rel="alternate"][hreflang="et-EE"]')).toHaveCount(1);
      await expect(page.locator('link[rel="alternate"][hreflang="en-GB"]')).toHaveCount(1);
      // structured data parses
      const ld = await page.locator('script[type="application/ld+json"]').textContent();
      expect(() => JSON.parse(ld)).not.toThrow();
      expect(JSON.parse(ld)['@type']).toBe('Campground');
    });

    test('renders exactly one h1 and all five sections', async ({ page }) => {
      await page.goto(cfg.path);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(cfg.heading);
      for (const id of SECTIONS) {
        await expect(page.locator(`#${id}`), `section #${id}`).toHaveCount(1);
      }
    });

    test(`renders all ${ROOM_COUNT} rooms with hero images and text`, async ({ page }) => {
      await page.goto(cfg.path);
      const rooms = page.locator('.room');
      await expect(rooms).toHaveCount(ROOM_COUNT);

      await expect(rooms.first().locator('.room__title')).toHaveText(cfg.firstRoom);
      await expect(rooms.last().locator('.room__title')).toHaveText(cfg.lastRoom);

      // every room has a hero image and a non-empty body
      for (let i = 0; i < ROOM_COUNT; i++) {
        const room = rooms.nth(i);
        await expect(room.locator('.room__hero-img')).toHaveCount(1);
        const body = await room.locator('.room__body').innerText();
        expect(body.trim().length, `room ${i} body`).toBeGreaterThan(20);
      }
    });

    test(`renders ${PARTNER_COUNT} partners, each named and linked`, async ({ page }) => {
      await page.goto(cfg.path);
      const partners = page.locator('.partner');
      await expect(partners).toHaveCount(PARTNER_COUNT);

      await partners.last().scrollIntoViewIfNeeded();
      await page.waitForLoadState('networkidle');

      const count = await partners.count();
      for (let i = 0; i < count; i++) {
        const name = await partners.nth(i).locator('.partner__name').innerText();
        expect(name.trim(), `partner ${i} has a name`).not.toBe('');
        // logo must actually be a decodable image, not a broken TIFF
        const img = partners.nth(i).locator('.partner__logo img');
        if (await img.count()) {
          const ok = await img.evaluate((el) => el.complete && el.naturalWidth > 0);
          expect(ok, `partner "${name}" logo renders`).toBe(true);
        }
      }
    });

    test('contact block keeps the address, e-mail, phone and coordinates', async ({ page }) => {
      await page.goto(cfg.path);
      const contact = page.locator('#kontakt');
      for (const h of cfg.contactHeads) {
        await expect(contact.getByRole('heading', { name: h })).toBeVisible();
      }
      const text = await contact.innerText();
      expect(text).toContain('info@vango.ee');
      expect(text).toContain('516 3259');
      expect(text).toContain('Laiksaare');
      expect(text).toMatch(/58°07/);
      expect(text).toMatch(/24°45/);
    });

    test('every image on the page actually loads', async ({ page }) => {
      await page.goto(cfg.path, { waitUntil: 'networkidle' });
      // force lazy images into view
      await page.evaluate(async () => {
        for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
        await new Promise((r) => setTimeout(r, 1500));
      });
      const broken = await page.evaluate(() =>
        [...document.images]
          // the lightbox <img> is an empty placeholder until it is opened
          .filter((i) => i.getAttribute('src'))
          .filter((i) => !i.complete || i.naturalWidth === 0)
          .map((i) => i.currentSrc || i.src)
      );
      expect(broken, `broken images:\n${broken.join('\n')}`).toEqual([]);
    });

    test('all images have alt attributes', async ({ page }) => {
      await page.goto(cfg.path);
      const missing = await page.evaluate(() =>
        [...document.images].filter((i) => !i.hasAttribute('alt')).map((i) => i.src)
      );
      expect(missing).toEqual([]);
    });

    test('switches language and back', async ({ page }) => {
      await page.goto(cfg.path);
      await page.locator('.langs').getByRole('link', { name: cfg.other.label }).click();
      await expect(page).toHaveURL(new RegExp(`${cfg.other.path.replace(/\//g, '\\/')}$`));
      await expect(page.locator('h1')).toHaveText(LANGS[lang === 'et' ? 'en' : 'et'].heading);
    });
  });
}

test.describe('navigation', () => {
  test('every nav item scrolls to its section', async ({ page }) => {
    await page.goto('/');
    const isMobile = await page.locator('.site-nav__toggle').isVisible();
    if (isMobile) await page.locator('.site-nav__toggle').click();

    for (const id of SECTIONS) {
      await page.locator(`.site-nav__list a[href="#${id}"]`).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      // smooth scrolling is animated — poll until it settles
      await expect
        .poll(
          () => page.locator(`#${id}`).evaluate((el) => {
            const r = el.getBoundingClientRect();
            return r.top < window.innerHeight && r.bottom > 0;
          }),
          { message: `#${id} scrolled into view`, timeout: 5000 }
        )
        .toBe(true);
      if (isMobile) await page.locator('.site-nav__toggle').click();
    }
  });

  test('booking link points at the reservation system', async ({ page }) => {
    await page.goto('/');
    const book = page.locator('.site-nav__book');
    await expect(book).toHaveAttribute('href', /freetobook\.com/);
    await expect(book).toHaveAttribute('target', '_blank');
    await expect(book).toHaveAttribute('rel', /noopener/);
  });

  test('back-to-top button appears after scrolling and returns to the top', async ({ page }) => {
    await page.goto('/');
    const btn = page.locator('.to-top');
    await expect(btn).toBeHidden();
    await page.evaluate(() => window.scrollTo(0, 3000));
    await expect(btn).toBeVisible();
    await btn.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(50);
  });
});

test.describe('lightbox', () => {
  test('opens from a room hero, pages through, and closes', async ({ page }) => {
    await page.goto('/');
    const dialog = page.locator('#lightbox');
    await expect(dialog).toBeHidden();

    // first room that has thumbnails => a multi-image group
    const room = page.locator('.room').filter({ has: page.locator('.thumb') }).first();
    await room.locator('.room__hero a').click();

    await expect(dialog).toBeVisible();
    const img = dialog.locator('.lightbox__img');
    await expect(img).toHaveAttribute('src', /.+/);

    const firstSrc = await img.getAttribute('src');
    const caption = await dialog.locator('.lightbox__caption').innerText();
    expect(caption).toMatch(/1\/\d+/);

    await dialog.locator('.lightbox__btn--next').click();
    await expect(img).not.toHaveAttribute('src', firstSrc);
    await expect(dialog.locator('.lightbox__caption')).toContainText('2/');

    await dialog.locator('.lightbox__btn--prev').click();
    await expect(img).toHaveAttribute('src', firstSrc);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('arrow keys page through images', async ({ page }) => {
    await page.goto('/');
    const dialog = page.locator('#lightbox');
    const room = page.locator('.room').filter({ has: page.locator('.thumb') }).first();
    await room.locator('.room__hero a').click();
    await expect(dialog).toBeVisible();

    const first = await dialog.locator('.lightbox__img').getAttribute('src');
    await page.keyboard.press('ArrowRight');
    await expect(dialog.locator('.lightbox__img')).not.toHaveAttribute('src', first);
    await page.keyboard.press('ArrowLeft');
    await expect(dialog.locator('.lightbox__img')).toHaveAttribute('src', first);
  });

  test('the "photos" button opens the room gallery', async ({ page }) => {
    await page.goto('/');
    const dialog = page.locator('#lightbox');
    await page.locator('.thumbs__more').first().click();
    await expect(dialog).toBeVisible();
    await dialog.locator('.lightbox__btn--close').click();
    await expect(dialog).toBeHidden();
  });

  test('returns focus to the element that opened it', async ({ page }) => {
    await page.goto('/');
    const opener = page.locator('.room').filter({ has: page.locator('.thumb') }).first()
      .locator('.room__hero a');
    await opener.click();
    await expect(page.locator('#lightbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
  });
});

test.describe('responsive + a11y', () => {
  test('no horizontal overflow', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, 'page scrolls horizontally').toBeLessThanOrEqual(1);
  });

  test('skip link is the first tab stop and reaches main', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.locator('.skip-link');
    await expect(skip).toBeFocused();
    await expect(skip).toHaveAttribute('href', '#main');
    await expect(page.locator('#main')).toHaveCount(1);
  });

  test('heading order is sane (no skipped levels)', async ({ page }) => {
    await page.goto('/');
    const levels = await page.evaluate(() =>
      [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => +h.tagName[1])
    );
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1], `jump at heading ${i}`).toBeLessThanOrEqual(1);
    }
  });

  test('mobile menu toggles', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only');
    await page.goto('/');
    const toggle = page.locator('.site-nav__toggle');
    const list = page.locator('.site-nav__list');
    await expect(toggle).toBeVisible();
    await expect(list).toBeHidden();
    await toggle.click();
    await expect(list).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(list).toBeHidden();
  });

  test('desktop shows the full nav without a toggle', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only');
    await page.goto('/');
    await expect(page.locator('.site-nav__toggle')).toBeHidden();
    await expect(page.locator('.site-nav__list')).toBeVisible();
    // 5 in-page anchors + booking, plus one per section that has content
    await expect(page.locator('.site-nav__list li')).not.toHaveCount(0);
    await expect(page.locator('.site-nav__book')).toBeVisible();
    for (const id of ['ruumid', 'toitlustus', 'tegevused', 'partnerid', 'kontakt']) {
      await expect(page.locator(`.site-nav__list a[href="#${id}"]`)).toHaveCount(1);
    }
  });

  /**
   * Colour contrast, measured against what the browser actually paints.
   * The accent started at #f45a4c, which put body links at 3.15:1, white
   * text on the booking button at 3.27:1 and the back-to-top arrow at
   * 2.03:1 — all below WCAG AA. Anything that carries text has to earn its
   * colour, so the numbers are asserted rather than eyeballed.
   */
  test('text and controls meet WCAG AA contrast', async ({ page }) => {
    await page.goto('/uudised/');

    const results = await page.evaluate(() => {
      const lin = (c) => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const lum = (css) => {
        const [r, g, b] = css.match(/[\d.]+/g).map(Number);
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      };
      const ratio = (a, b) => {
        const [x, y] = [lum(a), lum(b)];
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      // The sheet the content is printed on. Every transparent background
      // ultimately resolves to this, so it is the honest backdrop to test
      // text against.
      const PAPER = 'rgb(253, 250, 246)';

      const check = (selector, need, label) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const s = getComputedStyle(el);
        const bg = s.backgroundColor;
        const opaque = bg && !/rgba?\([^)]*,\s*0\)/.test(bg) && bg !== 'transparent';
        return {
          label: label || selector,
          ratio: +ratio(s.color, opaque ? bg : PAPER).toFixed(2),
          need,
        };
      };

      return [
        check('.site-nav__book', 4.5, 'booking button'),
        check('.site-nav__list [aria-current="page"]', 4.5, 'current nav item'),
        check('.card__excerpt', 4.5, 'card excerpt'),
        check('.card__date', 4.5, 'card date'),
        check('.page__lead', 4.5, 'page lead'),
        check('.post__back a', 4.5, 'back link'),
        // an icon only has to reach the 3:1 that graphics need
        check('.to-top', 3, 'back-to-top arrow'),
      ].filter(Boolean);
    });

    expect(results.length, 'found elements to measure').toBeGreaterThan(4);
    const failures = results.filter((r) => r.ratio < r.need);
    expect(
      failures,
      `below WCAG AA:\n${failures.map((f) => `  ${f.label}: ${f.ratio}:1 (needs ${f.need}:1)`).join('\n')}`
    ).toEqual([]);
  });
});

test.describe('deployment artefacts', () => {
  test('sitemap lists both languages', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.ok()).toBeTruthy();
    const xml = await res.text();
    expect(xml).toContain('/en/');
  });

  test('robots.txt is served', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.ok()).toBeTruthy();
  });

  test('booking-conditions PDF is self-hosted', async ({ request }) => {
    const res = await request.get('/docs/broneerimistingimused.pdf');
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toContain('pdf');
  });

  test('redirects file ships with the build', async ({ request }) => {
    const res = await request.get('/_redirects');
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    // This used to look for a room rule. Rooms have pages of their own now,
    // so those rules are gone by design — a rule for /ruumid/<slug> would
    // shadow the page it points at (tests/rooms.spec.js guards that). The
    // WordPress leftovers are the stable thing to sample instead.
    expect(body).toContain('/wp-admin/');
    expect(body).toContain('/docs/broneerimistingimused.pdf');
  });
});
