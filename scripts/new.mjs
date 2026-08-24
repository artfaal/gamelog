#!/usr/bin/env node
// new.mjs <appid> [--slug my-slug] — кэш Steam-меты + заготовка записи.
// Машинное — только в cache/<appid>.json; md на 100% рукописный.
// Форма кэша и походы в Steam — scripts/steam-app.mjs (общий канон с refresh.mjs).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fetchApp, microtrailer, appCache } from "./steam-app.mjs";
import { runs } from "./timeline.mjs";

const args = process.argv.slice(2);
const appid = args[0];
const si = args.indexOf("--slug");
const slugArg = si === -1 ? null : args[si + 1];
if (!appid || !/^\d+$/.test(appid) || (si !== -1 && !slugArg)) {
  console.error("usage: node scripts/new.mjs <appid> [--slug my-slug]");
  process.exit(1);
}

// Кэш уже есть — это второй заход в ту же игру (atomic-heart-2024 + atomic-heart):
// заготовку записи делаем, а кэш не трогаем. Перезапись переставила бы порядок shots,
// и кадры в уже написанной записи молча поехали бы: она ссылается на номера.
// Обновить поле в существующем кэше — refresh.mjs, он пишет точечно.
const file = `cache/${appid}.json`;
let cache;
if (existsSync(file)) {
  cache = JSON.parse(readFileSync(file, "utf8"));
  console.log(`${file} уже есть — не трогаю (обновить поле: node scripts/refresh.mjs ${appid} --field genres)`);
} else {
  const data = await fetchApp(appid, `node scripts/new.mjs ${appid}`);
  const { value: micro, known, movieid } = await microtrailer(data);
  if (!known) {
    console.error("проверка микротрейлера сорвалась (сеть) — повтори позже; за прокси: NODE_USE_ENV_PROXY=1 HTTPS_PROXY=… node scripts/new.mjs " + appid);
    process.exit(1);
  }
  if (movieid && !micro) console.warn(`микротрейлера у ролика ${movieid} нет (404) — клипа не будет`);
  cache = appCache(appid, data, micro);
  writeFileSync(file, JSON.stringify(cache, null, 2) + "\n");
  console.log(`${file} — ${cache.name}, ${cache.shots.length} скринов`);
}

const slug =
  slugArg ??
  cache.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error(`слаг «${slug}» не годится — задай руками: --slug my-slug`);
  process.exit(1);
}
const md = `content/${slug}.md`;
if (existsSync(md)) {
  console.log(`${md} уже есть — не трогаю`);
} else {
  // Дата финала — из ачивок, а не догадкой: точный источник лежит в том же Steam,
  // куда мы уже сходили за метой. Отказ (нет кредов, сети, ачивок) — прежний tbd.
  const sessions = await runs(appid);
  const finished = sessions
    ? `${sessions.at(-1).at(-1).at.toISOString().slice(0, 10)}  # из ачивок последнего захода — сверь`
    : `tbd     # дата финала; tbd = «сейчас играю»`;
  if (!sessions)
    console.log("дата финала из ачивок не подставлена (нет кредов game-compass.env, сети или ачивок) — в заготовке tbd");
  writeFileSync(
    md,
    `---
steam: ${appid}
finished: ${finished}
hours: tbd        # число часов или tbd
score: tbd        # 1–10, можно с половиной (7.5), или tbd; дропнул — убери score и поставь dropped: true
verdict:
draft: true
---
`,
  );
  console.log(`${md} — заготовка создана`);
}
