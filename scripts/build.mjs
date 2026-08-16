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
// оценка бывает половинной; цифры Cormorant — старого стиля (свисают ниже строки),
// поэтому запятая отдельным span'ом, её сажает на место .score .sep
const ruScore = n => String(n).replace(".", '<span class="sep">,</span>');
const ruScoreLabel = n => String(n).replace(".", ",");
// tbd — «пока неизвестно»: годится для finished, hours и score
const TBD = "tbd";
const isVideo = p => /\.(webm|mp4)$/i.test(String(p).split(/[?#]/)[0]);
// ||спойлер|| → кнопка-блюр (до markdown; содержимое скрыто от SR до раскрытия)
const spoilers = md => md.replace(/\|\|([^|]+)\|\|/g,
  '<button type="button" class="spoiler" aria-label="Спойлер — показать"><span aria-hidden="true">$1</span></button>');
const mdToHtml = md => marked.parse(spoilers(md));

// ---------- чтение и валидация записей ----------
let broken = false;
const entries = [];
for (const f of readdirSync("content").filter(f => f.endsWith(".md"))) {
  const slug = f.replace(/\.md$/, "");
  const parsed = matter(readFileSync(`content/${f}`, "utf8"));
  const { data: fm, content: body } = parsed;
  if (fm.draft && !DRAFTS) continue;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    console.error(`✗ content/${f}: имя файла не годится для слага (a-z, 0-9, дефисы)`);
    process.exit(1);
  }
  // ошибки драфта не валят сборку — драфт просто пропускается с предупреждением
  const errs = [];
  const fail = msg => errs.push(msg);

  // YAML отдаёт даты Date-объектом — нормализуем в ISO и сверяем с исходной строкой
  // (невозможную дату 2026-02-31 YAML молча превращает в 2026-03-03)
  if (fm.finished instanceof Date && !isNaN(fm.finished)) fm.finished = fm.finished.toISOString().slice(0, 10);
  const rawDate = /^finished:\s*["']?(\d{4}-\d{2}-\d{2})["']?\s*(?:#.*)?$/m.exec(parsed.matter)?.[1];
  const isoOk = d => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    const t = Date.parse(`${d}T00:00:00Z`);
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d;
  };
  if (fm.finished !== TBD && (!isoOk(String(fm.finished)) || (rawDate && rawDate !== fm.finished)))
    fail(`кривая дата finished: ${rawDate ?? fm.finished}`);
  if (fm.hours !== TBD && (!Number.isFinite(fm.hours) || fm.hours < 0))
    fail(`hours должно быть числом или tbd: ${fm.hours}`);
  if (fm.dropped !== undefined && typeof fm.dropped !== "boolean") fail(`dropped должен быть true/false: ${fm.dropped}`);
  const dropped = fm.dropped === true;
  // finished: tbd — запись «сейчас играю»: игра ещё идёт, даты финала нет
  const playing = fm.finished === TBD;
  if (dropped && playing) fail("дроп уже случился — у dropped: true нужна дата finished");
  if (dropped && fm.score != null) fail("у дропа оценки нет — убери строку score");
  if (!dropped && fm.score !== TBD && !(Number.isFinite(fm.score) && fm.score >= 1 && fm.score <= 10 && fm.score % 0.5 === 0))
    fail("нужен score 1–10 с шагом 0,5 или tbd — или dropped: true");
  if (fm.clip != null && fm.clip !== "store" && fm.clip !== "none" && !(typeof fm.clip === "string" && fm.clip.startsWith("media/")))
    fail(`clip должен быть store, none или media/…: ${fm.clip}`);
  if (fm.shots != null && !Array.isArray(fm.shots)) fail(`shots должен быть списком: ${fm.shots}`);
  if (typeof fm.verdict !== "string" || !fm.verdict.trim()) fail("нужен verdict — одна строка вердикта");

  let steam = null;
  if (fm.steam) {
    if (existsSync(`cache/${fm.steam}.json`)) steam = JSON.parse(readFileSync(`cache/${fm.steam}.json`, "utf8"));
    else fail(`нет cache/${fm.steam}.json — запусти: node scripts/new.mjs ${fm.steam}`);
  } else if (!fm.hero) fail("нужно поле steam: <appid> — или hero: media/…");

  const media = p => {
    if (typeof p === "number") {
      if (!steam || !(p in steam.shots)) { fail(`нет магазинного скрина №${p}`); return null; }
      return steam.shots[p];
    }
    const ref = String(p).replace(/^\.\//, "");
    if (/^https?:\/\//.test(ref)) return ref;
    if (!ref.startsWith("media/") || ref.includes("..")) { fail(`медиа-ссылка должна быть номером скрина, https://… или media/…: ${p}`); return null; }
    if (!existsSync(`content/${ref}`) || !statSync(`content/${ref}`).isFile())
      { fail(`нет файла content/${ref}`); return null; }
    return ref;
  };

  // тело: основной текст + секция «## Моменты» (### Заголовок {spoiler} / ![alt](ref) / текст)
  const parts = body.split(/^## Моменты\s*$/m);
  if (parts.length > 2) fail("секция «## Моменты» должна быть одна");
  const [main, momentsRaw] = parts;
  const moments = [];
  if (momentsRaw !== undefined) {
    const chunks = momentsRaw.split(/^### /m);
    if (chunks[0].trim()) fail("текст между «## Моменты» и первым «### » потеряется — убери его");
    if (chunks.length === 1) fail("секция «## Моменты» пуста — нужен хотя бы один «### Заголовок»");
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
      if (/!\[[^\]]*\]\(/.test(text)) fail(`в моменте «${title}» больше одной картинки — оставь одну`);
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
    // у дропа медиа по умолчанию нет — но заданные руками shots и clip показываются
    clip: fm.clip === "none" ? null
      : fm.clip && fm.clip !== "store" ? media(fm.clip)
      : (fm.clip === "store" || !dropped) ? steam?.micro ?? null
      : null,
    dropped,
    playing,
    html: mdToHtml(main.trim()),
    rawText: main.trim(),
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
// «сейчас играю» — наверх ленты, дальше по дате финала
entries.sort((a, b) =>
  (b.playing - a.playing) ||
  String(b.fm.finished).localeCompare(String(a.fm.finished)) || a.slug.localeCompare(b.slug));

// Steam-ассеты кэшируются локально (cache/assets, вне git) и раздаются со своего домена —
// сайт не зависит от доступности steamstatic у читателя. Сеть нужна один раз на новый ассет.
const toCopy = new Map();
async function localize(url, appid) {
  if (typeof url !== "string" || !/^https?:\/\//.test(url) || !/steamstatic\.com/.test(url)) return url;
  const base = new URL(url).pathname.split("/").pop();
  const dir = `cache/assets/${appid}`;
  const file = `${dir}/${base}`;
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    const r = await fetch(url).catch(() => null);
    if (!r?.ok) {
      console.error(`✗ не скачался ассет ${url} (${r?.status ?? "сеть"}); за прокси: NODE_USE_ENV_PROXY=1 HTTPS_PROXY=… make …`);
      process.exit(1);
    }
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  const rel = `a/${appid}/${base}`;
  toCopy.set(rel, file);
  return rel;
}
for (const e of entries) {
  const id = e.fm.steam;
  if (!id) continue;
  e.hero = await localize(e.hero, id);
  if (e.logo) e.logo = await localize(e.logo, id);
  if (e.poster) e.poster = await localize(e.poster, id);
  e.shots = await Promise.all(e.shots.map(u => localize(u, id)));
  if (e.clip) e.clip = await localize(e.clip, id);
  for (const m of e.moments) if (m.shot) m.shot = await localize(m.shot, id);
}

// связки заходов одной игры: общий ключ = steam appid | fm.game | slug
const gameKey = e => e.fm.steam ?? e.fm.game ?? e.slug;
for (const e of entries) {
  e.siblings = entries.filter(o => o !== e && gameKey(o) === gameKey(e));
}

// ---------- рендер ----------
// иконки интерфейса — svg, а не глифы: не зависят от набора символов в шрифте
const icon = (paths, cls = "") =>
  `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const I_CLOSE = icon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
const I_PREV = icon('<polyline points="15 18 9 12 15 6"/>');
const I_NEXT = icon('<polyline points="9 18 15 12 9 6"/>');
const I_SHARE = icon('<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>', "i-share");
const I_CHECK = icon('<polyline points="20 6 9 17 4 12"/>', "i-check");
// логотип Steam — simple-icons (CC0)
const I_STEAM = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"/></svg>`;

const metaLine = e => {
  const parts = [e.playing ? '<span class="now-tag">сейчас играю</span>' : ruDate(e.fm.finished)];
  // hours: tbd — часов просто нет в строке, выдумывать нечего
  const hrs = e.fm.hours === TBD ? null : ruHours(e.fm.hours);
  if (hrs) parts.push(e.dropped ? hrs : `${hrs} в игре`);
  if (e.dropped) parts.push('<span class="drop-tag">дропнул</span>');
  if (e.fm.platform) parts.push(`<span class="platform">${esc(e.fm.platform)}</span>`);
  for (const s of e.siblings) {
    const year = String(s.fm.finished).slice(0, 4);
    let label;
    if (s.playing) label = "сейчас играю";
    else if (s.dropped) label = `первый заход — дроп в ${year}`;
    else if (s.fm.finished > e.fm.finished) label = `вернулся и прошёл в ${year}`;
    else label = `прошёл в ${year}`;
    parts.push(`<a class="rev" href="#${s.slug}">${label} ↗</a>`);
  }
  const share = `<button type="button" class="share" data-slug="${esc(e.slug)}" data-name="${esc(e.name)}" aria-label="Поделиться ссылкой на запись" title="Поделиться">
    ${I_SHARE}${I_CHECK}
  </button>`;
  // есть appid — даём читателю прямой путь на страницу игры в магазине
  const store = e.fm.steam
    ? `<a class="storelink" href="https://store.steampowered.com/app/${e.fm.steam}/" target="_blank" rel="noopener"
        aria-label="Открыть ${esc(e.name)} в Steam" title="Открыть в Steam">${I_STEAM}<span>Steam</span></a>`
    : "";
  // каждый кусок меты — свой элемент строки: разделители не липнут к соседям при переносе
  return parts.join('<span class="meta__sep" aria-hidden="true">·</span>') + store + share;
};

// закрытый спойлер прячется одним inert: он же убирает содержимое из чтения скринридером
const videoHtml = (src, label, { poster = "", preload = "none", hidden = false } = {}) =>
  `<video class="clip" src="${esc(src)}" muted loop playsinline controls preload="${preload}"${poster ? ` poster="${esc(poster)}"` : ""}
      aria-label="Видео: ${esc(label)}"${hidden ? " inert" : ""}></video>`;

// кадр — кнопка: лайтбокс доступен с клавиатуры
const shotHtml = (src, alt, hidden = false) =>
  `<button type="button" class="shotbtn"${hidden ? " inert" : ""}><img class="shot" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" width="1920" height="1080"></button>`;

const momentMedia = m =>
  !m.shot ? ""
  : isVideo(m.shot)
  ? videoHtml(m.shot, m.alt, { preload: "metadata", hidden: m.spoiler })
  : shotHtml(m.shot, m.alt, m.spoiler);

const momentsHtml = e => e.moments.length
  ? `<div class="glass"><div class="moments"><h4 class="moments__title">Моменты</h4>${e.moments.map(m => `
      <figure class="moment${m.spoiler ? " is-spoiler" : ""}">
        ${m.spoiler ? '<button type="button" class="reveal" aria-label="Спойлер — показать"></button>' : ""}
        ${momentMedia(m)}
        <figcaption${m.spoiler ? " inert" : ""}><strong>${esc(m.title)}</strong>${m.html}</figcaption>
      </figure>`).join("")}</div></div>`
  : "";

const entryHtml = (e, i) => {
  const logo = e.logo
    ? `<h2 class="sr-only">${esc(e.name)}</h2><img class="logo" src="${esc(e.logo)}" alt="" loading="lazy">`
    : `<h2 class="logo-text">${esc(e.name)}</h2>`;
  const score = e.dropped ? ""
    : e.fm.score === TBD
    ? `<span class="score score--tbd" aria-label="Оценки пока нет"><span class="n">—</span><span class="of">из 10</span></span>`
    : `<span class="score" aria-label="Оценка ${ruScoreLabel(e.fm.score)} из 10"><span class="n">${ruScore(e.fm.score)}</span><span class="of">из 10</span></span>`;
  const mediaPanel = !e.clip && !e.shots.length ? "" : `
    <div class="glass glass--media">
      ${e.clip ? videoHtml(e.clip, e.name, { poster: e.shots[0] ?? e.hero }) : ""}
      ${e.shots.length ? `<div class="pair">${e.shots.slice(0, 2).map((s, n) => shotHtml(s, `Кадр ${n + 1} из ${e.name}`)).join("")}</div>` : ""}
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
  const y = e.playing ? "сейчас" : String(e.fm.finished).slice(0, 4);
  if (!byYear.has(y)) byYear.set(y, []);
  byYear.get(y).push([e, i]);
});
const tocHtml = [...byYear].map(([y, items]) => `
  <section class="tocd__year">
    <h3 class="mono">${y}</h3>
    <div class="tocd__grid">${items.map(([e, i]) => `
      <a href="#${esc(e.slug)}" data-nav-to="${i}" title="${esc(e.name)}"
         aria-label="${esc(e.name)}${e.dropped ? " (дроп)" : e.playing ? " (сейчас играю)" : ""}">
        <img src="${esc(e.poster ?? e.hero)}" alt="" width="600" height="900">
        ${e.dropped ? '<span class="tocd__tag mono">дроп</span>'
          : e.playing ? '<span class="tocd__tag mono">играю</span>' : ""}
      </a>`).join("")}</div>
  </section>`).join("");

const page = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Хроника</title>
<meta name="description" content="Игровой дневник: впечатления, кадры, воспоминания.">
<meta property="og:type" content="website">
<meta property="og:title" content="Хроника">
<meta property="og:description" content="Игровой дневник: впечатления, кадры, воспоминания.">
${entries[0] ? `<meta property="og:image" content="${esc(abs(entries[0].hero))}">
<meta property="og:image:alt" content="Обложка: ${esc(entries[0].name)}">` : ""}
<meta property="og:url" content="${SITE}/">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&amp;family=IBM+Plex+Sans:wght@350;400;600&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
</head>
<body id="top">
<header class="site-head">
  <h1 class="wordmark">Хроника</h1>
</header>
<button class="toc-btn" id="toc-btn" aria-haspopup="dialog" aria-label="Оглавление">☰<span class="toc-btn__label"> оглавление</span></button>
<button class="top-btn" id="top-btn" aria-label="Наверх">↑<span class="toc-btn__label"> наверх</span></button>
<main>${entries.map(entryHtml).join("")}</main>
<footer class="site-foot">
  <p>Игры заканчиваются. Воспоминания — нет.</p>
  <span class="mono">Ассеты игр — Steam · <a href="https://artfaal.ru">artfaal</a></span>
</footer>
<dialog class="tocd" id="tocd" aria-labelledby="tocd-title">
  <button class="x" id="tocd-x" aria-label="Закрыть">${I_CLOSE}</button>
  <h2 class="tocd__title" id="tocd-title">Оглавление</h2>
  <nav class="tocd__list" id="tocd-list" aria-label="Список игр">${tocHtml}</nav>
</dialog>
<dialog class="lb" id="lb" aria-label="Медиа записи">
  <button class="x" id="lb-x" aria-label="Закрыть">${I_CLOSE}</button>
  <div class="lb__stage" id="lb-stage" tabindex="-1" autofocus></div>
  <p class="cap"><span class="mono" id="lb-cap"></span><span class="mono lb__count" id="lb-count"></span></p>
  <button class="lb__nav lb__nav--prev" id="lb-prev" aria-label="Предыдущее медиа">${I_PREV}</button>
  <button class="lb__nav lb__nav--next" id="lb-next" aria-label="Следующее медиа">${I_NEXT}</button>
</dialog>
<script src="app.js"></script>
</body>
</html>
`;

// описание для OG-карточки: вердикт + начало текста, без спойлеров и разметки
const ogDesc = e => {
  const plain = e.rawText
    .replace(/\|\|[^|]+\|\|/g, "")                     // спойлеры не утекают в превью
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const full = `${e.fm.verdict} ${plain}`;
  if (full.length <= 500) return full;
  return full.slice(0, full.lastIndexOf(" ", 500)) + "…";
};

// OG-стаб записи: карточка конкретной игры + мгновенный редирект в ленту
const stub = e => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${esc(e.name)} · Хроника</title>
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(e.name)} · Хроника">
<meta property="og:description" content="${esc(ogDesc(e))}">
<meta property="og:image" content="${esc(abs(e.hero))}">
<meta property="og:image:alt" content="Обложка: ${esc(e.name)}">
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
for (const [rel, file] of toCopy) {
  mkdirSync(`dist/${rel.slice(0, rel.lastIndexOf("/"))}`, { recursive: true });
  cpSync(file, `dist/${rel}`);
}
console.log(`dist: ${entries.length} записей${DRAFTS ? " + драфты" : ""}`);
