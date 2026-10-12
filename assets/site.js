// MSL Guide — site behaviour: search, theme, navigation, copy buttons.
// No dependencies. Everything degrades: without this script the pages are
// still complete, linked, and readable.
(() => {
  "use strict";

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const root = document.documentElement;
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  // Pages live at the root or one chapter folder down; links in the search
  // index are root-relative, so they are prefixed with the way back to root.
  const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content;
  const ROOT = meta("msl-root") ?? "";
  const here = meta("msl-page") ?? (location.pathname.split("/").pop() || "index.html");

  // ---------------------------------------------------------------- theme

  const dark = matchMedia("(prefers-color-scheme: dark)");
  const effective = () => root.dataset.theme || (dark.matches ? "dark" : "light");
  const labelTheme = () => {
    const next = effective() === "dark" ? "light" : "dark";
    $$(".theme-toggle").forEach((b) => b.setAttribute("aria-label", `Switch to ${next} theme`));
  };
  $$(".theme-toggle").forEach((b) => b.addEventListener("click", () => {
    const next = effective() === "dark" ? "light" : "dark";
    // Choosing what the OS already says hands control back to the OS.
    if ((next === "dark") === dark.matches) { delete root.dataset.theme; store.set("msl-theme", ""); }
    else { root.dataset.theme = next; store.set("msl-theme", next); }
    labelTheme();
  }));
  dark.addEventListener("change", labelTheme);
  labelTheme();

  // ---------------------------------------------------------------- shortcuts

  $$("[data-shortcut]").forEach((k) => { k.textContent = isMac ? "⌘K" : "Ctrl K"; });

  // ---------------------------------------------------------------- sidebar

  const sidebar = $("#sidebar");
  const toggle = $(".nav-toggle");
  const setNav = (open) => {
    document.body.classList.toggle("nav-open", open);
    toggle?.setAttribute("aria-expanded", String(open));
    toggle?.setAttribute("aria-label", open ? "Hide chapters" : "Show chapters");
  };
  toggle?.addEventListener("click", () => setNav(!document.body.classList.contains("nav-open")));
  document.addEventListener("click", (e) => {
    if (document.body.classList.contains("nav-open") && !sidebar.contains(e.target) && !toggle.contains(e.target)) setNav(false);
  });

  const scroller = $(".side-scroll");
  const current = $(".chapter a.current", sidebar);
  if (scroller && current) {
    const top = current.offsetTop - scroller.clientHeight / 2 + current.offsetHeight / 2;
    scroller.scrollTop = Math.max(0, top);
  }

  // ---------------------------------------------------------------- on this page

  const tocLinks = $$(".toc a[href^='#']:not(.toc-top)");
  if (tocLinks.length) {
    const targets = tocLinks.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
    let active = null;
    const spy = () => {
      const line = innerHeight * 0.25;
      let index = 0;
      targets.forEach((t, i) => { if (t.getBoundingClientRect().top < line) index = i; });
      // At the very bottom the last short section can never reach the line.
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) index = targets.length - 1;
      const link = tocLinks[index];
      if (link !== active) {
        active?.classList.remove("active");
        link.classList.add("active");
        active = link;
        const box = link.closest(".toc");
        const r = link.getBoundingClientRect(), b = box.getBoundingClientRect();
        if (r.top < b.top + 40 || r.bottom > b.bottom - 40) box.scrollTop += r.top - b.top - b.height / 3;
      }
    };
    let queued = false;
    addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; spy(); }); } }, { passive: true });
    spy();
  }

  $$(".toc-inline a").forEach((a) => a.addEventListener("click", () => { a.closest("details").open = false; }));

  // ---------------------------------------------------------------- copy

  $$(".prose pre").forEach((pre) => {
    const host = pre.closest("figure.code") || pre;
    if (host === pre) { const wrap = document.createElement("figure"); wrap.className = "code"; pre.replaceWith(wrap); wrap.append(pre); }
    const fig = pre.closest("figure.code");
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "copy"; btn.textContent = "Copy";
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(pre.innerText.replace(/\n$/, ""));
        btn.textContent = "Copied"; btn.classList.add("done");
      } catch {
        btn.textContent = "Select and copy"; // clipboard blocked; say so rather than pretend
      }
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("done"); }, 1600);
    });
    fig.append(btn);
  });

  // ---------------------------------------------------------------- chapter tiles

  $$(".chapter-card .more").forEach((btn) => btn.addEventListener("click", () => {
    const card = btn.closest(".chapter-card");
    const open = card.classList.toggle("expanded");
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "Show fewer" : `Show all ${btn.dataset.count}`;
  }));

  // Topic filter: chips on the home page, and ?topic= from the colour key
  // on any other page.
  const grid = $(".chapter-grid");
  const chips = $$(".chips .chip");
  const status = $(".filter-status");
  function filterTopic(topic, scroll) {
    if (!grid) return;
    const cards = $$(".chapter-card", grid);
    let shown = 0;
    cards.forEach((c) => { const on = topic === "all" || c.dataset.topic === topic; c.hidden = !on; if (on) shown++; });
    chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.topic === topic)));
    if (topic === "all") status.textContent = "";
    else {
      const name = chips.find((c) => c.dataset.topic === topic)?.textContent.trim() || topic;
      status.innerHTML = `${name}: ${shown} of ${cards.length} chapters · <button type="button">Show all</button>`;
      $("button", status).addEventListener("click", () => filterTopic("all"));
    }
    const url = new URL(location.href);
    if (topic === "all") url.searchParams.delete("topic"); else url.searchParams.set("topic", topic);
    history.replaceState(null, "", url);
    if (scroll) $("#chapters").scrollIntoView({ block: "start" });
  }
  chips.forEach((c) => c.addEventListener("click", () => filterTopic(c.getAttribute("aria-pressed") === "true" && c.dataset.topic !== "all" ? "all" : c.dataset.topic)));
  const startTopic = new URLSearchParams(location.search).get("topic");
  if (startTopic && chips.some((c) => c.dataset.topic === startTopic)) filterTopic(startTopic);

  // ---------------------------------------------------------------- colour key

  const legendBox = $("#topic-key");
  let legendFor = null;
  function closeLegend() {
    if (!legendBox || legendBox.hidden) return;
    legendBox.hidden = true;
    legendFor?.setAttribute("aria-expanded", "false");
    legendFor = null;
  }
  function openLegend(btn) {
    if (legendFor === btn) { closeLegend(); return; }
    closeLegend();
    legendFor = btn;
    btn.setAttribute("aria-expanded", "true");
    $$(".legend-row", legendBox).forEach((r) => r.classList.toggle("current", r.dataset.topic === btn.dataset.legend));
    legendBox.hidden = false;
    // Below the chip if it fits, otherwise above; the beak points at the dot.
    const r = btn.getBoundingClientRect();
    const w = legendBox.offsetWidth, h = legendBox.offsetHeight;
    const left = Math.min(Math.max(8, r.left - 8), document.documentElement.clientWidth - w - 8);
    const below = r.bottom + 8 + h < innerHeight || r.top - 8 - h < 0;
    legendBox.classList.toggle("above", !below);
    legendBox.style.left = `${left + scrollX}px`;
    legendBox.style.top = `${(below ? r.bottom + 8 : r.top - 8 - h) + scrollY}px`;
    const dot = $(".cat-dot", btn).getBoundingClientRect();
    legendBox.style.setProperty("--beak-x", `${dot.left + dot.width / 2 - left}px`);
    $(".legend-row.current", legendBox)?.scrollIntoView({ block: "nearest" });
  }
  if (legendBox) {
    $$("[data-legend]").forEach((b) => {
      b.setAttribute("aria-expanded", "false");
      b.addEventListener("click", (e) => { e.stopPropagation(); openLegend(b); });
    });
    $$(".legend-row", legendBox).forEach((row) => row.addEventListener("click", (e) => {
      if (!grid) return; // other pages follow the link to the filtered home page
      e.preventDefault();
      closeLegend();
      filterTopic(row.dataset.topic, true);
    }));
    document.addEventListener("click", (e) => { if (!legendBox.contains(e.target)) closeLegend(); });
    addEventListener("resize", closeLegend);
  }

  // ---------------------------------------------------------------- recent pages

  if (document.body.classList.contains("is-article")) {
    const title = $(".doc h1")?.textContent.trim();
    const chapter = $(".crumbs a:last-child")?.textContent.trim();
    let recent = [];
    try { recent = JSON.parse(store.get("msl-recent-2") || "[]"); } catch { recent = []; }
    recent = [{ u: here, t: title, c: chapter }, ...recent.filter((r) => r.u !== here)].slice(0, 5);
    store.set("msl-recent-2", JSON.stringify(recent));
  }

  // ---------------------------------------------------------------- search
  //
  // A port of the app's own HelpSearchIndex: one entry per section, prefix
  // matching, a typo pass only when the exact pass finds nothing, synonyms
  // for the words people actually type, and at most three hits per article.

  const S = {
    stop: new Set("a an the to of and or is are in on at for with how do does can i my me it its what why when where you your be this that from into there".split(" ")),
    syn: {
      ram: ["memory"], mem: ["memory"], memory: ["ram", "balloon"], cpu: ["processor", "vcpu"], cpus: ["processor", "vcpu"],
      cores: ["processor", "vcpu"], core: ["processor", "vcpu"], vm: ["instance", "virtual machine"], vms: ["instance"],
      machine: ["instance"], container: ["instance"], box: ["instance"], distro: ["distribution"], os: ["distribution"],
      linux: ["distribution", "guest"], delete: ["remove", "trash"], uninstall: ["remove"], erase: ["remove"], destroy: ["remove"],
      fsck: ["filesystem", "check disk", "repair"], e2fsck: ["filesystem", "repair"], corrupt: ["repair", "filesystem"],
      corrupted: ["repair", "filesystem"], corruption: ["repair", "filesystem"], broken: ["repair", "troubleshooting"],
      fix: ["repair", "troubleshooting"], boot: ["start"], launch: ["open", "start"], wifi: ["network"], internet: ["network"],
      offline: ["network"], online: ["network"], firewall: ["sandbox", "network"], isolate: ["sandbox"], isolation: ["sandbox"],
      lockdown: ["sandbox", "seal"], privacy: ["sandbox"], security: ["sandbox"], freeze: ["suspend"], pause: ["suspend"],
      sleep: ["suspend", "power"], resume: ["start", "suspend"], wake: ["power", "resume"], lid: ["power", "sleep"],
      backup: ["snapshot"], backups: ["snapshot"], checkpoint: ["snapshot"], rollback: ["snapshot", "restore"], undo: ["restore", "snapshot"],
      dock: ["pin"], tile: ["dock"], spotlight: ["applications folder"], shortcut: ["keyboard", "keys"], shortcuts: ["keyboard", "keys"],
      hotkey: ["keyboard", "shortcut"], hotkeys: ["keyboard", "shortcut"], keybinding: ["keyboard", "shortcut"], finder: ["files"],
      folder: ["files"], copy: ["files", "drag"], transfer: ["files", "drag"], share: ["mnt", "home folder"], shared: ["mnt", "home folder"],
      space: ["storage", "disk"], full: ["storage", "disk"], size: ["storage", "disk"], gb: ["storage", "disk"], resize: ["storage", "disk"],
      grow: ["storage", "disk"], slow: ["memory", "performance"], lag: ["performance", "memory"], beachball: ["memory", "paging"],
      crash: ["troubleshooting"], error: ["troubleshooting"], problem: ["troubleshooting"], log: ["logs"], debug: ["logs", "troubleshooting"],
      wireshark: ["traffic monitor"], packets: ["traffic monitor"], monitor: ["traffic"], password: ["user", "first start"],
      username: ["user"], login: ["user"], sudo: ["root", "user"], clock: ["time"], time: ["clock"], date: ["clock"],
      gui: ["applications", "mslgd"], app: ["applications"], apps: ["applications"], program: ["applications"],
      window: ["applications", "mslgd"], windows: ["applications", "mslgd"], x11: ["mslgd"], xorg: ["mslgd"], xquartz: ["mslgd"],
      display: ["mslgd", "graphics"], shell: ["terminal"], console: ["terminal"], bash: ["terminal", "shell"], zsh: ["terminal", "shell"],
      cli: ["command line", "msl"], command: ["command line", "terminal"], daemon: ["mslhd", "background service"],
      service: ["mslhd"], mslhd: ["background service"], download: ["install"], setup: ["install", "first start"], new: ["create"],
      keyboard: ["shortcut", "input"], mouse: ["input"], hibernation: ["hibernate"], shutdown: ["shut down"], poweroff: ["shut down"],
      restart: ["shut down", "start"], reboot: ["shut down", "start"], package: ["package manager"], apt: ["package manager"],
      apk: ["package manager"], pacman: ["package manager"], dnf: ["package manager"], flatpak: ["source"], snap: ["snapshot", "source"],
      kaomoji: ["greeter"], cat: ["kitty", "mascot"], kitty: ["mascot"], melon: ["logo"],
    },
    fold: (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(),
    words(t) { return S.fold(t).match(/[\p{L}\p{N}]+|[⌘⇧⌥⌃]/gu) || []; },
    stem(w) {
      if (w.length <= 4 || !/^\p{L}+$/u.test(w)) return w;
      let s = w;
      if (s.endsWith("ing") && s.length >= 6) s = s.slice(0, -3);
      else if (s.endsWith("ies")) s = s.slice(0, -3) + "y";
      else if (s.endsWith("ed") && s.length >= 6) s = s.slice(0, -2);
      else if (s.endsWith("es") && /(sh|ch|ss|x)$/.test(s.slice(0, -2))) s = s.slice(0, -2);
      else if (s.endsWith("s") && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
      const last = s[s.length - 1];
      if (s.length >= 4 && s[s.length - 2] === last && !"aeioulsz".includes(last)) s = s.slice(0, -1);
      if (s.length > 4 && s.endsWith("e")) s = s.slice(0, -1);
      return s;
    },
    tokens(t) { return S.words(t).map(S.stem); },
    weight: { title: [10, 2.5], heading: [8, 8], body: [1, 1] },
    edit(a, b, limit) {
      if (Math.abs(a.length - b.length) > limit) return false;
      const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
      for (let j = 0; j <= b.length; j++) d[0][j] = j;
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
      return d[a.length][b.length] <= limit;
    },
  };

  let index = null;
  function buildIndex(data) {
    const postings = new Map();
    const entries = data.entries.map((e, n) => {
      const lead = !e.u.includes("#");
      const add = (t, field) => {
        const counts = new Map();
        for (const tok of S.tokens(t)) counts.set(tok, (counts.get(tok) || 0) + 1);
        for (const [tok, count] of counts) {
          if (!postings.has(tok)) postings.set(tok, []);
          postings.get(tok).push({ n, field, count });
        }
      };
      add(e.a, "title");
      if (e.h) add(e.h, "heading");
      add(e.x, "body");
      if (e.s) add(e.s, "body");
      return { ...e, lead, order: n, hf: S.fold(e.h || ""), tf: S.fold(e.a), xf: S.fold(e.x) };
    });
    return { entries, postings, vocab: [...postings.keys()].sort() };
  }

  function candidates(tok, fuzzy) {
    const { postings, vocab } = index;
    const found = [];
    if (postings.has(tok)) found.push([tok, 1]);
    if (tok.length >= 2) {
      let lo = 0, hi = vocab.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (vocab[mid] < tok) lo = mid + 1; else hi = mid; }
      for (let p = lo; p < vocab.length && vocab[p].startsWith(tok); p++) {
        if (vocab[p] !== tok) found.push([vocab[p], 0.5 + 0.3 * (tok.length / vocab[p].length)]);
      }
    }
    if (fuzzy && !found.length && tok.length >= 5) {
      const limit = tok.length >= 8 ? 2 : 1;
      for (const w of vocab) if (Math.abs(w.length - tok.length) <= limit && S.edit(tok, w, limit)) found.push([w, 0.45]);
    }
    return found;
  }

  function score(terms, fuzzy, requireAll) {
    const totals = new Map();
    const matched = new Map();
    for (const term of terms) {
      const variants = [{ tok: S.stem(term), w: 1, show: term }];
      for (const syn of S.syn[term] || []) for (const tok of S.tokens(syn)) variants.push({ tok, w: 0.6, show: syn });
      const best = new Map(), seen = new Map();
      for (const v of variants) {
        for (const [word, quality] of candidates(v.tok, fuzzy)) {
          for (const p of index.postings.get(word)) {
            const e = index.entries[p.n];
            const tf = 1 + Math.min(p.count - 1, 4) * 0.15;
            const value = S.weight[p.field][e.lead ? 0 : 1] * quality * v.w * tf;
            best.set(p.n, Math.max(best.get(p.n) || 0, value));
            if (!seen.has(p.n)) seen.set(p.n, []);
            seen.get(p.n).push(v.show, word);
          }
        }
      }
      for (const [n, s] of best) {
        const t = totals.get(n) || { score: 0, hl: [] };
        t.score += s; t.hl.push(...seen.get(n));
        totals.set(n, t);
        matched.set(n, (matched.get(n) || 0) + 1);
      }
    }
    if (!requireAll) { for (const t of totals.values()) t.score *= 0.5; return totals; }
    for (const n of [...totals.keys()]) if (matched.get(n) !== terms.length) totals.delete(n);
    return totals;
  }

  function search(query) {
    let words = S.words(query);
    const meaningful = words.filter((w) => !S.stop.has(w));
    const terms = [...new Set(meaningful.length ? meaningful : words)];
    if (!terms.length) return [];
    let m = score(terms, false, true);
    if (!m.size) m = score(terms, true, true);
    if (!m.size) m = score(terms, true, false);
    const phrase = S.fold(query).trim().split(/\s+/).join(" ");
    if (phrase.includes(" ")) {
      for (const [n, t] of m) {
        const e = index.entries[n];
        if (e.hf.includes(phrase)) t.score += 12;
        if (e.lead && e.tf.includes(phrase)) t.score += 12;
        if (e.xf.includes(phrase)) t.score += 4;
      }
    }
    const ranked = [...m].sort((a, b) => b[1].score - a[1].score || a[0] - b[0]);
    const per = new Map(), out = [];
    for (const [n, t] of ranked) {
      const e = index.entries[n];
      const article = e.u.split("#")[0];
      if ((per.get(article) || 0) >= 3) continue;
      per.set(article, (per.get(article) || 0) + 1);
      out.push({ e, hl: [...new Set(t.hl)] });
      if (out.length === 40) break;
    }
    return out;
  }

  const escapeHTML = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function highlight(textIn, terms) {
    const pats = terms.filter((t) => t && t.length > 1).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!pats.length) return escapeHTML(textIn);
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${pats.join("|")})`, "giu");
    let outS = "", last = 0;
    for (const mm of textIn.matchAll(re)) {
      const start = mm.index + mm[1].length;
      // Extend to the end of the word so "snap" lights up "snapshots".
      let end = start + mm[2].length;
      while (end < textIn.length && /[\p{L}\p{N}]/u.test(textIn[end])) end++;
      outS += escapeHTML(textIn.slice(last, start)) + "<mark>" + escapeHTML(textIn.slice(start, end)) + "</mark>";
      last = end;
    }
    return outS + escapeHTML(textIn.slice(last));
  }
  function snippet(textIn, terms, radius = 90) {
    const f = S.fold(textIn);
    let hit = -1, len = 0;
    for (const t of terms) {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${S.fold(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u");
      const mm = re.exec(f);
      if (mm && (hit < 0 || mm.index + mm[1].length < hit)) { hit = mm.index + mm[1].length; len = t.length; }
    }
    if (hit < 0) return textIn.length > radius * 2 ? textIn.slice(0, radius * 2).trim() + "…" : textIn;
    let start = hit, end = hit + len, steps = 0;
    while (start > 0 && steps++ < radius && !".!?".includes(textIn[start - 1])) start--;
    steps = 0;
    while (end < textIn.length && steps++ < radius) { if (".!?".includes(textIn[end++])) break; }
    let s = textIn.slice(start, end).trim();
    if (start > 0 && !".!?".includes(textIn[start - 1])) s = "…" + s;
    if (end < textIn.length && !".!?".includes(s[s.length - 1])) s += "…";
    return s;
  }

  const ICON_DOC = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.75h5.5L12.5 4.75v9.5h-8.5Z"/><path d="M9.25 1.75v3.25h3.25M6.25 8.25h4M6.25 10.75h4"/></svg>';
  const ICON_HASH = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.25 2.5 5 13.5M11 2.5 9.75 13.5M2.75 5.75h11M2.25 10.25h11"/></svg>';
  const ICON_CLOCK = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25"/><path d="M8 4.75V8l2.25 1.5"/></svg>';
  const ICON_SEARCH = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.25"/><path d="m10.25 10.25 3.25 3.25"/></svg>';

  let palette, input, list, countEl, items = [], activeIndex = 0, lastFocus = null;

  function loadIndex() {
    if (index) return Promise.resolve();
    if (window.MSL_SEARCH) { index = buildIndex(window.MSL_SEARCH); return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = $("script[src*='assets/site.js']").src.replace("site.js", "search-index.js");
      s.onload = () => { index = buildIndex(window.MSL_SEARCH); resolve(); };
      s.onerror = reject;
      document.head.append(s);
    });
  }

  function makePalette() {
    palette = document.createElement("div");
    palette.className = "palette";
    palette.hidden = true;
    palette.innerHTML = `<div class="palette-scrim"></div>
<div class="palette-box" role="dialog" aria-modal="true" aria-label="Search the guide">
<label class="palette-field">${ICON_SEARCH}<input type="search" placeholder="Search the guide" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="palette-results" aria-autocomplete="list"><kbd title="Close">esc</kbd></label>
<div class="palette-results" id="palette-results" role="listbox"></div>
<div class="palette-foot"><span class="hint"><kbd>↑</kbd><kbd>↓</kbd>to move</span><span class="hint"><kbd>↵</kbd>to open</span><span class="hint"><kbd>esc</kbd>to close</span><span class="count"></span></div>
</div>`;
    document.body.append(palette);
    input = $("input", palette);
    list = $(".palette-results", palette);
    countEl = $(".count", palette);
    $(".palette-scrim", palette).addEventListener("click", closePalette);
    $(".palette-field kbd", palette).addEventListener("click", closePalette);
    input.addEventListener("input", render);
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIndex + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIndex - 1); }
      else if (e.key === "Enter") { e.preventDefault(); const a = items[activeIndex]; if (a) go(a, e); }
    });
    list.addEventListener("mousemove", (e) => {
      const a = e.target.closest(".result");
      if (a) setActive(items.indexOf(a), false);
    });
  }

  function go(a, e) {
    if (e && (e.metaKey || e.ctrlKey)) { open(a.href, "_blank"); return; }
    closePalette();
    location.href = a.href;
  }

  function setActive(i, scroll = true) {
    if (!items.length) return;
    activeIndex = (i + items.length) % items.length;
    items.forEach((el, n) => { el.classList.toggle("active", n === activeIndex); el.setAttribute("aria-selected", String(n === activeIndex)); });
    input.setAttribute("aria-activedescendant", items[activeIndex].id);
    if (scroll) items[activeIndex].scrollIntoView({ block: "nearest" });
  }

  const topicOf = (chapterTitle) => window.MSL_SEARCH.chapters.find((c) => c.t === chapterTitle)?.k;
  function row(href, iconSvg, titleHTML, path, snip, n, topic = topicOf(path)) {
    const dot = topic ? `<span class="cat-dot t-${topic}" aria-hidden="true"></span>` : "";
    return `<a class="result" id="r${n}" role="option" href="${ROOT}${href}">${iconSvg}<span class="result-title">${titleHTML}</span>${path ? `<span class="result-path">${dot}${escapeHTML(path)}</span>` : ""}${snip ? `<span class="result-snippet">${snip}</span>` : ""}</a>`;
  }

  function render() {
    const q = input.value.trim();
    let html = "";
    let n = 0;
    if (!q) {
      let recent = [];
      try { recent = JSON.parse(store.get("msl-recent-2") || "[]"); } catch { recent = []; }
      recent = recent.filter((r) => r.u !== here && r.t);
      if (recent.length) {
        html += `<p class="palette-group">Recently read</p>`;
        html += recent.map((r) => row(r.u, ICON_CLOCK, escapeHTML(r.t), r.c, "", n++)).join("");
      }
      html += `<p class="palette-group">Chapters</p>`;
      html += window.MSL_SEARCH.chapters.map((c) => row(c.u, ICON_DOC, escapeHTML(c.t), `${c.n} ${c.n === 1 ? "article" : "articles"}`, "", n++, c.k)).join("");
      countEl.textContent = "";
    } else {
      const results = search(q);
      if (!results.length) {
        html = `<div class="palette-empty"><p>Nothing in the guide matches “${escapeHTML(q)}”.</p><p>Try fewer words, or the word MSL uses — “instance” rather than “VM”.</p></div>`;
      } else {
        html = results.map(({ e, hl }) => {
          const title = e.h ? `${highlight(e.a, hl)}<span class="sep">›</span>${highlight(e.h, hl)}` : highlight(e.a, hl);
          return row(e.u, e.h ? ICON_HASH : ICON_DOC, title, e.c, highlight(snippet(e.x || e.s, hl), hl), n++);
        }).join("");
      }
      countEl.textContent = results.length ? `${results.length}${results.length === 40 ? "+" : ""} ${results.length === 1 ? "result" : "results"}` : "";
    }
    list.innerHTML = html;
    items = $$(".result", list);
    activeIndex = 0;
    setActive(0);
    list.scrollTop = 0;
  }

  async function openPalette() {
    if (!palette) makePalette();
    setNav(false);
    lastFocus = document.activeElement;
    palette.hidden = false;
    document.body.style.overflow = "hidden";
    input.focus();
    input.select();
    try {
      await loadIndex();
      render();
    } catch {
      list.innerHTML = `<div class="palette-empty"><p>The search index didn't load.</p><p>Every article is still one click away in the chapter list.</p></div>`;
    }
  }
  function closePalette() {
    if (!palette || palette.hidden) return;
    palette.hidden = true;
    document.body.style.overflow = "";
    lastFocus?.focus?.();
  }

  $$("[data-open-search]").forEach((b) => b.addEventListener("click", openPalette));
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); palette && !palette.hidden ? closePalette() : openPalette(); }
    else if (e.key === "/" && !typing) { e.preventDefault(); openPalette(); }
    else if (e.key === "Escape") { if (palette && !palette.hidden) closePalette(); else if (legendFor) { const b = legendFor; closeLegend(); b.focus(); } else setNav(false); }
    else if (e.key === "Tab" && palette && !palette.hidden) { e.preventDefault(); input.focus(); }
  });
  // Warm the index once the page is idle, so the first search is instant.
  const warm = () => loadIndex().catch(() => {});
  if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 4000 }); else setTimeout(warm, 1500);
})();
