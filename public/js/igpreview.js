// Instagram preview: the studio's Preview button opens the post the way it will look on Instagram.
// Swipe (or use the arrows) through the slides; the caption folds like Instagram's, with "more".
// Slides are drawn by the studio's own engine (window.__studio.engine), from the post as it is on
// screen right now, unsaved edits included, so the preview matches the download exactly.

const studio = document.querySelector('meta[name="kh-studio"]').content;
const HANDLE = { kmp: "konnectedminds", unbroken: "the.unbroken_podcast" }[studio] || studio;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const IC = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2.1 0 3.5 1.2 5 3 1.5-1.8 2.9-3 5-3 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M20.7 16.6A9 9 0 1 0 17 20.3L21.5 21.5z"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M22 3L9.2 10.1M22 3l-7.3 18-3.5-8.9L2 8.7z"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M19 21l-7-6.2L5 21V3h14z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>'
};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// hashtags and @handles in Instagram's link colour
const rich = s => esc(s).replace(/(^|[\s(])([#@][\p{L}\p{N}_.]*[\p{L}\p{N}_])/gu, '$1<span class="igp-tag">$2</span>');
const dateLine = d => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(d || ""); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]}` : ""; };

let box = null, urls = [], run = 0, pushed = false, lastFocus = null;

function current() {
  const st = window.__studio && window.__studio.state;
  return st && st.posts.get(st.currentId);
}

function open() {
  const S = window.__studio, p = current();
  if (!S || !S.engine || !p) return;
  if (box) close(true);
  const id = p.id, data = JSON.parse(JSON.stringify(p)), n = data.slides.length;
  if (!n) return;
  const info = S.engine.info(id, data), mine = ++run;
  lastFocus = document.activeElement;

  // Instagram shows roughly the first 125 characters, then "… more"
  const cap = (data.caption || "").trim(), cut = cap.length > 125 || cap.split("\n").length > 2;
  const short = cut ? cap.split("\n").slice(0, 2).join("\n").slice(0, 125).replace(/\s+\S*$/, "") : cap;

  box = document.createElement("div");
  box.className = "igp";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Instagram preview");
  box.style.setProperty("--ar", info.ratio || 0.75);
  box.innerHTML = `
    <div class="igp-top">
      <button type="button" class="igp-x" data-igp-close aria-label="Close the preview">${IC.close}</button>
      <div class="igp-title"><b>Preview</b><span>How it will look on Instagram</span></div>
    </div>
    <article class="igp-post">
      <header class="igp-head">
        <span class="igp-av"><img src="/brand/${studio}-mark.png" alt=""></span>
        <b>${esc(HANDLE)}</b>
        <span class="igp-ic igp-dim" aria-hidden="true">${IC.more}</span>
      </header>
      <div class="igp-media">
        <div class="igp-track" tabindex="0" role="group" aria-roledescription="carousel" aria-label="${n} slide${n > 1 ? "s" : ""}. Swipe or use the arrow keys.">
          ${data.slides.map((_, i) => `<figure class="igp-slide wait" role="group" aria-roledescription="slide" aria-label="Slide ${i + 1} of ${n}"><img alt="" draggable="false"></figure>`).join("")}
        </div>
        ${n > 1 ? `<span class="igp-count" aria-hidden="true">1/${n}</span>
          <button type="button" class="igp-arrow prev" data-igp-step="-1" aria-label="Previous slide" hidden>${IC.prev}</button>
          <button type="button" class="igp-arrow next" data-igp-step="1" aria-label="Next slide">${IC.next}</button>` : ""}
      </div>
      <div class="igp-acts" aria-hidden="true">
        <span class="igp-ic">${IC.heart}</span><span class="igp-ic">${IC.chat}</span><span class="igp-ic">${IC.send}</span>
        <span class="igp-dots">${n > 1 ? data.slides.map((_, i) => `<i${i ? "" : ' class="on"'}></i>`).join("") : ""}</span>
        <span class="igp-ic igp-save">${IC.save}</span>
      </div>
      <div class="igp-cap">${cap
        ? `<p><b>${esc(HANDLE)}</b> <span data-igp-short>${rich(short)}${cut ? ` <button type="button" class="igp-more" data-igp-more>… more</button>` : ""}</span>${cut ? `<span data-igp-full hidden>${rich(cap)}</span>` : ""}</p>`
        : `<p class="igp-none">No caption yet.</p>`}</div>
      ${dateLine(data.date) ? `<p class="igp-date">${esc(dateLine(data.date))}</p>` : ""}
    </article>`;
  document.body.appendChild(box);
  document.documentElement.classList.add("igp-on");
  history.pushState({ igp: 1 }, ""); pushed = true;
  box.querySelector(n > 1 ? ".igp-track" : "[data-igp-close]").focus({ preventScroll: true });

  // slide 1 first, then the rest in order, so the first swipe is already drawn
  const figs = box.querySelectorAll(".igp-slide");
  (async () => {
    for (let i = 0; i < n; i++) {
      let blob = null;
      try { blob = await S.engine.slide(id, data, i, "image/jpeg", 0.9); } catch (e) { /* shown below */ }
      if (mine !== run) return;
      if (!blob) { figs[i].classList.replace("wait", "fail"); continue; }
      const u = URL.createObjectURL(blob); urls.push(u);
      const img = figs[i].querySelector("img");
      img.onload = () => figs[i].classList.remove("wait");
      img.src = u;
    }
  })();
}

function close(fromHistory) {
  if (!box) return;
  run++;
  box.remove(); box = null;
  document.documentElement.classList.remove("igp-on");
  urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
  if (pushed && !fromHistory) { pushed = false; history.back(); }
  pushed = false;
  if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
  else { const b = document.getElementById("igPreviewBtn"); if (b) b.focus({ preventScroll: true }); }
}

function step(d) {
  const t = box && box.querySelector(".igp-track"); if (!t) return;
  const i = Math.round(t.scrollLeft / Math.max(1, t.clientWidth)) + d;
  t.scrollTo({ left: Math.max(0, i) * t.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function onScroll(t) {
  const n = t.children.length, i = Math.max(0, Math.min(n - 1, Math.round(t.scrollLeft / Math.max(1, t.clientWidth))));
  const c = box.querySelector(".igp-count"); if (c) c.textContent = `${i + 1}/${n}`;
  box.querySelectorAll(".igp-dots i").forEach((d, j) => d.classList.toggle("on", j === i));
  const pv = box.querySelector(".igp-arrow.prev"), nx = box.querySelector(".igp-arrow.next");
  if (pv) pv.hidden = i === 0;
  if (nx) nx.hidden = i === n - 1;
}

document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("#igPreviewBtn, [data-igp-close], [data-igp-step], [data-igp-more]");
  if (!t) { if (box && e.target === box) close(); return; }
  if (t.id === "igPreviewBtn") return open();
  if (t.hasAttribute("data-igp-close")) return close();
  if (t.hasAttribute("data-igp-step")) return step(+t.dataset.igpStep);
  box.querySelector("[data-igp-short]").hidden = true;
  box.querySelector("[data-igp-full]").hidden = false;
});
document.addEventListener("scroll", e => { if (box && e.target.classList && e.target.classList.contains("igp-track")) onScroll(e.target); }, true);
// The preview takes the keys while it's open, so the studio behind it doesn't change slides or undo.
document.addEventListener("keydown", e => {
  if (!box) return;
  if (e.key === "Tab") {
    const f = [...box.querySelectorAll("button:not([hidden]), [tabindex]")];
    if (f.length && e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (f.length && !e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    return;
  }
  if (e.key === "Escape") { e.preventDefault(); close(); }
  else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); step(e.key === "ArrowLeft" ? -1 : 1); }
  e.stopImmediatePropagation();
}, true);
// the phone's back button closes the preview instead of leaving the studio
addEventListener("popstate", () => { if (box) close(true); });
