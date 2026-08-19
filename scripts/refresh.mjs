#!/usr/bin/env node
// refresh.mjs <appid…> | --all [--field genres,coop] [--unsafe] — точечное обновление cache/<appid>.json.
// Без --field ничего не пишет: показывает, какие поля разошлись со Steam.
//
// Зачем отдельный скрипт: new.mjs заводит кэш один раз и существующий не трогает —
// иначе он переставил бы порядок shots, а записи ссылаются на кадры по номеру
// (shots: [5, 0], ![](2) в моментах): картинки в ленте молча поехали бы, и сборка
// этого не заметит. Здесь пишутся ровно названные поля, остальное переносится как есть.
//
//   node scripts/refresh.mjs --all                  что вообще разошлось со Steam
//   node scripts/refresh.mjs 668580 --field genres  обновить одно поле одной игры
//
// Steam из этой сети бывает недоступен напрямую:
//   NODE_USE_ENV_PROXY=1 HTTPS_PROXY=… node scripts/refresh.mjs …
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import matter from "gray-matter";
import { fetchApp, microtrailer, appCache, posterSmallOf } from "./steam-app.mjs";

// ---------- аргументы ----------
const args = process.argv.slice(2);
const fi = args.indexOf("--field");
const fieldsArg = fi === -1 ? null : args[fi + 1];
const ids = args.filter((a, i) => /^\d+$/.test(a) && !(fi !== -1 && i === fi + 1));  // значение --field за appid не принимаем
const all = args.includes("--all");
const unsafe = args.includes("--unsafe");

const USAGE = "usage: node scripts/refresh.mjs <appid…> | --all [--field genres,coop] [--unsafe]";
if ((!ids.length && !all) || (ids.length && all) || (fi !== -1 && (!fieldsArg || fieldsArg.startsWith("--")))) {
  console.error(USAGE);
  process.exit(1);
}

// shots двигает нумерацию кадров в записях, micro подменяет клип всем записям с clip: store
// и записям без clip (сборка подставляет микротрейлер сама) — молча их переписывать нельзя
const RISKY = ["shots", "micro"];
const SAFE = ["name", "hero", "logo", "poster", "posterSmall", "genres", "coop", "released"];
const KNOWN = [...SAFE, ...RISKY];

const fields = fieldsArg ? fieldsArg.split(",").map(s => s.trim()).filter(Boolean) : null;
if (fields && !fields.length) { console.error(USAGE); process.exit(1); }
const unknown = (fields ?? []).filter(f => !KNOWN.includes(f));
if (unknown.length) {
  console.error(`неизвестное поле: ${unknown.join(", ")}; в кэше есть: ${KNOWN.join(", ")}`);
  process.exit(1);
}

// порядок проверок важен: запрет --all идёт первым, иначе на «--all --field shots»
// скрипт советовал бы --unsafe, а с ним же и отказывал — совет в тупик
const risky = (fields ?? []).filter(f => RISKY.includes(f));
if (risky.length && all) {
  console.error("--all с shots/micro не бывает: разъехавшиеся кадры смотрят по одной игре — назови appid явно");
  process.exit(1);
}
if (risky.length && !unsafe) {
  console.error(`${risky.join(" и ")} — поля, от которых кадры в записях едут молча: номера в shots: и ![](N) начнут показывать не то`);
  console.error("перезапись только осознанно: добавь --unsafe — скрипт покажет, какой номер куда съехал, и какие записи на номера ссылаются");
  process.exit(1);
}
if (unsafe && !risky.length) console.warn("--unsafe без shots/micro ни на что не влияет");

const targets = all
  ? readdirSync("cache").filter(f => /^\d+\.json$/.test(f)).map(f => f.replace(/\.json$/, "")).sort()
  : ids;
for (const appid of targets) {
  if (existsSync(`cache/${appid}.json`)) continue;
  console.error(`нет cache/${appid}.json — новую игру заводит new.mjs: node scripts/new.mjs ${appid}`);
  process.exit(1);
}

// ---------- сравнение ----------
// у скринов в хвосте ?t=… — метка последнего апдейта страницы: меняется сама по себе,
// а сборка кэширует ассет по имени файла. Считать это расхождением — гнать мусорный дифф
const bare = u => (typeof u === "string" ? u.split("?")[0] : u);
// posterSmall завели позже самих кэшей: в записанных до него файлах поля нет, а appCache()
// всегда отдаёт URL. Сравнивать сырое было бы «разошлись все и навсегда» — переписывать
// старые кэши ради одного поля канон запрещает. Берём то же, что берёт сборка: posterSmallOf()
// выводит лёгкий постер из ретинового, когда поля нет.
const wasField = (k, was) => (k === "posterSmall" ? posterSmallOf(was) : was[k]);
const same = (k, was, now) =>
  k === "shots" ? JSON.stringify((was ?? []).map(bare)) === JSON.stringify(now.map(bare))
    : k === "genres" ? JSON.stringify(was ?? []) === JSON.stringify(now)
      : was === now;

const shotsMoved = (was, now) => {
  const before = (was ?? []).map(bare), after = now.map(bare);
  const moved = before.map((u, i) => {
    const j = after.indexOf(u);
    return j === i ? null : `№${i}→${j === -1 ? "нет" : `№${j}`}`;
  }).filter(Boolean);
  const added = after.map((u, j) => (before.includes(u) ? null : `№${j}`)).filter(Boolean);
  return `кадров было ${before.length}, стало ${after.length}`
    + (moved.length ? `; съехали: ${moved.join(" ")}` : "")
    + (added.length ? `; новые: ${added.join(" ")}` : "");
};
const describe = (k, was, now) =>
  k === "shots" ? shotsMoved(was, now)
    : k === "genres" ? `${(was ?? []).join(", ") || "—"} → ${now.join(", ") || "—"}`
      : `${was ?? "—"} → ${now ?? "—"}`;

// кто пострадает от сдвига номеров: записи этой игры и кадры, на которые они ссылаются.
// Без shots: во фронтматтере сборка сама берёт первые два кадра — такая запись тоже зависит
// от порядка, просто молча (build.mjs: steam.shots.slice(0, 2))
const refs = appid => {
  const out = [];
  for (const f of readdirSync("content").filter(f => f.endsWith(".md"))) {
    const { data: fm, content } = matter(readFileSync(`content/${f}`, "utf8"));
    if (String(fm.steam) !== String(appid)) continue;
    const nums = new Set();
    if (Array.isArray(fm.shots)) for (const s of fm.shots) if (typeof s === "number") nums.add(s);
    for (const m of content.matchAll(/!\[[^\]]*\]\((\d+)\)/g)) nums.add(Number(m[1]));
    const parts = [...nums].sort((a, b) => a - b).map(n => `№${n}`);
    if (!Array.isArray(fm.shots) && !fm.dropped) parts.unshift("по умолчанию №0 №1");
    if (parts.length) out.push(`${f.replace(/\.md$/, "")}: ${parts.join(", ")}`);
  }
  return out;
};

// ---------- проход ----------
let off = 0, skipped = 0;
// В дифе по многим играм сорвавшийся запрос — не повод потерять отчёт по остальным:
// читаем, а не пишем. Одиночный диф и любая запись падают честно, как раньше.
const soft = !fields && targets.length > 1;
for (const appid of targets) {
  const file = `cache/${appid}.json`;
  const was = JSON.parse(readFileSync(file, "utf8"));
  const data = await fetchApp(appid, "node scripts/refresh.mjs …", { soft });
  if (!data) { skipped++; continue; }
  const need = fields ?? KNOWN;

  let micro = was.micro, microKnown = true;
  if (need.includes("micro")) ({ value: micro, known: microKnown } = await microtrailer(data));
  if (!microKnown && fields) {
    console.error(`микротрейлер ${appid} не проверился (сеть) — наугад в кэш не пишу; повтори позже или за прокси`);
    process.exit(1);
  }
  const now = appCache(appid, data, micro);
  const changed = need.filter(k => (k !== "micro" || microKnown) && !same(k, wasField(k, was), now[k]));

  if (!fields) {  // режим дифа: ни байта в файл
    if (!changed.length && microKnown) { console.log(`= ${appid} ${now.name}`); continue; }
    off++;
    console.log(`≠ ${appid} ${now.name}`);
    for (const k of changed) console.log(`  ${k.padEnd(7)} ${describe(k, wasField(k, was), now[k])}`);
    if (!microKnown) console.log("  micro   не проверился (сеть) — поле пропущено");
    if (changed.includes("shots")) for (const r of refs(appid)) console.log(`  ↳ ${r}`);
    continue;
  }

  if (!changed.length) { console.log(`= ${file} — ${fields.join(", ")}: расхождений со Steam нет, не трогаю`); continue; }
  const next = { ...was };  // всё, что не названо в --field, переносится из файла как есть
  for (const k of changed) next[k] = now[k];
  writeFileSync(file, JSON.stringify(next, null, 2) + "\n");  // формат — как у new.mjs, иначе мусорный дифф в git
  console.log(`${file} — обновлено: ${changed.join(", ")}`);
  for (const k of changed) console.log(`  ${k.padEnd(7)} ${describe(k, wasField(k, was), now[k])}`);
  if (changed.includes("shots")) {
    console.log("  ⚠ номера кадров съехали — перепроверь записи:");
    for (const r of refs(appid)) console.log(`  ↳ ${r}`);
  }
  if (changed.includes("micro")) console.log("  ⚠ клип другой — он идёт в записи с clip: store и в записи без clip вообще");
}

if (!fields && targets.length > 1) {
  // «расхождений нет» при нуле проверенных — ложь: не проверено ничего
  const checked = targets.length - skipped;
  if (checked) console.log(off ? `\nразошлись со Steam: ${off} из ${checked}` : `\nпроверено кэшей: ${checked} — расхождений нет`);
  else console.log("\nне ответила ни одна игра — проверить не удалось");
  if (skipped) console.log(`не ответили: ${skipped} из ${targets.length} — повтори прогон${checked ? "" : "; за прокси: NODE_USE_ENV_PROXY=1 HTTPS_PROXY=…"}`);
}
