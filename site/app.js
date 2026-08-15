// Хроника: оглавление, лайтбокс, спойлеры, видео-в-кадре, scroll-spy.
// Ванильный JS, состояние — только DOM-классы.

// — оглавление —
const tocd = document.getElementById("tocd");
document.getElementById("toc-btn").addEventListener("click", () => tocd.showModal());
document.getElementById("tocd-x").addEventListener("click", () => tocd.close());
tocd.addEventListener("click", e => {
  if (e.target === tocd) { tocd.close(); return; }
  const a = e.target.closest("a[data-nav-to]");
  if (!a) return;
  e.preventDefault();
  tocd.close();
  document.getElementById(a.getAttribute("href").slice(1))
    ?.scrollIntoView({ behavior: "smooth" });
});

// — спойлеры: клик раскрывает; раскрытие съедает клик (лайтбокс не открывается) —
document.addEventListener("click", e => {
  const inline = e.target.closest(".spoiler:not(.open)");
  if (inline) { inline.classList.add("open"); return; }
  const moment = e.target.closest(".moment.is-spoiler:not(.open)");
  if (moment) { moment.classList.add("open"); e.stopImmediatePropagation(); }
}, { capture: true });
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.matches(".spoiler:not(.open)")) e.target.classList.add("open");
});

// — лайтбокс —
const lb = document.getElementById("lb");
const lbImg = document.getElementById("lb-img");
const lbCap = document.getElementById("lb-cap");
document.addEventListener("click", e => {
  const im = e.target.closest("img.shot");
  if (!im || lb.open) return;
  lbImg.src = im.src;
  lbImg.alt = im.alt;
  lbCap.textContent = im.alt;
  lb.showModal();
});
document.getElementById("lb-x").addEventListener("click", () => lb.close());
lb.addEventListener("click", e => { if (e.target === lb) lb.close(); });
lb.addEventListener("close", () => { lbImg.src = ""; });

// — видео: играет в кадре, пауза вне; клик — ручное управление (нативные controls) —
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const vio = new IntersectionObserver(es => es.forEach(e => {
    const v = e.target;
    if (e.isIntersecting) { if (!v.dataset.manual) v.play().catch(() => {}); }
    else { v.dataset.io = "1"; v.pause(); }
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

// — scroll-spy: активная запись в оглавлении —
const spy = new IntersectionObserver(es => {
  es.forEach(e => {
    if (!e.isIntersecting) return;
    const i = e.target.dataset.nav;
    document.querySelectorAll("[data-nav-to]").forEach(a =>
      a.classList.toggle("on", a.dataset.navTo === i));
  });
}, { rootMargin: "-35% 0px -55% 0px" });
document.querySelectorAll("[data-nav]").forEach(el => spy.observe(el));
