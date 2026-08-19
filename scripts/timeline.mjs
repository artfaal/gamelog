#!/usr/bin/env node
// timeline.mjs — когда играл и до чего дошёл, по датам ачивок Steam.
// Отвечает на вопрос, на который не отвечает ни библиотека, ни запись: Steam помнит
// только суммарные часы и последний запуск, а «последний запуск» — это может быть
// десять минут любопытства спустя годы после прохождения. Ачивки помнят каждую дату.
//
// Нужно перед тем, как снимать впечатления с автора: человек помнит игру, но не помнит
// когда играл, сколько заходов было и чем кончилось. Отсюда берётся дата в `finished`
// и половина фактуры для моментов.
//
// Ничего не пишет — как hours.mjs и suggest.mjs: решение и текст за человеком.
//
//   make timeline APPID=1245620
//   node scripts/timeline.mjs 1245620
import { existsSync, readFileSync } from "node:fs";
import { steamCreds, steamFetch } from "./steam-owned.mjs";

const API = "https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/";

// Пауза, после которой это уже другой заход, а не перерыв внутри прохождения.
// Два месяца: в библиотеке есть игры с разрывами в годы (Terraria — 2015…2025),
// и без разбивки «окно захода» выродилось бы в бессмысленное «десять лет».
const GAP_DAYS = 60;
const DAY = 86400e3;

// Сколько показываем, чтобы отчёт оставался читаемым: хвост называем числом.
const TAIL = 5;   // последние ачивки захода — по ним видно, чем заход кончился
const PEAKS = 3;  // самые плотные дни захода
const MISSED = 12;

const appid = Number(process.argv[2]);
if (!Number.isInteger(appid) || appid <= 0) {
  console.error("нужен appid: node scripts/timeline.mjs 1245620");
  process.exit(1);
}

const { KEY, ID } = steamCreds();
const rerun = `node scripts/timeline.mjs ${appid}`;
// l=russian: Steam сам отдаёт английский там, где русского перевода нет, и отдельная
// развилка «а если пусто» была бы кодом ради ничего.
// 400 у этого эндпоинта — не сбой сети, а ответ по существу: достижений для appid нет.
// Отдаём его вызывающему сами, иначе общая подсказка гонит чинить прокси, который цел.
const res = await steamFetch(`${API}?appid=${appid}&key=${KEY}&steamid=${ID}&l=russian`, rerun, [400]);
if (res.status === 400) {
  console.error(`достижений у ${appid} в Steam нет (либо appid не тот) — дат не будет, спрашивай автора без подсказок`);
  process.exit(1);
}
const stats = (await res.json()).playerstats ?? {};

if (!stats.success) {
  // Профиль закрыт или скрыта игровая статистика — ачивки есть, но нам их не покажут.
  console.error(`Steam не отдал ачивки (${stats.error ?? "без объяснения"}) — проверь приватность профиля`);
  process.exit(1);
}

const all = stats.achievements ?? [];
const done = all.filter(a => a.achieved && a.unlocktime)
  .map(a => ({ name: a.name || a.apiname, at: new Date(a.unlocktime * 1000) }))
  .sort((a, b) => a.at - b.at);

// Имя из кэша, если игра уже заведена: там оно то же самое, что в записи и на полке.
const cache = `cache/${appid}.json`;
const name = (existsSync(cache) && JSON.parse(readFileSync(cache, "utf8")).name) || stats.gameName || appid;

console.log(`${name} — ${done.length} из ${all.length} ачивок`);

if (!done.length) {
  console.log("\nни одной не выбито — дат нет, спрашивай автора без подсказок");
  process.exit(0);
}

const day = d => d.toISOString().slice(0, 10);

// Заходы: режем цепочку там, где между соседними ачивками пауза длиннее GAP_DAYS.
const runs = [[done[0]]];
for (let i = 1; i < done.length; i++) {
  const gap = (done[i].at - done[i - 1].at) / DAY;
  if (gap > GAP_DAYS) runs.push([]);
  runs.at(-1).push(done[i]);
}

for (const [i, run] of runs.entries()) {
  const from = run[0].at, to = run.at(-1).at;
  const days = Math.round((to - from) / DAY) + 1;
  const head = runs.length > 1 ? `заход ${i + 1} · ` : "заход: ";
  console.log(`\n${head}${day(from)} … ${day(to)} (${days} дн., ачивок ${run.length})`);

  // Плотные дни: где ачивок за сутки больше одной, там и была настоящая сессия.
  const byDay = new Map();
  for (const a of run) byDay.set(day(a.at), (byDay.get(day(a.at)) ?? 0) + 1);
  const peaks = [...byDay].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, PEAKS);
  if (peaks.length) console.log(`  плотнее всего: ${peaks.map(([d, n]) => `${d} (${n})`).join(", ")}`);

  // Хвост захода — обычно финал: концовки и последние боссы падают под конец.
  const tail = run.slice(-TAIL);
  console.log(`  под конец: ${tail.map(a => `${day(a.at)} ${a.name}`).join(" · ")}`);
}

const missed = all.filter(a => !a.achieved).map(a => a.name || a.apiname);
if (missed.length) {
  const shown = missed.slice(0, MISSED).join(" · ");
  const rest = missed.length > MISSED ? ` … и ещё ${missed.length - MISSED}` : "";
  console.log(`\nне выбито (${missed.length}): ${shown}${rest}`);
}
