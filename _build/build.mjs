#!/usr/bin/env node
// Builds the published site from the raw `help-export` output, plus any
// hand-written chapters in _extras/.
//
//   swift run help-export ./_export     (in the MSL repo, output copied here)
//   node _build/build.mjs               (writes the site into the repo root)
//
// The exporter owns the words; this script owns the page around them. It
// never edits article text: it lifts the title, summary and body out of each
// exported page, puts them in the template, rewrites links for the
// chapter-folder layout, and writes a search index.
//
// Layout of the published site:
//
//   index.html                  home
//   404.html                    not-found page; also redirects old flat URLs
//   <chapter>/index.html        chapter page
//   <chapter>/<article>.html    articles
//   assets/                     css, js, images, search index
//
// Hand-written styling and behaviour live in assets/site.css and site.js.

import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync, mkdirSync, rmdirSync, statSync } from "node:fs";
import { join, dirname, resolve, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(process.argv[2] ?? join(root, "_export"));
const extrasDir = join(root, "_extras");
const out = resolve(process.argv[3] ?? root);
const manifestFile = join(root, "_build", "manifest.json");

// Where the site is served from. GitHub Pages serves this repo at
// /MSL-Wiki/; the 404 page needs it to find its assets and to redirect old
// URLs from any depth. Change it if the site moves to a custom domain.
const siteBase = process.env.MSL_SITE_BASE ?? "/MSL-Wiki/";

// "Last updated" on the home page: the day the site was built.
const updated = process.env.MSL_UPDATED ?? new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

// Chapters are grouped into parts in the sidebar. A chapter the map doesn't
// know joins the part of the chapter before it, so a new chapter in the app
// never breaks the build.
const parts = {
  welcome: "Start", "getting-started": "Start",
  "main-window": "The app", applications: "The app", terminal: "The app",
  overview: "The app", instances: "The app", tools: "The app", sandbox: "The app",
  files: "Going further", graphics: "Going further", experiments: "Going further", power: "Going further",
  public: "Beyond one Mac", "admin-portal": "Beyond one Mac", updates: "Beyond one Mac",
  troubleshooting: "Help", cli: "Help", reference: "Help",
};

// Every chapter carries a topic colour, shared by chapters about similar
// things. The colours themselves live in site.css as --cat-<key>. A chapter
// in _extras/ names its topic in chapter.json; one nobody placed gets "other".
const topics = [
  { key: "basics", name: "Basics", about: "What MSL is, and your first steps with it.", chapters: ["welcome", "getting-started"] },
  { key: "app", name: "The app", about: "The main window and the tabs you use every day.", chapters: ["main-window", "overview"] },
  { key: "apps", name: "Linux apps & graphics", about: "Linux GUI apps as Mac windows, and how they get drawn.", chapters: ["applications", "graphics", "experiments"] },
  { key: "shell", name: "Shells & remote access", about: "Terminals, SSH, the msl command, and reaching an instance from elsewhere.", chapters: ["terminal", "public", "cli"] },
  { key: "instances", name: "Instances & files", about: "Looking after machines, moving files, and sleep and power.", chapters: ["instances", "files", "power"] },
  { key: "upkeep", name: "Upkeep", about: "Snapshots, disk checks, maintenance and updates.", chapters: ["tools", "updates"] },
  { key: "security", name: "Security & control", about: "Cutting an instance off, and locking a Mac down.", chapters: ["sandbox", "admin-portal"] },
  { key: "trouble", name: "Troubleshooting", about: "When something goes wrong: symptoms first, then fixes.", chapters: ["troubleshooting"] },
  { key: "reference", name: "Reference", about: "Every shortcut, command, file and word.", chapters: ["reference"] },
  { key: "extras", name: "Extras", about: "Chapters written for this site, beyond the guide inside the app.", chapters: [] },
];
const other = { key: "other", name: "Other", about: "", chapters: [] };
const topicOf = (chapterId, key) =>
  (key && topics.find((t) => t.key === key)) || topics.find((t) => t.chapters.includes(chapterId)) || other;

// Long chapter lists on the home page show this many, then "Show all".
const previewCount = 6;
const phonePreviewCount = 3;

// The first steps a new reader takes, shown on the home page.
const firstSteps = ["install-distro.html", "create-instance.html", "first-start.html", "first-app.html"];

// Names a chapter folder may not take, because the site already uses them.
const reserved = new Set(["assets", "index.html", "404.html"]);

// ---------------------------------------------------------------- text helpers

const one = (html, re) => (html.match(re) ?? [])[1];
const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1))
    : entities[e] ?? m);
const text = (html) => decode(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<a class="anchor"[^>]*>.*?<\/a>|<span class="callout-kind">.*?<\/span>/g, "")
  .replace(/<(br|\/p|\/li|\/h\d|\/tr|\/td|\/th|\/pre|\/dd|\/dt|\/figcaption)[^>]*>/g, " ").replace(/<[^>]+>/g, ""))
  .replace(/\s+/g, " ").trim();
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A link from one page to another, both given relative to the site root.
function link(from, to) {
  const fromDir = posix.dirname(from);
  if (fromDir === posix.dirname(to)) return posix.basename(to);
  return posix.relative(fromDir, posix.dirname(to)) + "/" + posix.basename(to);
}

// ---------------------------------------------------------------- reading

// On a phone, table rows become stacked cards. Each cell carries its column's
// heading so the card can label it; only the markup changes, never the text.
function stackTables(body) {
  return body.replace(/<table>([\s\S]*?)<\/table>/g, (whole, inner) => {
    const heads = [...inner.matchAll(/<th>([\s\S]*?)<\/th>/g)].map((h) => esc(text(h[1])));
    const rows = inner.replace(/<tbody>([\s\S]*?)<\/tbody>/, (tb, body) => "<tbody>" + body.replace(/<tr>([\s\S]*?)<\/tr>/g, (tr, cells) => {
      let i = 0;
      return "<tr>" + cells.replace(/<td>/g, () => `<td data-label="${heads[i++] ?? ""}">`) + "</tr>";
    }) + "</tbody>");
    return `<table class="stack${heads.length >= 3 ? " labelled" : ""}">${rows}</table>`;
  });
}

const headingsOf = (body) => [...body.matchAll(/<h([234]) id="([^"]+)">(.*?)<\/h\1>/g)]
  .map((h) => ({ level: +h[1], id: h[2], title: h[3].replace(/<a class="anchor".*$/, "") }));

function parseExportIndex() {
  const html = readFileSync(join(src, "index.html"), "utf8");
  const main = one(html, /<main>([\s\S]*)<\/main>/);
  const chapters = [];
  for (const m of main.matchAll(/<h2 id="([^"]+)">(.*?)<\/h2><p>(.*?)<\/p><ul>(.*?)<\/ul>/g)) {
    const articles = [...m[4].matchAll(/<li><a href="([^"]+)">(.*?)<\/a>(?: — (.*?))?<\/li>/g)]
      .map((a) => ({ file: a[1], navTitle: a[2], blurb: a[3] ?? "", source: join(src, a[1]), kind: "export" }));
    chapters.push({ id: m[1], title: m[2], blurb: m[3], articles, topic: topicOf(m[1]) });
  }
  return {
    title: one(html, /<h1>(.*?)<\/h1>/),
    summary: one(html, /<p class="summary">(.*?)<\/p>/),
    description: one(html, /<meta name="description" content="([^"]*)">/),
    chapters,
  };
}

// _extras/<chapter-id>/chapter.json plus the article files it lists. See
// _extras/README.md for the format.
function readExtras() {
  if (!existsSync(extrasDir)) return [];
  return readdirSync(extrasDir).filter((d) => !d.startsWith("_") && !d.startsWith(".") && statSync(join(extrasDir, d)).isDirectory()).map((id) => {
    const dir = join(extrasDir, id);
    const conf = JSON.parse(readFileSync(join(dir, "chapter.json"), "utf8"));
    const listed = conf.articles ?? readdirSync(dir).filter((f) => f.endsWith(".html") && !f.startsWith("_")).sort();
    const articles = listed.map((file) => {
      const html = readFileSync(join(dir, file), "utf8");
      return {
        file, source: join(dir, file), kind: "extra",
        navTitle: one(html, /<h1>([\s\S]*?)<\/h1>/)?.trim() ?? file,
        blurb: one(html, /<p class="summary">([\s\S]*?)<\/p>/)?.trim() ?? "",
      };
    });
    return { id, title: esc(conf.title ?? id), blurb: esc(conf.blurb ?? ""), articles, topic: topicOf(id, conf.topic), after: conf.after };
  });
}

function parseArticle(entry) {
  const html = readFileSync(entry.source, "utf8");
  if (entry.kind === "extra") {
    const body = html.replace(/<!--[\s\S]*?-->/g, "").replace(/^[\s\S]*?<h1>[\s\S]*?<\/h1>/, "").replace(/^\s*<p class="summary">[\s\S]*?<\/p>/, "").trim();
    const title = one(html, /<h1>([\s\S]*?)<\/h1>/)?.trim() ?? entry.file;
    const summary = one(html, /<p class="summary">([\s\S]*?)<\/p>/)?.trim() ?? "";
    return { title, summary, description: esc(text(summary)), body: stackTables(body), related: [], headings: headingsOf(body) };
  }
  const main = one(html, /<main>([\s\S]*)<\/main>/);
  let body = one(main, /<p class="summary">.*?<\/p>([\s\S]*)$/) ?? "";
  const related = one(body, /<div class="related"><h3>.*?<\/h3>([\s\S]*?)<\/div>/);
  body = body.replace(/<div class="related">[\s\S]*$/, "").replace(/<nav class="pager">[\s\S]*$/, "");
  body = stackTables(body.replace(/ style="[^"]*"/g, ""));
  return {
    title: one(main, /<h1>(.*?)<\/h1>/),
    summary: one(main, /<p class="summary">(.*?)<\/p>/) ?? "",
    description: one(html, /<meta name="description" content="([^"]*)">/) ?? "",
    body,
    related: related ? [...related.matchAll(/<a href="([^"]+)">(.*?)<\/a>/g)].map((r) => ({ href: r[1], title: r[2] })) : [],
    headings: headingsOf(body),
  };
}

// ---------------------------------------------------------------- template

const icon = {
  menu: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/></svg>',
  search: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.25"/><path d="m10.25 10.25 3.25 3.25"/></svg>',
  sun: '<svg class="i-sun" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06"/></svg>',
  moon: '<svg class="i-moon" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85Z"/></svg>',
  chevron: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>',
  arrowL: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12.5 8h-9M7 4.5 3.5 8 7 11.5"/></svg>',
  arrowR: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M9 4.5l3.5 3.5L9 11.5"/></svg>',
  home: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 7 8 2.5 13.5 7v6.5h-4v-4h-3v4h-4Z"/></svg>',
  github: '<svg viewBox="0 0 16 16" aria-hidden="true"><path class="fill" d="M8 .2a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.35c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.71 1.23 1.87.87 2.33.67.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 .2Z"/></svg>',
};

let version = "";

// Every page is rendered for one path; `L(to)` turns a root-relative path
// into a link from that page.
function pageKit(path, site) {
  const L = (to) => link(path, to);
  const rootPrefix = posix.dirname(path) === "." ? "" : "../";
  return { path, L, rootPrefix, site };
}

function head(k, title, description, extraHead = "") {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${extraHead}<title>${title}</title>
<meta name="description" content="${description}">
<meta name="color-scheme" content="light dark">
<meta name="msl-root" content="${k.rootPrefix}">
<meta name="msl-page" content="${k.path}">
<link rel="icon" type="image/png" href="${k.L("assets/favicon.png")}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..650&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap">
<link rel="stylesheet" href="${k.L("assets/site.css")}?v=${version}">
<script>document.documentElement.classList.add("js");try{var t=localStorage.getItem("msl-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}</script>
<script src="${k.L("assets/site.js")}?v=${version}" defer></script>
</head>`;
}

function topbar(k) {
  return `<a class="skip" href="#content">Skip to content</a>
<header class="topbar">
<button class="icon-btn nav-toggle" type="button" aria-label="Show chapters" aria-controls="sidebar" aria-expanded="false">${icon.menu}</button>
<a class="brand" href="${k.L("index.html")}"><img src="${k.L("assets/logo.png")}" alt="" width="22" height="22"><span>MSL Wiki</span></a>
<button class="search-trigger" type="button" aria-label="Search the guide" data-open-search>${icon.search}<span>Search ${k.site.articleCount} articles</span><kbd data-shortcut>Ctrl K</kbd></button>
<div class="topbar-end">
<a class="top-link" href="https://github.com/MilkmanAbi/MSL" aria-label="MSL on GitHub">${icon.github}<span>MSL on GitHub</span></a>
<button class="icon-btn theme-toggle" type="button" aria-label="Switch to dark theme">${icon.sun}${icon.moon}</button>
</div>
</header>`;
}

function sidebar(k) {
  const current = k.path;
  let html = `<nav class="sidebar" id="sidebar" aria-label="Chapters"><div class="side-scroll">
<a class="side-home${current === "index.html" ? " current" : ""}" href="${k.L("index.html")}"${current === "index.html" ? ' aria-current="page"' : ""}>${icon.home}<span>All chapters</span></a>`;
  let part = null;
  for (const ch of k.site.chapters) {
    if (ch.part !== part) { part = ch.part; html += `<p class="side-part">${part}</p>`; }
    const open = ch.index === current || ch.articles.some((a) => a.path === current);
    const item = (to, label, cls = "") => {
      const here = to === current;
      return `<li${cls ? ` class="${cls}"` : ""}><a href="${k.L(to)}"${here ? ' class="current" aria-current="page"' : ""}>${label}</a></li>`;
    };
    html += `<details class="chapter"${open ? " open" : ""}><summary>${icon.chevron}<span class="cat-dot t-${ch.topic.key}" aria-hidden="true"></span><span class="ch-name">${ch.title}</span><span class="ch-count">${ch.articles.length}</span></summary><ul>`;
    html += item(ch.index, "Overview", "ch-overview");
    for (const a of ch.articles) html += item(a.path, a.navTitle);
    html += `</ul></details>`;
  }
  return html + `</div></nav>`;
}

const topicChip = (t) =>
  `<button class="cat-chip t-${t.key}" type="button" data-legend="${t.key}" aria-haspopup="dialog" aria-controls="topic-key"><span class="cat-dot" aria-hidden="true"></span><span>${t.name}</span></button>`;

function legend(k) {
  const rows = topics.filter((t) => k.site.chapters.some((c) => c.topic.key === t.key)).map((t) => {
    const names = k.site.chapters.filter((c) => c.topic.key === t.key).map((c) => c.title).join(" · ");
    return `<li><a class="legend-row t-${t.key}" href="${k.L("index.html")}?topic=${t.key}#chapters" data-topic="${t.key}"><span class="cat-dot" aria-hidden="true"></span><span class="legend-text"><span class="legend-name">${t.name}</span><span class="legend-about">${t.about}</span><span class="legend-ch">${names}</span></span></a></li>`;
  }).join("");
  return `<div class="legend" id="topic-key" role="dialog" aria-label="What the colours mean" hidden><span class="beak" aria-hidden="true"></span><p class="legend-title">What the colours mean</p><p class="legend-hint">Chapters about similar things share a colour. Pick one to see only those chapters.</p><ul>${rows}</ul></div>`;
}

function footer(k) {
  const credits = k.site.byFile.get("credits.html");
  return `<footer class="site-footer"><p>Generated from the guide that ships inside MSL.${credits ? ` <a href="${k.L(credits.path)}">Credits and licences</a> ·` : ""} <a href="https://github.com/MilkmanAbi/MSL-Wiki">Source of this site</a></p></footer>`;
}

// Rewrites every internal link in exported or hand-written HTML for the
// folder layout. Links name a bare file ("tour.html"), a root-relative path
// ("welcome/tour.html"), or index.html; anything else is left for the link
// checker to report.
function relink(html, k) {
  return html.replace(/ href="([^"]+)"/g, (m, href) => {
    if (/^([a-z]+:|#|\/\/)/i.test(href)) return m;
    const [pathAndQuery, hash] = href.split("#");
    const [path, query] = pathAndQuery.split("?");
    let target = null;
    if (path === "index.html" || path === "" || path === "./") target = "index.html";
    else if (k.site.byFile.has(path)) target = k.site.byFile.get(path).path;
    else if (k.site.byPath.has(path)) target = path;
    else if (k.site.chapterById.has(path.replace(/\/(index\.html)?$/, ""))) target = k.site.chapterById.get(path.replace(/\/(index\.html)?$/, "")).index;
    if (!target) return m;
    return ` href="${k.L(target)}${query ? "?" + query : ""}${hash !== undefined ? "#" + hash : ""}"`;
  });
}

function shell(k, bodyClass, mainHTML, aside = "") {
  return `<body class="${bodyClass}">
${topbar(k)}
<div class="shell">
${sidebar(k)}
<main id="content">
${mainHTML}
${footer(k)}
</main>
${aside}
</div>
${legend(k)}
</body>
</html>
`;
}

const crumbs = (k, chapter) => chapter
  ? `<nav class="crumbs" aria-label="Breadcrumb"><a href="${k.L("index.html")}">Guide</a><span aria-hidden="true">/</span><a class="t-${chapter.topic.key}" href="${k.L(chapter.index)}"><span class="cat-dot" aria-hidden="true"></span>${chapter.title}</a></nav>`
  : `<nav class="crumbs" aria-label="Breadcrumb"><a href="${k.L("index.html")}">Guide</a></nav>`;

function articlePage(k, entry, a, prev, next) {
  const chapter = entry.chapter;
  const minutes = Math.max(1, Math.round(text(a.body).split(" ").length / 220));
  const toc = a.headings.filter((h) => h.level <= 3);
  const tocList = toc.map((h) => `<li class="l${h.level}"><a href="#${h.id}">${h.title}</a></li>`).join("");
  const tocInline = toc.length >= 3
    ? `<details class="toc-inline"><summary>${icon.chevron}On this page <span>${toc.length} sections</span></summary><ul>${tocList}</ul></details>` : "";
  const meta = [`Chapter ${chapter.number} of ${k.site.chapters.length}`, `${minutes} min read`].map((m) => `<span>${m}</span>`).join("");
  const related = a.related.length
    ? `<section class="related"><h2>See also</h2><ul>${a.related.map((r) => `<li><a href="${r.href}">${r.title}${icon.arrowR}</a></li>`).join("")}</ul></section>` : "";
  const pageLink = (p, dir) => p
    ? `<a class="pager-${dir}" href="${k.L(p.path)}" rel="${dir}"><span class="pager-label">${dir === "prev" ? icon.arrowL + "Previous" : "Next" + icon.arrowR}</span><span class="pager-title">${p.navTitle}</span><span class="pager-chapter">${p.chapter.title}</span></a>`
    : `<span></span>`;

  const main = `<article class="doc">
<header class="doc-head">
${crumbs(k, chapter)}
<h1>${a.title}</h1>
<p class="lead">${a.summary}</p>
<div class="doc-meta">${meta}${topicChip(chapter.topic)}</div>
</header>
${tocInline}
<div class="prose">
${relink(a.body, k)}
</div>
${relink(related, k)}
<nav class="pager" aria-label="Previous and next">${pageLink(prev, "prev")}${pageLink(next, "next")}</nav>
</article>`;
  const aside = `<aside class="toc" aria-label="On this page">${toc.length ? `<p class="toc-title">On this page</p><ul>${tocList}</ul><a class="toc-top" href="#content">Back to top</a>` : ""}</aside>`;
  return head(k, `${a.title} · MSL Wiki`, a.description) + "\n" + shell(k, "is-article", main, aside);
}

function chapterPage(k, ch) {
  const n = ch.articles.length;
  const rows = n
    ? `<ol class="chapter-list">${ch.articles.map((a, i) => `<li><a href="${k.L(a.path)}"><span class="cl-n">${i + 1}</span><span class="cl-text"><span class="cl-title">${a.navTitle}</span>${a.blurb ? `<span class="cl-blurb">${a.blurb}</span>` : ""}</span>${icon.arrowR}</a></li>`).join("")}</ol>`
    : `<div class="chapter-empty"><p class="cl-title">Nothing here yet</p><p>This chapter is waiting for its first article.</p></div>`;
  const i = k.site.chapters.indexOf(ch);
  const prev = k.site.chapters[i - 1], next = k.site.chapters[i + 1];
  const pageLink = (c, dir) => c
    ? `<a class="pager-${dir}" href="${k.L(c.index)}" rel="${dir}"><span class="pager-label">${dir === "prev" ? icon.arrowL + "Previous chapter" : "Next chapter" + icon.arrowR}</span><span class="pager-title">${c.title}</span><span class="pager-chapter">${c.articles.length} ${c.articles.length === 1 ? "article" : "articles"}</span></a>`
    : `<span></span>`;
  const main = `<article class="doc chapter-page t-${ch.topic.key}">
<header class="doc-head">
${crumbs(k, null)}
<p class="chapter-eyebrow"><span class="ch-num">${String(ch.number).padStart(2, "0")}</span>Chapter ${ch.number} of ${k.site.chapters.length}</p>
<h1>${ch.title}</h1>
<p class="lead">${ch.blurb}</p>
<div class="doc-meta"><span>${n} ${n === 1 ? "article" : "articles"}</span>${topicChip(ch.topic)}</div>
</header>
${rows}
<nav class="pager" aria-label="Previous and next chapter">${pageLink(prev, "prev")}${pageLink(next, "next")}</nav>
</article>`;
  return head(k, `${ch.title} · MSL Wiki`, esc(text(ch.blurb))) + "\n" + shell(k, "is-chapter", main);
}

// A quiet "Last updated" watermark in the corner of the home page, in the
// spirit of the Windows activation notice.
function watermark() {
  return `<aside class="watermark" aria-label="About this site"><p class="wm-note">Note:</p><p>Last updated ${updated},</p><p>Wiki generated from MSL Help docs.</p></aside>`;
}

function homePage(k, guide) {
  const first = firstSteps.filter((f) => k.site.byFile.has(f)).map((f, i) => {
    const a = k.site.byFile.get(f);
    return `<a class="step" href="${k.L(a.path)}"><span class="step-n">${i + 1}</span><span class="step-title">${a.navTitle}</span><span class="step-blurb">${a.blurb}</span></a>`;
  }).join("");
  const cards = k.site.chapters.map((ch) => {
    const n = ch.articles.length;
    const more = n > phonePreviewCount
      ? `<button class="more" type="button" aria-expanded="false" data-count="${n}">Show all ${n}</button>` : "";
    const list = n
      ? ch.articles.map((a, i) =>
        `<li${i >= previewCount ? ' class="p extra"' : i >= phonePreviewCount ? ' class="p"' : ""}><a href="${k.L(a.path)}" title="${esc(text(a.blurb))}">${a.navTitle}</a></li>`).join("")
      : `<li class="none">Nothing here yet</li>`;
    return `<section class="chapter-card t-${ch.topic.key}${n <= previewCount ? " few" : ""}" id="${ch.id}" data-topic="${ch.topic.key}"><header><span class="ch-num">${String(ch.number).padStart(2, "0")}</span><h3><a href="${k.L(ch.index)}">${ch.title}</a></h3><span class="ch-count">${n} ${n === 1 ? "article" : "articles"}</span></header><p>${ch.blurb}</p><ul>${list}</ul><footer>${topicChip(ch.topic)}${more}</footer></section>`;
  }).join("");
  const used = topics.filter((t) => k.site.chapters.some((c) => c.topic.key === t.key));
  const chips = `<button class="chip" type="button" data-topic="all" aria-pressed="true">All topics</button>` +
    used.map((t) => `<button class="chip t-${t.key}" type="button" data-topic="${t.key}" aria-pressed="false"><span class="cat-dot" aria-hidden="true"></span>${t.name}</button>`).join("");

  const main = `<div class="home">
<section class="hero">
<div class="hero-text">
<img class="hero-logo" src="assets/logo.png" alt="The MSL melon" width="48" height="48">
<h1>The MSL Wiki</h1>
<p class="lead">${guide.summary}</p>
<button class="hero-search" type="button" data-open-search>${icon.search}<span>Search the guide — try “ram”, “snapshot” or “ssh”</span><kbd data-shortcut>Ctrl K</kbd></button>
${watermark()}
</div>
<img class="mascot" src="assets/mascot.webp" alt="MSL's mascot, a small knight hugging a book — illustrated by neekocat_2025" width="304" height="480">
</section>
<section class="first-steps"><h2 class="part-title">First steps</h2><div class="steps">${first}</div></section>
<section class="chapters" id="chapters" aria-labelledby="chapters-title">
<div class="chapters-head"><h2 class="part-title" id="chapters-title">All ${k.site.chapters.length} chapters</h2><p class="filter-status" aria-live="polite"></p></div>
<div class="chips" role="group" aria-label="Show chapters by topic">${chips}</div>
<div class="chapter-grid">${cards}</div>
</section>
</div>`;
  return head(k, "The MSL Wiki", guide.description) + "\n" + shell(k, "is-home", main);
}

// GitHub Pages serves 404.html for any missing path, at that path. A <base>
// makes its links work from any depth, and the script sends old flat URLs
// (and articles that later move chapter) to where the article lives now.
function notFoundPage(k, guide) {
  const map = Object.fromEntries([...k.site.byFile.entries()].map(([file, a]) => [file, a.path]));
  for (const ch of k.site.chapters) map[ch.id] = ch.index;
  const redirect = `<base href="${siteBase}">
<script>(function(){var m=${JSON.stringify(map)},b=${JSON.stringify(siteBase)},p=location.pathname;if(p.slice(0,b.length)!==b)return;var r=p.slice(b.length).replace(/\\/(index\\.html)?$/,""),f=r.split("/").pop(),t=m[f];if(t&&t!==r){location.replace(b+t+location.search+location.hash)}})();</script>
`;
  const main = `<div class="lost">
<img class="mascot" src="assets/mascot.webp" alt="" width="152" height="240">
<h1>This page isn't in the guide</h1>
<p class="lead">It may have been renamed when the guide was rebuilt. Search for what you were after, or start from the list of chapters.</p>
<p class="lost-actions"><button class="btn btn-primary" type="button" data-open-search>Search the guide</button><a class="btn" href="index.html">All chapters</a></p>
</div>`;
  return head(k, "Not in the wiki · MSL Wiki", guide.description, redirect) + "\n" + shell(k, "is-home is-lost", main);
}

// ---------------------------------------------------------------- search index

// One entry per section, like the in-app search: the lead (everything above
// the first heading) and then each h2/h3 with the text under it.
function sections(entry, a) {
  const chunks = a.body.split(/(?=<h[23] id=")/);
  return chunks.map((chunk, i) => {
    const h = chunk.match(/^<h[23] id="([^"]+)">(.*?)<\/h[23]>/);
    return {
      u: entry.path + (h && i > 0 ? `#${h[1]}` : ""),
      a: decode(text(a.title)),
      h: h ? text(h[2]) : null,
      c: decode(text(entry.chapter.title)),
      x: text(h ? chunk.slice(h[0].length) : chunk) || text(a.summary),
      s: i === 0 ? text(a.summary) : "",
    };
  });
}

// ---------------------------------------------------------------- build

function writePage(path, html, written) {
  mkdirSync(dirname(join(out, path)), { recursive: true });
  writeFileSync(join(out, path), html);
  written.add(path);
}

function build() {
  const guide = parseExportIndex();

  // Chapters: the app's, then any from _extras/ placed after the chapter
  // they name (or at the end).
  const chapters = guide.chapters;
  for (const extra of readExtras()) {
    const at = chapters.findIndex((c) => c.id === extra.after);
    chapters.splice(at < 0 ? chapters.length : at + 1, 0, extra);
  }
  let part = "Guide";
  chapters.forEach((ch, i) => {
    if (reserved.has(ch.id) || ch.id.startsWith("_")) throw new Error(`chapter id "${ch.id}" can't be used as a folder name`);
    if (chapters.findIndex((c) => c.id === ch.id) !== i) throw new Error(`two chapters are called "${ch.id}"`);
    part = parts[ch.id] ?? (ch.topic.key === "extras" ? "Extras" : part);
    Object.assign(ch, { number: i + 1, part, index: `${ch.id}/index.html` });
    for (const a of ch.articles) Object.assign(a, { chapter: ch, path: `${ch.id}/${a.file}` });
  });

  const ordered = chapters.flatMap((ch) => ch.articles);
  const byFile = new Map();
  for (const a of ordered) {
    if (byFile.has(a.file)) throw new Error(`two articles are called ${a.file} (${byFile.get(a.file).path} and ${a.path}); file names must be unique so old links can find them`);
    byFile.set(a.file, a);
  }
  const exported = readdirSync(src).filter((f) => f.endsWith(".html") && f !== "index.html");
  for (const f of exported) if (!byFile.has(f)) console.warn(`warning: ${f} was exported but no chapter lists it; it is not published`);

  const site = {
    chapters, byFile,
    byPath: new Map(ordered.map((a) => [a.path, a])),
    chapterById: new Map(chapters.map((c) => [c.id, c])),
    articleCount: ordered.length,
  };

  const css = readFileSync(join(root, "assets", "site.css"));
  const js = readFileSync(join(root, "assets", "site.js"));
  version = createHash("sha1").update(css).update(js).update(String(ordered.length)).digest("hex").slice(0, 8);

  const written = new Set();
  const index = [];

  ordered.forEach((entry, i) => {
    const a = parseArticle(entry);
    writePage(entry.path, articlePage(pageKit(entry.path, site), entry, a, ordered[i - 1], ordered[i + 1]), written);
    index.push(...sections(entry, a));
  });
  for (const ch of chapters) writePage(ch.index, chapterPage(pageKit(ch.index, site), ch), written);
  writePage("index.html", homePage(pageKit("index.html", site), guide), written);
  writePage("404.html", notFoundPage(pageKit("404.html", site), guide), written);

  writeFileSync(join(root, "assets", "search-index.js"),
    `window.MSL_SEARCH=${JSON.stringify({ chapters: chapters.map((c) => ({ id: c.id, u: c.index, t: decode(text(c.title)), n: c.articles.length, k: c.topic.key })), entries: index })};\n`);

  // Remove pages an earlier build wrote that this one didn't: everything in
  // the last manifest, plus any loose .html in the root (the old flat layout).
  const previous = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : [];
  const stale = new Set([...previous, ...readdirSync(out).filter((f) => f.endsWith(".html"))]);
  for (const f of stale) {
    if (written.has(f) || !existsSync(join(out, f))) continue;
    unlinkSync(join(out, f));
    console.log(`removed stale ${f}`);
    const dir = dirname(join(out, f));
    if (dir !== out && readdirSync(dir).length === 0) rmdirSync(dir);
  }
  writeFileSync(manifestFile, JSON.stringify([...written].sort(), null, 1) + "\n");

  // Every internal link must land on a page, and on an id that exists there.
  const ids = new Map();
  for (const f of written) ids.set(f, new Set([...readFileSync(join(out, f), "utf8").matchAll(/ id="([^"]+)"/g)].map((m) => m[1])));
  const broken = [];
  let checked = 0;
  for (const f of written) {
    const html = readFileSync(join(out, f), "utf8");
    const base = f === "404.html" ? "." : posix.dirname(f); // 404 resolves against its <base>
    for (const [, href] of html.replace(/<base [^>]*>/, "").matchAll(/ (?:href|src)="([^"]+)"/g)) {
      if (/^([a-z]+:|\/\/)/i.test(href)) continue;
      checked++;
      const [pathAndQuery, hash] = href.split("#");
      const path = pathAndQuery.split("?")[0];
      const target = path ? posix.normalize(posix.join(base, path)) : f;
      if (target.startsWith("..")) { broken.push(`${f} → ${href} (outside the site)`); continue; }
      if (ids.has(target)) { if (hash && !ids.get(target).has(hash)) broken.push(`${f} → ${href} (no #${hash} there)`); }
      else if (!existsSync(join(out, target))) broken.push(`${f} → ${href}`);
    }
  }

  console.log(`${written.size} pages (${ordered.length} articles, ${chapters.length} chapter pages), ${index.length} search sections, ${checked} links checked`);
  if (broken.length) {
    console.error(`${broken.length} broken links:\n  ` + broken.join("\n  "));
    process.exit(1);
  }
}

build();
