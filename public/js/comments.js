// Design comments in the studios: a Comments tab beside Slide and Post, count badges on posts
// and slides, and a composer that pins a note to the slide you're looking at.
// Comments live in studios/{studio}/comments, one flat collection, so a single listener
// gives the counts for every post.
import { db, can, esc, initialsOf } from "./kh.js";
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

export function timeAgo(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); if (d < 7) return `${d} day${d > 1 ? "s" : ""} ago`;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function startComments(studio, s) {
  const $ = q => document.querySelector(q);
  const S = () => window.__studio;
  const panel = $("#khComments"), tab = $("#tabComments");
  const ref = collection(db, "studios", studio, "comments");
  let all = [], view = "all", showResolved = false, open = false, denied = false;

  const post = () => S() && S().state.posts.get(S().state.currentId);
  const slideIdx = () => (S() ? S().state.slideIdx : 0);
  const forPost = id => all.filter(c => c.postId === id);
  const openOf = list => list.filter(c => !c.resolved);
  // a comment follows its slide when slides are reordered
  const numOf = (p, c) => { if (!c.slideId) return null; const i = p.slides.findIndex(x => x.id === c.slideId); return i < 0 ? -1 : i; };

  onSnapshot(ref, snap => {
    denied = false;
    all = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.createdAt - b.createdAt);
    badges(); render();
  }, err => { denied = err && err.code === "permission-denied"; render(); });

  /* ---------- tab ---------- */
  function setOpen(v) {
    open = v;
    document.body.classList.toggle("kh-cmt-open", v);
    panel.hidden = !v;
    tab.setAttribute("aria-selected", String(v));
    if (v) { render(); setTimeout(() => { const t = $("#cmtText"); if (t && !matchMedia("(max-width:820px)").matches) t.focus(); }, 0); }
  }
  tab.addEventListener("click", () => setOpen(true));
  ["#tabSlide", "#tabPost"].forEach(q => $(q).addEventListener("click", () => setOpen(false)));
  window.__khOpenComments = () => setOpen(true);

  /* ---------- badges on the post list, the slide strip and the tab ---------- */
  function badges() {
    const p = post();
    document.querySelectorAll(".post-item[data-id]").forEach(el => {
      const n = openOf(forPost(el.dataset.id)).length;
      let b = el.querySelector(".kh-cb");
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement("span"); b.className = "kh-cb"; el.querySelector(".pi-meta").prepend(b); }
      b.textContent = n; b.title = `${n} open comment${n > 1 ? "s" : ""}`;
    });
    if (p) {
      const list = openOf(forPost(p.id));
      document.querySelectorAll(".thumb[data-i]").forEach(el => {
        const i = +el.dataset.i, n = list.filter(c => numOf(p, c) === i).length;
        let b = el.querySelector(".kh-cb");
        if (!n) { if (b) b.remove(); return; }
        if (!b) { b = document.createElement("span"); b.className = "kh-cb"; el.appendChild(b); }
        b.textContent = n; b.title = `${n} open comment${n > 1 ? "s" : ""} on this slide`;
      });
      const n = list.length, c = $("#cmtCount");
      c.hidden = !n; c.textContent = n;
    }
  }
  window.__khOnList = badges;
  window.__khOnStage = () => { badges(); if (open) render(); };

  /* ---------- panel ---------- */
  function render() {
    if (!open) return;
    const p = post();
    if (denied) { panel.innerHTML = `<p class="cmt-empty">Comments aren't switched on yet. Ask your admin to update the site's security rules.</p>`; return; }
    if (!p) { panel.innerHTML = `<p class="cmt-empty">Open a post to see its comments.</p>`; return; }
    const reel = p.format === "reel", i = slideIdx();
    const mine = forPost(p.id), shownAll = showResolved ? mine : openOf(mine);
    const here = shownAll.filter(c => numOf(p, c) === i);
    const list = (view === "slide" && !reel ? here : shownAll)
      .sort((a, b) => (numOf(p, a) ?? -2) - (numOf(p, b) ?? -2) || a.createdAt - b.createdAt);
    const resolvedN = mine.filter(c => c.resolved).length;
    const typing = document.activeElement && document.activeElement.id === "cmtText";
    const draft = $("#cmtText") ? $("#cmtText").value : "";
    const about = $("#cmtAbout") ? $("#cmtAbout").checked : true;

    panel.innerHTML = `
      <div class="cmt-head">
        ${reel ? `<span class="cmt-title">${openOf(mine).length} open</span>` : `<div class="seg cmt-seg" role="group" aria-label="Which comments">
          <button type="button" data-view="slide" class="${view === "slide" ? "on" : ""}">Slide ${i + 1} <span class="n">${openOf(here).length}</span></button>
          <button type="button" data-view="all" class="${view === "all" ? "on" : ""}">Whole post <span class="n">${openOf(mine).length}</span></button></div>`}
        ${resolvedN ? `<label class="toggle cmt-res"><input type="checkbox" id="cmtShowRes" ${showResolved ? "checked" : ""}> Resolved (${resolvedN})</label>` : ""}
      </div>
      <div class="cmt-list" id="cmtList">
        ${list.map(c => item(p, c, i)).join("") || `<p class="cmt-empty">${view === "slide" && !reel ? `No comments on slide ${i + 1} yet.` : "No comments yet."} Notes like “use this hook” or “change the photo” go here.</p>`}
      </div>
      <form class="cmt-form" id="cmtForm">
        <textarea id="cmtText" rows="3" maxlength="2000" placeholder="${reel ? "Comment on this cover…" : `Comment on slide ${i + 1}…`}" aria-label="Write a comment"></textarea>
        <div class="cmt-row">
          ${reel ? "" : `<label class="toggle"><input type="checkbox" id="cmtAbout" ${about ? "checked" : ""}> Pin to slide ${i + 1}</label>`}
          <span class="hint">⌘/Ctrl + Enter</span>
          <button class="btn primary sm" type="submit">Comment</button>
        </div>
      </form>`;
    const ta = $("#cmtText"); ta.value = draft;
    if (typing) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }

  function item(p, c, i) {
    const n = numOf(p, c), here = n === i && p.format !== "reel";
    const where = p.format === "reel" ? "" : n === null ? `<span class="cmt-where">Whole post</span>`
      : n < 0 ? `<span class="cmt-where">Deleted slide</span>` : `<button type="button" class="cmt-where" data-go="${n}" title="Go to slide ${n + 1}">Slide ${n + 1}</button>`;
    return `<article class="cmt${c.resolved ? " resolved" : ""}${here ? " here" : ""}" data-id="${esc(c.id)}">
      <span class="av" aria-hidden="true">${esc(initialsOf(c.name || c.by))}</span>
      <div class="cmt-body">
        <div class="cmt-meta"><b>${esc(c.name || c.by)}</b><span>${esc(timeAgo(c.createdAt))}</span>${where}</div>
        <p>${esc(c.text)}</p>
        <div class="cmt-acts">
          ${can.resolve(s.role, c, s.email) ? `<button type="button" class="link" data-res="${c.resolved ? "0" : "1"}">${c.resolved ? "Reopen" : "Resolve"}</button>` : ""}
          ${can.removeComment(s.role, c, s.email) ? `<button type="button" class="link danger" data-del>Delete</button>` : ""}
          ${c.resolved && c.resolvedBy ? `<span class="cmt-by">Resolved by ${esc(c.resolvedBy.split("@")[0])}</span>` : ""}
        </div>
      </div>
    </article>`;
  }

  async function send() {
    const p = post(), ta = $("#cmtText"); if (!p || !ta) return;
    const text = ta.value.trim(); if (!text) { ta.focus(); return; }
    const pin = p.format !== "reel" && (!$("#cmtAbout") || $("#cmtAbout").checked);
    const sl = p.slides[slideIdx()];
    // clear first: the new comment arrives (and redraws the panel) before the save finishes
    ta.value = "";
    try {
      await addDoc(ref, {
        postId: p.id, postTitle: p.title || "", postDate: p.date || "", format: p.format || "carousel",
        slideId: pin && sl ? sl.id : null, text, by: s.email, name: s.name, createdAt: Date.now(), resolved: false
      });
    } catch (e) {
      const t = $("#cmtText"); if (t && !t.value) t.value = text;
      alert(e && e.code === "permission-denied" ? "Comments aren't switched on yet. Ask your admin to update the site's security rules." : "Couldn't post the comment. Check your connection and try again.");
    }
    finally { const t = $("#cmtText"); if (t) t.focus(); }
  }

  panel.addEventListener("submit", e => { e.preventDefault(); send(); });
  panel.addEventListener("keydown", e => { if (e.target.id === "cmtText" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } });
  panel.addEventListener("change", e => { if (e.target.id === "cmtShowRes") { showResolved = e.target.checked; render(); } });
  panel.addEventListener("click", async e => {
    const v = e.target.closest("[data-view]"); if (v) { view = v.dataset.view; render(); return; }
    const go = e.target.closest("[data-go]"); if (go) { S().goSlide(+go.dataset.go); return; }
    const art = e.target.closest(".cmt"); if (!art) return;
    const c = all.find(x => x.id === art.dataset.id); if (!c) return;
    try {
      if (e.target.closest("[data-res]")) {
        const res = e.target.closest("[data-res]").dataset.res === "1";
        await updateDoc(doc(ref, c.id), { resolved: res, resolvedBy: res ? s.email : null, resolvedAt: res ? Date.now() : null });
      }
      if (e.target.closest("[data-del]") && confirm("Delete this comment?")) await deleteDoc(doc(ref, c.id));
    } catch (err) { alert("Couldn't update the comment. Try again."); }
  });

  // ?comments=1 (from Home) opens the panel on arrival
  if (new URLSearchParams(location.search).get("comments")) setOpen(true);
}
