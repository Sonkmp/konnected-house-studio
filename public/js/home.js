// Home page: sign in, pick a studio, and the two-week schedule across studios.
import {
  db, session, signIn, sendSetPassword, logOut, navHTML, wireNav, can, STUDIOS, esc
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
  const msg = $("#loginMsg");
  const say = (t, cls = "") => { msg.textContent = t; msg.className = "msg " + cls; };
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    say("Signing in…");
    try {
      await signIn($("#email").value, $("#password").value);
      location.replace(safeNext || "/");
    } catch (err) {
      const c = err && err.code;
      if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found") say("That email and password don't match. Use the link below to set a new password.", "bad");
      else if (c === "auth/too-many-requests") say("Too many tries. Wait a few minutes, or set a new password with the link below.", "bad");
      else say("Couldn't sign in. Check your connection and try again.", "bad");
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
const fmtDay = isoDate => new Date(isoDate + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const STATUS = { draft: "Draft", ready: "Ready", posted: "Posted" };

function showHome(s) {
  $("#home").hidden = false;
  const nav = $("#khNav"); nav.innerHTML = navHTML(s, "home"); wireNav(nav);
  $("#hello").textContent = `Welcome, ${s.name}`;

  const posts = {};
  $("#studios").innerHTML = Object.values(STUDIOS).map(st => `
    <a class="panel studio" href="${st.path}" style="--c:${st.accent}">
      <img src="${st.logo}" alt="${esc(st.show)}">
      <div><b>${esc(st.name)}</b><p id="count-${st.key}">&nbsp;</p></div>
      <div class="row"><span class="btn sm">Carousels</span><span class="btn sm">Reel covers</span></div>
    </a>`).join("");
  document.querySelectorAll(".studio .btn").forEach((b, i) => {
    b.addEventListener("click", e => {
      e.preventDefault();
      const st = Object.values(STUDIOS)[Math.floor(i / 2)];
      location.href = st.path + (i % 2 ? "#reel" : "#carousel");
    });
  });

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
    }, () => { $("#sched").innerHTML = `<div class="day"><span class="empty">Couldn't load the schedule. Reload to try again.</span></div>`; });
  }

  function render() {
    const all = Object.values(posts).flat();
    let html = "";
    for (let i = 0; i < 14; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      const key = iso(d);
      const items = all.filter(p => p.date === key).sort((a, b) => a.studio.localeCompare(b.studio) || String(a.format).localeCompare(String(b.format)));
      if (!items.length && i > 0) continue;
      html += `<div class="day${i === 0 ? " today" : ""}"><div class="d">${i === 0 ? "Today" : esc(fmtDay(key).split(" ")[0])}<small>${esc(fmtDay(key).split(" ").slice(1).join(" "))}</small></div><div class="items">`;
      if (!items.length) html += `<span class="empty">Nothing today.</span>`;
      for (const p of items) {
        const st = STUDIOS[p.studio];
        html += `<div class="item">
          <span class="dot" style="--c:${(p.theme && p.theme.accent) || st.accent}"></span>
          <span class="t"><a href="${st.path}#post=${encodeURIComponent(p.id)}">${esc(p.title || "Untitled")}</a>
            <small>${esc(st.name)} · ${p.format === "reel" ? "Reel cover" : `Carousel · ${(p.slides || []).length} slides`}${p.label ? " · " + esc(p.label) : ""}</small></span>
          <span class="acts"><span class="chip" data-s="${esc(p.status || "draft")}">${esc(STATUS[p.status] || "Draft")}</span>
            ${can.markPosted(s.role) && p.status !== "posted" ? `<button class="btn sm" data-posted="${esc(p.studio)}/${esc(p.id)}">Mark posted</button>` : ""}</span>
        </div>`;
      }
      html += `</div></div>`;
    }
    $("#sched").innerHTML = html || `<div class="day"><span class="empty">Nothing scheduled.</span></div>`;
  }

  $("#sched").addEventListener("click", async e => {
    const b = e.target.closest("[data-posted]"); if (!b) return;
    const [studio, id] = b.dataset.posted.split("/");
    b.disabled = true;
    try { await updateDoc(doc(db, "studios", studio, "posts", id), { status: "posted", postedAt: Date.now(), postedBy: s.email, updatedAt: Date.now() }); }
    catch (err) { b.disabled = false; alert("Couldn't mark it as posted. Try again."); }
  });
}
