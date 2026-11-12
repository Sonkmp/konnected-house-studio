// Home page: sign in, the two studios, and the two-week schedule across studios.
import {
  db, session, signIn, sendSetPassword, logOut, sidebarHTML, wireNav, can, STUDIOS, ICONS, esc
} from "./kh.js";
import {
  collection, query, where, onSnapshot, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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
    catch (err) { say(err && err.code === "auth/invalid-email" ? "That doesn't look like an email address." : "Couldn't send the link. Try again in a minute.", "bad"); }
  });
}

function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
const dayPill = isoDate => new Date(isoDate + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
const STATUS = { draft: "Draft", ready: "Ready", posted: "Posted" };

function showHome(s) {
  $("#home").hidden = false;
  const sb = $("#sidebar"); sb.innerHTML = sidebarHTML(s, "home"); wireNav(sb);
  const hour = new Date().getHours();
  $("#hello").textContent = `${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, ${s.name.split(" ")[0]}`;
  $("#today").textContent = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) + " · Design Studio";
  $("#icOpen").innerHTML = ICONS.clock; $("#icReady").innerHTML = ICONS.check; $("#icReel").innerHTML = ICONS.film;

  const posts = {};
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
        </div>
      </div>
    </article>`).join("");

  const today = new Date(); today.setHours(12);
  const from = iso(today), end = new Date(today); end.setDate(end.getDate() + 13);
  const to = iso(end);

  for (const st of Object.values(STUDIOS)) {
    const q = query(collection(db, "studios", st.key, "posts"), where("date", ">=", from), where("date", "<=", to));
    onSnapshot(q, snap => {
      posts[st.key] = snap.docs.map(d => ({ id: d.id, studio: st.key, ...d.data() }));
      const list = posts[st.key], open = list.filter(p => p.status !== "posted").length;
      $("#count-" + st.key).textContent = list.length ? `${list.length} post${list.length > 1 ? "s" : ""} in the next 14 days · ${open} not posted yet` : "Nothing scheduled in the next 14 days";
      render();
    }, () => { $("#sched").innerHTML = `<p class="empty">Couldn't load the schedule. Reload to try again.</p>`; });
  }

  function render() {
    const all = Object.values(posts).flat()
      .sort((a, b) => a.date.localeCompare(b.date) || a.studio.localeCompare(b.studio) || String(a.format).localeCompare(String(b.format)));
    $("#stOpen").textContent = all.filter(p => p.status !== "posted").length;
    $("#stReady").textContent = all.filter(p => p.status === "ready").length;
    $("#stReel").textContent = all.filter(p => p.format === "reel").length;
    const note = $("#filterNote");
    note.hidden = !filter; if (filter) note.textContent = `Showing ${FILTERS[filter][0]} · tap the tile again for all`;
    const shown = filter ? all.filter(FILTERS[filter][1]) : all;
    $("#sched").innerHTML = shown.map(p => {
      const st = STUDIOS[p.studio];
      return `<div class="item">
        <span class="dp${p.date === from ? " today" : ""}">${p.date === from ? "Today" : esc(dayPill(p.date))}</span>
        <span class="t"><span class="dot" style="--c:${(p.theme && p.theme.accent) || st.accent}"></span><span>
          <a href="${st.path}#post=${encodeURIComponent(p.id)}">${esc(p.title || "Untitled")}</a>
          <small>${esc(st.show)} · ${p.format === "reel" ? "Reel cover" : `Carousel · ${(p.slides || []).length} slides`}${p.label ? " · " + esc(p.label) : ""}</small></span></span>
        <span class="acts"><span class="chip" data-s="${esc(p.status || "draft")}">${esc(STATUS[p.status] || "Draft")}</span>
          ${can.markPosted(s.role) && p.status !== "posted" ? `<button class="btn ghost sm" data-posted="${esc(p.studio)}/${esc(p.id)}" title="Mark as posted">${ICONS.check}<span>Mark posted</span></button>` : ""}</span>
      </div>`;
    }).join("") || `<p class="empty">${filter ? `Nothing ${FILTERS[filter][0]} in the next 14 days.` : "Nothing scheduled in the next 14 days."}</p>`;
  }

  $("#sched").addEventListener("click", async e => {
    const b = e.target.closest("[data-posted]"); if (!b) return;
    const [studio, id] = b.dataset.posted.split("/");
    b.disabled = true;
    try { await updateDoc(doc(db, "studios", studio, "posts", id), { status: "posted", postedAt: Date.now(), postedBy: s.email, updatedAt: Date.now() }); }
    catch (err) { b.disabled = false; alert("Couldn't mark it as posted. Try again."); }
  });
}
