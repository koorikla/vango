import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Motion. All of it is CSS now — scroll-driven animations and view
 * transitions, with no script involved.
 *
 * The one thing that can go badly wrong is the `@supports` guard. Without
 * it, a browser that does not understand `animation-timeline: view()` still
 * applies the `from` keyframe and leaves the page permanently blank. That is
 * far worse than having no animation, and it is invisible from a browser
 * that does support it — so it is asserted against the stylesheet itself.
 */

const css = readFileSync('assets/css/main.css', 'utf8');

test.describe('the reveal cannot strand content', () => {
  test('every hiding rule sits inside the @supports guard', () => {
    const start = css.indexOf('@supports (animation-timeline: view())');
    expect(start, '@supports guard is present').toBeGreaterThan(-1);

    // Walk the guard's braces to find where it ends.
    let depth = 0, end = start;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) { end = i; break; }
    }
    const guarded = css.slice(start, end);
    const outside = css.slice(0, start) + css.slice(end);

    expect(guarded, 'the reveal is inside the guard').toContain('animation: rise');
    // `rise` starts at opacity 0. If anything outside the guard applied it,
    // an unsupporting browser would hide that content for ever.
    expect(outside.includes('animation: rise'), 'nothing applies rise unguarded').toBe(false);
  });

  test('the reveal finishes while the block is still entering', () => {
    // A range that runs on into `cover` leaves whatever is already on screen
    // at load — the first room on a desktop — sitting near 60% opacity until
    // the reader scrolls, which reads as a rendering fault and undoes the
    // text contrast this palette was tuned for. Asserted against the rule
    // rather than by measuring pixels: whether a given element is mid-reveal
    // at load depends on viewport height, so geometry cannot tell a stranded
    // block apart from one that is legitimately still arriving.
    const range = css.match(/animation-range:\s*([^;]+);/);
    expect(range, 'animation-range is declared').not.toBeNull();
    expect(range[1].trim(), 'the range must end inside the entry phase')
      .toMatch(/^entry [\d.]+% entry [\d.]+%$/);
  });

  test('a block below the fold reveals as it arrives', async ({ page }) => {
    await page.goto('/');
    const index = await page.evaluate(() =>
      [...document.querySelectorAll('.room')].findIndex(
        (el) => el.getBoundingClientRect().top > window.innerHeight * 1.5
      )
    );
    expect(index, 'a room starts well below the fold').toBeGreaterThan(-1);

    const room = page.locator('.room').nth(index);
    expect(Number(await room.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.5);

    await room.scrollIntoViewIfNeeded();
    await expect.poll(
      () => room.evaluate((el) => Number(getComputedStyle(el).opacity)),
      { message: 'room reveals once scrolled to' }
    ).toBe(1);
  });

  test('nothing is invisible when motion is reduced', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const hidden = await page.evaluate(() =>
      [...document.querySelectorAll('.room, .card, .gallery-grid__item, .partner, .cta')]
        .filter((el) => getComputedStyle(el).opacity === '0').length
    );
    expect(hidden, 'reduced motion must not hide content').toBe(0);
  });
});

test.describe('room ornaments', () => {
  const decorated = (page) => page.locator('.room:has(.room__anim-layer)');

  test('stay behind the words', async ({ page }) => {
    // They are white cut-outs: anything they cross disappears. The dragon's
    // limbs were sitting across the room's own title.
    await page.goto('/');
    const z = await page.locator('.room__anim').first()
      .evaluate((el) => getComputedStyle(el).zIndex);
    expect(Number(z), 'ornaments paint behind the text').toBeLessThan(0);
  });

  test('are softened at their edges', async ({ page }) => {
    // Heliaed's ornament is a hard-edged rectangle rather than a cut-out and
    // read as a grey slab dropped beside the paragraph.
    await page.goto('/');
    const mask = await page.locator('.room__anim').first()
      .evaluate((el) => getComputedStyle(el).maskImage);
    expect(mask).toContain('radial-gradient');
  });

  test('open on hover with a pointer', async ({ page, isMobile }) => {
    test.skip(isMobile, 'pointer-only');
    await page.goto('/');
    const room = decorated(page).first();
    await room.scrollIntoViewIfNeeded();
    const fly = () => room.locator('.room__anim')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--fly').trim());

    expect(await fly()).not.toBe('1');
    await room.hover();
    await expect.poll(fly, { message: 'ornaments open on hover' }).toBe('1');
  });

  test('open on scroll where there is no hover to give', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch-only');
    await page.goto('/');
    const room = decorated(page).first();
    await room.scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 300);
    await expect.poll(
      () => room.locator('.room__anim').evaluate(
        (el) => Number(getComputedStyle(el).getPropertyValue('--fly')) || 0
      ),
      { message: 'ornaments open as the room scrolls in' }
    ).toBeGreaterThan(0);
  });
});

test.describe('view transitions', () => {
  test('a room image is named on every page it appears', async ({ page }) => {
    for (const [url, expected] of [['/', 12], ['/ruumid/', 12]]) {
      await page.goto(url);
      const names = await page.locator('[data-vt]').evaluateAll(
        (els) => els.map((e) => getComputedStyle(e).viewTransitionName)
      );
      expect(names.length, `${url} tags every room`).toBe(expected);
      expect(names.filter((n) => n === 'none'), `${url} has no unnamed tag`).toEqual([]);
    }
  });

  test('no name is used twice on one page', async ({ page }) => {
    // A duplicate silently disables the whole transition.
    for (const url of ['/', '/ruumid/', '/ruumid/kuukoda/', '/en/', '/en/ruumid/moon-chamber/']) {
      await page.goto(url);
      const names = await page.locator('[data-vt]').evaluateAll(
        (els) => els.map((e) => getComputedStyle(e).viewTransitionName)
      );
      expect(new Set(names).size, `${url} has duplicate names: ${names.join(', ')}`).toBe(names.length);
    }
  });

  test('only rooms are tagged — posts have no hero to morph into', async ({ page }) => {
    await page.goto('/uudised/');
    await expect(page.locator('[data-vt]')).toHaveCount(0);
  });
});

test.describe('touch affordances', () => {
  test('controls opt out of double-tap zoom', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch-only');
    await page.goto('/');
    for (const sel of ['.site-nav__toggle', '.thumb', '.thumbs__more']) {
      await expect(page.locator(sel).first(), sel).toHaveCSS('touch-action', 'manipulation');
    }
  });
});
