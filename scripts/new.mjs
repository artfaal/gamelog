#!/usr/bin/env node
// new.mjs <appid> [--slug my-slug] — кэш Steam-меты + заготовка записи.
// Машинное — только в cache/<appid>.json; md на 100% рукописный.
import { writeFileSync, existsSync } from "node:fs";

const [appid, ...rest] = process.argv.slice(2);
if (!appid || !/^\d+$/.test(appid)) {
  console.error("usage: node scripts/new.mjs <appid> [--slug my-slug]");
  process.exit(1);
}
const slugArg = rest[rest.indexOf("--slug") + 1];

const res = await fetch(
  `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=english`,
);
const data = (await res.json())[appid]?.data;
if (!data) {
  console.error(`appdetails: нет данных для ${appid}`);
  process.exit(1);
}

const cdn = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}`;
const movieid = data.movies?.[0]?.id ?? null;
const cache = {
  appid: Number(appid),
  name: data.name,
  hero: `${cdn}/library_hero.jpg`,
  logo: `${cdn}/logo.png`,
  poster: `${cdn}/library_600x900_2x.jpg`,
  shots: (data.screenshots ?? []).slice(0, 8).map(s => s.path_full),
  micro: movieid
    ? `https://cdn.akamai.steamstatic.com/steam/apps/${movieid}/microtrailer.webm`
    : null,
};
writeFileSync(`cache/${appid}.json`, JSON.stringify(cache, null, 2) + "\n");
console.log(`cache/${appid}.json — ${cache.name}, ${cache.shots.length} скринов`);

const slug =
  slugArg ??
  data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const md = `content/${slug}.md`;
if (existsSync(md)) {
  console.log(`${md} уже есть — не трогаю`);
} else {
  writeFileSync(
    md,
    `---
steam: ${appid}
finished: ${new Date().toISOString().slice(0, 10)}
hours: 0
score:
verdict:
draft: true
---
`,
  );
  console.log(`${md} — заготовка создана`);
}
