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

Rooms, meals, activities, partners and contact all live on `/`. They are
**not** separate pages — the nav links are anchors.

- **Room text** — `content/et/ruumid/<room>.md` and the same file under
  `content/en/`. Each has a `hero` image, a `gallery` list and optional
  `animations`. These deliberately have no URL of their own
  (`render: never` in `hugo.toml`); they are fragments of the home page.
- **Everything else on the home page** — `data/et/site.json` and
  `data/en/site.json`. Section titles, the partner list, contact details and
  the activities text live there. `meta.tagline` is the one-line description
  under the site name; it is the first thing a first-time visitor reads.

Adding a room is rare, so it stays a two-file job. Adding a *post* is not,
which is what the sections below are for.

The bottom of the home page builds itself from those posts: **upcoming
events** and then the **three newest news items** appear above the partner
list, each section showing up only once it has something in it. Write a post
and it lands on the home page without touching a template.

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

## Placeholder content to delete

These are examples so the layouts had something real to render. Delete them
before the site goes to `vango.ee`:

- `content/*/uudised/suvi-avatud.md`
- `content/*/sundmused/suvine-retriit.md`
- `content/*/galerii/aastaajad/`
