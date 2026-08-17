# Adding content

Everything is a markdown file. There is no CMS and no build step beyond Hugo.

```
npm run dev      # local preview at http://localhost:1313
npm test         # the E2E suite (starts its own server)
npm run build    # production build into public/
```

Push to `main` and it deploys itself.

---

## The home page is a one-pager

Meals, activities, partners and contact live on `/` — the nav links to them
are anchors, not pages. Rooms appear there too, but each also has a page of
its own (see below).

- **Room text** — `content/et/ruumid/<room>.md` and the same file under
  `content/en/`. Each has a `hero` image, a `gallery` list and optional
  `animations`.
- **Everything else on the home page** — `data/et/site.json` and
  `data/en/site.json`. Section titles, the partner list, contact details and
  the activities text live there. `meta.tagline` is the one-line description
  under the site name; it is the first thing a first-time visitor reads.
- **What a shared link looks like** — also `site.json`, under `meta`:
  `seoTitle` (keep it under ~60 characters), `description` (~150) and
  `ogImage`, the picture Facebook, Messenger and WhatsApp show. A post with
  its own `cover` overrides `ogImage` for that post.

> The share image is rendered to **JPEG**, unlike every other image on the
> site. Facebook's crawler will not process a WebP `og:image` — the card
> comes out with the title and text and no picture. Do not "optimise" that
> one line in `baseof.html` to WebP.

Adding a room is rare, so it stays a two-file job. Adding a *post* is not,
which is what the sections below are for.

The bottom of the home page builds itself from those posts: **upcoming
events** and then the **three newest news items** appear above the partner
list, each section showing up only once it has something in it. Write a post
and it lands on the home page without touching a template.

---

## Rooms have their own pages

Each room is listed on `/ruumid/` and has a page at `/ruumid/<slug>/`
(`/en/ruumid/<slug>/`), so it can be found by name in a search — on the
one-pager a room is one paragraph among twelve, which nothing can rank.

A room's URL is built from its **title**, in each language: Kuukoda is at
`/ruumid/kuukoda/` and `/en/ruumid/moon-chamber/`. Set `slug:` in the front
matter and keep it a plain ASCII version of the name — `Käbi` becomes `kabi`,
`Journeyer’s Sauna` becomes `journeyers-sauna`.

WordPress had published these under slugs that often named something else
entirely — Kuukoda at `tiigimaja`, Imedemaa veesilm at `indiaanisaun-3`,
Heliaed at `trahter-lava` — and those URLs are indexed. **If you rename a
room, add a line to `static/_redirects` forwarding the old path to the new
one**, exactly as the existing room block does. A 301 carries the search
ranking across; simply dropping the URL does not.

`tests/rooms.spec.js` fails if a slug stops matching its title, if a renamed
room has no redirect, or if a rule in `_redirects` would shadow a live page.

### Writing a room

Most room texts are written to run straight on from the room's name, with no
subject of their own — *"…on eriti müstiline paik"* — because on the
one-pager the title sits inline immediately before the sentence. The room
page detects that and puts the name back at the front, both in the heading
paragraph and in the search snippet. A text that opens with a capital letter
is left exactly as written. Either style is fine; just be consistent within
a single room's two translations.

---

## News, events and galleries

Three sections, one file per entry, in both languages:

| Section | Estonian URL | English URL | Folder |
|---|---|---|---|
| News | `/uudised/` | `/en/news/` | `content/<lang>/uudised/` |
| Events | `/sundmused/` | `/en/events/` | `content/<lang>/sundmused/` |
| Galleries | `/galerii/` | `/en/gallery/` | `content/<lang>/galerii/` |

The folder names are Estonian in both languages so a page and its
translation sit at the same path; only the public URL differs. Each section
appears in the nav **only once it has at least one entry**, and publishes an
RSS feed at `<section>/index.xml`.

### A news post

`content/et/uudised/minu-lugu.md`:

```markdown
---
title: "Pealkiri"
translationKey: "uudised-minu-lugu"   # links the et/en versions together
date: 2026-08-20
summary: "Üks lause, mis läheb kaardile ja RSS-i."
cover: "img/uploads/2015-01-4.jpg"    # optional; otherwise the first image in the bundle
---

Sisu siia. Tavaline markdown.
```

Create the same file under `content/en/uudised/` with the same
`translationKey` and the language switcher will move between them.

### An event

Same as a post, plus:

```yaml
eventDate: 2026-09-18     # required — decides Upcoming vs Past
eventEnd: 2026-09-20      # optional
location: "Vetevaimu suitsusaun"
```

Events are grouped into **Tulemas / Upcoming** and **Möödunud / Past** at
build time, soonest first. Because that comparison happens during the build,
an event only moves to "Past" on the next deploy — push anything, or trigger
the workflow manually, to refresh it.

### A video in a post

```
{{</* youtube nh5XUfihq-c */>}}
```

The id is the part after `v=` in the YouTube address. The player is embedded
through `youtube-nocookie.com` (`privacy.youtube` in `hugo.toml`), so nothing
is set on the visitor's machine until they press play. `content/*/sundmused/vonge-2018.md`
uses it.

### A gallery

A gallery is a folder ("page bundle") holding its own images:

```
content/et/galerii/suvi-2026/
  index.md
  DSC_0001.jpg
  DSC_0002.jpg
```

Every image in the folder appears in the grid and opens in the lightbox.
Resizing and WebP conversion happen at build time. To caption an image, add
`alt` in front matter under `resources`.

---

## URLs

Page URLs come from the **title** (`:slug`), not the filename, so
`title: "Suvehooaeg on avatud"` becomes `/uudised/suvehooaeg-on-avatud/`.
Override with `slug: "midagi-muud"` in front matter.

## Drafts

`draft: true` keeps a page out of the production build. `npm run dev` shows
drafts; `npm run build` does not.

## What happens as a section grows

Nothing you have to maintain. News and gallery lists page themselves after
**12 entries** (`pagerSize` in `hugo.toml`); events stay on one page because
they are already split into Upcoming and Past. Each post links to the next
and previous one in its section on its own.

The `summary` line and the `cover` image are what a post shows as a card, in
its RSS feed, and on Facebook — a post without them falls back to its first
paragraph and first picture, which is usually worse. They are the two lines
worth filling in every time.

## What is in there now

The news and events sections were seeded from the
[Facebook page](https://www.facebook.com/vangoimedemaa) — real posts from 2020
to 2025, rewritten as articles in both languages. They are all in the past, so
the events list shows only **Möödunud / Past** and the home page's "Tulemas"
band stays hidden until a future `eventDate` exists.

Covers point at `img/uploads/…` under `assets/`, which is where the pictures
carried over from the old WordPress site live. New posts can either do the same
or drop their images into a page bundle.

The one gallery, `content/*/galerii/aastaajad/`, is a page bundle with its own
photographs. Add more folders next to it the same way.
