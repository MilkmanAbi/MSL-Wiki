# MSL Guide

The complete guide to [MSL](https://github.com/MilkmanAbi) — real Linux on your Mac.

**Read it at: https://milkmanabi.github.io/MSL-Wiki/**

117 articles across 19 chapters from the app, plus chapters of our own, covering everything from installing your
first distro to running a managed fleet.

## What's in it

| Chapter | |
|---|---|
| Welcome, Getting Started | Installing a distro, creating an instance, your first Linux app |
| The Main Window, Applications, Terminal | The app itself, and running Linux programs with their own Dock tiles |
| Managing Instances | Renaming and copying, provenance, encrypted images, port forwarding |
| Sandbox, Files, Graphics | Cutting an instance off, moving files, GPU acceleration |
| Power, Public Access, Admin Portal | Sleep and battery, reaching an instance from the internet, locking a Mac down |
| Troubleshooting, Command Line, Reference | When something goes wrong, and every command |

## How this is built

The words come from the guide that ships **inside MSL**, exported by the same
parser the app uses. The page around them (layout, search, navigation) is
built here:

```
swift run help-export ./_export   # in the MSL repo; copy the output into _export/
node _build/build.mjs             # writes the site into the repo root
```

```
index.html                 home page
404.html                   not-found page; also redirects old links (see below)
<chapter>/index.html       one folder per chapter, with an overview page
<chapter>/<article>.html
assets/                    site.css and site.js (the whole design), images, search index
_export/                   raw exporter output. Don't edit; re-export instead.
_extras/                   hand-written chapters (see _extras/README.md)
_build/                    the build script, and a manifest of what it wrote
```

- `_build/build.mjs` has no dependencies. It re-templates every page, rewrites
  links for the folder layout, writes `assets/search-index.js`, removes pages
  that no longer exist, and **fails if any link or `#anchor` is broken**.
- Everything outside the `_` folders and `assets/` is generated. Edits to it are
  lost on the next build.
- `.nojekyll` makes GitHub Pages serve the files exactly as they are.

**Old links keep working.** The site used to be flat (`/MSL-Wiki/tour.html`).
GitHub Pages answers a missing page with `404.html`, which recognises any
article by its file name and redirects to where it lives now, keeping the
`#section`. That also covers articles that move to another chapter later, so
article file names must stay unique. The redirect assumes the site is served
from `/MSL-Wiki/`; set `MSL_SITE_BASE` when building if that changes.

To preview, run `python -m http.server` in the repo root and open
http://localhost:8000. The redirects only work on GitHub Pages itself, or on a
server that serves `404.html` for missing pages.

There is no second copy of the text. Add an article to the app and it
appears here; a broken cross-reference fails the app's own tests long
before it could reach the web.

## Licence

MIT, like MSL itself — except mslgd, MSL's X11 server, which is GPL-3.0.
