// steam-app.mjs — поход в Steam за метой игры и форма cache/<appid>.json.
// Один канон на двоих: new.mjs заводит кэш целиком, refresh.mjs обновляет названные поля.
// Разъедься эти две копии — записи начнут ссылаться на кадры, которых нет.
// Не точка входа, шебанга нет.

// rerun — чем повторить прогон: подсказка про прокси должна называть команду,
// которую человек и запускал, а не соседнюю.
// soft — вернуть null вместо выхода. Нужно там, где игр много, а результат только
// читается: один моргнувший запрос не повод потерять отчёт по остальным двадцати.
// Где по ответу пишут в кэш — soft не ставить: писать по половине данных нельзя.
export async function fetchApp(appid, rerun, { soft = false, includeAssets = false } = {}) {
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
  if (!includeAssets) return data;
  // Store Browse отдаёт актуальные пути, включая хеши и library_capsule.
  // appdetails их не содержит; старые /steam/apps/<id>/library_*.jpg у новых игр дают 404.
  const input = { ids: [{ appid: Number(appid) }], context: { language: "english", country_code: "US" }, data_request: { include_assets: true } };
  const legacyLogo = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/logo.png`;
  const [artRes, logoRes] = await Promise.all([
    fetch(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`).catch(() => null),
    fetch(legacyLogo, { method: "HEAD" }).catch(() => null),
  ]);
  const art = artRes?.ok ? await artRes.json().catch(() => null) : null;
  const assets = art?.response?.store_items?.find(i => Number(i.appid) === Number(appid))?.assets;
  if (!assets?.asset_url_format || !assets.library_hero || !assets.library_capsule ||
      (!logoRes?.ok && logoRes?.status !== 404)) {
    console.error(`Steam ${appid}: не получены обложки Store Browse или не проверен логотип; повтори ${rerun}`);
    if (soft) return null;
    process.exit(1);
  }
  // Store Browse не отдаёт library logo. Только подтверждённый 404 означает,
  // что старого логотипа нет; сеть не превращаем в отсутствие картинки.
  return { ...data, assets, libraryLogo: logoRes.ok ? legacyLogo : null };
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

// Полке ретина не нужна, а posterSmall есть не во всех кэшах: записанные до его
// появления переписывать нельзя (номера кадров поедут), поэтому лёгкий постер
// выводим из имени ретинового. Обе формы URL остаются здесь, в одном месте.
export const posterSmallOf = c => c?.posterSmall ?? c?.poster?.replace("_600x900_2x.jpg", "_600x900.jpg") ?? null;

// Форма файла cache/<appid>.json. Меняешь её — меняешь здесь, и только здесь.
export function appCache(appid, data, micro) {
  const cdn = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}`;
  const asset = (field, fallback) => data.assets?.[field]
    ? `https://shared.akamai.steamstatic.com/store_item_assets/${data.assets.asset_url_format.replace("${FILENAME}", data.assets[field])}`
    : fallback;
  return {
    appid: Number(appid),
    name: data.name,
    hero: asset("library_hero", `${cdn}/library_hero.jpg`),
    logo: data.libraryLogo === undefined ? `${cdn}/logo.png` : data.libraryLogo,
    poster: asset("library_capsule_2x", asset("library_capsule", `${cdn}/library_600x900_2x.jpg`)),
    // полке ретина не нужна: карточка 2:3 в сетке — тот же кадр втрое легче.
    // В кэшах, записанных раньше, поля нет — сборка падает на poster
    posterSmall: asset("library_capsule", `${cdn}/library_600x900.jpg`),
    shots: (data.screenshots ?? []).slice(0, 8).map(s => s.path_full),
    micro,
    // фасеты полки: жанры Steam как есть, кооп — из категорий
    genres: (data.genres ?? []).map(g => g.description),
    coop: (data.categories ?? []).some(c => /Co-op/i.test(c.description)),
    // дата выхода игры — строкой в формате Steam («Aug 6, 2018»), как отдали: разбирает
    // её сборка. Поля нет в кэшах, записанных раньше него, — потребитель обязан это пережить.
    // У ещё не вышедшей игры Steam тоже отдаёт «дату» («Q1 2027», «To be announced») —
    // это план, а не факт выхода, и в кэш он не едет: даты выхода у игры пока нет
    released: data.release_date?.coming_soon ? null : data.release_date?.date || null,
  };
}
