import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Rooms have pages of their own so they can be found by name — on the
 * one-pager each is a paragraph among twelve, which nothing can rank.
 *
 * Each now lives at a URL that says what it is. WordPress had published them
 * under slugs that frequently described something else entirely: Kuukoda at
 * "tiigimaja", Imedemaa veesilm at "indiaanisaun-3", Heliaed at
 * "trahter-lava". Those old URLs are indexed, so every one of them is
 * redirected to its replacement rather than dropped — which is what most of
 * this file guards.
 */

const ROOMS = [
  { was: 'asukoht',        et: { slug: 'imedemaa',             title: 'Imedemaa' },             en: { slug: 'wonderland',                  title: 'Wonderland' } },
  { was: 'peomaja',        et: { slug: 'kabi',                 title: 'Käbi' },                 en: { slug: 'heart',                       title: 'Heart' } },
  { was: 'tiigimaja',      et: { slug: 'kuukoda',              title: 'Kuukoda' },              en: { slug: 'moon-chamber',                title: 'Moon Chamber' } },
  { was: 'suur-ait',       et: { slug: 'targa-tamme-ait',      title: 'Targa Tamme ait' },      en: { slug: 'garner-of-the-smart-oak',     title: 'Garner of the Smart Oak' } },
  { was: 'vaike-ait',      et: { slug: 'haldja-onn',           title: 'Haldja onn' },           en: { slug: 'fairy-hut',                   title: 'Fairy Hut' } },
  { was: 'trahter-lava',   et: { slug: 'heliaed',              title: 'Heliaed' },              en: { slug: 'garden-of-sounds',            title: 'Garden of Sounds' } },
  { was: 'rabbithole',     et: { slug: 'janeseuru-hotell',     title: 'Jäneseuru hotell' },     en: { slug: 'rabbit-hole-hotel',           title: 'Rabbit Hole Hotel' } },
  { was: 'saunamaja',      et: { slug: 'randaja-saun',         title: 'Rändaja saun' },         en: { slug: 'journeyers-sauna',            title: 'Journeyer’s Sauna' } },
  { was: 'suitsusaun',     et: { slug: 'vetevaimu-suitsusaun', title: 'Vetevaimu suitsusaun' }, en: { slug: 'water-guardians-smoke-sauna', title: 'Water Guardian’s Smoke Sauna' } },
  { was: 'indiaanisaun-3', et: { slug: 'imedemaa-veesilm',     title: 'Imedemaa veesilm' },     en: { slug: 'small-wonderland-lake',       title: 'Small Wonderland Lake' } },
  { was: 'laagriplats-2',  et: { slug: 'aladini-imeaas',       title: 'Aladini imeaas' },       en: { slug: 'aladdins-lea-of-wonders',     title: 'Aladdin’s Lea of Wonders' } },
  { was: 'kodumaja',       et: { slug: 'kodumaja',             title: 'Kodumaja' },             en: { slug: 'homehouse',                   title: 'Homehouse' } },
];

const LANGS = [['et', ''], ['en', '/en']];

/** Every rule in _redirects, as [from, to] pairs. */
function redirectRules() {
  return readFileSync('static/_redirects', 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/));
}

test.describe('room URLs say the room name', () => {
  for (const room of ROOMS) {
    test(`${room.et.title} lives at a URL that names it`, async ({ page }) => {
      for (const [lang, prefix] of LANGS) {
        const url = `${prefix}/ruumid/${room[lang].slug}/`;
        const res = await page.goto(url);
        expect(res.status(), url).toBeLessThan(400);
        await expect(page.locator('h1'), url).toHaveText(room[lang].title);
      }
    });
  }

  test('the slug is derived from the name, not left over from WordPress', () => {
    // The point of the rename: "tiigimaja" told a reader nothing about
    // Kuukoda. Each slug now has to be recognisably its title.
    const ascii = (s) =>
      s.normalize('NFKD').replace(/[̀-ͯ’']/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    for (const room of ROOMS) {
      for (const [lang] of LANGS) {
        expect(room[lang].slug, `${room[lang].title} (${lang})`).toBe(ascii(room[lang].title));
      }
    }
  });
});

test.describe('the URLs WordPress published', () => {
  test('every renamed room forwards its old URL', () => {
    // Cloudflare serves these; Hugo's dev server does not, so the rules are
    // checked as data. Dropping one would 404 a page Google already has.
    const rules = redirectRules();
    const missing = [];
    for (const room of ROOMS) {
      for (const [lang, prefix] of LANGS) {
        if (room.was === room[lang].slug) continue; // never moved
        const from = `${prefix}/ruumid/${room.was}`;
        const to = `${prefix}/ruumid/${room[lang].slug}`;
        const rule = rules.find(([f]) => f === from);
        if (!rule) missing.push(`${from}  (no rule)`);
        else if (rule[1] !== to) missing.push(`${from} -> ${rule[1]}, expected ${to}`);
        else if (rule[2] !== '301') missing.push(`${from} is a ${rule[2]}, expected 301`);
      }
    }
    expect(missing, `old room URLs not forwarded:\n${missing.join('\n')}`).toEqual([]);
  });

  test('nothing in _redirects shadows a room page', () => {
    // Cloudflare applies _redirects ahead of static assets, so a rule whose
    // source is also a real page would send it somewhere else for ever.
    const rules = redirectRules().map(([from]) => from);
    const shadowed = [];
    for (const room of ROOMS) {
      for (const [lang, prefix] of LANGS) {
        const url = `${prefix}/ruumid/${room[lang].slug}`;
        for (const rule of rules) {
          const re = new RegExp('^' + rule.replace(/\*/g, '.*').replace(/:\w+/g, '[^/]+') + '/?$');
          if (re.test(url)) shadowed.push(`${url}  <-  ${rule}`);
        }
      }
    }
    expect(shadowed, `redirects shadowing real pages:\n${shadowed.join('\n')}`).toEqual([]);
  });

  test('the production build emits the new URLs and only those', () => {
    // Checked against the build, not over HTTP: `hugo server` also resolves a
    // page by its content-file path, so /ruumid/asukoht/ answers there long
    // after the slug changed. Only what lands in public/ gets deployed, and
    // an old path surviving there would hold the same content at two URLs —
    // the duplicate this rename exists to remove.
    const out = mkdtempSync(join(tmpdir(), 'vango-rooms-'));
    try {
      execFileSync('hugo', ['--gc', '--minify', '--destination', out], { stdio: 'pipe' });
      const built = [];
      const missing = [];
      for (const room of ROOMS) {
        for (const [lang, prefix] of LANGS) {
          const dir = join(out, prefix.replace(/^\//, ''), 'ruumid');
          if (!existsSync(join(dir, room[lang].slug, 'index.html'))) {
            missing.push(`${prefix}/ruumid/${room[lang].slug}/`);
          }
          if (room.was !== room[lang].slug && existsSync(join(dir, room.was, 'index.html'))) {
            built.push(`${prefix}/ruumid/${room.was}/`);
          }
        }
      }
      expect(missing, `rooms not built:\n${missing.join('\n')}`).toEqual([]);
      expect(built, `old slugs still built:\n${built.join('\n')}`).toEqual([]);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

test.describe('a room page', () => {
  test('is findable: own title, description, canonical and picture', async ({ page }) => {
    await page.goto('/ruumid/vetevaimu-suitsusaun/');

    await expect(page).toHaveTitle(/^Vetevaimu suitsusaun/);
    await expect(page.locator('h1')).toHaveText('Vetevaimu suitsusaun');
    await expect(page.locator('link[rel="canonical"]'))
      .toHaveAttribute('href', /\/ruumid\/vetevaimu-suitsusaun\/$/);

    // the room's own photograph, not the site-wide share image
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(og).not.toMatch(/kumblustunn/);
    expect(og).toMatch(/\.jpg/);
  });

  test('reads as a sentence, not a fragment', async ({ page }) => {
    // Room texts were written to run on from the room's name and have no
    // subject of their own ("...on eriti müstiline paik"). Under a heading
    // that reads as broken prose, so the name has to lead the paragraph.
    await page.goto('/ruumid/vetevaimu-suitsusaun/');
    const body = (await page.locator('.room-page__body').innerText()).trim();
    expect(body).toMatch(/^Vetevaimu suitsusaun/);

    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc, 'the snippet must not open mid-sentence').toMatch(/^Vetevaimu suitsusaun/);
  });

  test('shows its photographs at a size worth clicking for', async ({ page }) => {
    await page.goto('/ruumid/vetevaimu-suitsusaun/');
    const shots = page.locator('.gallery-grid__item');
    expect(await shots.count()).toBeGreaterThan(1);

    await shots.first().scrollIntoViewIfNeeded();
    await shots.first().click();
    const dialog = page.locator('#lightbox');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('is marked up as a place inside the place', async ({ page }) => {
    await page.goto('/ruumid/kuukoda/');
    const blocks = await page.locator('script[type="application/ld+json"]')
      .evaluateAll((els) => els.map((e) => JSON.parse(e.textContent)));

    const room = blocks.find((b) => b['@type'] === 'Accommodation');
    expect(room, 'room carries Accommodation markup').toBeTruthy();
    expect(room.name).toBe('Kuukoda');
    expect(room.containedInPlace['@type']).toBe('Campground');

    const crumbs = blocks.find((b) => b['@type'] === 'BreadcrumbList');
    expect(crumbs, 'room carries a breadcrumb trail').toBeTruthy();
    expect(crumbs.itemListElement.map((i) => i.name).at(-1)).toBe('Kuukoda');
    expect(crumbs.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
  });

  test('offers somewhere to go next', async ({ page }) => {
    await page.goto('/ruumid/kuukoda/');
    await expect(page.locator('.crumbs a[href$="/ruumid/"]')).toHaveCount(1);
    await expect(page.locator('.cta__book')).toHaveAttribute('href', /freetobook\.com/);
    // neighbouring rooms, none of them this one
    const others = page.locator('.cards .card__link');
    expect(await others.count()).toBeGreaterThan(0);
    const hrefs = await others.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs.some((h) => h.includes('/kuukoda/'))).toBe(false);
  });
});

test.describe('how a room is reached', () => {
  test('the home page links to every room page', async ({ page }) => {
    await page.goto('/');
    for (const room of ROOMS) {
      await expect(
        page.locator(`.room a[href$="/ruumid/${room.et.slug}/"]`).first(),
        `home page links to ${room.et.title}`
      ).toHaveCount(1);
    }
  });

  test('the section index lists them all', async ({ page }) => {
    await page.goto('/ruumid/');
    await expect(page.locator('h1')).toHaveText('Ruumid');
    await expect(page.locator('.cards .card')).toHaveCount(ROOMS.length);
  });

  test('every room is in the sitemap', async ({ request }) => {
    const index = await (await request.get('/sitemap.xml')).text();
    const nested = [...index.matchAll(/<loc>([^<]+\.xml)<\/loc>/g)].map((m) => m[1]);
    const all = [index, ...(await Promise.all(nested.map(async (u) => (await request.get(u)).text())))].join('');
    for (const room of ROOMS) {
      expect(all, `${room.et.title} in sitemap`).toContain(`/ruumid/${room.et.slug}/`);
      expect(all, `${room.en.title} in sitemap`).toContain(`/en/ruumid/${room.en.slug}/`);
    }
  });

  test('a room links to its translation', async ({ page }) => {
    await page.goto('/ruumid/kuukoda/');
    await page.locator('.langs').getByRole('link', { name: 'English' }).click();
    await expect(page).toHaveURL(/\/en\/ruumid\/moon-chamber\/$/);
    await expect(page.locator('h1')).toHaveText('Moon Chamber');
  });
});
