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
    btn.replaceWith(span);
    return;
  }
  const reveal = e.target.closest("button.reveal");
  if (reveal) {
    const fig = reveal.closest(".moment");
    fig.classList.add("open");
    fig.querySelectorAll("[aria-hidden]").forEach(el => el.removeAttribute("aria-hidden"));
    reveal.remove();
  }
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
lb.addEventListener("click", e => { if (e.target === lb) lb.close(); });
lb.addEventListener("close", () => { lbImg.src = ""; });

// — видео: играет в кадре, пауза вне; ручная пауза уважается —
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const vio = new IntersectionObserver(es => es.forEach(e => {
    const v = e.target;
    if (e.isIntersecting) { if (!v.dataset.manual) v.play().catch(() => {}); }
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
