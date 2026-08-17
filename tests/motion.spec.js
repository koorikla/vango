import { test, expect } from '@playwright/test';

/**
 * Motion. Two things used to make the site feel dead on a phone: the
 * entrance animation rode `animation-timeline: view()`, which only Chromium
 * implements, and the decorative artwork around each room only ever moved on
 * :hover, which a finger never triggers. Both are asserted here, on both the
 * desktop and the touch project.
 */

/** The first element of a kind that starts below the fold. */
async function firstOffscreen(page, selector) {
  const index = await page.evaluate(
    (sel) => [...document.querySelectorAll(sel)].findIndex(
      (el) => el.getBoundingClientRect().top >= window.innerHeight
    ),
    selector
  );
  expect(index, `${selector} has an element below the fold`).toBeGreaterThan(-1);
  return page.locator(selector).nth(index);
}

test.describe('entrance reveals', () => {
  test('a block below the fold starts hidden and animates in', async ({ page }) => {
    await page.goto('/');
    const room = await firstOffscreen(page, '.room');

    await expect(room).toHaveClass(/will-reveal/);
    await expect(room).toHaveCSS('opacity', '0');

    await room.scrollIntoViewIfNeeded();
    await expect(room).toHaveClass(/is-in/);
    await expect(room).toHaveCSS('opacity', '1');
  });

  test('what is already on screen is never hidden', async ({ page }) => {
    await page.goto('/');
    // Anything in the first viewport has been painted; hiding it to animate
    // it back in would read as a flicker on load.
    const flashing = await page.evaluate(() =>
      [...document.querySelectorAll('.will-reveal')]
        .filter((el) => el.getBoundingClientRect().top < window.innerHeight).length
    );
    expect(flashing, 'visible elements were hidden after paint').toBe(0);
    await expect(page.locator('.room').first()).toHaveCSS('opacity', '1');
  });

  test('nothing is left invisible when motion is reduced', async ({ page }) => {
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
  /** Rooms whose front matter gives them decoration layers. */
  const decoratedRooms = (page) => page.locator('.room:has(.room__anim-layer)');

  test('fan out on hover with a pointer', async ({ page, isMobile }) => {
    test.skip(isMobile, 'pointer-only');
    await page.goto('/');
    const room = decoratedRooms(page).first();
    await room.scrollIntoViewIfNeeded();

    const fly = () => room.locator('.room__anim').evaluate(
      (el) => getComputedStyle(el).getPropertyValue('--fly').trim()
    );
    expect(await fly(), 'at rest the layers sit behind the photo').not.toBe('1');

    await room.hover();
    await expect.poll(fly, { message: 'layers fan out on hover' }).toBe('1');
  });

  test('fan out on scroll when there is no hover to give', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch-only');
    await page.goto('/');
    const room = decoratedRooms(page).first();
    await room.scrollIntoViewIfNeeded();

    // The bloom observer wants the room properly in frame, not just touching
    // the edge, so give it the class rather than a pixel-exact scroll.
    await expect(room).toHaveClass(/room--bloom/);
    await expect
      .poll(() => room.locator('.room__anim').evaluate(
        (el) => getComputedStyle(el).getPropertyValue('--fly').trim()
      ), { message: 'ornaments open on a touch device' })
      .toBe('1');

    // and they have actually moved off centre
    const moved = await room.locator('.room__anim-layer').first().evaluate((el) => {
      const t = getComputedStyle(el).translate;
      return t && t !== 'none' && parseFloat(t) !== 0;
    });
    expect(moved, 'a layer is displaced from the circle').toBe(true);
  });

  test('open even when the room is taller than the screen', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch-only');
    // Set before loading, so the observers are built against this viewport
    // and nothing has been marked already. A short screen makes a stacked
    // room — circle, thumbnails, paragraph — taller than the viewport, and
    // an element bigger than the viewport can never reach a ratio threshold.
    await page.setViewportSize({ width: 390, height: 380 });
    await page.goto('/');

    const tallest = await page.evaluate(() => {
      const rooms = [...document.querySelectorAll('.room:has(.room__anim-layer)')];
      let best = -1, height = 0;
      rooms.forEach((el, i) => {
        const h = el.getBoundingClientRect().height;
        if (h > height) { height = h; best = i; }
      });
      return { index: best, height, viewport: window.innerHeight };
    });
    expect(tallest.height, 'a room is taller than the viewport')
      .toBeGreaterThan(tallest.viewport);

    const room = decoratedRooms(page).nth(tallest.index);
    await room.scrollIntoViewIfNeeded();
    await expect(room).toHaveClass(/room--bloom/);
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
