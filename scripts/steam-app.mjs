// steam-app.mjs — поход в Steam за метой игры и форма cache/<appid>.json.
// Один канон на двоих: new.mjs заводит кэш целиком, refresh.mjs обновляет названные поля.
// Разъедься эти две копии — записи начнут ссылаться на кадры, которых нет.
// Не точка входа, шебанга нет.

// rerun — чем повторить прогон: подсказка про прокси должна называть команду,
// которую человек и запускал, а не соседнюю.
// soft — вернуть null вместо выхода. Нужно там, где игр много, а результат только
// читается: один моргнувший запрос не повод потерять отчёт по остальным двадцати.
// Где по ответу пишут в кэш — soft не ставить: писать по половине данных нельзя.
export async function fetchApp(appid, rerun, { soft = false } = {}) {
  const res = await fetch(
    `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=english`,
  ).catch(() => null);
  if (!res?.ok) {
    const what = `appdetails ${appid}: Steam не ответил (${res?.status ?? "сеть"})`;
    if (soft) { console.error(`${what} — пропускаю`); return null; }
    console.error(`${what}; за прокси: NODE_USE_ENV_PROXY=1 HTTPS_PROXY=… ${rerun}`);
    process.exit(1);
  }
  // тело читаем отдельно от заголовков: соединение рвётся и после 200, и тогда
  // json() бросает — необработанным это роняет весь прогон стектрейсом
  const body = await res.json().catch(() => null);
  const data = body?.[appid]?.data;
  if (!data) {
    const what = `appdetails: нет данных для ${appid}${body ? "" : " (ответ оборвался)"}`;
    if (soft) { console.error(`${what} — пропускаю`); return null; }
    console.error(what);
    process.exit(1);
  }
  return data;
}

// У свежих роликов Steam легаси-файла микротрейлера нет (404) — это нормально и означает
// «клипа не будет». А вот сорвавшийся запрос молча превращать в «клипа нет» нельзя:
// в кэш уедет null, и запись останется без клипа по причине «сеть моргнула».
// Отсюда three-state: known говорит, можно ли верить value.
export async function microtrailer(data) {
  const movieid = data.movies?.[0]?.id ?? null;
  if (!movieid) return { value: null, known: true, movieid: null };
  const url = `https://cdn.akamai.steamstatic.com/steam/apps/${movieid}/microtrailer.webm`;
  const head = await fetch(url, { method: "HEAD" }).catch(() => null);
  if (head?.ok) return { value: url, known: true, movieid };
  if (head?.status === 404) return { value: null, known: true, movieid };
  return { value: null, known: false, movieid };
}

// Форма файла cache/<appid>.json. Меняешь её — меняешь здесь, и только здесь.
export function appCache(appid, data, micro) {
  const cdn = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}`;
  return {
    appid: Number(appid),
    name: data.name,
    hero: `${cdn}/library_hero.jpg`,
    logo: `${cdn}/logo.png`,
    poster: `${cdn}/library_600x900_2x.jpg`,
    shots: (data.screenshots ?? []).slice(0, 8).map(s => s.path_full),
    micro,
    // фасеты полки: жанры Steam как есть, кооп — из категорий
    genres: (data.genres ?? []).map(g => g.description),
    coop: (data.categories ?? []).some(c => /Co-op/i.test(c.description)),
  };
}
