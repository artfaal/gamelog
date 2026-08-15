#!/usr/bin/env node
// build.mjs [--drafts] — собирает dist/ из content/*.md + cache/*.json.
// Один проход, без вотчеров и инкрементальности: контента десятки записей.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync, existsSync } from "node:fs";
import matter from "gray-matter";
import { marked } from "marked";

const DRAFTS = process.argv.includes("--drafts");
const SITE = "https://games.artfaal.ru";

// ---------- утилиты ----------
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const ruDate = iso => {
  const [y, m, d] = String(iso).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const ruHours = n => {
  const m10 = n % 10, m100 = n % 100;
  const w = (m100 >= 11 && m100 <= 14) ? "часов" : m10 === 1 ? "час" : (m10 >= 2 && m10 <= 4) ? "часа" : "часов";
  return `${n} ${w}`;
};
// ||спойлер|| → кликабельный блюр (до markdown, чтобы работало в любом месте текста)
const spoilers = md => md.replace(/\|\|([^|]+)\|\|/g, '<span class="spoiler" tabindex="0">$1</span>');
const mdToHtml = md => marked.parse(spoilers(md));

// ---------- чтение записей ----------
const entries = [];
for (const f of readdirSync("content").filter(f => f.endsWith(".md"))) {
  const slug = f.replace(/\.md$/, "");
  const { data: fm, content: body } = matter(readFileSync(`content/${f}`, "utf8"));
  if (fm.draft && !DRAFTS) continue;
  // YAML отдаёт даты Date-объектом — нормализуем в ISO-строку
  if (fm.finished instanceof Date) fm.finished = fm.finished.toISOString().slice(0, 10);

  const steam = fm.steam ? JSON.parse(readFileSync(`cache/${fm.steam}.json`, "utf8")) : null;
  const media = p => {
    if (typeof p !== "number") return p;
    if (!steam) throw new Error(`content/${f}: номер скрина ${p} без поля steam`);
    return steam.shots[p];
  };

  // тело: основной текст + секция «## Моменты» (### Заголовок {spoiler} / ![alt](ref) / текст)
  const [main, momentsRaw] = body.split(/^## Моменты\s*$/m);
  const moments = [];
  if (momentsRaw) {
    for (const chunk of momentsRaw.split(/^### /m).slice(1)) {
      const [head, ...lines] = chunk.split("\n");
      const spoiler = /\{spoiler\}/.test(head);
      const title = head.replace(/\{spoiler\}/, "").trim();
      let shot = null, alt = title;
      const text = lines.join("\n").replace(/!\[([^\]]*)\]\(([^)]+)\)/, (_, a, ref) => {
        shot = media(/^\d+$/.test(ref) ? Number(ref) : ref);
        if (a) alt = a;
        return "";
      });
      moments.push({ title, spoiler, shot, alt, html: mdToHtml(text.trim()) });
    }
  }

  entries.push({
    slug,
    fm,
    steam,
    name: fm.name ?? steam?.name ?? slug,
    hero: media(fm.hero ?? steam?.hero),
    logo: fm.logo ? media(fm.logo) : steam?.logo ?? null,
    poster: fm.poster ? media(fm.poster) : steam?.poster ?? null,
    shots: (fm.shots ?? (steam ? [0, 1] : [])).map(media).filter(Boolean),
    clip: fm.clip === "none" ? null : fm.clip && fm.clip !== "store" ? fm.clip : steam?.micro ?? null,
    dropped: fm.score == null,
    html: mdToHtml(main.trim()),
    moments,
  });
}
entries.sort((a, b) => String(b.fm.finished).localeCompare(String(a.fm.finished)));

// связки заходов одной игры: общий ключ = steam appid | fm.game | slug
const gameKey = e => e.fm.steam ?? e.fm.game ?? e.slug;
for (const e of entries) {
  e.siblings = entries.filter(o => o !== e && gameKey(o) === gameKey(e));
}

// ---------- рендер ----------
const metaLine = e => {
  const parts = [ruDate(e.fm.finished)];
  parts.push(e.dropped ? `${ruHours(e.fm.hours)} · <span class="drop-tag">дропнул</span>` : `${ruHours(e.fm.hours)} в игре`);
  if (e.fm.platform) parts.push(`<span class="platform">${esc(e.fm.platform)}</span>`);
  for (const s of e.siblings) {
    const label = s.dropped
      ? `первый заход — дроп в ${String(s.fm.finished).slice(0, 4)}`
      : `${s.fm.finished > e.fm.finished ? "вернулся и прошёл" : "прошёл"} в ${String(s.fm.finished).slice(0, 4)}`;
    parts.push(`<a class="rev" href="#${s.slug}">${label} ↗</a>`);
  }
  return parts.join(" · ");
};

const clipHtml = e => e.clip
  ? `<video class="clip" src="${esc(e.clip)}" muted loop playsinline controls preload="none"
      poster="${esc(e.shots[0] ?? e.hero)}" aria-label="Видео: ${esc(e.name)}"></video>`
  : "";

const shotHtml = (e, src, alt, cls = "shot") =>
  `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" width="1920" height="1080">`;

const momentsHtml = e => e.moments.length
  ? `<div class="glass"><div class="moments"><h4 class="moments__title">Моменты</h4>${e.moments.map(m => `
      <figure class="moment${m.spoiler ? " is-spoiler" : ""}">
        ${m.shot ? shotHtml(e, m.shot, m.alt) : ""}
        <figcaption><strong>${esc(m.title)}</strong>${m.html}</figcaption>
      </figure>`).join("")}</div></div>`
  : "";

const entryHtml = (e, i) => {
  const logo = e.logo
    ? `<img class="logo" src="${esc(e.logo)}" alt="${esc(e.name)}" loading="lazy">`
    : `<h2 class="logo-text">${esc(e.name)}</h2>`;
  const score = e.dropped ? "" :
    `<span class="score" aria-label="Оценка ${e.fm.score} из 10"><span class="n">${e.fm.score}</span><span class="of">из 10</span></span>`;
  const mediaPanel = e.dropped ? "" : `
    <div class="glass glass--media">
      ${clipHtml(e)}
      ${e.shots.length ? `<div class="pair">${e.shots.slice(0, 2).map(s => shotHtml(e, s, `Кадр из ${e.name}`)).join("")}</div>` : ""}
    </div>`;
  return `
  <article class="stage" id="${esc(e.slug)}" data-nav="${i}">
    <div class="hero">
      <img class="bg" src="${esc(e.hero)}" alt="" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} width="3840" height="1240">
      ${logo}
    </div>
    <div class="body">
      <div class="glass note${e.dropped ? " is-drop" : ""}">
        ${score}
        <span class="mono meta">${metaLine(e)}</span>
        <h3 class="verdict">${esc(e.fm.verdict ?? "")}</h3>
        ${e.html}
      </div>
      ${mediaPanel}
      ${momentsHtml(e)}
    </div>
  </article>`;
};

const tocHtml = entries.map((e, i) => `
  <a href="#${esc(e.slug)}" data-nav-to="${i}">
    ${e.poster ? `<img src="${esc(e.poster)}" alt="" loading="lazy" width="600" height="900">`
               : `<img src="${esc(e.hero)}" alt="" loading="lazy" width="600" height="900">`}
    <span class="nm">${esc(e.name)}</span>
    <span class="mono">${e.dropped ? '<span class="drop-tag">дроп</span> · ' : ""}${String(e.fm.finished).slice(0, 4)}</span>
  </a>`).join("");

const games = new Set(entries.filter(e => !e.dropped).map(gameKey)).size;
const hours = entries.reduce((s, e) => s + (e.fm.hours ?? 0), 0);
const ruGames = n => {
  const m10 = n % 10, m100 = n % 100;
  return `${n} ${(m100 >= 11 && m100 <= 14) ? "игр" : m10 === 1 ? "игра" : (m10 >= 2 && m10 <= 4) ? "игры" : "игр"}`;
};

const page = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Хроника</title>
<meta name="description" content="Игровой дневник: ${ruGames(games)}, ${ruHours(hours)}.">
<meta property="og:title" content="Хроника">
<meta property="og:description" content="Игровой дневник: впечатления, кадры, воспоминания.">
${entries[0] ? `<meta property="og:image" content="${esc(entries[0].hero)}">` : ""}
<meta property="og:url" content="${SITE}/">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=IBM+Plex+Sans:wght@350;400;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
</head>
<body id="top">
<header class="site-head">
  <span class="wordmark">Хроника</span>
  <span class="mono">${ruGames(games)} · ${hours} ч</span>
</header>
<main>${entries.map(entryHtml).join("")}</main>
<footer class="site-foot">
  <p>Игры заканчиваются. Воспоминания — нет.</p>
  <span class="mono">Ассеты игр — Steam · <a href="https://artfaal.ru">artfaal</a></span>
</footer>
<button class="toc-btn" id="toc-btn" aria-haspopup="dialog">☰ оглавление</button>
<dialog class="tocd" id="tocd">
  <button class="x" id="tocd-x" aria-label="Закрыть">✕</button>
  <h4>Оглавление</h4>
  <nav class="tocd__list" id="tocd-list" aria-label="Список игр">${tocHtml}</nav>
</dialog>
<dialog class="lb" id="lb">
  <button class="x" id="lb-x" aria-label="Закрыть">✕</button>
  <img id="lb-img" alt="">
  <p class="mono cap" id="lb-cap"></p>
</dialog>
<script src="app.js"></script>
</body>
</html>
`;

// OG-стаб записи: карточка конкретной игры + мгновенный редирект в ленту
const stub = e => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${esc(e.name)} · Хроника</title>
<meta property="og:title" content="${esc(e.name)} · Хроника">
<meta property="og:description" content="${esc(e.fm.verdict ?? "")}">
<meta property="og:image" content="${esc(e.hero)}">
<meta property="og:url" content="${SITE}/e/${esc(e.slug)}/">
<meta http-equiv="refresh" content="0; url=/#${esc(e.slug)}">
<link rel="canonical" href="${SITE}/#${esc(e.slug)}">
</head>
<body><a href="/#${esc(e.slug)}">${esc(e.name)} — открыть в хронике</a></body>
</html>
`;

// ---------- запись dist ----------
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", page);
cpSync("site/styles.css", "dist/styles.css");
cpSync("site/app.js", "dist/app.js");
if (existsSync("content/media")) cpSync("content/media", "dist/media", { recursive: true });
for (const e of entries) {
  mkdirSync(`dist/e/${e.slug}`, { recursive: true });
  writeFileSync(`dist/e/${e.slug}/index.html`, stub(e));
}
console.log(`dist: ${entries.length} записей (${games} игр, ${hours} ч)${DRAFTS ? " + драфты" : ""}`);
