#!/usr/bin/env node
// build.mjs [--drafts] — собирает dist/ из content/*.md + cache/*.json.
// Один проход, без вотчеров и инкрементальности: контента десятки записей.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync, existsSync, statSync } from "node:fs";
import matter from "gray-matter";
import { marked } from "marked";

const DRAFTS = process.argv.includes("--drafts");
const SITE = "https://games.artfaal.ru";

// ---------- утилиты ----------
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const abs = u => new URL(u, SITE + "/").href;
const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const ruDate = iso => {
  const [y, m, d] = String(iso).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  return `${n} ${(m100 >= 11 && m100 <= 14) ? many : m10 === 1 ? one : (m10 >= 2 && m10 <= 4) ? few : many}`;
};
const ruHours = n => plural(n, "час", "часа", "часов");
const ruGames = n => plural(n, "игра", "игры", "игр");
// ||спойлер|| → кнопка-блюр (до markdown; содержимое скрыто от SR до раскрытия)
const spoilers = md => md.replace(/\|\|([^|]+)\|\|/g,
  '<button type="button" class="spoiler" aria-expanded="false" aria-label="Спойлер — показать"><span aria-hidden="true">$1</span></button>');
const mdToHtml = md => marked.parse(spoilers(md));

// ---------- чтение и валидация записей ----------
let broken = false;
const entries = [];
for (const f of readdirSync("content").filter(f => f.endsWith(".md"))) {
  const slug = f.replace(/\.md$/, "");
  const parsed = matter(readFileSync(`content/${f}`, "utf8"));
  const { data: fm, content: body } = parsed;
  if (fm.draft && !DRAFTS) continue;
  // ошибки драфта не валят сборку — драфт просто пропускается с предупреждением
  const errs = [];
  const fail = (_f, msg) => errs.push(msg);

  // YAML отдаёт даты Date-объектом — нормализуем в ISO и сверяем с исходной строкой
  // (невозможную дату 2026-02-31 YAML молча превращает в 2026-03-03)
  if (fm.finished instanceof Date && !isNaN(fm.finished)) fm.finished = fm.finished.toISOString().slice(0, 10);
  const rawDate = /^finished:\s*["']?(\d{4}-\d{2}-\d{2})["']?\s*(?:#.*)?$/m.exec(parsed.matter)?.[1];
  const isoOk = d => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    const t = Date.parse(`${d}T00:00:00Z`);
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d;
  };
  if (!isoOk(String(fm.finished)) || (rawDate && rawDate !== fm.finished))
    fail(f, `кривая дата finished: ${rawDate ?? fm.finished}`);
  if (!Number.isFinite(fm.hours) || fm.hours < 0) fail(f, `hours должно быть числом: ${fm.hours}`);
  if (fm.dropped !== undefined && typeof fm.dropped !== "boolean") fail(f, `dropped должен быть true/false: ${fm.dropped}`);
  const dropped = fm.dropped === true;
  if (dropped && fm.score != null) fail(f, "dropped: true несовместим со score");
  if (!dropped && !(Number.isInteger(fm.score) && fm.score >= 1 && fm.score <= 10))
    fail(f, "нужен score 1–10 — или dropped: true");
  if (fm.clip != null && fm.clip !== "store" && fm.clip !== "none" && !(typeof fm.clip === "string" && fm.clip.startsWith("media/")))
    fail(f, `clip должен быть store, none или media/…: ${fm.clip}`);
  if (fm.shots != null && !Array.isArray(fm.shots)) fail(f, `shots должен быть списком: ${fm.shots}`);

  let steam = null;
  if (fm.steam) {
    if (existsSync(`cache/${fm.steam}.json`)) steam = JSON.parse(readFileSync(`cache/${fm.steam}.json`, "utf8"));
    else fail(f, `нет cache/${fm.steam}.json — запусти: node scripts/new.mjs ${fm.steam}`);
  } else if (!fm.hero) fail(f, "нужно поле steam: <appid> — или hero: media/…");

  const media = p => {
    if (typeof p === "number") {
      if (!steam || !(p in steam.shots)) { fail(f, `нет магазинного скрина №${p}`); return null; }
      return steam.shots[p];
    }
    const ref = String(p).replace(/^\.\//, "");
    if (/^https?:\/\//.test(ref)) return ref;
    if (!ref.startsWith("media/")) { fail(f, `медиа-ссылка должна быть номером скрина, https://… или media/…: ${p}`); return null; }
    if (!existsSync(`content/${ref}`) || !statSync(`content/${ref}`).isFile())
      { fail(f, `нет файла content/${ref}`); return null; }
    return ref;
  };

  // тело: основной текст + секция «## Моменты» (### Заголовок {spoiler} / ![alt](ref) / текст)
  const parts = body.split(/^## Моменты\s*$/m);
  if (parts.length > 2) fail(f, "секция «## Моменты» должна быть одна");
  const [main, momentsRaw] = parts;
  const moments = [];
  if (momentsRaw !== undefined) {
    const chunks = momentsRaw.split(/^### /m);
    if (chunks[0].trim()) fail(f, "текст между «## Моменты» и первым «### » потеряется — убери его");
    if (chunks.length === 1) fail(f, "секция «## Моменты» пуста — нужен хотя бы один «### Заголовок»");
    for (const chunk of chunks.slice(1)) {
      const [head, ...lines] = chunk.split("\n");
      const spoiler = /\{spoiler\}/.test(head);
      const title = head.replace(/\{spoiler\}/, "").trim();
      let shot = null, alt = title;
      const text = lines.join("\n").replace(/!\[([^\]]*)\]\(([^)]+)\)/, (_, a, ref) => {
        shot = media(/^\d+$/.test(ref) ? Number(ref) : ref);
        if (a) alt = a;
        return "";
      });
      if (/!\[[^\]]*\]\(/.test(text)) fail(f, `в моменте «${title}» больше одной картинки — оставь одну`);
      moments.push({ title, spoiler, shot, alt, html: mdToHtml(text.trim()) });
    }
  }

  entries.push({
    slug,
    fm,
    steam,
    name: fm.name ?? steam?.name ?? slug,
    hero: media(fm.hero ?? steam?.hero),
    logo: fm.logo != null ? media(fm.logo) : steam?.logo ?? null,
    poster: fm.poster != null ? media(fm.poster) : steam?.poster ?? null,
    shots: ((Array.isArray(fm.shots) ? fm.shots : null) ?? (steam && !dropped ? steam.shots.slice(0, 2) : [])).map(media).filter(Boolean),
    clip: fm.clip === "none" ? null : fm.clip && fm.clip !== "store" ? media(fm.clip) : steam?.micro ?? null,
    dropped,
    html: mdToHtml(main.trim()),
    moments,
  });
  if (errs.length) {
    entries.pop();
    const tag = fm.draft ? "⚠ (драфт пропущен)" : "✗";
    for (const m of errs) console.error(`${tag} content/${f}: ${m}`);
    if (!fm.draft) broken = true;
  }
}

if (broken) { console.error("сборка остановлена — исправь контент"); process.exit(1); }
if (!DRAFTS && entries.length === 0) {
  console.error("прод-сборка пуста: ни одной записи без draft — deploy отменён");
  process.exit(1);
}
entries.sort((a, b) =>
  String(b.fm.finished).localeCompare(String(a.fm.finished)) || a.slug.localeCompare(b.slug));

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

// кадр — кнопка: лайтбокс доступен с клавиатуры
const shotHtml = (src, alt, hidden = false) =>
  `<button type="button" class="shotbtn"${hidden ? " inert" : ""}><img class="shot" src="${esc(src)}" alt="${esc(alt)}"${hidden ? ' aria-hidden="true"' : ""} loading="lazy" width="1920" height="1080"></button>`;

const momentsHtml = e => e.moments.length
  ? `<div class="glass"><div class="moments"><h4 class="moments__title">Моменты</h4>${e.moments.map(m => `
      <figure class="moment${m.spoiler ? " is-spoiler" : ""}">
        ${m.spoiler ? '<button type="button" class="reveal" aria-label="Спойлер — показать"></button>' : ""}
        ${m.shot ? shotHtml(m.shot, m.alt, m.spoiler) : ""}
        <figcaption${m.spoiler ? ' aria-hidden="true" inert' : ""}><strong>${esc(m.title)}</strong>${m.html}</figcaption>
      </figure>`).join("")}</div></div>`
  : "";

const entryHtml = (e, i) => {
  const logo = e.logo
    ? `<h2 class="sr-only">${esc(e.name)}</h2><img class="logo" src="${esc(e.logo)}" alt="" loading="lazy">`
    : `<h2 class="logo-text">${esc(e.name)}</h2>`;
  const score = e.dropped ? "" :
    `<span class="score" aria-label="Оценка ${e.fm.score} из 10"><span class="n">${e.fm.score}</span><span class="of">из 10</span></span>`;
  const mediaPanel = e.dropped || (!e.clip && !e.shots.length) ? "" : `
    <div class="glass glass--media">
      ${clipHtml(e)}
      ${e.shots.length ? `<div class="pair">${e.shots.slice(0, 2).map(s => shotHtml(s, `Кадр из ${e.name}`)).join("")}</div>` : ""}
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

// оглавление: год-группы с сеткой постеров — масштабируется на десятки игр
const byYear = new Map();
entries.forEach((e, i) => {
  const y = String(e.fm.finished).slice(0, 4);
  if (!byYear.has(y)) byYear.set(y, []);
  byYear.get(y).push([e, i]);
});
const tocHtml = [...byYear].map(([y, items]) => `
  <section class="tocd__year">
    <h5 class="mono">${y}</h5>
    <div class="tocd__grid">${items.map(([e, i]) => `
      <a href="#${esc(e.slug)}" data-nav-to="${i}" title="${esc(e.name)}"
         aria-label="${esc(e.name)}${e.dropped ? " (дроп)" : ""}">
        <img src="${esc(e.poster ?? e.hero)}" alt="" width="600" height="900">
        ${e.dropped ? '<span class="tocd__drop mono">дроп</span>' : ""}
      </a>`).join("")}</div>
  </section>`).join("");

const games = new Set(entries.filter(e => !e.dropped).map(gameKey)).size;
// ponytail: часы суммируются по всем заходам, включая дропы — это «наиграно всего»
const hours = entries.reduce((s, e) => s + (e.fm.hours ?? 0), 0);

const page = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Хроника</title>
<meta name="description" content="Игровой дневник: ${ruGames(games)}, ${ruHours(hours)}.">
<meta property="og:title" content="Хроника">
<meta property="og:description" content="Игровой дневник: впечатления, кадры, воспоминания.">
${entries[0] ? `<meta property="og:image" content="${esc(abs(entries[0].hero))}">` : ""}
<meta property="og:url" content="${SITE}/">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=IBM+Plex+Sans:wght@350;400;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
</head>
<body id="top">
<header class="site-head">
  <h1 class="wordmark">Хроника</h1>
  <span class="mono">${ruGames(games)} · ${hours} ч</span>
</header>
<button class="toc-btn" id="toc-btn" aria-haspopup="dialog">☰ оглавление</button>
<main>${entries.map(entryHtml).join("")}</main>
<footer class="site-foot">
  <p>Игры заканчиваются. Воспоминания — нет.</p>
  <span class="mono">Ассеты игр — Steam · <a href="https://artfaal.ru">artfaal</a></span>
</footer>
<dialog class="tocd" id="tocd" aria-labelledby="tocd-title">
  <button class="x" id="tocd-x" aria-label="Закрыть">✕</button>
  <h4 id="tocd-title">Оглавление</h4>
  <nav class="tocd__list" id="tocd-list" aria-label="Список игр">${tocHtml}</nav>
</dialog>
<dialog class="lb" id="lb" aria-label="Кадр во весь экран">
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
<meta property="og:image" content="${esc(abs(e.hero))}">
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
console.log(`dist: ${entries.length} записей (${ruGames(games)}, ${hours} ч)${DRAFTS ? " + драфты" : ""}`);
