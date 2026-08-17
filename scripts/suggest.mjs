#!/usr/bin/env node
// suggest.mjs [--min 20] — что наиграно в Steam, но в дневник не попало.
// Обратный вопрос к hours.mjs: тот сверяет записи с библиотекой, этот показывает
// остаток библиотеки — кандидатов в очередь add_game.md. Ничего не пишет: что
// станет записью, решает человек, скрипт только вспоминает за него.
//
// Креды — ~/.skill-secrets/game-compass.env (канон, там же профиль Макса):
//   set -a; . ~/.skill-secrets/game-compass.env; set +a; node scripts/suggest.mjs
import { readFileSync, readdirSync } from "node:fs";
import matter from "gray-matter";
import { fetchOwned } from "./steam-owned.mjs";

// Порог: в библиотеке под 600 игр и 400 с ненулевым налётом — это архив за десять
// лет, а не список кандидатов. 20 ч ≈ выходные, проведённые в игре: ниже — «попробовал
// и закрыл», рассказывать нечего. Порог грубый и потому переопределяемый: в дневнике
// есть запись на 5 ч (дроп), просто искать такие сплошным списком бессмысленно.
const args = process.argv.slice(2);
const mi = args.indexOf("--min");
const MIN = mi === -1 ? 20 : Number(args[mi + 1]);
if (!Number.isFinite(MIN) || MIN < 0) {
  console.error("usage: node scripts/suggest.mjs [--min 20]");
  process.exit(1);
}

const owned = await fetchOwned("node scripts/suggest.mjs");

// заходов на игру может быть несколько (возвращения) — тут важен сам факт, что она в дневнике есть
const written = new Set();
for (const f of readdirSync("content").filter(f => f.endsWith(".md"))) {
  const { data: fm } = matter(readFileSync(`content/${f}`, "utf8"));
  if (fm.steam) written.add(fm.steam);
}

// add_game.md — очередь Макса, лежит в .gitignore: в клоне с GitHub его нет.
// Поэтому не фильтр, а пометка: список не должен молча меняться от наличия файла,
// а помеченная строка — просто уже разобранная. appid берём только из ячеек таблицы.
let queued = new Set();
try {
  queued = new Set(readFileSync("add_game.md", "utf8").split("\n")
    .filter(l => l.startsWith("|"))
    .flatMap(l => l.split("|").map(c => c.trim()))
    .filter(c => /^\d{3,}$/.test(c))
    .map(Number));
} catch { /* файла нет — просто не будет пометок */ }

const rows = [...owned]
  .filter(([appid, g]) => g.hours >= MIN && g.hours > 0 && !written.has(appid))
  .sort((a, b) => b[1].hours - a[1].hours);

// Последний запуск в строке, а не отдельным разделом «недавно играл»: список за
// десять лет без даты не отсортировать глазами (сверху Dota 2 из 2016-го), а
// playtime_2weeks у Steam почти всегда пуст — раздел из одной строки не нужен.
for (const [appid, g] of rows) {
  const mark = queued.has(appid) ? "оч." : "";
  const last = g.last ? g.last.toISOString().slice(0, 10) : "—";
  console.log(`${mark.padEnd(4)} ${g.name.padEnd(36)} ${g.hours.toFixed(1).padStart(7)} ч  ${last}  ${appid}`);
}

const inQueue = rows.filter(([appid]) => queued.has(appid)).length;
const below = [...owned].filter(([appid, g]) => g.hours > 0 && g.hours < MIN && !written.has(appid)).length;
if (!rows.length) { console.log(`\nот ${MIN} ч в дневник не попало ничего; ниже порога ещё ${below}`); process.exit(0); }
console.log(`\nкандидатов от ${MIN} ч: ${rows.length}${inQueue ? ` (${inQueue} уже в очереди add_game.md — «оч.»)` : ""}; ниже порога ещё ${below}`);
console.log("завести запись: node scripts/new.mjs <appid>");
