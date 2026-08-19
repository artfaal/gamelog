// Замер ленты: насколько врут заглушки высоты (--h) и сильно ли дёргает при чтении
// снизу вверх — тот сценарий, из-за которого заглушка появилась (см. README).
// Скрипт для консоли браузера, а не для node: высоту записи знает только раскладка.
//
//   1. make serve  (или открой https://games.artfaal.ru)
//   2. поставь нужную ширину — на телефоне дефект виден, на широком слабее
//   3. вставь файл целиком в консоль
//
// Два замера идут отдельно и в таком порядке не случайно:
//   heights() снимает ПРАВДУ — временно показывает все записи, чтобы у непосещённых
//     тоже была настоящая высота, а не заглушка: иначе промах у них выйдет нулевым;
//   jitter() меряет дефект и потому требует свежей загрузки — `auto` в
//     contain-intrinsic-size запоминает настоящую высоту, и второй проход по той же
//     ленте идёт уже без единого сдвига.

const sleep = ms => new Promise(r => setTimeout(r, ms));

// раскладка устаканилась: шрифты приехали, уже начатые картинки декодированы, кадр
// отрисован. Ждём только те, что реально грузятся: decode() у lazy-картинки, до которой
// читатель не доехал, не разрешится никогда — она даже не начинала качаться. Видео не
// ждём намеренно: место под него держит aspect-ratio, метаданные высоту уже не меняют
const capped = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);

async function settled() {
  await capped(document.fonts.ready, 3000);
  const started = [...document.images].filter(i => i.currentSrc && i.complete);
  await capped(Promise.all(started.map(i => i.decode().catch(() => {}))), 3000);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}

// правда о высотах: чему они равны, когда запись действительно разложена
async function heights() {
  const off = document.createElement("style");
  off.textContent = "article.stage { content-visibility: visible !important; }";
  document.head.appendChild(off);
  await settled();
  await sleep(400);

  const vh = window.innerHeight;
  const rows = [...document.querySelectorAll("article.stage")].map(a => {
    const declared = Number(a.style.getPropertyValue("--h")) || 250;
    const real = Math.round(a.getBoundingClientRect().height / vh * 100);
    return { запись: a.id, заглушка: declared, реально: real, промах: declared - real, промах250: 250 - real };
  });
  off.remove();

  const sum = k => rows.reduce((s, r) => s + Math.abs(r[k]), 0);
  const worst = k => Math.max(...rows.map(r => Math.abs(r[k])));
  return {
    строки: rows,
    формула: { сумма_промахов_svh: sum("промах"), худший_промах_svh: worst("промах") },
    общая_заглушка_250: { сумма_промахов_svh: sum("промах250"), худший_промах_svh: worst("промах250") },
  };
}

// дефект: запись, материализуясь выше вьюпорта, двигает всё, что ниже
async function jitter() {
  await settled();
  window.scrollTo(0, document.documentElement.scrollHeight);
  await sleep(1200);

  const step = window.innerWidth < 768 ? 600 : 700;
  let prev = document.documentElement.scrollHeight;
  let jumps = 0, sum = 0, worst = 0, guard = 0, stuck = 0;
  // видимый рывок: сколько запись под пальцем уехала СВЕРХ того, на сколько мы
  // прокрутили. Изменение scrollHeight ниже читателя рывком не является, а scroll
  // anchoring, наоборот, часть его гасит — считаем то, что реально видно
  let seenWorst = 0, seenSum = 0;
  const anchor = () => document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
    ?.closest("article.stage");

  // до самого верха, а не фиксированным числом шагов: лента длиннее, чем кажется,
  // и на трёх десятках шагов её верхняя половина просто не посещается
  while (window.scrollY > 0 && guard++ < 500) {
    const before = window.scrollY;
    const mark = anchor();
    const top = mark?.getBoundingClientRect().top;

    window.scrollBy(0, -step);
    await sleep(120);

    // скачок высоты считаем ДО решения о выходе: иначе последний, самый крупный,
    // терялся ровно там, где дефект сильнее всего
    const h = document.documentElement.scrollHeight;
    if (h !== prev) {
      jumps++;
      sum += Math.abs(h - prev);
      worst = Math.max(worst, Math.abs(h - prev));
      prev = h;
    }
    if (mark?.isConnected && top != null) {
      const шагнули = before - window.scrollY;
      const уехало = Math.abs(mark.getBoundingClientRect().top - top - шагнули);
      if (уехало > 1) { seenSum += уехало; seenWorst = Math.max(seenWorst, уехало); }
    }

    // шаг вверх не продвинул — это и есть дефект в чистом виде: лента доросла ровно
    // настолько, насколько мы поднялись. Выходим, если так несколько раз подряд
    stuck = window.scrollY >= before ? stuck + 1 : 0;
    if (stuck >= 3) break;
  }
  return {
    шагов: guard,
    доехал_до_верха: window.scrollY === 0,
    высота_документа: { скачков: jumps, суммарно_px: sum, худший_px: worst },
    видимый_сдвиг: { суммарно_px: Math.round(seenSum), худший_px: Math.round(seenWorst) },
  };
}

(async () => {
  const экран = `${window.innerWidth}×${window.innerHeight}`;
  // сначала дефект (нужна нетронутая лента), потом правда о высотах
  const дефект = await jitter();
  const правда = await heights();
  console.table(правда.строки);
  console.log({ экран, дёрганье: дефект, промахи: { формула: правда.формула, было_бы_с_общей_250: правда.общая_заглушка_250 } });
})();
