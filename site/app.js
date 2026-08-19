// Хроника: полка, лайтбокс, спойлеры, видео-в-кадре, scroll-spy.
// Ванильный JS, состояние — только DOM-классы.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
// «экономия трафика» в браузере — прямая просьба не качать лишнего: клип весит мегабайты,
// а автоплей тянет его целиком. Такой же выключатель автозапуска, как reduce-motion
const saveData = navigator.connection?.saveData === true;
const autoplay = !reduceMotion.matches && !saveData;

// — полка: нативный переход по якорю, диалог просто закрывается —
const shelf = document.getElementById("shelf");
// сетка постеров — один узел на два места: стена в хвосте ленты и полка. Переносим,
// а не копируем: две разметки для одного факта разъехались бы на первой же правке
const wall = document.getElementById("wall");
const shelfList = document.getElementById("shelf-list");
document.getElementById("shelf-x").addEventListener("click", () => shelf.close());
shelf.addEventListener("click", e => {
  if (e.target === shelf) shelf.close();
  else if (e.target.closest("a[data-nav-to]")) shelf.close();
});

// — поиск на полке: набор фильтрует сетку постеров, Enter ведёт к лучшему совпадению —
const shelfQ = document.getElementById("shelf-q");
const shelfCount = document.getElementById("shelf-count");
const shelfPick = document.getElementById("shelf-pick");
const shelfBtn = document.getElementById("shelf-btn");
const shelfGrid = document.getElementById("shelf-grid");
const shelfEmpty = document.getElementById("shelf-empty");
const shelfFilters = document.getElementById("shelf-filters");
const shelfFCount = document.getElementById("shelf-fcount");
const shelfSort = document.getElementById("shelf-sort");
const sayBox = document.getElementById("say");                // короткие сообщения скрипта вслух
const say = msg => { sayBox.textContent = ""; setTimeout(() => sayBox.textContent = msg, 50); };   // кандидат под Enter — вслух, для скринридера
const shelfItems = [...shelfList.querySelectorAll("a")].map(el => ({
  el,
  name: el.title,
  slug: el.hash.slice(1),
  status: el.dataset.status,
  score: el.dataset.score ? Number(el.dataset.score) : null,
  hours: el.dataset.hours ? Number(el.dataset.hours) : null,
  genres: el.dataset.genres ? el.dataset.genres.split("|") : [],
  flags: [el.dataset.coop !== undefined ? "coop" : "", el.dataset.moments ? "moments" : ""].filter(Boolean),
  raw: el.dataset.text ?? "",
}));
// заголовок группы и его карточки: заголовок уходит, когда из группы не осталось никого
const shelfHeads = [...shelfGrid.querySelectorAll(".shelf__head")].map(h => {
  const items = [];
  for (let n = h.nextElementSibling; n && !n.classList.contains("shelf__head"); n = n.nextElementSibling) items.push(n);
  return { h, items };
});
let shelfHits = shelfItems, shelfPos = 0;

const fold = s => s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// набрал не переключив раскладку: «фещьшс» — тоже Atomic
const RU2EN = { й: "q", ц: "w", у: "e", к: "r", е: "t", н: "y", г: "u", ш: "i", щ: "o", з: "p",
  ф: "a", ы: "s", в: "d", а: "f", п: "g", р: "h", о: "j", л: "k", д: "l", ж: ";", э: "'",
  я: "z", ч: "x", с: "c", м: "v", и: "b", т: "n", ь: "m", б: ",", ю: "." };
const relayout = s => s.replace(/[а-яё]/gi, c => RU2EN[c.toLowerCase()] ?? c);
shelfItems.forEach(it => { it.text = fold(it.raw); });

// чем раньше совпало, тем выше: начало имени → начало слова → внутри слова → инициалы → слаг
const rank = (it, q) => {
  const hay = fold(it.name), flat = q.replace(/ /g, "");
  if (hay.startsWith(q)) return 4;
  if (hay.includes(` ${q}`)) return 3;
  if (hay.includes(q)) return 2;
  if (hay.split(" ").map(w => w[0]).join("").startsWith(flat)) return 1.5;   // sts → Slay the Spire 2
  if (it.slug.replace(/-/g, "").includes(flat)) return 1;                    // atomicheart → atomic-heart
  if (it.text.includes(q)) return 0.5;                                       // по тексту записи — последним
  return 0;
};

// кандидат под Enter есть только пока в поле что-то набрано: пустой фильтр — просто «все записи»
const shelfHit = () => (shelfQ.value.trim() ? shelfHits[shelfPos] : null);

const shelfPaint = () => {
  const live = new Set(shelfHits);
  const hit = shelfHit();
  shelfItems.forEach(it => {
    it.el.classList.toggle("is-off", !live.has(it));
    it.el.classList.toggle("is-hit", it === hit);
  });
  shelfHeads.forEach(g => g.h.classList.toggle("is-off", !g.items.some(a => !a.classList.contains("is-off"))));
  // пустой результат — не пустой прямоугольник: сообщение и сброс прямо в сетке
  shelfEmpty.hidden = shelfHits.length > 0;
  shelfCount.textContent = !shelfQ.value.trim() && !shelfPicked().length ? ""
    : shelfHits.length ? `${shelfHits.length} из ${shelfItems.length}` : "ничего не нашлось";
  shelfPick.textContent = hit ? `. Enter откроет ${hit.name}` : "";
};

// — фильтр: чипы сужают набор, дальше по нему работает поиск —
// пороги приезжают из сборки атрибутами; здесь только их применение
const shelfChips = [...shelf.querySelectorAll(".chip--filter[data-k]")];
const shelfReset = document.getElementById("shelf-reset");
const chipFits = (it, c) => {
  const d = c.dataset;
  if (d.k === "score") return it.score != null && it.score >= Number(d.min);
  if (d.k === "hours") return it.hours != null
    && (d.min === undefined || it.hours >= Number(d.min))
    && (d.max === undefined || it.hours < Number(d.max));
  if (d.k === "status") return it.status === d.v;
  if (d.k === "flag") return it.flags.includes(d.v);
  if (d.k === "genre") return it.genres.includes(d.v);
  return true;
};
// внутри ряда чипы складываются по ИЛИ, ряды между собой — по И
const shelfPicked = () => {
  const rows = {};
  for (const c of shelfChips) {
    if (c.getAttribute("aria-pressed") !== "true") continue;
    (rows[c.dataset.k] ??= []).push(c);
  }
  return Object.values(rows);
};

// чип, под который не подходит ни одна запись, показывать незачем — сразу прячем;
// считаем тем же chipFits, второй копии порогов не заводим
shelfChips.forEach(c => { c.hidden = !shelfItems.some(it => chipFits(it, c)); });

// срез фильтра отдаётся ссылкой: #f=score9,hours40. Якорь записи (#hades) остаётся
// якорем — от среза его отличает префикс «f=», больше hash ни на что не разбирается.
// Токен собирается из тех же атрибутов, что и фильтр: второй копии порогов нет
const chipTok = c => `${c.dataset.k}${c.dataset.v ?? ""}${c.dataset.min ?? ""}${c.dataset.max ? `-${c.dataset.max}` : ""}`;
const shelfHash = () => {
  const f = shelfChips.filter(c => c.getAttribute("aria-pressed") === "true")
    .map(c => encodeURIComponent(chipTok(c))).join(",");
  if (!f && !location.hash.startsWith("#f=")) return;   // чужой якорь записи не трогаем
  // replaceState, а не hash=: срез — не шаг истории, «назад» должно уводить со страницы
  history.replaceState(null, "", f ? `#f=${f}` : location.pathname + location.search);
};

const shelfFind = () => {
  const rows = shelfPicked();
  const on = shelfChips.filter(c => c.getAttribute("aria-pressed") === "true").length;
  const raw = shelfQ.value.trim();
  shelfReset.hidden = !on && !raw;
  // включённый фильтр виден снаружи: он переживает закрытие полки, и без метки
  // читатель возвращается к обрезанной сетке, не понимая почему
  shelfBtn.classList.toggle("is-on", on > 0);
  shelfBtn.setAttribute("aria-label", on
    ? `Полка — поиск и фильтр по играм, фильтров включено: ${on}`
    : "Полка — поиск и фильтр по играм");
  shelfFCount.textContent = on ? ` · ${on}` : "";
  // копия, а не сам shelfItems: порядок ниже сортируется на месте, и без копии
  // исходный список перемешался бы навсегда — стрелки в поиске ходили бы не по сетке
  const kept = rows.length
    ? shelfItems.filter(it => rows.every(cs => cs.some(c => chipFits(it, c))))
    : [...shelfItems];
  // порядок не по дате: карточки переставляет CSS-свойство order, узлы остаются на месте,
  // а заголовки групп прячутся — вне хронологии они бы врали
  const by = shelfSort.value;
  if (by !== "date") kept.sort((a, b) => (b[by] ?? -1) - (a[by] ?? -1));
  shelfGrid.classList.toggle("is-sorted", by !== "date");
  if (by === "date") shelfItems.forEach(it => { it.el.style.order = ""; });
  else kept.forEach((it, i) => { it.el.style.order = i + 1; });
  const qs = [...new Set([fold(raw), fold(relayout(raw))])].filter(Boolean);
  // сортировка стабильная — внутри одного ранга порядок остаётся тем же, что в сетке
  shelfHits = raw
    ? kept.map(it => [it, Math.max(...qs.map(q => rank(it, q)))])
      .filter(([, r]) => r > 0).sort((a, b) => b[1] - a[1]).map(([it]) => it)
    : kept;
  shelfPos = 0;
  shelfHash();
  shelfPaint();
};
shelfSort.addEventListener("change", shelfFind);

// сброс — и запрос, и чипы: после пустого результата полка возвращается одним нажатием
const shelfClear = () => {
  shelfQ.value = "";
  shelfChips.forEach(x => x.setAttribute("aria-pressed", "false"));
  shelfFind();
};
document.getElementById("shelf-empty-reset").addEventListener("click", shelfClear);

const shelfOpen = focus => {
  shelfFind();
  // свёрнутый фильтр не съедает экран, пока им не пользуются; включённый — раскрыт,
  // иначе непонятно, почему в сетке четыре игры вместо шестнадцати
  shelfFilters.open = shelfChips.some(c => c.getAttribute("aria-pressed") === "true");
  shelf.append(shelfList);
  shelf.showModal();
  shelfBtn.setAttribute("aria-expanded", "true");
  // без фокуса поля фокус уехал бы на крестик и мигал кольцом — уводим в сам диалог
  if (focus) shelfQ.focus();
  else shelf.focus();
  // полка открывается там, где читатель сейчас: активную карточку видно без прокрутки
  shelfGrid.querySelector("a.on")?.scrollIntoView({ block: "center" });
};
shelf.addEventListener("close", () => {
  shelfBtn.setAttribute("aria-expanded", "false");
  // набранное снимается с закрытием, выбранные чипы — нет: запрос разовый, а фильтр —
  // режим просмотра. Сетка та же самая и остаётся в хвосте ленты стеной: уехал бы туда
  // и последний поиск — стена показывала бы одну обложку из семнадцати
  shelfQ.value = "";
  shelfFind();
  wall.append(shelfList);   // стена возвращается на место
});
// на телефоне поле не фокусируем — иначе диалог открывается под выехавшей клавиатурой
shelfBtn.addEventListener("click", () =>
  shelfOpen(matchMedia("(hover: hover) and (pointer: fine)").matches));

// ссылка со срезом, открытая в чистой вкладке, открывает полку тем же срезом
if (location.hash.startsWith("#f=")) {
  // битый процент в адресе — не повод уронить весь скрипт вместе с лайтбоксом
  const dec = t => { try { return decodeURIComponent(t); } catch { return t; } };
  const toks = new Set(location.hash.slice(3).split(",").map(dec));
  shelfChips.forEach(c => c.setAttribute("aria-pressed", String(toks.has(chipTok(c)))));
  shelfOpen(false);
}

shelf.querySelector(".shelf__filters").addEventListener("click", e => {
  const c = e.target.closest(".chip--filter");
  if (!c) return;
  if (c === shelfReset) { shelfClear(); return; }
  const was = c.getAttribute("aria-pressed") === "true";
  // ряд с data-solo — взаимоисключающий: два порога оценки разом всё равно дают нижний
  if (c.parentElement.hasAttribute("data-solo"))
    c.parentElement.querySelectorAll(".chip--filter").forEach(x => x.setAttribute("aria-pressed", "false"));
  c.setAttribute("aria-pressed", String(!was));
  shelfFind();
});

shelfQ.addEventListener("input", shelfFind);
shelfQ.addEventListener("keydown", e => {
  // у type=search первый Esc нативно чистит поле, но не перерисовывает сетку — делаем сами:
  // набранное Esc снимает, пустое поле закрывает полку
  if (e.key === "Escape") {
    e.preventDefault();
    if (shelfQ.value) { shelfQ.value = ""; shelfFind(); } else shelf.close();
    return;
  }
  const hit = shelfHit();
  if (!hit) return;               // нечего выбирать — клавиши работают как в обычном поле
  if (e.key === "Enter") {
    e.preventDefault();
    hit.el.click();
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    shelfPos = (shelfPos + (e.key === "ArrowDown" ? 1 : -1) + shelfHits.length) % shelfHits.length;
    shelfPaint();
    shelfHits[shelfPos].el.scrollIntoView({ block: "nearest", behavior: reduceMotion.matches ? "auto" : "smooth" });
  }
});

// «/» — открыть полку сразу в поиске; поверх другого диалога и в поле не перехватываем
addEventListener("keydown", e => {
  if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
  if (document.querySelector("dialog[open]") || e.target.matches("input, textarea")) return;
  e.preventDefault();
  shelfOpen(true);
});

// — спойлеры: раскрытая кнопка становится обычным текстом —
document.addEventListener("click", e => {
  const btn = e.target.closest("button.spoiler");
  if (btn) {
    const span = document.createElement("span");
    span.className = "spoiler open";
    span.innerHTML = btn.firstElementChild.innerHTML;
    span.tabIndex = -1;
    btn.replaceWith(span);
    span.focus();
    return;
  }
  const reveal = e.target.closest("button.reveal");
  if (reveal) {
    const fig = reveal.closest(".moment");
    fig.classList.add("open");
    fig.querySelectorAll("[inert]").forEach(el => el.removeAttribute("inert"));
    reveal.remove();
    const vid = fig.querySelector("video");
    if (vid && !reduceMotion.matches) vid.play().catch(() => {});   // раскрыли момент — видео идёт
    const target = vid ?? fig.querySelector(".shotbtn") ?? fig.querySelector("figcaption");
    if (target.tabIndex < 0) target.tabIndex = -1;
    target.focus();
  }
});

// — поделиться: системный шэр на мобиле, копирование ссылки на десктопе —
document.addEventListener("click", async e => {
  const btn = e.target.closest("button.share");
  if (!btn) return;
  const url = `${location.origin}/e/${btn.dataset.slug}/`;
  if (navigator.share) { navigator.share({ title: btn.dataset.name, url }).catch(() => {}); return; }
  try { await navigator.clipboard.writeText(url); }
  catch {
    // провал виден и глазами: say() — строка sr-only, с ней зрячий читатель
    // не отличил бы неудачу от успеха и ушёл бы с пустым буфером
    btn.classList.add("err");
    say("Скопировать не вышло — буфер обмена недоступен");
    setTimeout(() => btn.classList.remove("err"), 3000);
    return;
  }
  btn.classList.add("ok");
  say("Ссылка скопирована");   // имя кнопки остаётся на месте: подмена на 1,5 с прячет действие
  setTimeout(() => btn.classList.remove("ok"), 1500);
});

// — лайтбокс: все медиа записи одной лентой, листается стрелками и кликом по краям —
const lb = document.getElementById("lb");
const lbStage = document.getElementById("lb-stage");
const lbCap = document.getElementById("lb-cap");
const lbCount = document.getElementById("lb-count");
const lbPrev = document.getElementById("lb-prev");
const lbNext = document.getElementById("lb-next");
let reel = [], pos = 0, lbFrom = null;

// лента записи в порядке вёрстки: клип шапки, кадры, моменты; спойлер до раскрытия не листается
const reelOf = el => [...el.closest("article.stage").querySelectorAll(".shotbtn img, video.clip")]
  .filter(m => !m.closest(".moment.is-spoiler:not(.open)"));

const lbShow = () => {
  const src = reel[pos];
  // кадр мог не дождаться своей очереди у наблюдателя — в лайтбокс он идёт уже с адресом
  if (src.dataset.src && !src.getAttribute("src")) src.src = src.dataset.src;
  const cap = src.alt || src.getAttribute("aria-label") || "";
  const node = document.createElement(src.tagName === "VIDEO" ? "video" : "img");
  node.src = src.src;
  if (node.tagName === "VIDEO") node.controls = node.loop = node.playsInline = true;
  else node.alt = cap;
  lbStage.replaceChildren(node);
  if (node.tagName === "VIDEO" && !reduceMotion.matches) node.play().catch(() => {});
  lbCap.textContent = cap;
  lbCount.textContent = reel.length > 1 ? `${pos + 1} из ${reel.length}` : "";
  lbPrev.hidden = lbNext.hidden = reel.length < 2;
};
const lbGo = d => { pos = (pos + d + reel.length) % reel.length; lbShow(); };
const lbOpen = media => {
  lbFrom = document.activeElement;
  reel = reelOf(media);
  pos = reel.indexOf(media);
  // клип в ленте продолжал бы играть под открытым лайтбоксом — два ролика разом.
  // data-io говорит обработчику паузы, что она не ручная, data-lb — кого возобновлять
  document.querySelectorAll("video.clip").forEach(v => {
    if (v.paused) return;
    v.dataset.io = "1";
    v.dataset.lb = "1";
    v.pause();
  });
  lbShow();
  lb.showModal();
};

// вход в лайтбокс — кадром; ролики листаются внутри, уже открытым
document.addEventListener("click", e => {
  const shot = e.target.closest("button.shotbtn");
  if (!shot) return;
  if (shot.closest(".moment.is-spoiler:not(.open)")) return; // сперва раскрыть спойлер
  lbOpen(shot.querySelector("img"));
});
lbPrev.addEventListener("click", () => lbGo(-1));
lbNext.addEventListener("click", () => lbGo(1));
document.getElementById("lb-x").addEventListener("click", () => lb.close());
// клик мимо кнопок закрывает; ролик исключён — там свои контролы
lb.addEventListener("click", e => { if (!e.target.closest("button, video")) lb.close(); });
lb.addEventListener("keydown", e => {
  if (e.target.closest("video")) return;   // в плеере стрелки перематывают, а не листают
  if (e.key === "ArrowLeft") lbGo(-1);
  else if (e.key === "ArrowRight") lbGo(1);
});
lb.addEventListener("close", () => {
  lbStage.replaceChildren();
  // кадр мог уехать из DOM (спойлер перерисовал момент) — тогда фокус просто не трогаем
  if (lbFrom?.isConnected) lbFrom.focus();
  lbFrom = null;
  // возвращаем только те, что играли до открытия: поставленный на паузу руками так и стоит.
  // autoplay тут не спрашиваем: при reduce-motion и saveData клип играет только с руки
  // читателя — забрать его на время лайтбокса можно, не вернуть после закрытия нельзя
  document.querySelectorAll("video.clip[data-lb]").forEach(v => {
    delete v.dataset.lb;
    if (!v.dataset.manual) v.play().catch(() => {});
  });
});

// — видео: играет в кадре, пауза вне; ручная пауза уважается —
{
  const vio = new IntersectionObserver(es => es.forEach(e => {
    const v = e.target;
    if (e.isIntersecting) {
      if (autoplay && !v.dataset.manual && !v.closest(".moment.is-spoiler:not(.open)")) v.play().catch(() => {});
    }
    else if (!v.paused) { v.dataset.io = "1"; v.pause(); }
  }), { threshold: 0.35 });
  document.querySelectorAll("video.clip").forEach(v => {
    v.addEventListener("pause", () => {
      if (v.dataset.io) delete v.dataset.io;   // пауза от observer — не ручная
      else v.dataset.manual = "1";             // пауза от пользователя — не автозапускать
    });
    v.addEventListener("play", () => delete v.dataset.manual);
    vio.observe(v);
  });
}

// — постеры на подходе: сборка кладёт файл в data-poster, поведение живёт здесь —
// обои узкого экрана (--poster для размытых слоёв) и кадр-заглушка клипа. Иначе браузер
// тянет и то и другое сразу на всю ленту: постер из CSS-фона мимо lazy, кадр — мимо preload="none"
{
  const wake = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    wake.unobserve(el);
    if (el.tagName === "VIDEO") el.poster = el.dataset.poster;
    else if (el.tagName === "IMG") el.src = el.dataset.src;
    else el.style.setProperty("--poster", `url('${el.dataset.poster}')`);
  }), { rootMargin: "50% 0px" });
  document.querySelectorAll("article.stage[data-poster], video.clip[data-poster]").forEach(el => wake.observe(el));

  // кадры первой записи: loading="lazy" в разметке остаётся, но Chrome тянет lazy-картинку
  // ещё за ~1250 px до экрана, а пара кадров первой записи лежит ближе — и приезжает
  // на первый экран мегабайтами. Снимаем у неё адрес до первой раскладки и возвращаем
  // на подходе, тем же наблюдателем. Дальше по ленте порог браузера уже никого не
  // достаёт, там кадры остаются на нативном lazy и живут без JS
  document.querySelector("article.stage")?.querySelectorAll("img.shot").forEach(img => {
    img.dataset.src = img.getAttribute("src");
    img.removeAttribute("src");
    wake.observe(img);
  });

  // постеры полки: она в <dialog>, до открытия не грузится ни одна lazy-картинка — и сетка
  // собиралась на глазах у читателя. Будим в простой, но не раньше первого движения по ленте:
  // на первом экране эти полтора мегабайта отнимают канал у обоев, а к полке идут уже из чтения
  const idle = typeof requestIdleCallback === "function" ? requestIdleCallback : cb => setTimeout(cb, 2000);
  const warmShelf = () => idle(() =>
    document.querySelectorAll("#shelf-list img[loading]").forEach(img => { img.loading = "eager"; }));
  if (!saveData) addEventListener("scroll", warmShelf, { once: true, passive: true });
}

// — «наверх»: появляется, когда читатель отъехал от начала. По глубине прокрутки,
//   а не по шапке: липкая, она из вида больше не уходит —
const topBtn = document.getElementById("top-btn");
topBtn.addEventListener("click", () => scrollTo({
  top: 0,
  behavior: reduceMotion.matches ? "auto" : "smooth",
}));

// — кнопки-таблетки не мешают чтению: на узком экране они уезжают, пока читатель
//   едет вниз, и возвращаются, как только он двинулся вверх —
let lastY = scrollY;
addEventListener("scroll", () => {
  topBtn.classList.toggle("show", scrollY > 400);
  const dy = scrollY - lastY;
  if (Math.abs(dy) < 6) return;                       // дрожание пальца — не сигнал
  document.body.classList.toggle("fabs-away", dy > 0 && scrollY > 200);
  lastY = scrollY;
}, { passive: true });

// — scroll-spy: активная запись на полке и в шапке —
const headNow = document.getElementById("head-now");
const stages = document.querySelectorAll("[data-nav]");
const spy = new IntersectionObserver(es => {
  es.forEach(e => {
    if (!e.isIntersecting) return;
    const i = e.target.dataset.nav;
    // имя записи уже есть в её заголовке — второй копии в атрибуте не заводим
    headNow.textContent = `${Number(i) + 1} из ${stages.length} · ${e.target.querySelector("h2").textContent}`;
    document.querySelectorAll("[data-nav-to]").forEach(a => {
      const on = a.dataset.navTo === i;
      a.classList.toggle("on", on);
      if (on) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
  });
}, { rootMargin: "-35% 0px -55% 0px" });
stages.forEach(el => spy.observe(el));
