#!/usr/bin/env node
// new.mjs <appid> [--slug my-slug] — кэш Steam-меты + заготовка записи.
// Машинное — только в cache/<appid>.json; md на 100% рукописный.
import { writeFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const appid = args[0];
const si = args.indexOf("--slug");
const slugArg = si === -1 ? null : args[si + 1];
if (!appid || !/^\d+$/.test(appid) || (si !== -1 && !slugArg)) {
  console.error("usage: node scripts/new.mjs <appid> [--slug my-slug]");
  process.exit(1);
}

const res = await fetch(
  `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=english`,
);
if (!res.ok) {
  console.error(`appdetails: HTTP ${res.status}`);
  process.exit(1);
}
const data = (await res.json())[appid]?.data;
if (!data) {
  console.error(`appdetails: нет данных для ${appid}`);
  process.exit(1);
}

const cdn = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}`;
const movieid = data.movies?.[0]?.id ?? null;
// у свежих роликов Steam легаси-файлов нет (404) — проверяем и честно пишем null
let micro = null;
if (movieid) {
  const url = `https://cdn.akamai.steamstatic.com/steam/apps/${movieid}/microtrailer.webm`;
  const head = await fetch(url, { method: "HEAD" }).catch(() => null);
  if (head?.ok) micro = url;
  else if (head?.status === 404) console.warn(`микротрейлера у ролика ${movieid} нет (404) — клипа не будет`);
  else {
    console.error(`проверка микротрейлера сорвалась (${head?.status ?? "сеть"}) — повтори позже`);
    process.exit(1);
  }
}
const cache = {
  appid: Number(appid),
  name: data.name,
  hero: `${cdn}/library_hero.jpg`,
  logo: `${cdn}/logo.png`,
  poster: `${cdn}/library_600x900.jpg`,
  shots: (data.screenshots ?? []).slice(0, 8).map(s => s.path_full),
  micro,
  // фасеты полки: жанры Steam как есть, кооп — из категорий
  genres: (data.genres ?? []).map(g => g.description),
  coop: (data.categories ?? []).some(c => /Co-op/i.test(c.description)),
};
writeFileSync(`cache/${appid}.json`, JSON.stringify(cache, null, 2) + "\n");
console.log(`cache/${appid}.json — ${cache.name}, ${cache.shots.length} скринов`);

const slug =
  slugArg ??
  data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error(`слаг «${slug}» не годится — задай руками: --slug my-slug`);
  process.exit(1);
}
const md = `content/${slug}.md`;
if (existsSync(md)) {
  console.log(`${md} уже есть — не трогаю`);
} else {
  writeFileSync(
    md,
    `---
steam: ${appid}
finished: tbd     # дата финала; tbd = «сейчас играю»
hours: tbd        # число часов или tbd
score: tbd        # 1–10, можно с половиной (7.5), или tbd; дропнул — убери score и поставь dropped: true
verdict:
draft: true
---
`,
  );
  console.log(`${md} — заготовка создана`);
}
