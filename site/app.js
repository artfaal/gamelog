// Хроника: оглавление, лайтбокс, спойлеры, видео-в-кадре, scroll-spy.
// Ванильный JS, состояние — только DOM-классы.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

// — оглавление: нативный переход по якорю, диалог просто закрывается —
const tocd = document.getElementById("tocd");
document.getElementById("toc-btn").addEventListener("click", () => tocd.showModal());
document.getElementById("tocd-x").addEventListener("click", () => tocd.close());
tocd.addEventListener("click", e => {
  if (e.target === tocd) tocd.close();
  else if (e.target.closest("a[data-nav-to]")) tocd.close();
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

// — scroll-spy: активная запись в оглавлении —
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
