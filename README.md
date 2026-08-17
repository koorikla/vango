# The Vango website — how to change it

The whole site is a folder of text files. There is no login, no admin panel and
nothing to break by clicking the wrong button. You edit a file on your own Mac,
look at the result in your browser, and when you're happy you send it to
GitHub — a minute later the live site has changed.

Nothing you do on your computer touches the live site until you press **Push**.
Until then you can try anything.

---

## The short version

Once you're set up (below), every change looks like this:

1. Open **GitHub Desktop** and click **Fetch origin** — this picks up anything
   that changed since last time.
2. Open **Terminal** and type:
   ```
   cd ~/Documents/GitHub/vango
   hugo server -D
   ```
3. Open <http://localhost:1313> in your browser. That is the site, running on
   your own machine.
4. Edit the files. Every time you save, the browser updates by itself.
5. When you're done, click on the Terminal window and press **Ctrl + C** to
   stop the preview.
6. Back in GitHub Desktop: write a short line saying what you changed, click
   **Commit to main**, then **Push origin**.
7. About a minute later it's live. Today that is
   <https://koorikla.github.io/vango/>; it will be `vango.ee` once the domain
   is pointed there.

That's the whole job. The rest of this file is detail.

---

## First time only — getting set up

You need three things installed. This takes about twenty minutes, once.

### 1. GitHub Desktop

Download it from <https://desktop.github.com>, install it, and sign in with
your GitHub account. This is what fetches changes and sends yours back — you
never have to type a git command.

### 2. Hugo

Hugo is the program that turns the text files into a website. It's installed
from the Terminal.

Open **Terminal** (press Cmd + Space, type "Terminal", press Enter) and paste
this, then press Enter:

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

That installs Homebrew, a tool for installing other tools. It will ask for your
Mac password — that's normal, and nothing appears on screen as you type it.
Follow any instructions it prints at the end.

Then:

```
brew install hugo
```

Check it worked:

```
hugo version
```

You should see something starting with `hugo v0.165` or higher.

### 3. Something to edit text with

Any editor that shows the file as it really is. Do **not** use Word or Pages —
they add invisible formatting.

- **Visual Studio Code** — <https://code.visualstudio.com>, free. Open the whole
  `vango` folder with *File → Open Folder* and you get the file tree down the
  left-hand side. This is the one to pick if you're unsure.
- **Typora** — <https://typora.io>, small charge. Nicer to look at; shows
  headings and bold as you type.

You don't need the editor's own preview. The browser window from step 3 is a
much better preview, and it shows the real page.

### 4. Get the site onto your Mac

In GitHub Desktop: **File → Clone repository**, pick `koorikla/vango`, and
accept the folder it suggests (`~/Documents/GitHub/vango`). That's the folder
the Terminal command above refers to.

---

## Where everything lives

| I want to change… | Look in |
|---|---|
| A news item | `content/et/uudised/` and `content/en/uudised/` |
| An event | `content/et/sundmused/` and `content/en/sundmused/` |
| A photo gallery | `content/et/galerii/<folder>/` and `content/en/galerii/<folder>/` |
| The words about a room | `content/et/ruumid/<room>.md` and `content/en/ruumid/<room>.md` |
| Front page text, contacts, partner list | `data/et/site.json` and `data/en/site.json` |
| Photos that posts use as their cover | `assets/img/uploads/` |

The folder names are Estonian in both languages — that's deliberate, so a page
and its translation sit side by side. Only the web address differs
(`/uudised/` and `/en/news/`).

**Every page exists twice: once in `et`, once in `en`.** If you only write the
Estonian one, the English visitor gets nothing. Always do both.

---

## Recipes

### Add a news item

Make a new file in `content/et/uudised/`. Call it something plain and
lowercase, like `jaanituli.md`. Put this at the top:

```markdown
---
title: "Jaanituli Imedemaal"
translationKey: "uudised-jaanituli"
date: 2026-06-24
summary: "Üks lause, mis läheb kaardile ja Facebooki."
cover: "img/uploads/2015-01-4.jpg"
---

Tekst siia. Tavaline tekst, tühi rida lõikude vahel.
```

Then make the same file in `content/en/uudised/` with the English words but
**the same `translationKey`** — that is the string that ties the two versions
together so the Eesti/English switch works.

- `title` is what people see, and it also decides the web address.
- `date` must be `YYYY-MM-DD`. Newest appears first.
- `summary` and `cover` are what show on the card and on Facebook. A post
  without them falls back to its first paragraph and first picture, which is
  usually worse. Fill them in every time.

### Add an event

Exactly the same, but in `content/*/sundmused/`, with three extra lines:

```yaml
eventDate: 2026-09-18
eventEnd: 2026-09-20        # leave this out if it's a one-day event
location: "Vetevaimu suitsusaun"
```

`eventDate` is what sorts it into **Tulemas** or **Möödunud**. An event only
moves to "Möödunud" the next time something is pushed, so if one looks stuck
in the wrong list, push anything and it sorts itself out.

### Add a photo gallery

A gallery is a *folder* with the pictures inside it:

```
content/et/galerii/suvi-2026/
    index.md
    DSC_0001.jpg
    DSC_0002.jpg
```

`index.md` looks like a news post. Every picture in the folder appears in the
grid and opens full-size when clicked. They're resized automatically — you can
drop in photos straight off the camera. Copy the same folder into
`content/en/galerii/` for the English side.

### Use a photo as a post's cover

Put the picture in `assets/img/uploads/`, then refer to it by name:

```yaml
cover: "img/uploads/jaanituli-2026.jpg"
```

Note the path starts at `img/`, not `assets/`. Give the file a lowercase name
with no spaces and no ä, ö, ü or õ.

### Put a video in a post

```
{{< youtube nh5XUfihq-c >}}
```

The code is the bit after `v=` in the YouTube address. There's a real example
in `content/et/sundmused/vonge-2018.md`.

### Work on something without publishing it

Add this line to the top block:

```yaml
draft: true
```

It shows in your own preview (that's what the `-D` is for) but stays off the
live site. Delete the line when it's ready.

---

## Things that will bite

- **The block between the two `---` lines is fussy.** Keep the quotes, keep the
  colons, keep one item per line. If a page goes blank or the preview shows a
  red error, that block is where to look first.
- **A stray Estonian letter in a filename** causes odd web addresses. Letters
  in the *title* are fine — `Kevadõhtu kümblustünnis` is a perfectly good
  title. It's the *file* and *folder* names that should stay plain.
- **Don't rename a room's `slug`.** Those addresses have been indexed by Google
  for years. If a room really must be renamed, ask Kaur — it needs a
  redirect adding at the same time or the old links die.
- **Smart quotes are fine in the text**, but inside the `---` block use plain
  straight quotes: `"like this"`.

---

## If something goes wrong

**The preview won't start** — check you're in the right folder. Type
`cd ~/Documents/GitHub/vango` and try `hugo server -D` again. If it complains
about a specific file, that file's `---` block has a typo.

**The preview looks wrong** — stop it with Ctrl + C and start it again. If it
still looks wrong, it's the file, not the computer.

**I've made a mess and want to start over** — in GitHub Desktop, right-click
the changed file in the left-hand list and choose **Discard changes**. That
puts it back exactly as it was. Nothing is lost that you haven't pushed.

**I pushed something wrong** — no drama. Fix it and push again; it's live a
minute later. Nothing is ever permanently broken.

**GitHub emailed me about a failed check** — every push is tested
automatically. If a test fails, the email says which one. Forward it to Kaur
rather than guessing.

---

## For the technical detail

`CONTENT.md`, in this same folder, covers the same ground in more depth —
how the home page is assembled, how URLs are built, what happens as a section
grows past twelve entries. You shouldn't need it for ordinary posting.
