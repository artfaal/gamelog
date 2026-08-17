// Хроника: полка, лайтбокс, спойлеры, видео-в-кадре, scroll-spy.
// Ванильный JS, состояние — только DOM-классы.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

// — полка: нативный переход по якорю, диалог просто закрывается —
const shelf = document.getElementById("shelf");
document.getElementById("shelf-x").addEventListener("click", () => shelf.close());
shelf.addEventListener("click", e => {
  if (e.target === shelf) shelf.close();
  else if (e.target.closest("a[data-nav-to]")) shelf.close();
});

// — поиск на полке: набор фильтрует сетку постеров, Enter ведёт к лучшему совпадению —
const shelfQ = document.getElementById("shelf-q");
const shelfCount = document.getElementById("shelf-count");
const shelfPick = document.getElementById("shelf-pick");   // кандидат под Enter — вслух, для скринридера
const shelfItems = [...shelf.querySelectorAll("#shelf-list a")].map(el => ({
  el,
  name: el.title,
  slug: el.hash.slice(1),
  status: el.dataset.status,
  score: el.dataset.score ? Number(el.dataset.score) : null,
  hours: el.dataset.hours ? Number(el.dataset.hours) : null,
  genres: el.dataset.genres ? el.dataset.genres.split("|") : [],
  flags: [el.dataset.coop !== undefined ? "coop" : "", el.dataset.moments ? "moments" : ""].filter(Boolean),
}));
let shelfHits = shelfItems, shelfPos = 0;

const fold = s => s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// набрал не переключив раскладку: «фещьшс» — тоже Atomic
const RU2EN = { й: "q", ц: "w", у: "e", к: "r", е: "t", н: "y", г: "u", ш: "i", щ: "o", з: "p",
  ф: "a", ы: "s", в: "d", а: "f", п: "g", р: "h", о: "j", л: "k", д: "l", ж: ";", э: "'",
  я: "z", ч: "x", с: "c", м: "v", и: "b", т: "n", ь: "m", б: ",", ю: "." };
const relayout = s => s.replace(/[а-яё]/gi, c => RU2EN[c.toLowerCase()] ?? c);

// чем раньше совпало, тем выше: начало имени → начало слова → внутри слова → инициалы → слаг
const rank = (it, q) => {
  const hay = fold(it.name), flat = q.replace(/ /g, "");
  if (hay.startsWith(q)) return 4;
  if (hay.includes(` ${q}`)) return 3;
  if (hay.includes(q)) return 2;
  if (hay.split(" ").map(w => w[0]).join("").startsWith(flat)) return 1.5;   // sts → Slay the Spire 2
  if (it.slug.replace(/-/g, "").includes(flat)) return 1;                    // atomicheart → atomic-heart
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
  shelf.querySelectorAll(".shelf__year").forEach(sec =>
    sec.classList.toggle("is-off", !sec.querySelector("a:not(.is-off)")));
  shelfCount.textContent = !shelfQ.value.trim() && !shelfPicked().length ? ""
    : shelfHits.length ? `${shelfHits.length} из ${shelfItems.length}` : "ничего не нашлось";
  shelfPick.textContent = hit ? ` — ${hit.name}` : "";
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

const shelfFind = () => {
  const rows = shelfPicked();
  shelfReset.hidden = !rows.length;
  const kept = rows.length
    ? shelfItems.filter(it => rows.every(cs => cs.some(c => chipFits(it, c))))
    : shelfItems;
  const raw = shelfQ.value.trim();
  const qs = [...new Set([fold(raw), fold(relayout(raw))])].filter(Boolean);
  // сортировка стабильная — внутри одного ранга порядок остаётся хронологическим
  shelfHits = raw
    ? kept.map(it => [it, Math.max(...qs.map(q => rank(it, q)))])
      .filter(([, r]) => r > 0).sort((a, b) => b[1] - a[1]).map(([it]) => it)
    : kept;
  shelfPos = 0;
  shelfPaint();
};

// набранное сбрасывается на каждом открытии, выбранные чипы — нет:
// запрос разовый, а фильтр — режим просмотра, в котором читатель остаётся
const shelfOpen = focus => {
  shelfQ.value = "";
  shelfFind();
  shelf.showModal();
  // без фокуса поля фокус уехал бы на крестик и мигал кольцом — уводим в сам диалог
  if (focus) shelfQ.focus();
  else shelf.focus();
};
// на телефоне поле не фокусируем — иначе диалог открывается под выехавшей клавиатурой
document.getElementById("shelf-btn").addEventListener("click", () =>
  shelfOpen(matchMedia("(hover: hover) and (pointer: fine)").matches));

shelf.querySelector(".shelf__filters").addEventListener("click", e => {
  const c = e.target.closest(".chip--filter");
  if (!c) return;
  if (c === shelfReset) shelfChips.forEach(x => x.setAttribute("aria-pressed", "false"));
  else c.setAttribute("aria-pressed", String(c.getAttribute("aria-pressed") !== "true"));
  shelfFind();
});

shelfQ.addEventListener("input", shelfFind);
shelfQ.addEventListener("keydown", e => {
  // у type=search первый Esc нативно чистит поле — диалог закрылся бы только со второго
  if (e.key === "Escape") { e.preventDefault(); shelf.close(); return; }
  const hit = shelfHit();
  if (!hit) return;               // нечего выбирать — клавиши работают как в обычном поле
  if (e.key === "Enter") {
    e.preventDefault();
    hit.el.click();
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    shelfPos = (shelfPos + (e.key === "ArrowDown" ? 1 : -1) + shelfHits.length) % shelfHits.length;
    shelfPaint();
    shelfHits[shelfPos].el.scrollIntoView({ block: "nearest" });
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
  try { await navigator.clipboard.writeText(url); } catch { return; }
  btn.classList.add("ok");
  btn.setAttribute("aria-label", "Ссылка скопирована");
  setTimeout(() => {
    btn.classList.remove("ok");
    btn.setAttribute("aria-label", "Поделиться ссылкой на запись");
  }, 1500);
});

// — лайтбокс: все медиа записи одной лентой, листается стрелками и кликом по краям —
const lb = document.getElementById("lb");
const lbStage = document.getElementById("lb-stage");
const lbCap = document.getElementById("lb-cap");
const lbCount = document.getElementById("lb-count");
const lbPrev = document.getElementById("lb-prev");
const lbNext = document.getElementById("lb-next");
let reel = [], pos = 0;

// лента записи в порядке вёрстки: клип шапки, кадры, моменты; спойлер до раскрытия не листается
const reelOf = el => [...el.closest("article.stage").querySelectorAll(".shotbtn img, video.clip")]
  .filter(m => !m.closest(".moment.is-spoiler:not(.open)"));

const lbShow = () => {
  const src = reel[pos];
  const cap = src.alt || src.getAttribute("aria-label") || "";
  const node = document.createElement(src.tagName === "VIDEO" ? "video" : "img");
  node.src = src.src;
  if (node.tagName === "VIDEO") node.controls = node.loop = node.playsInline = true;
  else node.alt = cap;
  lbStage.replaceChildren(node);
  if (node.tagName === "VIDEO" && !reduceMotion.matches) node.play().catch(() => {});
  lbCap.textContent = cap;
  lbCount.textContent = reel.length > 1 ? `${pos + 1} / ${reel.length}` : "";
  lbPrev.hidden = lbNext.hidden = reel.length < 2;
};
const lbGo = d => { pos = (pos + d + reel.length) % reel.length; lbShow(); };
const lbOpen = media => {
  reel = reelOf(media);
  pos = reel.indexOf(media);
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
lb.addEventListener("close", () => lbStage.replaceChildren());

// — видео: играет в кадре, пауза вне; ручная пауза уважается —
{
  const autoplay = !reduceMotion.matches;
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

// — «наверх»: появляется, когда шапка ушла из вида —
const topBtn = document.getElementById("top-btn");
new IntersectionObserver(es =>
  topBtn.classList.toggle("show", !es[0].isIntersecting)
).observe(document.querySelector(".site-head"));
topBtn.addEventListener("click", () => scrollTo({
  top: 0,
  behavior: reduceMotion.matches ? "auto" : "smooth",
}));

// — кнопки-таблетки не мешают чтению: на узком экране они уезжают, пока читатель
//   едет вниз, и возвращаются, как только он двинулся вверх —
let lastY = scrollY;
addEventListener("scroll", () => {
  const dy = scrollY - lastY;
  if (Math.abs(dy) < 6) return;                       // дрожание пальца — не сигнал
  document.body.classList.toggle("fabs-away", dy > 0 && scrollY > 200);
  lastY = scrollY;
}, { passive: true });

// — scroll-spy: активная запись на полке —
const spy = new IntersectionObserver(es => {
  es.forEach(e => {
    if (!e.isIntersecting) return;
    const i = e.target.dataset.nav;
    document.querySelectorAll("[data-nav-to]").forEach(a => {
      const on = a.dataset.navTo === i;
      a.classList.toggle("on", on);
      if (on) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
  });
}, { rootMargin: "-35% 0px -55% 0px" });
document.querySelectorAll("[data-nav]").forEach(el => spy.observe(el));
