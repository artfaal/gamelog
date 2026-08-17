#!/usr/bin/env node
// hours.mjs — сверяет часы в записях с наигранным в Steam.
// Ничего не пишет: md на 100% рукописный, цифру ставит человек. Задача скрипта —
// избавить от похода в профиль и показать, где запись разошлась с реальностью.
//
// Креды — ~/.skill-secrets/game-compass.env (канон, там же профиль Макса):
//   set -a; . ~/.skill-secrets/game-compass.env; set +a; node scripts/hours.mjs
// Проще через Makefile: make hours
import { readFileSync, readdirSync } from "node:fs";
import matter from "gray-matter";

const KEY = process.env.STEAM_API_KEY;
const ID = process.env.STEAM_ID;
if (!KEY || !ID) {
  console.error("нет STEAM_API_KEY/STEAM_ID — подложи ~/.skill-secrets/game-compass.env (см. make hours)");
  process.exit(1);
}

const res = await fetch(
  `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${KEY}&steamid=${ID}&include_appinfo=1&format=json`,
).catch(() => null);
if (!res?.ok) {
  console.error(`Steam API не ответил (${res?.status ?? "сеть"}); за прокси: NODE_USE_ENV_PROXY=1 HTTPS_PROXY=… make hours`);
  process.exit(1);
}
const owned = new Map(
  ((await res.json()).response?.games ?? []).map(g => [g.appid, g.playtime_forever / 60]),
);

// записей на игру может быть несколько (возвращения) — сравнивать надо сумму заходов
const byGame = new Map();
for (const f of readdirSync("content").filter(f => f.endsWith(".md"))) {
  const { data: fm } = matter(readFileSync(`content/${f}`, "utf8"));
  if (!fm.steam) continue;
  if (!byGame.has(fm.steam)) byGame.set(fm.steam, []);
  byGame.get(fm.steam).push({ slug: f.replace(/\.md$/, ""), hours: fm.hours });
}

const TBD = "tbd";
const rows = [];
for (const [appid, entries] of byGame) {
  const steam = owned.get(appid);
  const declared = entries.reduce((s, e) => s + (typeof e.hours === "number" ? e.hours : 0), 0);
  const openTbd = entries.filter(e => e.hours === TBD);
  const name = entries.map(e => e.slug).join(" + ");
  if (steam === undefined) { rows.push(["?", name, "нет в библиотеке Steam"]); continue; }
  if (openTbd.length) {
    rows.push(["tbd", name, `в Steam ${steam.toFixed(1)} ч${declared ? ` (в других заходах ${declared} ч)` : ""} — есть что проставить`]);
    continue;
  }
  const diff = steam - declared;
  if (Math.abs(diff) < 1) rows.push(["ок", name, `${declared} ч`]);
  else rows.push(["≠", name, `в записи ${declared} ч, в Steam ${steam.toFixed(1)} ч (${diff > 0 ? "+" : ""}${diff.toFixed(1)})`]);
}

const order = { "≠": 0, tbd: 1, "?": 2, ок: 3 };
rows.sort((a, b) => order[a[0]] - order[b[0]] || a[1].localeCompare(b[1]));
for (const [mark, name, note] of rows) console.log(`${mark.padEnd(4)} ${name.padEnd(28)} ${note}`);

const off = rows.filter(r => r[0] !== "ок").length;
console.log(off ? `\nтребует внимания: ${off} из ${rows.length}` : `\nвсе ${rows.length} записей сходятся со Steam`);
