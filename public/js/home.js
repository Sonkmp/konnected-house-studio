// Home page: sign in, the two studios, and the two-week schedule across studios.
import {
  db, session, signIn, sendSetPassword, emailError, logOut, sidebarHTML, wireNav, can, STUDIOS, ICONS, esc, initialsOf
} from "./kh.js";
import {
  collection, query, where, onSnapshot, doc, updateDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { timeAgo } from "./comments.js";

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const next = params.get("next");
const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;

document.addEventListener("click", async e => {
  if (e.target.closest("[data-kh-out]")) { await logOut(); location.replace("/"); }
});

const s = await session();
if (!s) showLogin();
else if (!s.role) { $("#naEmail").textContent = s.email; $("#noAccess").hidden = false; }
else if (safeNext) location.replace(safeNext);
// the content lead and the content poster work from the simple feed
else if (s.role === "lead" || s.role === "poster") location.replace("/feed/");
else showHome(s);

function showLogin() {
  $("#login").hidden = false;
  $("#email").focus();
  const studio = safeNext && Object.values(STUDIOS).find(st => safeNext.startsWith(st.path));
  if (studio) $("#signSub").textContent = `Sign in to open ${studio.name}.`;
  $("#pwToggle").addEventListener("click", e => {
    const pw = $("#password"), show = pw.type === "password";
    pw.type = show ? "text" : "password";
    e.currentTarget.textContent = show ? "Hide" : "Show"; e.currentTarget.setAttribute("aria-pressed", String(show));
  });
  const msg = $("#loginMsg");
  const say = (t, cls = "") => { msg.textContent = t; msg.className = "msg " + cls; };
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("#signBtn"); btn.disabled = true; btn.textContent = "Signing in…"; say("");
    try {
      await signIn($("#email").value, $("#password").value);
      location.replace(safeNext || "/");
    } catch (err) {
      const c = err && err.code;
      if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found") say("That email and password don't match. Use the link below to set a new password.", "bad");
      else if (c === "auth/too-many-requests") say("Too many tries. Wait a few minutes, or set a new password with the link below.", "bad");
      else say("Couldn't sign in. Check your connection and try again.", "bad");
      btn.disabled = false; btn.textContent = "Sign in";
    }
  });
  $("#setPw").addEventListener("click", async () => {
    const email = $("#email").value.trim();
    if (!email) { say("Type your email above first, then click the link again.", "bad"); $("#email").focus(); return; }
    try { await sendSetPassword(email); say(`If ${email} is on the team, a link to set your password is on its way. Check spam too.`, "ok"); }
    catch (err) { say(emailError(err), "bad"); }
  });
}

function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
const dayPill = isoDate => new Date(isoDate + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
// function declarations, so showHome (which runs before this line is reached) can use them
function addDays(isoDate, n) { const d = new Date(isoDate + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); }
function fmtOf(p) { return p.format || "carousel"; }
function fmtName(p) { return { carousel: "carousel", quote: "quote card", reel: "reel cover" }[fmtOf(p)] || "post"; }
const STATUS = { draft: "Draft", review: "For review", ready: "Ready", posted: "Posted" };

function showHome(s) {
  $("#home").hidden = false;
  const sb = $("#sidebar"); sb.innerHTML = sidebarHTML(s, "home"); wireNav(sb);
  const hour = new Date().getHours();
  $("#hello").textContent = `${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, ${s.name.split(" ")[0]}`;
  $("#dateLine").textContent = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  $("#icOpen").innerHTML = ICONS.clock; $("#icReady").innerHTML = ICONS.check; $("#icReel").innerHTML = ICONS.film;

  const posts = {};
  // which studio and which view; remembered in this browser only
  const pref = (k, d) => { try { return localStorage.getItem("home." + k) || d; } catch (e) { return d; } };
  const keep = (k, v) => { try { localStorage.setItem("home." + k, v); } catch (e) { /* convenience only */ } };
  let upStudio = STUDIOS[pref("studio", "kmp")] ? pref("studio", "kmp") : "kmp", view = pref("view", "list") === "grid" ? "grid" : "list";
  let fmt = ["all", "carousel", "quote", "reel"].includes(pref("fmt", "all")) ? pref("fmt", "all") : "all";
  $("#icList").innerHTML = ICONS.list; $("#icGrid").innerHTML = ICONS.grid;
  $("#upStudio").innerHTML = Object.values(STUDIOS).map(st => `<button type="button" role="tab" data-studio="${st.key}"><span class="sw" style="--c:${st.accent}"></span>${esc(st.show)}</button>`).join("");
  const syncCtrls = () => {
    document.querySelectorAll("#upStudio [data-studio]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.studio === upStudio)));
    document.querySelectorAll("#upView [data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
    document.querySelectorAll("#upFmt [data-fmt]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.fmt === fmt)));
  };
  $("#upFmt").addEventListener("click", e => { const b = e.target.closest("[data-fmt]"); if (!b) return; fmt = b.dataset.fmt; keep("fmt", fmt); syncCtrls(); render(); });
  $("#upStudio").addEventListener("click", e => { const b = e.target.closest("[data-studio]"); if (!b) return; upStudio = b.dataset.studio; keep("studio", upStudio); syncCtrls(); render(); });
  $("#upView").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (!b) return; view = b.dataset.view; keep("view", view); syncCtrls(); render(); });
  syncCtrls();
  // the stat tiles double as filters for the list
  const FILTERS = { open: ["not posted yet", p => p.status !== "posted"], ready: ["ready to post", p => p.status === "ready"], reel: ["reel covers", p => p.format === "reel"] };
  let filter = null;
  document.querySelectorAll(".stat[data-filter]").forEach(b => b.addEventListener("click", () => {
    filter = filter === b.dataset.filter ? null : b.dataset.filter;
    document.querySelectorAll(".stat[data-filter]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.filter === filter)));
    render();
  }));
  $("#studios").innerHTML = Object.values(STUDIOS).map(st => `
    <article class="card studio" style="--b:${st.band};--c:${st.accent}">
      <a class="band" href="${st.path}" aria-label="Open ${esc(st.name)}"><img src="${st.logo}" alt="${esc(st.show)}"></a>
      <div class="body">
        <b>${esc(st.name)}</b>
        <p id="count-${st.key}">&nbsp;</p>
        <div class="row">
          <a class="btn primary sm" href="${st.path}#carousel">Carousels</a>
          <a class="btn sm" href="${st.path}#reel">Reel covers</a>
          ${st.quotes ? `<a class="btn sm" href="${st.path}#quote">Quote cards</a>` : ""}
        </div>
      </div>
    </article>`).join("");

  const today = new Date(); today.setHours(12);
  const from = iso(today), end = new Date(today); end.setDate(end.getDate() + 13);
  const to = iso(end), back = addDays(from, -30);
  const inWindow = p => p.date >= from && p.date <= to;
  const missedOf = list => list.filter(p => p.date < from && p.status !== "posted");

  for (const st of Object.values(STUDIOS)) {
    // the last 30 days (to catch missed posts) and everything ahead (so moving a post can push the whole queue)
    const q = query(collection(db, "studios", st.key, "posts"), where("date", ">=", back));
    onSnapshot(q, snap => {
      posts[st.key] = snap.docs.map(d => ({ id: d.id, studio: st.key, ...d.data() })).filter(p => can.see(s.role, p));
      const list = posts[st.key].filter(inWindow), open = list.filter(p => p.status !== "posted").length, missed = missedOf(posts[st.key]).length;
      $("#count-" + st.key).textContent = (list.length ? `${list.length} post${list.length > 1 ? "s" : ""} in the next 14 days · ${open} not posted yet` : "Nothing scheduled in the next 14 days") + (missed ? ` · ${missed} missed` : "");
      render(); renderComments();
    }, () => { $("#sched").innerHTML = `<p class="empty">Couldn't load the schedule. Reload to try again.</p>`; });
  }

  // open comments across both studios, newest first
  const comments = {};
  for (const st of Object.values(STUDIOS)) {
    onSnapshot(query(collection(db, "studios", st.key, "comments"), where("resolved", "==", false)), snap => {
      comments[st.key] = snap.docs.map(d => ({ id: d.id, studio: st.key, ...d.data() }));
      renderComments();
    }, () => { $("#cmts").innerHTML = `<p class="empty">Comments aren't switched on yet.</p>`; });
  }
  function renderComments() {
    // content posters only hear about the posts they can see (Ready or Posted)
    const seen = s.role === "poster" ? new Set(Object.values(posts).flat().filter(inWindow).map(p => p.studio + "/" + p.id)) : null;
    const list = Object.values(comments).flat().filter(c => !seen || seen.has(c.studio + "/" + c.postId)).sort((a, b) => b.createdAt - a.createdAt);
    $("#cmtTotal").textContent = list.length ? `${list.length} open` : "";
    $("#cmts").innerHTML = list.slice(0, 8).map(c => {
      const st = STUDIOS[c.studio];
      return `<a class="cm" href="${st.path}?comments=1#post=${encodeURIComponent(c.postId)}">
        <span class="av" aria-hidden="true">${esc(initialsOf(c.name || c.by))}</span>
        <span><span class="cm-meta"><b>${esc(c.name || c.by)}</b><span>${esc(timeAgo(c.createdAt))}</span></span>
          <p>${esc(c.text)}</p>
          <small><i style="--c:${st.accent}"></i>${esc(c.postTitle || "A post")} · ${esc(st.show)}</small></span>
      </a>`;
    }).join("") || `<p class="empty">No open comments. Feedback the team leaves on a design shows up here.</p>`;
  }

  function render() {
    // within a day: carousels, then quote cards, then reel covers (older posts have no format: carousels)
    const ORDER = { carousel: 0, quote: 1, reel: 2 };
    const all = (posts[upStudio] || []).filter(inWindow)
      .sort((a, b) => a.date.localeCompare(b.date) || (ORDER[fmtOf(a)] ?? 3) - (ORDER[fmtOf(b)] ?? 3) || String(a.title).localeCompare(String(b.title)));
    $("#stOpen").textContent = all.filter(p => p.status !== "posted").length;
    $("#stReady").textContent = all.filter(p => p.status === "ready").length;
    $("#stReel").textContent = all.filter(p => p.format === "reel").length;
    const note = $("#filterNote");
    note.hidden = !filter; if (filter) note.textContent = `Showing ${FILTERS[filter][0]} · tap the tile again for all`;
    const shown = (filter ? all.filter(FILTERS[filter][1]) : all).filter(p => fmt === "all" || fmtOf(p) === fmt);
    const kind = p => p.format === "reel" ? "Reel cover" : p.format === "quote" ? "Quote card" : `Carousel · ${(p.slides || []).length} slides`;
    const fmtWord = { carousel: "carousels", quote: "quote cards", reel: "reel covers" }[fmt];
    const empty = s.role === "poster" && !filter ? `<p class="empty">Nothing ready to post in the next 14 days. Posts show up here once the content lead sets them to Ready.</p>` : `<p class="empty">${filter ? `Nothing ${FILTERS[filter][0]}${fmtWord ? ` among the ${fmtWord}` : ""} in the next 14 days.` : `No ${fmtWord || "posts"} scheduled in the next 14 days.`}</p>`;
    const missed = missedOf(posts[upStudio] || []).filter(p => fmt === "all" || fmtOf(p) === fmt)
      .sort((a, b) => a.date.localeCompare(b.date) || (ORDER[fmtOf(a)] ?? 3) - (ORDER[fmtOf(b)] ?? 3));
    renderMissed(missed);
    $("#sched").classList.toggle("pgrid", view === "grid");
    if (view === "grid") {
      $("#sched").innerHTML = shown.map(p => {
        const st = STUDIOS[p.studio], c = (p.theme && p.theme.accent) || st.accent;
        return `<a class="pcard" href="${st.path}#post=${encodeURIComponent(p.id)}" style="--c:${st.band}">
          <span class="pic">${p.thumb ? `<img src="${p.thumb}" alt="" loading="lazy">` : `<span class="ph" style="--c:${st.band}"><small style="color:${c}">${esc(kind(p))}</small>${esc(p.title || "Untitled")}</span>`}
            <span class="tag${p.date === from ? " today" : ""}">${p.date === from ? "Today" : esc(dayPill(p.date))}</span>
            <span class="chip st" data-s="${esc(p.status || "draft")}">${esc(STATUS[p.status] || "Draft")}</span></span>
          <span class="meta"><b>${esc(p.title || "Untitled")}</b><small>${esc(kind(p))}</small></span>
        </a>`;
      }).join("") || empty;
      return;
    }
    $("#sched").innerHTML = shown.map(p => {
      const st = STUDIOS[p.studio];
      return `<div class="item">
        ${can.edit(s.role, p)
          ? `<label class="dp editable${p.date === from ? " today" : ""}" title="Change the date this goes out">${p.date === from ? "Today" : esc(dayPill(p.date))}<input type="date" class="dp-in" value="${esc(p.date)}" data-date="${esc(p.studio)}/${esc(p.id)}" aria-label="Date for ${esc(p.title || "this post")}"></label>`
          : `<span class="dp${p.date === from ? " today" : ""}">${p.date === from ? "Today" : esc(dayPill(p.date))}</span>`}
        <span class="t"><span class="dot" style="--c:${(p.theme && p.theme.accent) || st.accent}"></span><span>
          <a href="${st.path}#post=${encodeURIComponent(p.id)}">${esc(p.title || "Untitled")}</a>
          <small>${esc(kind(p))}${p.label ? " · " + esc(p.label) : ""}</small></span></span>
        <span class="acts"><span class="chip" data-s="${esc(p.status || "draft")}">${esc(STATUS[p.status] || "Draft")}</span>
          ${can.approve(s.role) && p.status === "review" ? `<a class="btn primary sm" href="${st.path}#post=${encodeURIComponent(p.id)}" title="Read it through and approve it">Review</a>` : ""}
          ${can.markPosted(s.role, p) && p.status !== "posted" ? `<button class="btn ghost sm" data-posted="${esc(p.studio)}/${esc(p.id)}" title="Mark as posted">${ICONS.check}<span>Mark posted</span></button>` : ""}</span>
      </div>`;
    }).join("") || empty;
  }

  // Missed: posts whose day has passed and that never went out. They can be moved to today or any day.
  function renderMissed(missed) {
    const box = $("#missed");
    box.hidden = !missed.length;
    if (!missed.length) { box.innerHTML = ""; return; }
    const movable = missed.filter(p => can.edit(s.role, p));
    box.innerHTML = `<div class="mi-head"><b>Missed · ${missed.length} not posted</b>
        <span>Their day has passed. Move them to today or another day, or mark them posted if they went out late.</span>
        ${movable.length > 1 ? `<button type="button" class="btn primary sm" data-catchup>Catch up: move all from today</button>` : ""}</div>
      ${missed.map(p => {
        const st = STUDIOS[p.studio];
        return `<div class="item">
          ${can.edit(s.role, p)
            ? `<label class="dp missed editable" title="Pick a new day for this post">${esc(dayPill(p.date))}<input type="date" class="dp-in" value="${esc(p.date)}" min="${from}" data-date="${esc(p.studio)}/${esc(p.id)}" aria-label="New date for ${esc(p.title || "this post")}"></label>`
            : `<span class="dp missed">${esc(dayPill(p.date))}</span>`}
          <span class="t"><span class="dot" style="--c:${(p.theme && p.theme.accent) || st.accent}"></span><span>
            <a href="${st.path}#post=${encodeURIComponent(p.id)}">${esc(p.title || "Untitled")}</a>
            <small>${esc(fmtName(p))}${p.label ? " · " + esc(p.label) : ""} · ${esc(STATUS[p.status] || "Draft")}</small></span></span>
          <span class="acts">
            ${can.edit(s.role, p) ? `<button type="button" class="btn sm" data-today="${esc(p.studio)}/${esc(p.id)}">Move to today</button>` : ""}
            ${can.markPosted(s.role, p) ? `<button class="btn ghost sm" data-posted="${esc(p.studio)}/${esc(p.id)}" title="It went out late: mark it posted">${ICONS.check}<span>Mark posted</span></button>` : ""}</span>
        </div>`;
      }).join("")}`;
  }

  /* ---------- rescheduling ---------- */
  const find = key => { const [studio, id] = key.split("/"); return (posts[studio] || []).find(p => p.id === id); };
  // Put `queue` (in order) on `start` and the days after. A post already on a day it needs moves
  // one day later, and so on, until a day is free. Days whose post already went out are skipped.
  function planPush(queue, start) {
    const pool = posts[queue[0].studio] || [], fm = fmtOf(queue[0]);
    const moving = new Set(queue.map(p => p.id)), q = [...queue], moves = [];
    let d = start, guard = 0;
    while (q.length && guard++ < 500) {
      const here = pool.filter(p => p.date === d && fmtOf(p) === fm && !moving.has(p.id));
      if (here.some(p => p.status === "posted")) { d = addDays(d, 1); continue; }
      const cur = q.shift();
      if (cur.date !== d) moves.push({ p: cur, to: d });
      here.forEach(p => { moving.add(p.id); q.push(p); });
      d = addDays(d, 1);
    }
    return moves;
  }
  async function applyMoves(moves) {
    const blocked = moves.filter(m => !can.edit(s.role, m.p));
    if (blocked.length) { toast(`You can't move “${blocked[0].p.title || "Untitled"}”, so nothing was moved.`); render(); return false; }
    const b = writeBatch(db), now = Date.now();
    moves.forEach(m => b.update(doc(db, "studios", m.p.studio, "posts", m.p.id), { date: m.to, updatedAt: now }));
    try { await b.commit(); } catch (err) { toast("Couldn't move it. Only people who can edit these posts can move them."); render(); return false; }
    const first = moves[0];
    toast(moves.length === 1 ? `Moved to ${dayPill(first.to)}.` : `Moved ${moves.length} posts.`);
    if (moves.some(m => m.to > to)) setTimeout(() => toast("Some posts moved past the next 14 days. Find them in the studio."), 2600);
    return true;
  }
  const moveList = moves => `<ul class="mv-list">${moves.map(m => `<li><b>${esc(m.p.title || "Untitled")}</b><span>${esc(m.p.date < from ? "Missed " + dayPill(m.p.date) : dayPill(m.p.date))} → ${esc(dayPill(m.to))}</span></li>`).join("")}</ul>`;

  const dlg = document.createElement("dialog");
  dlg.className = "card mv"; dlg.id = "moveDlg"; document.body.appendChild(dlg);
  let pending = null;
  dlg.addEventListener("click", async e => {
    if (e.target === dlg || e.target.closest("[data-mv-cancel]")) { dlg.close(); return; }
    const b = e.target.closest("[data-mv]"); if (!b || b.disabled || !pending) return;
    const moves = pending[b.dataset.mv]; if (!moves) return;
    dlg.querySelectorAll("button").forEach(x => { x.disabled = true; });
    await applyMoves(moves); pending = null; dlg.close();
  });
  dlg.addEventListener("close", () => { pending = null; render(); });
  function option(key, title, desc, moves, why) {
    return `<button type="button" class="mv-opt" data-mv="${key}"${why ? " disabled" : ""}>
      <b>${title}</b><span>${why ? esc(why) : desc}</span>${!why && moves && moves.length > 1 ? moveList(moves) : ""}</button>`;
  }

  // Move one post to a day. If that day already has a post of the same kind, ask what to do with it.
  async function requestMove(p, when) {
    if (!p || !when || when === p.date) { render(); return; }
    const pool = posts[p.studio] || [], kind = fmtName(p);
    const there = pool.filter(x => x.date === when && fmtOf(x) === fmtOf(p) && x.id !== p.id);
    if (!there.length) { await applyMoves([{ p, to: when }]); return; }
    const occ = there[0], name = esc(occ.title || "Untitled"), sent = there.some(x => x.status === "posted");
    const push = planPush([p], when);
    const swapWhy = sent ? `The ${kind} on ${dayPill(when)} has already gone out.`
      : there.length > 1 ? `${dayPill(when)} has ${there.length} ${kind}s, so there's nothing to swap with.`
      : p.date < from ? `${dayPill(p.date)} has passed, so “${occ.title || "Untitled"}” would become missed.` : "";
    const swap = swapWhy ? null : [{ p, to: when }, { p: occ, to: p.date }];
    pending = { push, swap, both: [{ p, to: when }] };
    dlg.innerHTML = `<h3>Move “${esc(p.title || "Untitled")}” to ${esc(dayPill(when))}?</h3>
      <p>${esc(dayPill(when))} already has a ${kind}: <b>${name}</b>${sent ? " (already posted)" : ""}.</p>
      <div class="mv-opts">
        ${option("push", "Push the rest forward", sent ? `This post takes the next free day after ${esc(dayPill(when))}.` : `<b>${name}</b> moves one day later, and so does each ${kind} after it until there's a free day.`, push, "")}
        ${option("swap", "Swap days", `<b>${name}</b> takes ${esc(dayPill(p.date))}, this post's old day.`, swap, swapWhy)}
        ${option("both", `Keep both on ${esc(dayPill(when))}`, `Two ${kind}s go out that day.`, null, "")}
      </div>
      <div class="mv-foot"><button type="button" class="btn" data-mv-cancel>Cancel</button></div>`;
    dlg.showModal();
  }
  // Move every missed post (that this person can move) to today onward, keeping their order,
  // and push the scheduled posts along behind them.
  function catchUp() {
    const missed = missedOf(posts[upStudio] || []).filter(p => can.edit(s.role, p) && (fmt === "all" || fmtOf(p) === fmt))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!missed.length) return;
    const byFmt = {}; missed.forEach(p => { (byFmt[fmtOf(p)] = byFmt[fmtOf(p)] || []).push(p); });
    const moves = Object.values(byFmt).flatMap(list => planPush(list, from));
    pending = { push: moves };
    dlg.innerHTML = `<h3>Catch up ${missed.length} missed post${missed.length > 1 ? "s" : ""}?</h3>
      <p>They go out from today in their original order. Posts already scheduled move later to make room, until there's a free day. Nothing is deleted.</p>
      ${moveList(moves)}
      <div class="mv-foot"><button type="button" class="btn" data-mv-cancel>Cancel</button><button type="button" class="btn primary" data-mv="push">Move ${moves.length} post${moves.length > 1 ? "s" : ""}</button></div>`;
    dlg.showModal();
  }

  const home = $("#home");
  home.addEventListener("click", e => {
    const inp = e.target.closest(".dp-in"); if (inp && inp.showPicker){ try { inp.showPicker(); } catch (err) { /* the browser opens it itself */ } }
    const t = e.target.closest("[data-today]"); if (t) requestMove(find(t.dataset.today), from);
    if (e.target.closest("[data-catchup]")) catchUp();
  });
  home.addEventListener("change", e => {
    const inp = e.target.closest(".dp-in"); if (!inp || !inp.value) return;
    requestMove(find(inp.dataset.date), inp.value);
  });

  let toastT = 0;
  function toast(msg) {
    let t = $("#homeToast");
    if (!t) { t = document.createElement("div"); t.id = "homeToast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3600);
  }

  $("#home").addEventListener("click", async e => {
    const b = e.target.closest("[data-posted]"); if (!b) return;
    const [studio, id] = b.dataset.posted.split("/");
    b.disabled = true;
    try { await updateDoc(doc(db, "studios", studio, "posts", id), { status: "posted", postedAt: Date.now(), postedBy: s.email, updatedAt: Date.now() }); }
    catch (err) { b.disabled = false; alert("Couldn't mark it as posted. Try again."); }
  });
}
