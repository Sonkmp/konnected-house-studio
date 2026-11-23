// The simple feed, for people who don't design. The content lead swipes through each post,
// comments and approves it; the content poster downloads approved posts (with the caption)
// and marks them posted. Designers keep the studios.
// Slides are drawn by the studio page itself, loaded once per studio in a hidden frame
// (studio.js ?engine=1), so what's approved here is exactly what gets downloaded.
import { db, requireMember, can, STUDIOS, ROLES, esc, initialsOf, logOut } from "./kh.js";
import {
  collection, query, where, onSnapshot, doc, updateDoc, addDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { timeAgo } from "./comments.js";

const $ = q => document.querySelector(q);
const s = await requireMember();

const keep = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* per-browser convenience only */ } }
};

// review = swipe, comment, approve (content lead); post = download, mark posted (content poster).
// Admins can look at either; everyone else sees the review feed without the Approve button.
let mode = s.role === "poster" ? "post" : s.role === "lead" ? "review" : s.role === "admin" && keep.get("fd.mode") === "post" ? "post" : "review";

const hashM = location.hash.match(/^#(kmp|unbroken)(?:\/(.+))?$/);
let studio = hashM ? hashM[1] : STUDIOS[keep.get("fd.studio")] ? keep.get("fd.studio") : "kmp";
let focusId = hashM && hashM[2] ? decodeURIComponent(hashM[2]) : null;
let tab = keep.get("fd.tab") || "carousel";
// on arrival and on switching studio, open the format that has something waiting for review
let autoTab = true;

const FORMATS = [["carousel", "Carousels"], ["quote", "Quote cards"], ["reel", "Reel covers"]];
const FMT_ONE = { carousel: "Carousel", quote: "Quote card", reel: "Reel cover" };
const SHORT = { kmp: "KMP", unbroken: "Unbroken" };
const INK = { kmp: "#0A0D24", unbroken: "#FFFFFF" };
const markOf = k => `/brand/${k}-mark.png`;
const fmtOf = p => p.format || "carousel";

const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function addDays(isoDate, n) { const d = new Date(isoDate + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); }
const today = iso(new Date());
const dateLabel = d => d ? new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "No date";
const byDate = (a, b) => (a.date || "").localeCompare(b.date || "") || fmtRank(a) - fmtRank(b);
const fmtRank = p => ["carousel", "quote", "reel"].indexOf(fmtOf(p));

const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  chat: svg('<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  down: svg('<path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 20h14"/>'),
  prev: svg('<path d="M14.5 6l-6 6 6 6"/>'),
  next: svg('<path d="M9.5 6l6 6-6 6"/>'),
  chev: svg('<path d="M9.5 6l6 6-6 6"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  done: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>')
};

/* ---------- data ---------- */
const posts = { kmp: new Map(), unbroken: new Map() };
const comments = { kmp: [], unbroken: [] };
const loaded = { kmp: false, unbroken: false };
let denied = false;
const back = addDays(today, -30);
for (const k of Object.keys(STUDIOS)) {
  onSnapshot(query(collection(db, "studios", k, "posts"), where("date", ">=", back)), snap => {
    const next = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    for (const [id, p] of posts[k]) { const n = next.get(id); if (!n || verOf(n) !== verOf(p)) dropImgs(k, id); }
    posts[k] = next; loaded[k] = true; render();
  }, err => { denied = err && err.code === "permission-denied"; loaded[k] = true; render(); });
  onSnapshot(collection(db, "studios", k, "comments"), snap => {
    comments[k] = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.createdAt - b.createdAt);
    paintCounts(); if (sheet.open) renderSheetList();
    if (mode === "review" && !firstPaint) render();   // a new comment moves the card out of the main feed
  }, () => { /* the feed works without comments */ });
}
const openComments = (k, id) => comments[k].filter(c => c.postId === id && !c.resolved);

/* ---------- slide images, drawn by the studio's own engine ---------- */
const engines = {}, eng = {};
function engine(k) {
  if (!engines[k]) engines[k] = new Promise((res, rej) => {
    const f = document.createElement("iframe");
    f.className = "fd-engine"; f.tabIndex = -1; f.title = ""; f.setAttribute("aria-hidden", "true");
    f.src = STUDIOS[k].path + "?engine=1";
    const t0 = Date.now();
    const poll = () => {
      const e = f.contentWindow && f.contentWindow.__studio && f.contentWindow.__studio.engine;
      if (e) e.loaded.then(() => { eng[k] = e; res(e); render(); });
      else if (Date.now() - t0 > 60000) { delete engines[k]; f.remove(); rej(new Error("engine")); }
      else setTimeout(poll, 150);
    };
    f.addEventListener("load", poll, { once: true });
    document.body.appendChild(f);
  });
  return engines[k];
}
// Only what the slides are drawn from counts, so approving or moving a post doesn't redraw it.
const SKIP = new Set(["status", "updatedAt", "reviewedAt", "reviewedBy", "reviewedByName", "postedAt", "postedBy", "thumb", "caption"]);
const vers = new WeakMap();
function verOf(p) {
  if (vers.has(p)) return vers.get(p);
  const str = JSON.stringify(p, (key, v) => SKIP.has(key) ? undefined : v);
  let h = 5381; for (let i = 0; i < str.length; i++) h = (h * 33 ^ str.charCodeAt(i)) >>> 0;
  const v = h.toString(36); vers.set(p, v); return v;
}
const imgKey = (k, p, i) => `${k}/${p.id}@${verOf(p)}#${i}`;
const imgs = new Map(), jobs = [];
let pumping = false;
function want(k, p, i, urgent) {
  const key = imgKey(k, p, i);
  if (imgs.has(key)) return;
  const at = jobs.findIndex(j => j.key === key);
  if (at >= 0) { if (urgent && at > 0) jobs.unshift(jobs.splice(at, 1)[0]); return; }
  const job = { key, k, id: p.id, i };
  if (urgent) jobs.unshift(job); else jobs.push(job);
  pump();
}
async function pump() {
  if (pumping) return; pumping = true;
  while (jobs.length) {
    const j = jobs.shift(), p = posts[j.k].get(j.id);
    if (!p || imgKey(j.k, p, j.i) !== j.key) continue;
    try {
      const e = await engine(j.k);
      const blob = await e.slide(p.id, p, j.i, "image/jpeg", 0.9);
      imgs.set(j.key, URL.createObjectURL(blob));
    } catch (err) { imgs.set(j.key, ""); }
    paintImg(j.key);
  }
  pumping = false;
}
function dropImgs(k, id) {
  for (const [key, url] of imgs) if (key.startsWith(`${k}/${id}@`)) { if (url) URL.revokeObjectURL(url); imgs.delete(key); }
}
function paintImg(key) {
  const url = imgs.get(key);
  document.querySelectorAll("img[data-img]").forEach(im => {
    if (im.dataset.img !== key) return;
    if (url) { im.src = url; im.classList.remove("ph"); im.closest(".fd-slide, .fd-thb")?.classList.remove("wait"); }
    else im.closest(".fd-slide, .fd-thb")?.classList.add("fail");
  });
}
const infoCache = new Map();
function info(k, p) {
  const e = eng[k]; if (!e) return { pillar: p.label || "", ratio: 0.75 };
  const key = `${k}|${p.id}|${verOf(p)}`;
  if (!infoCache.has(key)) { try { infoCache.set(key, e.info(p.id, p)); } catch (err) { return { pillar: p.label || "", ratio: 0.75 }; } }
  return infoCache.get(key);
}

/* ---------- what each person sees ---------- */
const unposted = k => [...posts[k].values()].filter(p => p.status !== "posted");
// The reviewer's last open comment on a post; once they comment, the post waits on the designer
// (out of the main feed) until the designer saves a change after it.
const myLast = (k, p) => { let t = 0; for (const c of comments[k]) if (c.postId === p.id && !c.resolved && c.by === s.email && (c.createdAt || 0) > t) t = c.createdAt; return t; };
const waiting = (k, p) => { const t = myLast(k, p); return !!t && t > (p.updatedAt || 0); };
function reviewLists(k, f) {
  const list = unposted(k).filter(p => fmtOf(p) === f).sort(byDate);
  return {
    review: list.filter(p => p.status === "review" && !waiting(k, p)),
    commented: list.filter(p => p.status === "review" && waiting(k, p)),
    approved: list.filter(p => p.status === "ready"),
    design: list.filter(p => !p.status || p.status === "draft")
  };
}
const toPost = k => [...posts[k].values()].filter(p => p.status === "ready").sort(byDate);
const postedLately = k => [...posts[k].values()].filter(p => p.status === "posted" && (p.date >= addDays(today, -7) || (p.postedAt || 0) > Date.now() - 7 * 864e5))
  .sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0) || (b.date || "").localeCompare(a.date || ""));
const badgeOf = k => mode === "review" ? unposted(k).filter(p => p.status === "review" && !waiting(k, p)).length : toPost(k).length;
const formatsOf = k => FORMATS.filter(([f]) => f !== "reel" || unposted(k).some(p => fmtOf(p) === "reel"));

/* ---------- page ---------- */
const slideAt = new Map();     // card key -> slide on show
const opened = new Set();      // folded rows opened into a full card
const openSecs = new Set(keep.get("fd.secs") ? keep.get("fd.secs").split(",") : []);
const downloaded = new Set();
let firstPaint = true;

function render() {
  renderTop();
  const main = $("#fdMain");
  if (denied) { main.innerHTML = `<p class="fd-empty">You don't have access to these posts. Ask your admin.</p>`; return; }
  if (!loaded[studio]) { main.innerHTML = `<p class="fd-empty">Loading…</p>`; return; }
  const keepY = window.scrollY;
  main.innerHTML = mode === "review" ? reviewHTML() : postHTML();
  main.dataset.mode = mode;
  afterRender();
  if (!firstPaint) window.scrollTo(0, keepY);
  if (firstPaint) { firstPaint = false; if (focusId) focusPost(); }
}

function renderTop() {
  $("#fdStudios").innerHTML = Object.keys(STUDIOS).map(k => {
    const n = loaded[k] ? badgeOf(k) : 0;
    return `<button type="button" class="fd-st" data-studio="${k}" aria-pressed="${k === studio}" style="--c:${STUDIOS[k].accent};--band:${STUDIOS[k].band};--ci:${INK[k]}">
      <img src="${markOf(k)}" alt=""><span>${SHORT[k]}</span>${n ? `<i class="n" aria-label="${n} ${mode === "review" ? "to review" : "to post"}">${n}</i>` : ""}</button>`;
  }).join("");
  const tabs = $("#fdTabs");
  tabs.hidden = mode !== "review";
  if (mode === "review") {
    const fs = formatsOf(studio);
    if (!fs.some(([f]) => f === tab)) tab = "carousel";
    if (autoTab && loaded[studio]) {
      autoTab = false;
      const has = f => reviewLists(studio, f).review.length;
      if (!has(tab)) { const f = fs.find(([x]) => has(x)); if (f) tab = f[0]; }
    }
    tabs.innerHTML = fs.map(([f, label]) => {
      const n = loaded[studio] ? reviewLists(studio, f).review.length : 0;
      return `<button type="button" role="tab" data-tab="${f}" aria-selected="${f === tab}">${label}${n ? ` <span class="n">${n}</span>` : ""}</button>`;
    }).join("");
  }
  const me = $("#fdMe");
  if (!me.dataset.done) {
    me.dataset.done = "1";
    const role = ROLES[s.role] ? ROLES[s.role].label : s.role;
    me.innerHTML = `<button type="button" class="fd-avbtn" id="fdAv" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(s.name)}, ${esc(role)}. Account menu">${esc(initialsOf(s.name))}</button>
      <div class="fd-menu" id="fdMenu" role="menu" hidden>
        <div class="fd-mwho"><b>${esc(s.name)}</b><span>${esc(role)}</span></div>
        ${s.role === "admin" ? `<button type="button" role="menuitem" data-mode>Switch view</button>` : ""}
        ${s.role !== "lead" && s.role !== "poster" ? `<a role="menuitem" href="/">Home and studios</a>` : ""}
        <button type="button" role="menuitem" data-out>Sign out</button>
      </div>`;
  }
  const sw = me.querySelector("[data-mode]");
  if (sw) sw.textContent = mode === "review" ? "See the poster's view" : "See the review view";
  if (s.role === "lead" || s.role === "poster") $("#fdLogo").href = "/feed/";
}

/* ----- review (content lead) ----- */
function reviewHTML() {
  const L = reviewLists(studio, tab), label = FORMATS.find(([f]) => f === tab)[1].toLowerCase();
  const empty = `<div class="fd-done">${IC.done}<b>All caught up</b><span>No ${esc(STUDIOS[studio].show)} ${label} waiting for your review.</span></div>`;
  return `<div class="fd-feed">
    ${L.review.length ? L.review.map(p => card(studio, p)).join("") : empty}
    ${L.commented.length ? section("commented", "Commented · waiting on the designer", L.commented) : ""}
    ${L.approved.length ? section("approved", "Approved · with the poster", L.approved) : ""}
    ${L.design.length ? section("design", "Still with the designer", L.design) : ""}
  </div>`;
}
function section(id, title, list) {
  const key = `${studio}:${tab}:${id}`;
  return `<details class="fd-sec" data-sec="${key}"${openSecs.has(key) ? " open" : ""}>
    <summary><span>${esc(title)}</span><span class="n">${list.length}</span>${IC.chev}</summary>
    <div class="fd-rows">${list.map(p => folded(studio, p)).join("")}</div>
  </details>`;
}
function folded(k, p) {
  const key = `${k}/${p.id}`;
  if (opened.has(key)) return `<div class="fd-fold open" data-key="${esc(key)}"><button type="button" class="fd-unfold" data-fold>Fold up</button>${card(k, p)}</div>`;
  return `<div class="fd-fold" data-key="${esc(key)}"><button type="button" class="fd-row" data-fold aria-expanded="false">
    ${thumb(k, p)}<span class="fd-rt"><b>${esc(dateLabel(p.date))}</b><span>${esc(info(k, p).pillar || FMT_ONE[fmtOf(p)])}</span>${whenChip(p)}</span>${IC.chev}</button></div>`;
}
function thumb(k, p) {
  const key = imgKey(k, p, 0), url = imgs.get(key);
  if (url) return `<span class="fd-thb"><img src="${url}" alt="" data-img="${esc(key)}"></span>`;
  if (p.thumb) return `<span class="fd-thb"><img src="${esc(p.thumb)}" alt="" data-img="${esc(key)}"></span>`;
  if ((p.slides || []).length) want(k, p, 0, false);
  return `<span class="fd-thb wait"><img alt="" data-img="${esc(key)}"></span>`;
}
function whenChip(p) {
  if (p.status === "posted") return "";
  if (p.date === today) return `<span class="fd-when today">Today</span>`;
  if (p.date && p.date < today) return `<span class="fd-when late">Overdue</span>`;
  return "";
}
function card(k, p) {
  const key = `${k}/${p.id}`, n = (p.slides || []).length, i = Math.min(slideAt.get(key) || 0, Math.max(0, n - 1));
  const inf = info(k, p), nC = openComments(k, p.id).length;
  const slides = (p.slides || []).map((_, j) => {
    const ik = imgKey(k, p, j), url = imgs.get(ik);
    const src = url || (j === 0 && p.thumb ? p.thumb : "");
    return `<figure class="fd-slide${url ? "" : " wait"}" data-i="${j}" role="group" aria-roledescription="slide" aria-label="Slide ${j + 1} of ${n}">
      <img alt=""${src ? ` src="${esc(src)}"` : ""}${url ? "" : ' class="ph"'} data-img="${esc(ik)}" draggable="false"></figure>`;
  }).join("");
  return `<article class="fd-card" data-key="${esc(key)}" data-k="${k}" data-id="${esc(p.id)}">
    <header class="fd-ch">
      <img class="fd-av" src="${markOf(k)}" alt="">
      <div class="fd-who"><b>${esc(STUDIOS[k].show)}</b><span>${esc(dateLabel(p.date))}${inf.pillar ? ` · ${esc(inf.pillar)}` : ""}</span></div>
      ${whenChip(p)}${myLast(k, p) && !waiting(k, p) && p.status === "review" ? `<span class="fd-when today" title="The designer changed it after your comment">Updated</span>` : ""}
    </header>
    <div class="fd-media" style="aspect-ratio:${inf.ratio || 0.75}">
      ${n ? `<div class="fd-track" data-track tabindex="0" role="group" aria-roledescription="carousel" aria-label="${n} slide${n > 1 ? "s" : ""}. Swipe or use the arrow keys.">${slides}</div>` : `<p class="fd-noslides">No slides yet</p>`}
      ${n > 1 ? `<span class="fd-count" aria-hidden="true">${i + 1}/${n}</span>
        <button type="button" class="fd-arrow prev" data-step="-1" aria-label="Previous slide"${i === 0 ? " hidden" : ""}>${IC.prev}</button>
        <button type="button" class="fd-arrow next" data-step="1" aria-label="Next slide"${i === n - 1 ? " hidden" : ""}>${IC.next}</button>` : ""}
    </div>
    <div class="fd-acts">
      <button type="button" class="fd-ic" data-cmt aria-label="Comments${nC ? `, ${nC} open` : ""}">${IC.chat}<span class="fd-cn" data-cn="${esc(key)}">${nC || ""}</span></button>
      <div class="fd-dots" aria-hidden="true">${n > 1 ? (p.slides || []).map((_, j) => `<i${j === i ? ' class="on"' : ""}></i>`).join("") : ""}</div>
      <div class="fd-decide">${decide(p)}</div>
    </div>
    ${p.caption ? `<div class="fd-cap"><p>${esc(p.caption)}</p><button type="button" class="fd-more" data-more hidden>more</button></div>` : `<p class="fd-cap none">No caption yet.</p>`}
    <button type="button" class="fd-viewc" data-cmt data-cv="${esc(key)}"${nC ? "" : " hidden"}>${viewLine(k, p)}</button>
  </article>`;
}
function viewLine(k, p) {
  const list = openComments(k, p.id); if (!list.length) return "";
  const last = list[list.length - 1];
  return `<span>${list.length > 1 ? `View all ${list.length} comments` : "1 comment"}</span><span class="fd-last"><b>${esc((last.name || last.by || "").split(" ")[0])}</b> ${esc(last.text)}</span>`;
}
function decide(p) {
  const st = p.status || "draft", ok = can.approve(s.role);
  if (st === "posted") return `<span class="fd-state">Posted</span>`;
  if (st === "ready") return `<span class="fd-ok">${IC.check}Approved</span>${ok ? `<button type="button" class="fd-link" data-to="review">Take back</button>` : ""}`;
  if (!ok) return `<span class="fd-state">${st === "review" ? "Waiting for review" : "In design"}</span>`;
  return `<button type="button" class="fd-approve" data-to="ready">${IC.check}Approve</button>`;
}

/* ----- post (content poster) ----- */
function postHTML() {
  const list = toPost(studio), done = postedLately(studio);
  const late = list.filter(p => p.date < today), now = list.filter(p => p.date === today), soon = list.filter(p => p.date > today);
  const group = (title, sub, arr) => arr.length ? `<section class="fd-grp"><h2 class="fd-h">${esc(title)}${sub ? ` <span>${esc(sub)}</span>` : ""}</h2>${arr.map(p => job(studio, p)).join("")}</section>` : "";
  const key = `${studio}:posted`;
  return `<div class="fd-list">
    <ol class="fd-how" aria-label="How to post"><li><b>1</b>Download</li><li><b>2</b>Post on Instagram</li><li><b>3</b>Done: downloading marks it posted</li></ol>
    ${list.length ? group("Overdue", "post these first", late) + group("Today", dateLabel(today), now) + group("Coming up", "", soon)
      : `<div class="fd-done">${IC.done}<b>Nothing to post right now</b><span>Posts show up here as soon as they're approved.</span></div>`}
    ${done.length ? `<details class="fd-sec" data-sec="${key}"${openSecs.has(key) ? " open" : ""}><summary><span>Posted · last 7 days</span><span class="n">${done.length}</span>${IC.chev}</summary>
      <div class="fd-rows">${done.map(p => job(studio, p)).join("")}</div></details>` : ""}
  </div>`;
}
function job(k, p) {
  const key = `${k}/${p.id}`, n = (p.slides || []).length, posted = p.status === "posted", got = downloaded.has(key);
  const what = `${FMT_ONE[fmtOf(p)]}${n > 1 ? ` · ${n} slides` : ""}`;
  const at = posted && p.postedAt ? `Posted ${timeAgo(p.postedAt)}` : "";
  return `<article class="fd-job${posted ? " posted" : ""}" data-key="${esc(key)}" data-k="${k}" data-id="${esc(p.id)}">
    ${thumb(k, p)}
    <div class="fd-jt">
      <b>${esc(what)}</b>
      <span>${esc(dateLabel(p.date))}${info(k, p).pillar ? ` · ${esc(info(k, p).pillar)}` : ""}</span>
      ${posted ? `<span class="fd-ok">${IC.check}${esc(at || "Posted")}</span>` : p.caption ? `<button type="button" class="fd-link" data-copy>Copy caption</button>` : `<span class="fd-warn">No caption yet</span>`}
    </div>
    <div class="fd-jb">
      ${posted ? `<button type="button" class="btn" data-dl>${IC.down}<span>Download again</span></button>
           <button type="button" class="btn" data-posted="0">Undo</button>`
        : `<button type="button" class="btn${got ? "" : " primary"}" data-dl>${IC.down}<span>${got ? "Download again" : "Download"}</span></button>
           <button type="button" class="btn${got ? " primary" : ""}" data-posted="1">${IC.check}<span>Mark posted</span></button>`}
    </div>
  </article>`;
}

/* ---------- after each render ---------- */
const seen = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (!en.isIntersecting) return;
    const c = en.target, p = posts[c.dataset.k] && posts[c.dataset.k].get(c.dataset.id); if (!p) return;
    const i = slideAt.get(c.dataset.key) || 0, n = (p.slides || []).length;
    want(c.dataset.k, p, i, true);
    for (let j = 0; j < n; j++) if (j !== i) want(c.dataset.k, p, j, false);
    seen.unobserve(c);
  });
}, { rootMargin: "700px 0px" });

function afterRender() {
  seen.disconnect();
  document.querySelectorAll(".fd-card").forEach((c, n) => {
    seen.observe(c);
    // the first posts start drawing straight away, even before the page has scrolled or painted
    const p = n < 2 && posts[c.dataset.k].get(c.dataset.id);
    if (p && (p.slides || []).length) want(c.dataset.k, p, Math.min(slideAt.get(c.dataset.key) || 0, p.slides.length - 1), false);
    const t = c.querySelector("[data-track]"), i = slideAt.get(c.dataset.key) || 0;
    if (t && i) t.scrollLeft = i * t.clientWidth;
    const cap = c.querySelector(".fd-cap p"), more = c.querySelector("[data-more]");
    if (cap && more) more.hidden = cap.scrollHeight <= cap.clientHeight + 1;
  });
  // the poster's downloads draw with the engine; load it while they read the list
  if (mode === "post" && !engines[studio]) setTimeout(() => engine(studio).catch(() => {}), 600);
}
function paintCounts() {
  renderTop();
  document.querySelectorAll("[data-cn]").forEach(el => {
    const [k, id] = el.dataset.cn.split(/\/(.+)/); const n = openComments(k, id).length;
    el.textContent = n || "";
    el.closest("[data-cmt]").setAttribute("aria-label", `Comments${n ? `, ${n} open` : ""}`);
  });
  document.querySelectorAll("[data-cv]").forEach(el => {
    const [k, id] = el.dataset.cv.split(/\/(.+)/), p = posts[k].get(id); if (!p) return;
    el.innerHTML = viewLine(k, p); el.hidden = !openComments(k, id).length;
  });
}
function focusPost(retry) {
  const el = [...document.querySelectorAll("[data-key]")].find(x => x.dataset.key === `${studio}/${focusId}`);
  const p = posts[studio].get(focusId);
  if (!el && p && mode === "review" && !retry && p.status !== "posted") {
    // it's in another tab or a folded section: open it there
    tab = fmtOf(p); opened.add(`${studio}/${focusId}`);
    const L = reviewLists(studio, tab); const sec = L.commented.includes(p) ? "commented" : L.approved.includes(p) ? "approved" : L.design.includes(p) ? "design" : null;
    if (sec) openSecs.add(`${studio}:${tab}:${sec}`);
    render();
    return setTimeout(() => focusPost(true), 0);
  }
  focusId = null;
  if (!el) return;
  el.scrollIntoView({ block: "center" });
  el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 2200);
  if (new URLSearchParams(location.search).get("comments") && el.classList.contains("fd-card")) openSheet(el.dataset.k, el.dataset.id);
}

/* ---------- swiping ---------- */
function onTrack(t) {
  const c = t.closest(".fd-card"); if (!c) return;
  const n = t.children.length, i = Math.max(0, Math.min(n - 1, Math.round(t.scrollLeft / Math.max(1, t.clientWidth))));
  if (slideAt.get(c.dataset.key) === i) return;
  slideAt.set(c.dataset.key, i);
  const cnt = c.querySelector(".fd-count"); if (cnt) cnt.textContent = `${i + 1}/${n}`;
  c.querySelectorAll(".fd-dots i").forEach((d, j) => d.classList.toggle("on", j === i));
  const pv = c.querySelector(".fd-arrow.prev"), nx = c.querySelector(".fd-arrow.next");
  if (pv) pv.hidden = i === 0; if (nx) nx.hidden = i === n - 1;
  const p = posts[c.dataset.k].get(c.dataset.id);
  if (p) { want(c.dataset.k, p, i, true); if (i + 1 < n) want(c.dataset.k, p, i + 1, true); }
  if (sheet.open && sheet.key === c.dataset.key) renderSheetForm();
}
document.addEventListener("scroll", e => { if (e.target.matches && e.target.matches("[data-track]")) onTrack(e.target); }, true);
function goSlide(c, i) {
  const t = c.querySelector("[data-track]"); if (!t) return;
  t.scrollTo({ left: i * t.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
document.addEventListener("keydown", e => {
  const t = e.target.closest && e.target.closest("[data-track]"); if (!t) return;
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault();
  const c = t.closest(".fd-card"); goSlide(c, (slideAt.get(c.dataset.key) || 0) + (e.key === "ArrowRight" ? 1 : -1));
});

/* ---------- actions ---------- */
document.addEventListener("click", async e => {
  const t = e.target.closest("button, a, summary"); if (!t) { closeMenu(); return; }
  if (t.id === "fdAv") { const m = $("#fdMenu"); m.hidden = !m.hidden; t.setAttribute("aria-expanded", String(!m.hidden)); return; }
  if (!t.closest("#fdMenu")) closeMenu();
  if (t.matches("[data-out]")) { await logOut(); location.replace("/"); return; }
  if (t.matches("[data-mode]")) { mode = mode === "review" ? "post" : "review"; keep.set("fd.mode", mode); closeMenu(); render(); window.scrollTo(0, 0); return; }
  if (t.dataset.studio) { if (t.dataset.studio !== studio) { studio = t.dataset.studio; autoTab = true; keep.set("fd.studio", studio); history.replaceState(null, "", "#" + studio); render(); window.scrollTo(0, 0); } return; }
  if (t.dataset.tab) { if (t.dataset.tab !== tab) { tab = t.dataset.tab; keep.set("fd.tab", tab); render(); window.scrollTo(0, 0); } return; }
  if (t.matches("[data-fold]")) {
    const f = t.closest(".fd-fold"); if (opened.has(f.dataset.key)) opened.delete(f.dataset.key); else opened.add(f.dataset.key);
    render(); return;
  }
  const c = t.closest("[data-id]"), k = c && c.dataset.k, p = c && posts[k] && posts[k].get(c.dataset.id);
  if (t.dataset.step && c) { goSlide(c, (slideAt.get(c.dataset.key) || 0) + +t.dataset.step); return; }
  if (t.matches("[data-more]")) { c.querySelector(".fd-cap").classList.add("open"); t.hidden = true; return; }
  if (!p) return;
  if (t.matches("[data-cmt]")) { openSheet(k, p.id); return; }
  if (t.dataset.to) { setStatus(t, k, p, t.dataset.to); return; }
  if (t.matches("[data-posted]")) { setStatus(t, k, p, t.dataset.posted === "1" ? "posted" : "ready"); return; }
  if (t.matches("[data-copy]")) { copyText(p.caption || ""); toast("Caption copied."); return; }
  if (t.matches("[data-dl]")) { download(t, k, p); return; }
});
document.addEventListener("toggle", e => {
  const d = e.target; if (!d.matches || !d.matches("details[data-sec]")) return;
  if (d.open) openSecs.add(d.dataset.sec); else openSecs.delete(d.dataset.sec);
  keep.set("fd.secs", [...openSecs].join(","));
}, true);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
function closeMenu() { const m = $("#fdMenu"); if (m && !m.hidden) { m.hidden = true; $("#fdAv").setAttribute("aria-expanded", "false"); } }

const SAID = {
  ready: "Approved. It's with the poster now.",
  review: "Taken back. The poster can't see it until you approve it again.",
  posted: "Marked as posted.",
  draft: "Sent back to the designer."
};
async function setStatus(btn, k, p, to, quiet) {
  const prev = p.status || "draft", now = Date.now();
  const data = { status: to, updatedAt: now };
  if (to === "ready" && prev !== "posted") Object.assign(data, { reviewedAt: now, reviewedBy: s.email, reviewedByName: s.name || "" });
  if (to === "posted") Object.assign(data, { postedAt: now, postedBy: s.email });
  if (btn) btn.disabled = true;
  try {
    await updateDoc(doc(db, "studios", k, "posts", p.id), data);
    if (!quiet) toast(to === "ready" && prev === "posted" ? "Back to ready to post." : SAID[to] || "Saved.", { label: "Undo", run: () => setStatus(null, k, posts[k].get(p.id) || p, prev, true) });
  } catch (err) {
    if (btn) btn.disabled = false;
    toast(err && err.code === "permission-denied" ? "Your role can't make that change." : "Couldn't save that. Check your connection and try again.");
  }
}

/* ---------- download (content poster) ---------- */
const prepared = new Map();   // key@version -> File[] for the phone's share sheet (one post at a time)
const busy = new Set();
async function download(btn, k, p) {
  const key = `${k}/${p.id}`, vkey = `${key}@${verOf(p)}`, label = btn.querySelector("span");
  if (busy.has(key)) return;
  if (p.caption) copyText(p.caption);   // first, while the tap still counts as a tap
  const phone = matchMedia("(pointer: coarse)").matches && navigator.canShare && navigator.share;
  const say = t => { if (label) label.textContent = t; };
  busy.add(key); btn.disabled = true; btn.classList.add("busy");
  try {
    say("Getting ready…");
    const e = await engine(k);
    if (phone) {
      let files = prepared.get(vkey);
      if (!files) {
        const list = await e.files(p.id, p, (a, b) => say(b > 1 ? `Preparing ${a} of ${b}…` : "Preparing…"));
        files = list.map(f => new File([f.blob], f.name, { type: "image/png" }));
        prepared.clear(); prepared.set(vkey, files);
      }
      if (navigator.canShare({ files })) {
        try {
          await navigator.share({ files });
          prepared.delete(vkey); done(true); return;
        } catch (err) {
          if (err && err.name === "AbortError") { reset(); return; }
          if (err && err.name === "NotAllowedError") {
            // the phone wants a fresh tap before it opens the share sheet; the images are ready now
            reset(); say(files.length > 1 ? `Save ${files.length} images` : "Save image"); btn.classList.add("primary"); return;
          }
        }
      }
    }
    const z = await e.zip(p.id, p, (a, b) => say(b > 1 ? `Preparing ${a} of ${b}…` : "Preparing…"));
    say("Saving…");
    save(z.blob, z.name);
    done(false);
  } catch (err) {
    reset();
    toast("Couldn't prepare the download. A photo may not have loaded. Try again.");
  }
  function reset() { busy.delete(key); btn.disabled = false; btn.classList.remove("busy"); say("Download"); }
  // Downloading means it's going up, so it's marked posted straight away (Joseph, 23 Nov); Undo puts it back.
  function done(shared) {
    busy.delete(key); downloaded.add(key);
    const was = (posts[k].get(p.id) || p).status, mark = was !== "posted";
    if (mark) setStatus(null, k, posts[k].get(p.id) || p, "posted", true);
    const what = shared ? "Saved to your phone" : "Downloaded";
    const cap = p.caption ? (shared ? " The caption is copied, so paste it in Instagram." : " The caption is in caption.txt, and it's copied too.") : "";
    toast(`${what}${mark ? " and marked as posted." : "."}${cap}`, mark ? { label: "Undo", run: () => setStatus(null, k, posts[k].get(p.id) || p, was, true) } : undefined);
    render();
  }
}
function save(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function copyText(text) {
  const fallback = () => { const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) { /* nothing more to try */ } ta.remove(); };
  try { navigator.clipboard.writeText(text).catch(fallback); } catch (e) { fallback(); }
}

/* ---------- comments sheet ---------- */
const sheet = { open: false, k: null, id: null, key: null, about: "slide", showRes: false };
const dlg = $("#fdSheet");
const numOf = (p, c) => { if (!c.slideId) return null; const i = (p.slides || []).findIndex(x => x.id === c.slideId); return i < 0 ? -1 : i; };
function openSheet(k, id) {
  Object.assign(sheet, { open: true, k, id, key: `${k}/${id}`, showRes: false });
  const p = posts[k].get(id);
  dlg.innerHTML = `<div class="sh-grab" aria-hidden="true"></div>
    <header class="sh-head"><div><h2 id="shTitle">Comments</h2><span>${esc(STUDIOS[k].show)} · ${esc(FMT_ONE[fmtOf(p)])} · ${esc(dateLabel(p.date))}</span></div>
      <button type="button" class="sh-x" data-close aria-label="Close">${IC.x}</button></header>
    <div class="sh-list" id="shList"></div>
    <form class="sh-form" id="shForm"><div class="sh-about" id="shAbout"></div>
      <div class="sh-in"><textarea id="shText" rows="1" maxlength="2000" placeholder="Add a comment…" aria-label="Write a comment"></textarea>
      <button class="sh-send" type="submit">Post</button></div></form>`;
  renderSheetList(); renderSheetForm();
  dlg.showModal();
  if (!matchMedia("(pointer: coarse)").matches) $("#shText").focus();
}
function renderSheetList() {
  const p = posts[sheet.k] && posts[sheet.k].get(sheet.id), box = $("#shList"); if (!p || !box) return;
  const all = comments[sheet.k].filter(c => c.postId === sheet.id), open = all.filter(c => !c.resolved), res = all.filter(c => c.resolved);
  box.innerHTML = (open.length ? open.map(c => item(p, c)).join("") : `<p class="sh-empty">No comments yet. Say what to change, like “use a different photo on slide 3”.</p>`)
    + (res.length ? `<button type="button" class="fd-link sh-res" data-showres>${sheet.showRes ? "Hide" : "Show"} ${res.length} resolved</button>${sheet.showRes ? res.map(c => item(p, c)).join("") : ""}` : "");
}
function item(p, c) {
  const n = numOf(p, c), single = (p.slides || []).length < 2;
  const where = single ? "" : n === null ? `<span class="sh-where">Whole post</span>` : n < 0 ? `<span class="sh-where">Deleted slide</span>`
    : `<button type="button" class="sh-where" data-go="${n}">Slide ${n + 1}</button>`;
  return `<article class="sh-c${c.resolved ? " resolved" : ""}" data-cid="${esc(c.id)}">
    <span class="fd-avs" aria-hidden="true">${esc(initialsOf(c.name || c.by))}</span>
    <div><div class="sh-meta"><b>${esc(c.name || c.by)}</b><span>${esc(timeAgo(c.createdAt))}</span>${where}</div>
      <p>${esc(c.text)}</p>
      <div class="sh-acts">${can.resolve(s.role, c, s.email) ? `<button type="button" class="fd-link" data-res="${c.resolved ? "0" : "1"}">${c.resolved ? "Reopen" : "Resolve"}</button>` : ""}
        ${can.removeComment(s.role, c, s.email) ? `<button type="button" class="fd-link danger" data-del>Delete</button>` : ""}</div></div>
  </article>`;
}
function renderSheetForm() {
  const p = posts[sheet.k] && posts[sheet.k].get(sheet.id), box = $("#shAbout"); if (!p || !box) return;
  const n = (p.slides || []).length, i = slideAt.get(sheet.key) || 0;
  box.hidden = n < 2;
  box.innerHTML = n < 2 ? "" : `<span>About</span><button type="button" data-about="slide" aria-pressed="${sheet.about === "slide"}">Slide ${i + 1}</button><button type="button" data-about="post" aria-pressed="${sheet.about === "post"}">Whole post</button>`;
  $("#shText").placeholder = n < 2 || sheet.about === "post" ? "Add a comment…" : `Add a comment on slide ${i + 1}…`;
}
function closeSheet() { if (dlg.open) dlg.close(); }
dlg.addEventListener("close", () => { sheet.open = false; });
dlg.addEventListener("click", async e => {
  if (e.target === dlg) { closeSheet(); return; }
  const b = e.target.closest("button"); if (!b) return;
  if (b.matches("[data-close]")) { closeSheet(); return; }
  if (b.dataset.about) { sheet.about = b.dataset.about; renderSheetForm(); $("#shText").focus(); return; }
  if (b.matches("[data-showres]")) { sheet.showRes = !sheet.showRes; renderSheetList(); return; }
  if (b.dataset.go) {
    const c = [...document.querySelectorAll(".fd-card")].find(x => x.dataset.key === sheet.key);
    closeSheet(); if (c) { c.scrollIntoView({ block: "center" }); goSlide(c, +b.dataset.go); }
    return;
  }
  const art = b.closest("[data-cid]"); if (!art) return;
  const ref = doc(db, "studios", sheet.k, "comments", art.dataset.cid);
  try {
    if (b.dataset.res) { const r = b.dataset.res === "1"; await updateDoc(ref, { resolved: r, resolvedBy: r ? s.email : null, resolvedAt: r ? Date.now() : null }); }
    if (b.matches("[data-del]") && confirm("Delete this comment?")) await deleteDoc(ref);
  } catch (err) { toast("Couldn't update the comment. Try again."); }
});
dlg.addEventListener("input", e => { if (e.target.id === "shText") { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; } });
dlg.addEventListener("keydown", e => { if (e.target.id === "shText" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } });
dlg.addEventListener("submit", e => { e.preventDefault(); send(); });
async function send() {
  const p = posts[sheet.k].get(sheet.id), ta = $("#shText"); if (!p || !ta) return;
  const text = ta.value.trim(); if (!text) { ta.focus(); return; }
  const n = (p.slides || []).length, sl = n > 1 && sheet.about === "slide" ? p.slides[slideAt.get(sheet.key) || 0] : null;
  ta.value = ""; ta.style.height = "auto";
  try {
    await addDoc(collection(db, "studios", sheet.k, "comments"), {
      postId: p.id, postTitle: p.title || "", postDate: p.date || "", format: fmtOf(p),
      slideId: sl && sl.id ? sl.id : null, text, by: s.email, name: s.name, createdAt: Date.now(), resolved: false
    });
    const list = $("#shList"); if (list) list.scrollTop = list.scrollHeight;
  } catch (err) {
    if (!ta.value) ta.value = text;
    toast("Couldn't post the comment. Check your connection and try again.");
  }
}

/* ---------- toast ---------- */
let toastTimer = 0;
function toast(msg, action) {
  const el = $("#fdToast");
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ""}`;
  el.hidden = false;
  if (action) el.querySelector("button").onclick = () => { el.hidden = true; action.run(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 3500);
}

window.addEventListener("hashchange", () => {
  const m = location.hash.match(/^#(kmp|unbroken)(?:\/(.+))?$/); if (!m) return;
  studio = m[1]; focusId = m[2] ? decodeURIComponent(m[2]) : null; render(); if (focusId) focusPost();
});
let resizeT = 0;
window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => document.querySelectorAll(".fd-card").forEach(c => { const t = c.querySelector("[data-track]"); if (t) t.scrollLeft = (slideAt.get(c.dataset.key) || 0) * t.clientWidth; }), 120); });

render();
