#!/usr/bin/env node
// build.mjs [--drafts] — собирает dist/ из content/*.md + cache/*.json.
// Один проход, без вотчеров и инкрементальности: контента десятки записей.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync, existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import matter from "gray-matter";
import { marked } from "marked";
import { LIMITS } from "./video-policy.mjs";
import { posterSmallOf } from "./steam-app.mjs";
import { imageSize } from "./image-size.mjs";
import { gameKey, firstRun, siblingLabel } from "./siblings.mjs";
import { ruHours, ruGames, ruScore } from "./ru.mjs";

const DRAFTS = process.argv.includes("--drafts");
const SITE = "https://games.artfaal.ru";

// ---------- утилиты ----------
// `>` экранируется наравне с остальными: в HTML он был не обязателен, но тем же esc
// собирается feed.xml, а в XML последовательность `]]>` в тексте запрещена — вердикт
// с ней ронял бы фид молча (в ленте на вид всё цело). В атрибутах и тексте `&gt;`
// браузер разбирает обратно в `>`, так что разметка от этого не меняется
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const abs = u => new URL(u, SITE + "/").href;
const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const ruDate = iso => {
  const [y, m, d] = String(iso).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
// tbd — «пока неизвестно»: годится для finished, hours и score
const TBD = "tbd";
// Steam кладёт в жанры и то, что жанром не является: «Early Access» — стадия
// релиза, а в ряду жанровых чипов на полке она стоит наравне с RPG и Roguelike.
// Режем на потреблении, а не в new.mjs: кэши уже записаны, а повторный запуск
// new.mjs на существующую игру запрещён — он переставит нумерацию shots.
// Руками заданные fm.genres не трогаем: там автор пишет осознанно.
const GENRE_STOP = new Set(["Early Access"]);
// узкий экран: обои переключаются с широкого hero на вертикальный постер.
// Значение дублируется в @media site/styles.css — менять обязательно парой.
const NARROW = "(max-width: 48rem)";
// mp4 и webm — те же два формата, что знают политика клипов (scripts/video.mjs),
// .gitignore и README. Третий формат добавляется сразу во всех четырёх местах, иначе
// он разрешён сборкой, но обходит проверку веса и может уехать в git
const VIDEO_EXT = /\.(webm|mp4)$/i;
// у внешней ссылки расширение прячется за ?query и #fragment, у локального файла
// решётка — часть имени: «probe#1.mp4» иначе переставал быть видео
const isVideo = p => VIDEO_EXT.test(/^https?:\/\//.test(String(p)) ? String(p).split(/[?#]/)[0] : String(p));
// ||спойлер|| → кнопка-блюр (до markdown; содержимое скрыто от SR до раскрытия)
const spoilers = md => md.replace(/\|\|([^|]+)\|\|/g,
  '<button type="button" class="spoiler" aria-label="Спойлер — показать"><span aria-hidden="true">$1</span></button>');
// адрес медиа в разметке: имя файла кодируется посегментно. Без этого «probe#1.jpg»
// уезжал в src как есть, и браузер просил «media/probe», считая остаток фрагментом, —
// файл на сервере лежал, а кадр не показывался. Внешние ссылки не трогаем: они уже URL
const mediaUrl = p => /^https?:\/\//.test(p) ? p : String(p).split("/").map(encodeURIComponent).join("/");

// картинка, написанная прямо в тексте записи, проходит мимо наших помощников — адрес
// ей кодирует рендерер marked, иначе тот же «probe#1.jpg» давал 404 в прозе
marked.use({ renderer: {
  image({ href, title, text }) {
    const attrs = [`src="${esc(mediaUrl(href))}"`, `alt="${esc(text ?? "")}"`];
    if (title) attrs.push(`title="${esc(title)}"`);
    return `<img ${attrs.join(" ")}>`;
  },
} });
const mdToHtml = md => marked.parse(spoilers(md));
// текст записи без разметки и без спойлеров: OG-описание и индекс поиска на полке.
// Спойлер вычёркивается вместе с содержимым — из-под блюра ничто не находится
const plain = md => String(md)
  .replace(/\|\|[^|]+\|\|/g, "")
  .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
  .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/[*_`#>]/g, "")
  .replace(/\s+/g, " ")
  .trim();

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
  if (fm.paused !== undefined && typeof fm.paused !== "boolean") fail(`paused должен быть true/false: ${fm.paused}`);
  // paused: true — «отложил»: заход закончился, игра — нет. Без этого поля такая запись
  // числилась бы пройденной: «пройдено» — это всё, что не дроп и не «сейчас играю»
  const paused = fm.paused === true;
  if (dropped && playing) fail("дроп уже случился — у dropped: true нужна дата finished");
  if (paused && dropped) fail("отложенная игра не брошена — paused: true и dropped: true вместе не бывают");
  if (paused && playing) fail("«отложил» — это не «сейчас играю»: у paused: true нужна дата последнего захода");
  if (dropped && fm.score != null) fail("у дропа оценки нет — убери строку score");
  if (!dropped && fm.score !== TBD && !(Number.isFinite(fm.score) && fm.score >= 1 && fm.score <= 10 && fm.score % 0.5 === 0))
    fail("нужен score 1–10 с шагом 0,5 или tbd — или dropped: true");
  if (fm.clip != null && fm.clip !== "store" && fm.clip !== "none" && !(typeof fm.clip === "string" && fm.clip.startsWith("media/")))
    fail(`clip должен быть store, none или media/…: ${fm.clip}`);
  if (fm.shots != null && !Array.isArray(fm.shots)) fail(`shots должен быть списком: ${fm.shots}`);
  if (fm.focus != null && !(Number.isFinite(fm.focus) && fm.focus >= 0 && fm.focus <= 100))
    fail(`focus — число 0–100, процент по горизонтали: ${fm.focus}`);
  if (typeof fm.verdict !== "string" || !fm.verdict.trim()) fail("нужен verdict — одна строка вердикта");
  // name необязателен (имя приезжает из кэша Steam), но пустая строка побеждает фолбэк
  // fm.name ?? steam?.name ?? slug и протекает пустотой в заголовок, alt, title и фид
  if (fm.name !== undefined && (typeof fm.name !== "string" || !fm.name.trim()))
    fail("пустой name — либо строка с именем, либо поля нет");
  if (fm.genres != null && !(Array.isArray(fm.genres) && fm.genres.every(g => typeof g === "string" && g.trim())))
    fail(`genres должен быть списком строк: ${fm.genres}`);

  let steam = null;
  if (fm.steam) {
    if (existsSync(`cache/${fm.steam}.json`)) steam = JSON.parse(readFileSync(`cache/${fm.steam}.json`, "utf8"));
    else fail(`нет cache/${fm.steam}.json — запусти: node scripts/new.mjs ${fm.steam}`);
  } else if (!fm.hero) fail("нужно поле steam: <appid> — или hero: media/…");

  // расширение решает, чем ссылка станет в разметке: клип — <video>, кадр — <img>.
  // Проверка живёт внутри media(), потому что сюда сходится всё — clip, shots, hero,
  // logo, poster, кадры моментов — и уже после нормализации «./media/…»: снаружи её
  // обходила любая запись пути, кроме буквального «media/…»
  const KIND = {
    clip: { want: true, msg: "clip должен быть видео" },
    shot: { want: false, msg: "кадр должен быть картинкой, а не видео" },
    art: { want: false, msg: "обложка должна быть картинкой, а не видео" },
  };

  const media = (p, kind = null) => {
    if (typeof p === "number") {
      if (!steam || !(p in steam.shots)) { fail(`нет магазинного скрина №${p}`); return null; }
      return steam.shots[p];
    }
    const ref = String(p).replace(/^\.\//, "");
    const check = url => {
      const rule = kind && KIND[kind];
      if (rule && isVideo(url) !== rule.want) fail(`${rule.msg}: ${ref}`);
      return url;
    };
    if (/^https?:\/\//.test(ref)) return check(ref);
    if (!ref.startsWith("media/") || ref.includes("..")) { fail(`медиа-ссылка должна быть номером скрина, https://… или media/…: ${p}`); return null; }
    if (!existsSync(`content/${ref}`) || !statSync(`content/${ref}`).isFile())
      { fail(`нет файла content/${ref}`); return null; }
    return check(ref);
  };

  // тело: основной текст + секция «## Моменты» (### Заголовок {spoiler} / ![alt](ref) / текст)
  const parts = body.split(/^## Моменты\s*$/m);
  if (parts.length > 2) fail("секция «## Моменты» должна быть одна");
  const [main, momentsRaw] = parts;
  const moments = [];
  // корпус для поиска: основной текст + моменты. Момент под спойлером не индексируется
  // целиком — заголовок у него тоже закрыт блюром
  const momentText = [];
  // объём текста моментов — слагаемое заглушки высоты записи (stageVars ниже)
  let momentChars = 0;
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
      momentChars += title.length + text.trim().length;
      if (!spoiler) momentText.push(title, text.trim());
    }
  }

  entries.push({
    slug,
    fm,
    steam,
    name: fm.name ?? steam?.name ?? slug,
    hero: media(fm.hero ?? steam?.hero, "art"),
    // none — у части игр логотипа и постера в Steam нет (404): имя рисуется
    // текстом, на полку идёт кроп hero
    logo: fm.logo === "none" ? null : fm.logo != null && fm.logo !== "dark" ? media(fm.logo, "art") : steam?.logo ?? null,
    // dark — не путь, а признак вида: логотип игры нарисован тёмным, и на светлом
    // арте ему нужна светлая тень вместо общей тёмной. Ставится руками, глазами
    logoDark: fm.logo === "dark",
    poster: fm.poster === "none" ? null : fm.poster != null ? media(fm.poster, "art") : steam?.poster ?? null,
    // полка берёт готовый 600×900, а не ретиновый _2x: те же карточки втрое легче.
    // Кэши, записанные до появления поля, его не имеют — падаем на poster
    posterSmall: fm.poster === "none" ? null : fm.poster != null ? media(fm.poster, "art") : posterSmallOf(steam),
    // смысловой центр обоев по горизонтали: hero — широкий баннер, на узком экране
    // от него видно ~пятую часть ширины, и центр кадра сплошь и рядом не там
    focus: fm.focus ?? null,
    shots: ((Array.isArray(fm.shots) ? fm.shots : null) ?? (steam && !dropped ? steam.shots.slice(0, 2) : [])).map(r => media(r, "shot")).filter(Boolean),
    // у дропа медиа по умолчанию нет — но заданные руками shots и clip показываются
    clip: fm.clip === "none" ? null
      : fm.clip && fm.clip !== "store" ? media(fm.clip, "clip")
      : (fm.clip === "store" || !dropped) ? steam?.micro ?? null
      : null,
    dropped,
    playing,
    paused,
    // фасеты полки: у Steam-игр жанры из кэша, у остальных — руками во фронтматтере,
    // иначе запись молча выпадает из любого жанрового среза
    genres: Array.isArray(fm.genres) ? fm.genres.map(String) : (steam?.genres ?? []).filter(g => !GENRE_STOP.has(g)),
    coop: steam?.coop === true,
    html: mdToHtml(main.trim()),
    rawText: main.trim(),
    textChars: main.trim().length + momentChars,
    indexText: [main.trim(), ...momentText].join(" ").trim(),
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
  if (e.posterSmall) e.posterSmall = await localize(e.posterSmall, id);
  e.shots = await Promise.all(e.shots.map(u => localize(u, id)));
  if (e.clip) e.clip = await localize(e.clip, id);
  for (const m of e.moments) if (m.shot) m.shot = await localize(m.shot, id);
}

// связки заходов одной игры: правило выбора и подписи живут в scripts/siblings.mjs —
// живого контента с повторными заходами сейчас нет, и проверяются они тестами
for (const e of entries) {
  e.siblings = entries.filter(o => o !== e && gameKey(o) === gameKey(e));
  e.firstOfGame = firstRun([e, ...e.siblings]);
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
const I_CAL = icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>');
const I_CLOCK = icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>');
const I_PLAY = icon('<polygon points="6 4 20 12 6 20 6 4"/>');
const I_RSS = icon('<path d="M5 18h.01"/><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/>');
const I_PAUSE = icon('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>');
// логотип Steam — simple-icons (CC0)
const I_STEAM = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"/></svg>`;

// мета — лента чипов: каждый кусок самодостаточен, разделители не нужны.
// О дропе говорит медаль оценки, поэтому в ленте его нет — иначе дубль.
// на узком экране медаль не помещается на кромку — оценка едет первым чипом ленты.
// сама медаль остаётся в разметке: там подпись для скринридера, чип её дублирует визуально
const scoreChip = e => {
  const dim = e.dropped || e.fm.score === TBD;
  const body = e.dropped ? "дроп" : e.fm.score === TBD ? "—"
    : `${ruScore(e.fm.score)}<span class="track" style="--v:${e.fm.score}"></span><span class="of">из 10</span>`;
  return `<span class="chip chip--score${dim ? " is-dim" : ""}" aria-hidden="true">${body}</span>`;
};

const metaLine = e => {
  const parts = [scoreChip(e), e.playing
    ? `<span class="chip chip--flag">${I_PLAY}сейчас играю</span>`
    : `<span class="chip chip--date">${I_CAL}${ruDate(e.fm.finished)}</span>`];
  // «отложил» рядом с датой: дата у такой записи — последний заход, а не финал
  if (e.paused) parts.push(`<span class="chip chip--flag">${I_PAUSE}отложил</span>`);
  // hours: tbd — часов просто нет в строке, выдумывать нечего
  if (e.fm.hours !== TBD) parts.push(`<span class="chip chip--hours">${I_CLOCK}${ruHours(e.fm.hours)}</span>`);
  if (e.fm.platform) parts.push(`<span class="chip chip--platform">${esc(e.fm.platform)}</span>`);
  for (const s of e.siblings) {
    const label = siblingLabel(s, e, e.firstOfGame === s);
    parts.push(`<a class="chip chip--link" href="#${s.slug}">${label} ↗</a>`);
  }
  // есть appid — даём читателю прямой путь на страницу игры в магазине
  if (e.fm.steam) parts.push(`<a class="storelink" href="https://store.steampowered.com/app/${e.fm.steam}/" target="_blank" rel="noopener"
        aria-label="Открыть ${esc(e.name)} в Steam — новая вкладка">${I_STEAM}<span>Steam</span></a>`);
  parts.push(`<button type="button" class="chip chip--btn share" data-slug="${esc(e.slug)}" data-name="${esc(e.name)}" aria-label="Поделиться ссылкой">${I_SHARE}${I_CHECK}</button>`);
  // пробел между чипами — не для вида (зазор даёт margin), а чтобы копирование
  // строки мышью не склеивало значения: «1 июня 202647 часов»
  return parts.join(" ");
};

// закрытый спойлер прячется одним inert: он же убирает содержимое из чтения скринридером
// --focus — смысловой центр кропа. Файл постера для размытой подложки узкого экрана
// уезжает в data-poster: инлайновый url() в CSS-переменной грузился бы у всех записей
// разом, минуя loading="lazy". --poster из него ставит app.js на подходе к записи
const heroVars = e => e.focus != null ? ` style="--focus:${e.focus}%"` : "";
// единственное место, где собирается атрибут кадра-заглушки — и для записи, и для клипа.
// значение в апострофах: так во всём исходнике сборки не остаётся жадного атрибута
// кадра-заглушки, и grep-сторож ловит ровно его, а не собственный data-poster
const dataPoster = url => url ? ` data-poster='${esc(mediaUrl(url)).replace(/'/g, "%27")}'` : "";

// --h: во что обойдётся запись по высоте, в svh. Пока запись не отрисована,
// content-visibility держит её этим числом (см. README, «Записи вне экрана»).
// Общая заглушка на всех промахивалась до 235 svh и дёргала ленту при чтении
// снизу вверх. Слагаемые: панель и полоса обоев без содержимого, объём текста
// (основного и моментов, в сырых markdown-символах), медиа каждого момента
// и клип в шапке записи. Подогнано по всем записям на 390×844 и 1440×900
const stageVars = e => ` style="--h:${Math.round(
  179 + 0.0908 * (e.textChars ?? 0) + 35 * e.moments.filter(m => m.shot).length + (e.clip ? 39 : 0),
)}"`;
// размеры кадра в разметку: место под него резервируется до загрузки. У магазинных
// кадров Steam это всегда 1920×1080, свои же бывают узкими кропами (README, «Кадры»),
// и подставлять им 1920×1080 значит обещать браузеру не ту высоту
const shotSize = src => {
  // магазинный кадр Steam всегда 1920×1080; свой читается из файла; чужой по https —
  // ссылка, о которой сборка не знает ничего, и врать про неё размерами нельзя
  if (/^https?:\/\//.test(src)) return "";
  const size = /^media\//.test(src) ? imageSize(`content/${src}`) : { w: 1920, h: 1080 };
  return size ? ` width="${size.w}" height="${size.h}"` : "";
};

// кадр-заглушку браузер тянет немедленно даже при preload="none" — на первом экране
// это мегабайты за клипы, до которых читатель ещё не доехал. Ставит его app.js на подходе
const videoHtml = (src, label, { poster = "", preload = "none", hidden = false } = {}) =>
  `<video class="clip" src="${esc(mediaUrl(src))}" muted loop playsinline controls preload="${preload}"${dataPoster(poster)}
      aria-label="Видео: ${esc(label)}"${hidden ? " inert" : ""}></video>`;

// кадр — кнопка: лайтбокс доступен с клавиатуры. Имя нужно самой кнопке: у магазинного
// кадра alt пустой намеренно (номер и игру говорит счётчик лайтбокса), и без aria-label
// экранный диктор читал бы ленту безымянных кнопок
const shotHtml = (src, alt, hidden = false, label = "") =>
  `<button type="button" class="shotbtn" aria-label="${esc(label || alt || "Открыть кадр")}"${hidden ? " inert" : ""}><img class="shot" src="${esc(mediaUrl(src))}" alt="${esc(alt)}" loading="lazy" decoding="async"${shotSize(src)}></button>`;

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
    ? `<h2 class="sr-only">${esc(e.name)}</h2><img class="logo${e.logoDark ? " logo--dark" : ""}" src="${esc(mediaUrl(e.logo))}" alt="" decoding="async" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>`
    : `<h2 class="logo-text">${esc(e.name)}</h2>`;
  // оценка — медаль на верхней кромке панели; дуга кольца = сама оценка (--v: 0…10).
  // подпись для скринридера — отдельным sr-only: aria-label на голом span не работает
  const medal = (cls, label, inner, style = "") =>
    `<span class="score${cls}"${style}><span class="sr-only">${label}</span><span class="n" aria-hidden="true">${inner}</span></span>`;
  const score = e.dropped
    ? medal(" score--drop", "Дропнул — оценки нет", "дроп")
    : e.fm.score === TBD
    ? medal(" score--tbd", "Оценки пока нет", "—")
    : medal("", `Оценка ${ruScore(e.fm.score)} из 10`,
        `${ruScore(e.fm.score)}<span class="of">из 10</span>`, ` style="--v:${e.fm.score}"`);
  const mediaPanel = !e.clip && !e.shots.length ? "" : `
    <div class="glass glass--media">
      ${e.clip ? videoHtml(e.clip, e.name, { poster: e.shots[0] ?? e.hero }) : ""}
      ${e.shots.length ? `<div class="pair">${e.shots.slice(0, 2).map((s, n) => shotHtml(s, "", false, `${e.name}, кадр ${n + 1}`)).join("")}</div>` : ""}
    </div>`;
  return `
  <article class="stage" id="${esc(e.slug)}" data-nav="${i}"${dataPoster(e.poster)}${stageVars(e)}>
    <div class="hero${e.poster ? " hero--poster" : ""}"${heroVars(e)}>
      <picture>
        ${e.poster ? `<source media="${NARROW}" srcset="${esc(mediaUrl(e.poster))}" width="600" height="900">` : ""}
        <img class="bg" src="${esc(mediaUrl(e.hero))}" alt="" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} width="3840" height="1240">
      </picture>
      ${logo}
    </div>
    <div class="body">
      <div class="glass note${e.dropped ? " is-drop" : ""}">
        ${score}
        <span class="mono meta">${metaLine(e)}</span>
        <h3 class="verdict"><span class="kicker" aria-hidden="true">${esc(e.name)}</span>${esc(e.fm.verdict ?? "")}</h3>
        ${e.html}
      </div>
      ${mediaPanel}
      ${momentsHtml(e)}
    </div>
  </article>`;
};

// полка: год-группы с сеткой постеров — масштабируется на десятки игр.
// постеры lazy: сетка стоит стеной в хвосте ленты (в <dialog> её переносит app.js
// на открытии), от первого экрана её отделяет весь лонгрид — без атрибута десятки
// постеров грузились бы вместе с лентой. Сетка от этого не поедет: размеры кадра
// заданы атрибутами, место под него занято сразу
// Группировка по годам осмысленна, когда лет несколько; на молодом дневнике она даёт
// одну кучу на всю сетку — до порога группируем по месяцам. Условие живёт только здесь
// и описано в README; закрытый год — любой год, кроме текущего.
const YEARS_FOR_YEARS = 2;
const thisYear = new Date().getUTCFullYear();
const closedYears = new Set(entries.filter(e => !e.playing)
  .map(e => Number(String(e.fm.finished).slice(0, 4))).filter(y => y < thisYear));
const byMonth = closedYears.size < YEARS_FOR_YEARS;
const MONTHS_NOM = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];
const groupOf = e => {
  if (e.playing) return "сейчас играю";
  const [y, m] = String(e.fm.finished).split("-");
  return byMonth ? `${MONTHS_NOM[Number(m) - 1]} ${y}` : y;
};
const byGroup = new Map();
entries.forEach((e, i) => {
  const g = groupOf(e);
  if (!byGroup.has(g)) byGroup.set(g, []);
  byGroup.get(g).push([e, i]);
});
// подпись карточки полки: цифры на постере aria-hidden, а без них после фильтра «9+»
// непонятно, почему запись попала в срез — статус, оценка и часы проговариваются вслух
const shelfSay = e => [
  e.dropped ? "дроп" : e.playing ? "сейчас играю" : e.paused ? "отложил" : "пройдено",
  e.dropped || e.fm.score === TBD ? "" : `${ruScore(e.fm.score)} из 10`,
  typeof e.fm.hours === "number" ? ruHours(e.fm.hours) : "",
].filter(Boolean).join(", ");

// карточка несёт свои данные атрибутами — фильтр на клиенте считает по ним, без второго индекса
const cardData = e => [
  `data-status="${e.dropped ? "drop" : e.playing ? "play" : e.paused ? "pause" : "done"}"`,
  typeof e.fm.score === "number" ? `data-score="${e.fm.score}"` : "",
  typeof e.fm.hours === "number" ? `data-hours="${e.fm.hours}"` : "",
  e.genres.length ? `data-genres="${esc(e.genres.join("|"))}"` : "",
  e.coop ? 'data-coop=""' : "",
  e.moments.length ? `data-moments="${e.moments.length}"` : "",
  // текст записи едет прямо в карточку: корпус — десяток килобайт, отдельный
  // индекс-файл дороже. Спойлеры вырезаны — inline plain(), моменты под спойлером в indexText
  `data-text="${esc(plain(e.indexText))}"`,
].filter(Boolean).join(" ");

// тег на постере — только глагол: полная форма «сейчас играю» встаёт в две строки
// и закрывает пол-обложки; контекст даёт заголовок группы над сеткой
// сетка — один грид на всю полку, заголовки групп встают в него строкой на всю ширину:
// сортировка не по дате переставляет карточки свойством order, а не переносом узлов
const shelfHtml = [...byGroup].map(([g, items]) => `
    <h3 class="shelf__head mono">${esc(g)}</h3>${items.map(([e, i]) => `
      <a href="#${esc(e.slug)}" data-nav-to="${i}" title="${esc(e.name)}" ${cardData(e)}
         aria-label="${esc(e.name)} — ${shelfSay(e)}">
        <img src="${esc(mediaUrl(e.posterSmall ?? e.hero))}" alt="" loading="lazy" decoding="async" width="600" height="900">
        <span class="shelf__num mono" aria-hidden="true">
          <span class="${e.dropped || e.fm.score === TBD ? "dim" : "hi"}">${
            e.dropped ? "дроп" : e.fm.score === TBD ? "—" : ruScore(e.fm.score)}</span>
          <span>${typeof e.fm.hours === "number" ? `${e.fm.hours} ч` : ""}</span>
        </span>
        ${e.playing || e.paused ? `<span class="shelf__tag mono">${e.playing ? "играю" : "пауза"}</span>` : ""}
      </a>`).join("")}`).join("");

// чипы фильтра: пороги живут здесь и уезжают в разметку атрибутами —
// app.js их только применяет и второй копии порогов не держит
// solo — ряд, в котором чипы взаимоисключающие: «9+» и «8+» разом дают просто «8+»,
// подсвечены при этом оба. Ряды без флага складываются по ИЛИ, как раньше
const CHIPS = [
  ["оценка", [
    { k: "score", min: 9, lab: "9+" },
    { k: "score", min: 8, lab: "8+" },
    { k: "score", min: 7, lab: "7+" },
    // четвёртая ступень той же оси, а не отдельный ряд: заход, по которому вердикта ещё нет.
    // Дроп сюда не попадает — у него оценки нет по устройству, а не «пока»
    { k: "score", v: "none", lab: "без оценки" },
  ], { solo: true }],
  ["статус", [
    { k: "status", v: "done", lab: "пройдено" },
    { k: "status", v: "drop", lab: "дроп" },
    { k: "status", v: "play", lab: "играю" },
    { k: "status", v: "pause", lab: "отложил" },
  ]],
  ["часы", [
    { k: "hours", max: 10, lab: "до 10 ч" },
    { k: "hours", min: 10, max: 40, lab: "10–40 ч" },
    { k: "hours", min: 40, lab: "40+ ч" },
  ]],
  ["ещё", [
    // «есть кооп», а не «кооп»: признак приезжает из категорий Steam и говорит о самой
    // игре — поддерживает ли она совместную игру. Был ли этот заход совместным, запись не знает
    { k: "flag", v: "coop", lab: "есть кооп" },
    { k: "flag", v: "moments", lab: "с моментами" },
    // ярлык к хвостам: «отложил ∪ сейчас играю» одним нажатием — ответ на «во что вернуться».
    // Ряд статуса остаётся точным инструментом, этот чип — короткая дорога поверх него
    { k: "flag", v: "open", lab: "незакрытое" },
  ]],
];
const chipHtml = c => `<button type="button" class="chip chip--filter mono" data-k="${esc(c.k)}"${
  c.v !== undefined ? ` data-v="${esc(c.v)}"` : ""}${
  c.min !== undefined ? ` data-min="${c.min}"` : ""}${
  c.max !== undefined ? ` data-max="${c.max}"` : ""} aria-pressed="false">${esc(c.lab)}</button>`;
// role=group с подписью: иначе скринридер читает «9+, кнопка» без названия оси
const chipRow = (label, chips, opts = {}) => chips.length ? `
  <div class="shelf__row"${opts.solo ? " data-solo" : ""} role="group" aria-label="${esc(label)}"><span class="shelf__rowlab mono" aria-hidden="true">${label}</span>${chips.map(chipHtml).join("")}</div>` : "";
// жанры не выдумываем: в ряд попадают только те, что реально есть в записях
const genres = [...new Set(entries.flatMap(e => e.genres))].sort();
const filtersHtml =
  CHIPS.map(([label, items, opts]) => chipRow(label, items, opts)).join("") +
  chipRow("жанр", genres.map(g => ({ k: "genre", v: g, lab: g })));

// og:image главной — коллаж из свежих постеров: ссылку на дневник кидают в чат,
// и карточка должна показывать дневник, а не одну случайную игру. Склейка ffmpeg —
// в проекте он уже канонический инструмент (политики клипов и кадров). Нет ffmpeg
// или мало постеров — сборка не падает, og:image остаётся героем первой записи
const OG_FILE = "cache/assets/og.jpg";
const OG_REL = "og.jpg";
const ogSrcOf = rel => toCopy.get(rel) ?? `content/${rel}`;
let ogImage = entries[0] ? entries[0].hero : null;
let ogAlt = entries[0] ? `Обложка: ${entries[0].name}` : "";
{
  const src = entries.map(e => e.posterSmall).filter(Boolean).slice(0, 3).map(ogSrcOf);
  if (src.length < 3) console.warn("⚠ постеров меньше трёх — коллаж для og:image не собирается");
  else {
    // три постера 2:3 в кадр 1200×630: каждый по высоте карточки, бока подрезаны
    const chain = src.map((_, i) => `[${i}]scale=-2:630,crop=400:630[p${i}]`).join(";");
    const r = spawnSync("ffmpeg", ["-y", ...src.flatMap(f => ["-i", f]),
      "-filter_complex", `${chain};[p0][p1][p2]hstack=inputs=3`,
      "-frames:v", "1", "-q:v", "3", OG_FILE], { stdio: "ignore" });
    if (r.status === 0) {
      toCopy.set(OG_REL, OG_FILE);
      ogImage = OG_REL;
      ogAlt = "Хроника — постеры последних игр";
    } else console.warn(`⚠ ffmpeg не собрал коллаж (${r.error?.code ?? r.status}) — og:image главной остаётся обложкой первой записи`);
  }
}

// счётчик считает всё подряд: дропы и «сейчас играю» тоже игры, часы — сумма всех заходов
const games = new Set(entries.map(gameKey)).size;
const hours = entries.reduce((s, e) => s + (typeof e.fm.hours === "number" ? e.fm.hours : 0), 0);

// LCP первого экрана — обои первой записи. Браузер узнаёт о них, только разобрав
// <picture> в конце документа; preload с тем же media поднимает нужный файл в начало
// очереди. Условие широкого экрана — ровно дополнение NARROW, менять парой
const preloadLcp = !entries[0] ? "" : [
  entries[0].poster ? [entries[0].poster, ` media="${NARROW}"`] : null,
  [entries[0].hero, entries[0].poster ? ' media="(min-width: 48.0625rem)"' : ""],
].filter(Boolean).map(([u, m]) => `<link rel="preload" href="${esc(mediaUrl(u))}" as="image"${m}>`).join("\n");

const page = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Хроника — игровой дневник</title>
<meta name="description" content="Игровой дневник: ${ruGames(games)}, ${ruHours(hours)}.">
<meta property="og:type" content="website">
<meta property="og:title" content="Хроника — игровой дневник">
<meta property="og:description" content="Игры заканчиваются. Воспоминания — нет.">
${ogImage ? `<meta property="og:image" content="${esc(abs(mediaUrl(ogImage)))}">
<meta property="og:image:alt" content="${esc(ogAlt)}">` : ""}
<meta property="og:url" content="${SITE}/">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="Хроника — игровой дневник" href="${SITE}/feed.xml">
<!-- шрифты живут в styles.css и раздаются со своего домена; браузер узнаёт о них
     только разобрав таблицу, поэтому кириллический Cormorant — вордмарк и вердикт,
     самый крупный кегль первого экрана — просится вперёд. crossorigin обязателен и
     для своего домена: шрифт грузится в CORS-режиме, без атрибута файл поедет дважды -->
<link rel="preload" href="fonts/cormorant-garamond-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
${preloadLcp}
<link rel="stylesheet" href="styles.css">
</head>
<body id="top">
<header class="site-head">
  <h1 class="wordmark">Хроника</h1>
  <span class="mono site-head__now" id="head-now"></span>
  <span class="mono site-head__sum">${ruGames(games)} · ${ruHours(hours)}</span>
  <button class="shelf-btn" id="shelf-btn" aria-haspopup="dialog" aria-expanded="false" aria-label="Полка — поиск и фильтр по играм">☰<span class="fab-label"> полка</span></button>
</header>
<button class="top-btn" id="top-btn" aria-label="Наверх">↑<span class="fab-label"> наверх</span></button>
<span class="sr-only" id="say" role="status"></span>
<main>${entries.map(entryHtml).join("")}
<section class="wall" id="wall" aria-labelledby="wall-h">
  <h2 class="wall__h" id="wall-h">Вся полка</h2>
  <nav class="shelf__list" id="shelf-list" aria-label="Игры">
    <p class="shelf__empty" id="shelf-empty" hidden>Ничего не нашлось.
      <button type="button" class="chip chip--filter chip--reset mono" id="shelf-empty-reset">сбросить поиск и фильтры</button></p>
    <div class="shelf__grid" id="shelf-grid">${shelfHtml}</div>
  </nav>
</section></main>
<footer class="site-foot">
  <p>Игры заканчиваются. Воспоминания — нет.</p>
  <span class="mono">Обложки и кадры — Steam · <a href="https://artfaal.ru">artfaal</a>
    · <a href="/feed.xml" title="Читать дневник в читалке">${I_RSS}<span>RSS</span></a></span>
</footer>
<dialog class="shelf" id="shelf" tabindex="-1" aria-labelledby="shelf-title">
  <button class="x" id="shelf-x" aria-label="Закрыть полку">${I_CLOSE}</button>
  <h2 class="shelf__title" id="shelf-title">Полка</h2>
  <div class="shelf__find">
    <input class="shelf__q" id="shelf-q" type="search" autocomplete="off" autocapitalize="none" spellcheck="false"
           placeholder="название игры" aria-label="Найти игру"
           aria-controls="shelf-list" aria-describedby="shelf-hint">
    <span class="sr-only" id="shelf-hint">Enter открывает выбранную игру. Стрелки вверх и вниз перебирают найденное.</span>
    <select class="shelf__sort mono" id="shelf-sort" aria-label="Порядок">
      <option value="date">по дате</option>
      <option value="score">по оценке</option>
      <option value="hours">по часам</option>
    </select>
    <span class="shelf__count mono" role="status"><span id="shelf-count"></span><span class="sr-only" id="shelf-pick"></span></span>
  </div>
  <details class="shelf__filters" id="shelf-filters">
    <summary class="shelf__fsum mono">фильтр<span id="shelf-fcount"></span></summary>${filtersHtml}
    <div class="shelf__row"><button type="button" class="chip chip--filter chip--reset mono" id="shelf-reset" aria-label="Сбросить поиск и фильтры" hidden>сбросить</button></div>
  </details>
</dialog>
<dialog class="lb" id="lb" aria-label="Кадры и видео записи">
  <button class="x" id="lb-x" aria-label="Закрыть кадры">${I_CLOSE}</button>
  <div class="lb__stage" id="lb-stage" tabindex="-1" autofocus></div>
  <p class="cap" role="status"><span class="mono" id="lb-cap"></span><span class="mono lb__count" id="lb-count"></span></p>
  <button class="lb__nav lb__nav--prev" id="lb-prev" aria-label="Предыдущий кадр">${I_PREV}</button>
  <button class="lb__nav lb__nav--next" id="lb-next" aria-label="Следующий кадр">${I_NEXT}</button>
</dialog>
<script src="app.js"></script>
</body>
</html>
`;

// описание для OG-карточки: вердикт + начало текста, без спойлеров и разметки
const ogDesc = e => {
  const full = `${e.fm.verdict} ${plain(e.rawText)}`;
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
<meta property="og:image" content="${esc(abs(mediaUrl(e.hero)))}">
<meta property="og:image:alt" content="Обложка: ${esc(e.name)}">
<meta property="og:url" content="${SITE}/e/${esc(e.slug)}/">
<meta http-equiv="refresh" content="0; url=/#${esc(e.slug)}">
<link rel="canonical" href="${SITE}/#${esc(e.slug)}">
</head>
<body><a href="/#${esc(e.slug)}">${esc(e.name)} — открыть в «Хронике»</a></body>
</html>
`;

// ---------- запись dist ----------
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", page);
cpSync("site/styles.css", "dist/styles.css");
cpSync("site/app.js", "dist/app.js");
cpSync("site/favicon.svg", "dist/favicon.svg");
cpSync("site/fonts", "dist/fonts", { recursive: true });
if (existsSync("content/media")) {
  cpSync("content/media", "dist/media", { recursive: true });
  // дешёвая часть политики клипов — вес; остальное (fps, битрейт, faststart) смотрит `make video`
  for (const f of readdirSync("content/media").filter(f => /\.(mp4|webm)$/i.test(f))) {
    const mb = statSync(`content/media/${f}`).size / 1024 / 1024;
    if (mb > LIMITS.mbTotal) console.warn(`⚠ ${f}: ${mb.toFixed(0)} МБ — тяжелее ${LIMITS.mbTotal}; прогони make video`);
  }
}
for (const e of entries) {
  mkdirSync(`dist/e/${e.slug}`, { recursive: true });
  writeFileSync(`dist/e/${e.slug}/index.html`, stub(e));
}
for (const [rel, file] of toCopy) {
  mkdirSync(dirname(`dist/${rel}`), { recursive: true });
  cpSync(file, `dist/${rel}`);
}

// sitemap из одного адреса: сайт — одна лента, записи в ней якоря. Стабы /e/<slug>/
// сюда не идут: их canonical смотрит в /#slug, живут они ради OG-карточки в телеграме,
// и робот их всё равно отбросит — класть их в sitemap значит врать ему.
// lastmod — свежайшая дата финала; у «сейчас играю» даты нет, в расчёт не берём.
const lastmod = entries.map(e => String(e.fm.finished)).filter(d => d !== TBD).sort().at(-1);
writeFileSync("dist/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ""}
  </url>
</urlset>
`);
// фид: те же опубликованные записи, что в ленте. link — на стаб /e/<slug>/: второй страницы
// у записи нет, а стаб редиректит в ленту и несёт свою OG-карточку. pubDate — дата финала;
// у «сейчас играю» её нет, и элемент опускается: в RSS он необязателен, а выдумывать дату —
// врать читалке. В sitemap.xml фид не идёт — там намеренно один URL, корень
const rfc822 = iso => new Date(`${iso}T12:00:00Z`).toUTCString();
writeFileSync("dist/feed.xml", `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Хроника — игровой дневник</title>
    <link>${SITE}/</link>
    <description>Игры заканчиваются. Воспоминания — нет.</description>
    <language>ru</language>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>${entries.map(e => `
    <item>
      <title>${esc(e.name)} — ${esc(e.fm.verdict)}</title>
      <link>${SITE}/e/${esc(e.slug)}/</link>
      <guid>${SITE}/e/${esc(e.slug)}/</guid>
      <description>${esc(ogDesc(e))}</description>${e.fm.finished === TBD ? "" : `
      <pubDate>${rfc822(e.fm.finished)}</pubDate>`}
    </item>`).join("")}
  </channel>
</rss>
`);
writeFileSync("dist/robots.txt", `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`);
console.log(`dist: ${entries.length} записей (${ruGames(games)}, ${hours} ч)${DRAFTS ? " + драфты" : ""}`);
