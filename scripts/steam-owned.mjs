// steam-owned.mjs — библиотека Steam одним запросом: общий канон для hours.mjs и suggest.mjs.
// Оба ходят одними кредами и одинаково упираются в недоступность Steam из этой сети;
// вторая копия этого куска разъедется с первой — поэтому он тут один.
//
// Из процесса выходит сам: обе точки входа — CLI, и на «нет кредов» / «нет сети»
// честный ответ один — сказать и выйти. Возвращать null значит переписывать
// один и тот же обработчик в каждом вызывающем.
const API = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/";

// Креды и поход в Steam лежат тут, а не у каждого вызывающего: точек входа уже три
// (hours, suggest, timeline), и все три упираются в одно и то же — нет кредов или
// нет сети. Третья копия этих двух сообщений разъехалась бы с первыми двумя.
export function steamCreds() {
  const KEY = process.env.STEAM_API_KEY;
  const ID = process.env.STEAM_ID;
  if (!KEY || !ID) {
    // канон кредов называем целиком: модуль общий, и указатель на соседнюю цель
    // Makefile был бы для второго вызывающего указателем не туда
    console.error("нет STEAM_API_KEY/STEAM_ID — подложи креды: set -a; . ~/.skill-secrets/game-compass.env; set +a");
    process.exit(1);
  }
  return { KEY, ID };
}

// rerun — команда, которой скрипт запускают: без неё подсказка про прокси бесполезна.
// soft — статусы, которые вызывающий разбирает сам: у части эндпоинтов ошибка HTTP
// означает не «сеть легла», а внятный ответ по существу (ачивок у игры нет — 400),
// и общая подсказка про прокси на этом месте отправляет чинить исправное.
export async function steamFetch(url, rerun, soft = []) {
  const res = await fetch(url).catch(() => null);
  if (!res?.ok && !soft.includes(res?.status)) {
    console.error(`Steam API не ответил (${res?.status ?? "сеть"}); за прокси: NODE_USE_ENV_PROXY=1 HTTPS_PROXY=… ${rerun}`);
    process.exit(1);
  }
  return res;
}

export async function fetchOwned(rerun) {
  const { KEY, ID } = steamCreds();
  const res = await steamFetch(`${API}?key=${KEY}&steamid=${ID}&include_appinfo=1&format=json`, rerun);
  // Ключ — appid: hours.mjs спрашивает по нему часы, suggest.mjs идёт по всем значениям.
  // Имя нужно suggest.mjs: у игры, которой в дневнике ещё нет, слага тоже нет, и
  // назвать её больше нечем. last — последний запуск (0 у Steam значит «не знаю»).
  return new Map(((await res.json()).response?.games ?? []).map(g => [g.appid, {
    name: g.name,
    hours: g.playtime_forever / 60,
    last: g.rtime_last_played ? new Date(g.rtime_last_played * 1000) : null,
  }]));
}
