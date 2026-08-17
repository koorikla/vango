import { test, expect } from '@playwright/test';

/**
 * The shell the site wears on every page: a full crest on the home page, a
 * compact bar everywhere else, and a nav that stays reachable once you have
 * scrolled. These matter most for the pages that get published often — a
 * news post should open with the news, not with a screen of branding, and
 * should describe itself to search engines and share cards.
 */

test.describe('page shell', () => {
  test('inner pages open with a compact header, not the full crest', async ({ page }) => {
    const heightOf = async (url) => {
      await page.goto(url);
      return page.locator('.site-header').evaluate((el) => el.getBoundingClientRect().height);
    };
    const home = await heightOf('/');
    const post = await heightOf('/uudised/');

    expect(post, 'compact header is shorter than the crest').toBeLessThan(home / 2);
    await expect(page.locator('.site-header--compact')).toHaveCount(1);

    await page.goto('/');
    await expect(page.locator('.site-header--compact')).toHaveCount(0);
  });

  test('the nav bar stays at the top of the viewport once scrolled', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('.site-nav');
    await page.evaluate(() => window.scrollTo(0, 2500));
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('is-stuck')))
      .toBe(true);

    const top = await nav.evaluate((el) => el.getBoundingClientRect().top);
    expect(top, 'nav is parked at the top').toBeLessThanOrEqual(1);
    await expect(page.locator('.site-nav__book')).toBeInViewport();
  });

  test('the booking link is reachable without opening the menu', async ({ page }) => {
    await page.goto('/');
    // never inside the collapsible list, on any viewport
    await expect(page.locator('#site-menu .site-nav__book')).toHaveCount(0);
    await expect(page.locator('.site-nav__book')).toBeVisible();
  });

  test('rooms stack into one column on a phone', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only');
    await page.goto('/');
    const room = page.locator('.room').first();
    const cols = await room.evaluate((el) =>
      getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length
    );
    expect(cols, 'room is a single column').toBe(1);

    // and the text uses the full width rather than a half-width strip
    const [roomW, textW] = await room.evaluate((el) => [
      el.getBoundingClientRect().width,
      el.querySelector('.room__text').getBoundingClientRect().width,
    ]);
    expect(textW).toBeGreaterThan(roomW * 0.9);
  });
});

test.describe('per-page metadata', () => {
  const meta = (page, sel, attr = 'content') => page.locator(sel).getAttribute(attr);

  test('a post describes itself rather than reusing the home page', async ({ page }) => {
    await page.goto('/');
    const homeTitle = await page.title();
    const homeDesc = await meta(page, 'meta[name="description"]');

    await page.goto('/uudised/');
    const sectionHref = page.locator('.card__link').first();
    await sectionHref.click();

    await expect(page).not.toHaveTitle(homeTitle);
    await expect(page.locator('h1')).toHaveCount(1);
    const h1 = await page.locator('h1').innerText();
    expect(await page.title()).toContain(h1);

    const desc = await meta(page, 'meta[name="description"]');
    expect(desc, 'post has its own description').not.toBe(homeDesc);
    expect(desc.length).toBeGreaterThan(10);

    expect(await meta(page, 'meta[property="og:type"]')).toBe('article');
    expect(await meta(page, 'meta[property="og:title"]')).toContain(h1);
  });

  test('a post is marked up as an article, the home page as the place', async ({ page }) => {
    await page.goto('/');
    const home = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent());
    expect(home['@type']).toBe('Campground');

    await page.goto('/uudised/');
    await page.locator('.card__link').first().click();
    const post = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent());
    expect(post['@type']).toBe('Article');
    expect(post.headline).toBe(await page.locator('h1').innerText());
  });

  test('an event carries its date in structured data', async ({ page }) => {
    await page.goto('/sundmused/');
    await page.locator('.card__link').first().click();
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent());
    expect(ld['@type']).toBe('Event');
    expect(ld.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('every section advertises its feed', async ({ page }) => {
    for (const path of ['/uudised/', '/sundmused/', '/galerii/']) {
      await page.goto(path);
      const feed = page.locator('link[rel="alternate"][type="application/rss+xml"]');
      await expect(feed, path).toHaveCount(1);
    }
  });
});

test.describe('reading on from a post', () => {
  test('a post offers a way back and a way to book', async ({ page }) => {
    await page.goto('/uudised/');
    await page.locator('.card__link').first().click();

    // back to the section, both above and below the article
    await expect(page.locator('.post__back a')).toHaveAttribute('href', /\/uudised\/$/);
    await expect(page.locator('.band__more a')).toHaveAttribute('href', /\/uudised\/$/);

    const cta = page.locator('.cta');
    await expect(cta).toBeVisible();
    await expect(cta.locator('.cta__book')).toHaveAttribute('href', /freetobook\.com/);
    await expect(cta.locator('a[href^="mailto:"]')).toHaveCount(1);
  });
});
