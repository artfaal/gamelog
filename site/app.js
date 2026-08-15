// Хроника: оглавление, лайтбокс, спойлеры, видео-в-кадре, scroll-spy.
// Ванильный JS, состояние — только DOM-классы.

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
    fig.querySelectorAll("[aria-hidden], [inert]").forEach(el => {
      el.removeAttribute("aria-hidden"); el.removeAttribute("inert");
    });
    reveal.remove();
    const target = fig.querySelector(".shotbtn") ?? fig.querySelector("figcaption");
    if (target && !("focus" in target && target.tabIndex >= 0)) target.tabIndex = -1;
    target?.focus();
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

// — лайтбокс: кадры-кнопки, доступно с клавиатуры —
const lb = document.getElementById("lb");
const lbImg = document.getElementById("lb-img");
const lbCap = document.getElementById("lb-cap");
document.addEventListener("click", e => {
  const btn = e.target.closest("button.shotbtn");
  if (!btn || lb.open) return;
  if (btn.closest(".moment.is-spoiler:not(.open)")) return; // сперва раскрыть спойлер
  const im = btn.querySelector("img");
  lbImg.src = im.src;
  lbImg.alt = im.alt;
  lbCap.textContent = im.alt;
  lb.showModal();
});
document.getElementById("lb-x").addEventListener("click", () => lb.close());
lb.addEventListener("click", () => lb.close());  // клик в любом месте закрывает
lb.addEventListener("close", () => { lbImg.src = ""; });

// — видео: играет в кадре, пауза вне; ручная пауза уважается —
{
  const autoplay = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const vio = new IntersectionObserver(es => es.forEach(e => {
    const v = e.target;
    if (e.isIntersecting) { if (autoplay && !v.dataset.manual) v.play().catch(() => {}); }
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
  behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
}));

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
