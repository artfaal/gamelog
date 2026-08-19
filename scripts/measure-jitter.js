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
// читатель не доехал, не разрешится никогда — она даже не начинала качаться
async function settled() {
  const limit = new Promise(r => setTimeout(r, 3000));
  await Promise.race([document.fonts.ready, limit]);
  const started = [...document.images].filter(i => i.currentSrc && i.complete);
  await Promise.race([Promise.all(started.map(i => i.decode().catch(() => {}))), limit]);
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
  let jumps = 0, sum = 0, worst = 0, guard = 0;
  // до самого верха, а не фиксированным числом шагов: лента длиннее, чем кажется,
  // и на 30 шагах верхняя половина просто не посещается
  let stuck = 0;
  while (window.scrollY > 0 && guard++ < 500) {
    const before = window.scrollY;
    window.scrollBy(0, -step);
    await sleep(120);
    // шаг вверх не продвинул — это и есть дефект в чистом виде: лента доросла ровно
    // настолько, насколько мы поднялись. Выходим только если так несколько раз подряд
    stuck = window.scrollY >= before ? stuck + 1 : 0;
    if (stuck >= 3) break;
    const h = document.documentElement.scrollHeight;
    if (h !== prev) {
      jumps++;
      sum += Math.abs(h - prev);
      worst = Math.max(worst, Math.abs(h - prev));
      prev = h;
    }
  }
  return { шагов: guard, скачков: jumps, суммарно_px: sum, худший_рывок_px: worst };
}

(async () => {
  const экран = `${window.innerWidth}×${window.innerHeight}`;
  // сначала дефект (нужна нетронутая лента), потом правда о высотах
  const дефект = await jitter();
  const правда = await heights();
  console.table(правда.строки);
  console.log({ экран, дёрганье: дефект, промахи: { формула: правда.формула, было_бы_с_общей_250: правда.общая_заглушка_250 } });
})();
