import { test, expect } from '@playwright/test';

/**
 * News, events and galleries — the content types the site will actually grow
 * into. These assert the architecture works (URLs, translation, RSS, dates,
 * empty states) rather than the specific example content, so they keep
 * passing once the placeholder posts are replaced.
 */

const SECTIONS = [
  { key: 'news',    et: '/uudised/',   en: '/en/news/',    etTitle: 'Uudised',   enTitle: 'News' },
  { key: 'events',  et: '/sundmused/', en: '/en/events/',  etTitle: 'Sündmused', enTitle: 'Events' },
  { key: 'gallery', et: '/galerii/',   en: '/en/gallery/', etTitle: 'Galerii',   enTitle: 'Gallery' },
];

for (const s of SECTIONS) {
  test.describe(`${s.key} section`, () => {
    test('list page loads in both languages with the right title', async ({ page }) => {
      await page.goto(s.et);
      await expect(page.locator('h1')).toHaveText(s.etTitle);
      await page.goto(s.en);
      await expect(page.locator('h1')).toHaveText(s.enTitle);
    });

    test('every card links to a page that exists and has an h1', async ({ page }) => {
      await page.goto(s.et);
      const links = await page.locator('.card__link').evaluateAll((els) => els.map((e) => e.href));
      expect(links.length, 'section has at least one entry').toBeGreaterThan(0);
      for (const href of links) {
        const res = await page.goto(href);
        expect(res.status(), href).toBeLessThan(400);
        await expect(page.locator('h1')).toHaveCount(1);
        // and a way back to the section
        await expect(page.locator('.post__back a')).toHaveAttribute('href', new RegExp(s.et.replace(/\//g, '\\/') + '$'));
      }
    });

    test('publishes an RSS feed', async ({ request }) => {
      const res = await request.get(`${s.et}index.xml`);
      expect(res.ok()).toBeTruthy();
      const xml = await res.text();
      expect(xml).toContain('<rss');
      expect(xml).toMatch(/<item>/);
    });

    test('appears in the site nav', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator(`.site-nav__list a[href="${s.et}"]`)).toHaveCount(1);
    });

    test('is listed in the sitemap', async ({ request }) => {
      const xml = await (await request.get('/sitemap.xml')).text();
      // multilingual builds use a sitemap index
      const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      const nested = await Promise.all(
        urls.filter((u) => u.endsWith('.xml')).map(async (u) => (await request.get(u)).text())
      );
      const all = [xml, ...nested].join('');
      expect(all).toContain(s.et);
    });
  });
}

test.describe('events ordering', () => {
  test('a future event is listed under Upcoming, not Past', async ({ page }) => {
    await page.goto('/sundmused/');
    const headings = await page.locator('.band__title--sub').allInnerTexts();
    expect(headings.length, 'events are grouped').toBeGreaterThan(0);

    // find the group each card sits in and check it against the card's own date
    const groups = await page.evaluate(() => {
      const out = [];
      let current = null;
      for (const el of document.querySelectorAll('.band__title--sub, .card')) {
        if (el.classList.contains('band__title--sub')) current = el.textContent.trim();
        else out.push({ group: current, date: el.querySelector('time')?.getAttribute('datetime') });
      }
      return out;
    });
    const today = new Date().toISOString().slice(0, 10);
    for (const g of groups) {
      if (!g.date) continue;
      const isFuture = g.date >= today;
      const inUpcoming = /Tulemas|Upcoming/.test(g.group);
      expect(inUpcoming, `${g.date} grouped under "${g.group}"`).toBe(isFuture);
    }
  });
});

test.describe('gallery pages', () => {
  test('a gallery renders a photo grid wired to the lightbox', async ({ page }) => {
    await page.goto('/galerii/');
    await page.locator('.card__link').first().click();

    const items = page.locator('.gallery-grid__item');
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeGreaterThan(1);

    await items.first().click();
    const dialog = page.locator('#lightbox');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.lightbox__img')).toHaveAttribute('src', /.+/);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('cross-page navigation', () => {
  test('nav anchors jump back to the home page from an inner page', async ({ page, isMobile }) => {
    await page.goto('/uudised/');
    if (isMobile) await page.locator('.site-nav__toggle').click();
    await page.locator('.site-nav__list a[href$="#kontakt"]').first().click();
    await expect(page).toHaveURL(/\/#kontakt$/);
    await expect(page.locator('#kontakt')).toBeVisible();
  });

  test('language switch stays within the same section', async ({ page }) => {
    await page.goto('/uudised/');
    await page.locator('.langs').getByRole('link', { name: 'English' }).click();
    await expect(page).toHaveURL(/\/en\/news\/$/);
    await expect(page.locator('h1')).toHaveText('News');
  });

  test('home page shows a latest-news strip linking to the section', async ({ page }) => {
    await page.goto('/');
    const strip = page.locator('#uudised');
    await expect(strip).toHaveCount(1);
    await expect(strip.locator('.card')).not.toHaveCount(0);
    await strip.locator('.pill').click();
    await expect(page).toHaveURL(/\/uudised\/$/);
  });
});
