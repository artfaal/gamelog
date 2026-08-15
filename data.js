// PROTOTYPE — данные из Steam appdetails, mock-поля прохождений внизу
const STEAM = [
  {
    "appid": 292030,
    "name": "The Witcher 3: Wild Hunt",
    "release": "May 18, 2015",
    "genres": [
      "RPG"
    ],
    "shots": [
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/292030/ss_5710298af2318afd9aa72449ef29ac4a2ef64d8e.1920x1080.jpg?t=1768303991",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/292030/ss_0901e64e9d4b8ebaea8348c194e7a3644d2d832d.1920x1080.jpg?t=1768303991",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/292030/ss_112b1e176c1bd271d8a565eacb6feaf90f240bb2.1920x1080.jpg?t=1768303991",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/292030/ss_d1b73b18cbcd5e9e412c7a1dead3c5cd7303d2ad.1920x1080.jpg?t=1768303991",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/292030/ss_107600c1337accc09104f7a8aa7f275f23cad096.1920x1080.jpg?t=1768303991",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/292030/ss_64eb760f9a2b67f6731a71cce3a8fb684b9af267.1920x1080.jpg?t=1768303991"
    ],
    "movieid": 256927229,
    "micro": "https://cdn.akamai.steamstatic.com/steam/apps/256927229/microtrailer.webm",
    "mp4": "https://cdn.akamai.steamstatic.com/steam/apps/256927229/movie_max.mp4"
  },
  {
    "appid": 367520,
    "name": "Hollow Knight",
    "release": "Feb 24, 2017",
    "genres": [
      "Action",
      "Adventure",
      "Indie"
    ],
    "shots": [
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/367520/ss_5384f9f8b96a0b9934b2bc35a4058376211636d2.1920x1080.jpg?t=1776125684",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/367520/ss_d5b6edd94e77ba6db31c44d8a3c09d807ab27751.1920x1080.jpg?t=1776125684",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/367520/ss_a81e4231cc8d55f58b51a4a938898af46503cae5.1920x1080.jpg?t=1776125684",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/367520/ss_62e10cf506d461e11e050457b08aa0e2a1c078d0.1920x1080.jpg?t=1776125684",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/367520/ss_bd76bd88bc5334ee56ae3d5f0d8dec4455e8e3b8.1920x1080.jpg?t=1776125684",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/367520/ss_33a645903d6dd9beec39f272a3daf57174a6cc26.1920x1080.jpg?t=1776125684"
    ],
    "movieid": 256679401,
    "micro": "https://cdn.akamai.steamstatic.com/steam/apps/256679401/microtrailer.webm",
    "mp4": "https://cdn.akamai.steamstatic.com/steam/apps/256679401/movie_max.mp4"
  },
  {
    "appid": 632470,
    "name": "Disco Elysium - The Final Cut",
    "release": "Oct 15, 2019",
    "genres": [
      "RPG"
    ],
    "shots": [
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/632470/ss_b3694e99ffdb686d1bbbbe16a540d3d2ccd509c4.1920x1080.jpg?t=1780913406",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/632470/ss_9125a718ee9ba85386ae5d4eb820f3266073fc97.1920x1080.jpg?t=1780913406",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/632470/ss_4f5fdc3cf42feca8dafb1f7d2910ef96e62708a2.1920x1080.jpg?t=1780913406",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/632470/ss_fc6969799ebf19fd2a2c8a986c9419e053606a17.1920x1080.jpg?t=1780913406",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/632470/ss_dec29c440fab2f7817d68c1380c019290eb1755e.1920x1080.jpg?t=1780913406",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/632470/ss_ab38615b3a1d0d4309f06772db4bd9db5c250ef7.1920x1080.jpg?t=1780913406"
    ],
    "movieid": 256827872,
    "micro": "https://cdn.akamai.steamstatic.com/steam/apps/256827872/microtrailer.webm",
    "mp4": "https://cdn.akamai.steamstatic.com/steam/apps/256827872/movie_max.mp4"
  },
  {
    "appid": 1086940,
    "name": "Baldur's Gate 3",
    "release": "Aug 3, 2023",
    "genres": [
      "Adventure",
      "RPG",
      "Strategy"
    ],
    "shots": [
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1086940/ss_c73bc54415178c07fef85f54ee26621728c77504.1920x1080.jpg?t=1777363040",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1086940/ss_73d93bea842b93914d966622104dcb8c0f42972b.1920x1080.jpg?t=1777363040",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1086940/ss_cf936d31061b58e98e0c646aee00e6030c410cda.1920x1080.jpg?t=1777363040",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1086940/ss_b6a6ee6e046426d08ceea7a4506a1b5f44181543.1920x1080.jpg?t=1777363040",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1086940/ss_6b8faba0f6831a406ce015648958da9612d14dbb.1920x1080.jpg?t=1777363040",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1086940/ss_8fc5eba770b4a1639b31666908bdd2bbc1aa2ae4.1920x1080.jpg?t=1777363040"
    ],
    "movieid": 256987424,
    "micro": "https://cdn.akamai.steamstatic.com/steam/apps/256987424/microtrailer.webm",
    "mp4": "https://cdn.akamai.steamstatic.com/steam/apps/256987424/movie_max.mp4"
  },
  {
    "appid": 1091500,
    "name": "Cyberpunk 2077",
    "release": "Dec 9, 2020",
    "genres": [
      "RPG"
    ],
    "shots": [
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/ss_2f649b68d579bf87011487d29bc4ccbfdd97d34f.1920x1080.jpg?t=1784714077",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/ss_0e64170751e1ae20ff8fdb7001a8892fd48260e7.1920x1080.jpg?t=1784714077",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/ss_af2804aa4bf35d4251043744412ce3b359a125ef.1920x1080.jpg?t=1784714077",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/ss_7924f64b6e5d586a80418c9896a1c92881a7905b.1920x1080.jpg?t=1784714077",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/ss_4eb068b1cf52c91b57157b84bed18a186ed7714b.1920x1080.jpg?t=1784714077",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/ss_b529b0abc43f55fc23fe8058eddb6e37c9629a6a.1920x1080.jpg?t=1784714077"
    ],
    "movieid": 257082775,
    "micro": "https://cdn.akamai.steamstatic.com/steam/apps/257082775/microtrailer.webm",
    "mp4": "https://cdn.akamai.steamstatic.com/steam/apps/257082775/movie_max.mp4"
  },
  {
    "appid": 1145360,
    "name": "Hades",
    "release": "Sep 17, 2020",
    "genres": [
      "Action",
      "Indie",
      "RPG"
    ],
    "shots": [
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145360/ss_c0fed447426b69981cf1721756acf75369801b31.1920x1080.jpg?t=1758127023",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145360/ss_8a9f0953e8a014bd3df2789c2835cb787cd3764d.1920x1080.jpg?t=1758127023",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145360/ss_68300459a8c3daacb2ec687adcdbf4442fcc4f47.1920x1080.jpg?t=1758127023",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145360/ss_bcb499a0dd001f4101823f99ec5094d2872ba6ee.1920x1080.jpg?t=1758127023",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145360/ss_8e07e477fa7ff2f88c8984bc89b9652a655da0e9.1920x1080.jpg?t=1758127023",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145360/ss_34e6660705cfe47d2b2f95189c37f7cb77f75ca6.1920x1080.jpg?t=1758127023"
    ],
    "movieid": 256801252,
    "micro": "https://cdn.akamai.steamstatic.com/steam/apps/256801252/microtrailer.webm",
    "mp4": "https://cdn.akamai.steamstatic.com/steam/apps/256801252/movie_max.mp4"
  },
  {
    "appid": 1174180,
    "name": "Red Dead Redemption 2",
    "release": "Dec 5, 2019",
    "genres": [
      "Action",
      "Adventure"
    ],
    "shots": [
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1174180/ss_66b553f4c209476d3e4ce25fa4714002cc914c4f.1920x1080.jpg?t=1759502961",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1174180/ss_bac60bacbf5da8945103648c08d27d5e202444ca.1920x1080.jpg?t=1759502961",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1174180/ss_668dafe477743f8b50b818d5bbfcec669e9ba93e.1920x1080.jpg?t=1759502961",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1174180/ss_4ce07ae360b166f0f650e9a895a3b4b7bf15e34f.1920x1080.jpg?t=1759502961",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1174180/ss_d1a8f5a69155c3186c65d1da90491fcfd43663d9.1920x1080.jpg?t=1759502961"
    ],
    "movieid": 256767979,
    "micro": "https://cdn.akamai.steamstatic.com/steam/apps/256767979/microtrailer.webm",
    "mp4": "https://cdn.akamai.steamstatic.com/steam/apps/256767979/movie_max.mp4"
  },
  {
    "appid": 1245620,
    "name": "ELDEN RING",
    "release": "Feb 24, 2022",
    "genres": [
      "Action",
      "RPG"
    ],
    "shots": [
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/ss_943bf6fe62352757d9070c1d33e50b92fe8539f1.1920x1080.jpg?t=1784684281",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/ss_dcdac9e4b26ac0ee5248bfd2967d764fd00cdb42.1920x1080.jpg?t=1784684281",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/ss_3c41384a24d86dddd58a8f61db77f9dc0bfda8b5.1920x1080.jpg?t=1784684281",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/ss_e0316c76f8197405c1312d072b84331dd735d60b.1920x1080.jpg?t=1784684281",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/ss_ef61b771ee6b269b1f0cb484233e07a0bfb5f81b.1920x1080.jpg?t=1784684281",
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/ss_b1b91299d7e4b94201ac840aa64de54d9f5cb7f3.1920x1080.jpg?t=1784684281"
    ],
    "movieid": 256889452,
    "micro": "https://cdn.akamai.steamstatic.com/steam/apps/256889452/microtrailer.webm",
    "mp4": "https://cdn.akamai.steamstatic.com/steam/apps/256889452/movie_max.mp4"
  }
]
;

// Mock-поля прохождений (заглушки прототипа)
const RUNS = {
  1145360: { finished: "2026-07-12", hours: 41,  score: 9,  verdict: "Сороковая попытка побега — та самая." },
  1086940: { finished: "2026-04-03", hours: 112, score: 10, verdict: "Сто двенадцать часов, и ни один не жалко." },
  1245620: { finished: "2025-11-20", hours: 96,  score: 9,  verdict: "Междуземье ничего не объясняет. И правильно делает." },
  1091500: { finished: "2025-06-14", hours: 74,  score: 8,  verdict: "Найт-Сити дожал меня к финалу." },
  632470:  { finished: "2025-02-08", hours: 38,  score: 10, verdict: "Лучший детектив — тот, что внутри головы." },
  1174180: { finished: "2024-10-26", hours: 88,  score: 9,  verdict: "Медленно. Как и должно быть." },
  367520:  { finished: "2024-05-17", hours: 52,  score: 8,  verdict: "Карта из мела и упрямства." },
  292030:  { finished: "2024-01-05", hours: 140, score: 10, verdict: "Гвинт — отдельной строкой." },
};

const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
function ruDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const GAMES = STEAM
  .map(g => ({ ...g, ...RUNS[g.appid],
    hero:   `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/library_hero.jpg`,
    poster: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/library_600x900_2x.jpg`,
    logo:   `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/logo.png`,
  }))
  .sort((a, b) => b.finished.localeCompare(a.finished));

// Короткие впечатления для одностраничных вариантов (заглушки прототипа)
const NOTES = {
  1145360: [
    "Сначала казалось, что это игра про реакцию. Потом — что про билды. И только к тридцатой попытке дошло: это игра про разговоры между смертями. Погибаешь — и бежишь домой узнать, что скажет Ахилл.",
    "Сороковая попытка — та самая. Снег, мать, короткий разговор, ради которого всё и было. Титры пересматривал два раза.",
  ],
  1086940: [
    "Начал за паладина, к третьему акту понял, что отыгрываю не класс, а совесть. Игра каждый час подсовывает выбор, у которого нет правильного ответа, — и живёт с твоим.",
    "Финал собрал все хвосты, даже те, про которые я забыл. Редкий случай, когда сто часов — это ровно столько, сколько нужно.",
  ],
  1245620: [
    "Первые десять часов — сплошное «за что». Потом карта раскрывается, и оказывается, что страх был частью замысла: мир не водит за руку, и от этого каждая находка — твоя.",
    "Малению победил с сорок восьмой попытки и неделю всем об этом рассказывал.",
  ],
  1091500: [
    "После патчей это совсем другая игра. Найт-Сити — лучший город в жанре: в нём хочется просто стоять и смотреть, как течёт толпа.",
    "Финальная миссия с Джонни — редкий случай, когда игра честно платит за все вложенные часы.",
  ],
  632470: [
    "Детектив, в котором главная улика — ты сам. Двадцать четыре голоса в голове спорят, а ты выбираешь, кем быть: развалиной или человеком.",
    "Читал вслух реплики Куно. Простите.",
  ],
  1174180: [
    "Игра принципиально никуда не спешит — и в какой-то момент перестаёшь спешить ты. Лагерь, охота, дорога: половина моих часов — это просто езда шагом под разговоры.",
    "Эпилог длиной в маленькую игру. И он нужен весь.",
  ],
  367520: [
    "Карту рисуешь мелом и упрямством. Каждый новый район сначала пугает, потом становится домом.",
    "Босс-финал за пределами обычной концовки — лучшая дуэль в метроидваниях. Точка.",
  ],
  292030: [
    "Перепрохождение спустя годы — и всё ещё лучший открытый мир по плотности историй на квадратный километр. Даже вопросики на карте здесь зачем-то нужны.",
    "Гвинт — отдельной строкой: в какой-то момент я перестал спасать Цири, потому что искал карту Лето.",
  ],
};

// Итерация 3: длинный обзор Elden Ring + «моменты» (текст к конкретному скрину)
NOTES[1245620] = [
  "Первые десять часов — сплошное «за что». Игра не объясняет ни куда идти, ни зачем, ни почему всадник на площади убивает меня с двух ударов. Потом карта раскрывается, и оказывается, что страх был частью замысла: мир не водит за руку, и от этого каждая находка — твоя.",
  "Середина — лучшее, что случалось со мной в открытых мирах. Никаких вопросиков: видишь силуэт на горизонте — идёшь к нему, и там всегда что-то есть. Пещера, катакомбы, дракон на озере. Игра доверяет любопытству больше, чем любой квест-лог.",
  "К финалу устал — последняя треть заметно злее, и мой самурай с двуручником упёрся в потолок. Пересобрался в кровотечение — стало даже неприлично легко. Баланс тут тоже часть истории: страдание выбираешь сам.",
  "Сто часов спустя понимаю: главное, что оставила игра, — не боссы, а тишина между ними. Лошадь, поле, золотое дерево на полнеба.",
];

const MOMENTS = {
  1245620: [
    { shot: 2, t: "Первый выход в Лимгрейв", p: "Выходишь из пещеры — и мир просто лежит перед тобой: без загрузок, без маркеров, только золотое дерево на горизонте. Полчаса никуда не шёл, стоял и крутил камеру." },
    { shot: 3, t: "Столица", p: "Лейнделл — лучший город соулс-серии: вертикальный, золотой, бесконечный. Заблудиться здесь — удовольствие, которое я растягивал как мог." },
    { shot: 4, t: "Маления, наконец", p: "Сорок восемь попыток. На последней — руки на автомате, в голове тихо. Победил с осколком здоровья и орал так, что пришёл кот." },
  ],
  1174180: [
    { shot: 3, t: "Снег в Колтере", p: "Пролог, который все ругают за медлительность, — а я запомнил его как лучший туториал атмосферы: полозья скрипят, банда жмётся к печке, и никуда не хочется спешить." },
  ],
};

// Итерация 4: дроп-записи — короткий чисто текстовый обзор, без медиа
const DROPGAMES = [
  {
    appid: 1716740, name: "Starfield", release: "Sep 5, 2023", genres: ["RPG"],
    shots: [], movieid: null, micro: null, mp4: null,
    hero:   "https://cdn.cloudflare.steamstatic.com/steam/apps/1716740/library_hero.jpg",
    poster: "https://cdn.cloudflare.steamstatic.com/steam/apps/1716740/library_600x900_2x.jpg",
    logo:   "https://cdn.cloudflare.steamstatic.com/steam/apps/1716740/logo.png",
    finished: "2025-09-14", hours: 11, score: null, dropped: true,
    verdict: "Тысяча планет — и ни одной причины возвращаться.",
  },
];

NOTES[1716740] = [
  "Одиннадцать часов честно ждал, когда начнётся. Летал, стрелял, копал ресурсы, смотрел экраны загрузки. Космос оказался меню. Дропнул без злости — просто не моё.",
];

// Общая хронология: пройденное + дропнутое
const CHRONICLE = [...GAMES, ...DROPGAMES].sort((a, b) => b.finished.localeCompare(a.finished));

// Итерация 5: возвращения — у игры может быть несколько заходов в хронике.
// Поле link связывает записи одной игры: {to: finished-дата парной записи, text: подпись}
const AH_BASE = {
  appid: 668580, name: "Atomic Heart", genres: ["Action", "RPG"],
  shots: [
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/668580/ss_1dc8661cde295efc2d1ff8612e079f5c74803748.1920x1080.jpg?t=1786632138",
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/668580/ss_9dedae959672ac7d7f2db16638a5b65f80bfe125.1920x1080.jpg?t=1786632138",
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/668580/ss_2fce9ef441a18361b9ab8f1b1ac70160c8226577.1920x1080.jpg?t=1786632138",
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/668580/ss_19b14ddac88c1f0d24c8061c1f38bebabfbbdff3.1920x1080.jpg?t=1786632138",
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/668580/ss_1edcb9e8de3f513645678de19879cb02ecf07764.1920x1080.jpg?t=1786632138",
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/668580/ss_91b040e19e14baa32684a588c20246a305ae336e.1920x1080.jpg?t=1786632138",
  ],
  micro: "https://cdn.akamai.steamstatic.com/steam/apps/257320698/microtrailer.webm",
  hero:   "https://cdn.cloudflare.steamstatic.com/steam/apps/668580/library_hero.jpg",
  poster: "https://cdn.cloudflare.steamstatic.com/steam/apps/668580/library_600x900_2x.jpg",
  logo:   "https://cdn.cloudflare.steamstatic.com/steam/apps/668580/logo.png",
};

const AH_RUNS = [
  { ...AH_BASE, finished: "2024-07-21", hours: 3, score: null, dropped: true,
    verdict: "Красиво, но не завелось.",
    note: ["Вежливо посмотрел пролог, восхитился «Челомеем», устал от болтовни перчатки — и тихо вышел на первой локации."],
    link: { to: "2026-06-02", text: "вернулся и прошёл в 2026" } },
  { ...AH_BASE, finished: "2026-06-02", hours: 22, score: 7,
    verdict: "Вернулся — и зря дропал.",
    note: [
      "Второй заход спустя два года — и игра наконец завелась. То ли патчи, то ли настроение: перчатка всё так же болтает, но за комбинацию полимера с топором ей прощаешь.",
      "Середина провисает, финал спорный, но «Предприятие 3826» — лучший арт-дирекшн в жанре за годы. Семь из десяти, и ни капли сожаления о возвращении.",
    ],
    link: { to: "2024-07-21", text: "первый заход — дроп в 2024" } },
];

// Записи с note используют его вместо NOTES[appid] (у одной игры разные тексты заходов)
const CHRONICLE5 = [...CHRONICLE, ...AH_RUNS].sort((a, b) => b.finished.localeCompare(a.finished));
