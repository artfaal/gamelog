// Замер дёрганья ленты при чтении снизу вверх — тот сценарий, из-за которого
// появилась заглушка --h (см. README, «Записи вне экрана»). Скрипт для консоли
// браузера, а не для node: высоту записи знает только раскладка.
//
//   1. make serve  (или открой https://games.artfaal.ru)
//   2. поставь узкий экран — на телефоне дефект виден, на широком слабее
//   3. вставь этот файл целиком в консоль и дождись цифр
//
// Меряется изменение высоты документа: запись, материализуясь ВЫШЕ вьюпорта,
// двигает всё, что ниже, и читатель видит рывок. Цифры из README сняты так же —
// на 390×844 и 1440×900, шаг прокрутки 600 и 700 px соответственно.

(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const step = window.innerWidth < 768 ? 600 : 700;

  // залетаем в конец ленты: так ни одна запись выше ещё не рисовалась —
  // худший случай, он же и есть жалоба
  window.scrollTo(0, document.documentElement.scrollHeight);
  await sleep(1200);

  let prev = document.documentElement.scrollHeight;
  let jumps = 0, sum = 0, worst = 0;
  for (let i = 0; i < 30; i++) {
    window.scrollBy(0, -step);
    await sleep(120);
    const h = document.documentElement.scrollHeight;
    if (h !== prev) {
      jumps++;
      sum += Math.abs(h - prev);
      worst = Math.max(worst, Math.abs(h - prev));
      prev = h;
    }
  }

  // насколько заглушка разошлась с правдой — та же величина, но по записям
  const vh = window.innerHeight;
  const miss = [...document.querySelectorAll("article.stage")].map(a => {
    const declared = Number(a.style.getPropertyValue("--h")) || 250;
    const real = Math.round(a.getBoundingClientRect().height / vh * 100);
    return { запись: a.id, заглушка: declared, реально: real, промах: declared - real };
  });

  console.table(miss);
  console.log({
    экран: `${window.innerWidth}×${vh}`,
    скачков: jumps,
    суммарно_px: sum,
    худший_рывок_px: worst,
    худший_промах_svh: Math.max(...miss.map(m => Math.abs(m.промах))),
  });
})();
