// Shared Firebase setup, roles and the photo store for every page of the site.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, getDocs, setDoc, collection, Bytes
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// The web config is public by design; access is controlled by firestore.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyDdlROfwxCRtvVSAA1ECQt54fJGJ_zw8N8",
  authDomain: "konnected-house-studio.firebaseapp.com",
  projectId: "konnected-house-studio",
  storageBucket: "konnected-house-studio.firebasestorage.app",
  messagingSenderId: "1007912137069",
  appId: "1:1007912137069:web:609edf7f1f6b0e202a2a64"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export const STUDIOS = {
  kmp: { key: "kmp", name: "KMP Studio", show: "Konnected Minds", path: "/kmp/", logo: "/brand/kmp-logo-full.png", accent: "#4CA4C6", band: "#0A0D24" },
  unbroken: { key: "unbroken", name: "Unbroken Studio", show: "Unbroken Podcast", path: "/unbroken/", logo: "/brand/unbroken-logo-full.png", accent: "#C9060D", band: "#0D0D0D" }
};

export const ROLES = {
  admin: { label: "Admin", blurb: "Everything, plus adding people and changing roles" },
  designer: { label: "Designer", blurb: "Edit and download carousels and reel covers" },
  smm: { label: "Social media manager", blurb: "Edit and download reel covers, download carousels, mark posts as posted" },
  contributor: { label: "Contributor", blurb: "Write reel cover titles and hooks" },
  viewer: { label: "Viewer", blurb: "See what's coming up and download" }
};

// Mirrors firestore.rules. The rules are what actually protect the data.
const DESIGNS = ["admin", "designer"];
const REELS = ["admin", "designer", "smm", "contributor"];
const fmtOf = p => (p && p.format) || "carousel";
export const can = {
  edit: (role, post) => DESIGNS.includes(role) || (REELS.includes(role) && fmtOf(post) === "reel"),
  create: (role, fmt) => DESIGNS.includes(role) || (REELS.includes(role) && fmt === "reel"),
  markPosted: role => ["admin", "designer", "smm"].includes(role),
  team: role => role === "admin"
};

export const normEmail = e => String(e || "").trim().toLowerCase();

// Resolves once Firebase knows who is signed in: null, or {user, email, role, name}.
// role is null when the account exists but isn't on the team list.
export function session() {
  return new Promise(resolve => {
    const off = onAuthStateChanged(auth, async user => {
      off();
      if (!user) return resolve(null);
      const email = normEmail(user.email);
      let member = null;
      try { const snap = await getDoc(doc(db, "members", email)); member = snap.exists() ? snap.data() : null; }
      catch (e) { member = null; }
      resolve({ user, email, role: member ? member.role : null, name: (member && member.name) || email.split("@")[0] });
    });
  });
}

// For pages behind the login: sends visitors without a session to the sign-in page.
export async function requireMember() {
  const s = await session();
  if (!s || !s.role) {
    location.replace("/?next=" + encodeURIComponent(location.pathname + location.hash));
    return new Promise(() => {});
  }
  return s;
}

export const signIn = (email, password) => signInWithEmailAndPassword(auth, normEmail(email), password);
export const sendSetPassword = email => sendPasswordResetEmail(auth, normEmail(email), { url: location.origin + "/" });
export const logOut = () => signOut(auth);

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function navHTML(s, current) {
  const links = Object.values(STUDIOS).map(st =>
    `<a href="${st.path}"${st.key === current ? ' aria-current="page"' : ""}>${esc(st.name)}</a>`).join("");
  return `<a href="/" class="kh-home"${current === "home" ? ' aria-current="page"' : ""}>Home</a>${links}
    ${can.team(s.role) ? `<a href="/team/"${current === "team" ? ' aria-current="page"' : ""}>Team</a>` : ""}
    <span class="kh-me" title="${esc(s.email)}">${esc(s.name)} · ${esc(ROLES[s.role] ? ROLES[s.role].label : s.role)}</span>
    <button type="button" class="kh-out" data-kh-out>Sign out</button>`;
}
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONS = {
  home: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  team: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.5c2.3.2 4 1.8 4.5 4.5"/>'),
  out: svg('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l4-4-4-4"/><path d="M14 12H4"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  check: svg('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>'),
  film: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 8h14M5 16h14"/>')
};

// Navy sidebar for the light pages (home, team). The studios use navHTML in their dark header.
export function sidebarHTML(s, current) {
  const link = (href, key, label, icon) =>
    `<a href="${href}" class="sb-link"${key === current ? ' aria-current="page"' : ""}>${icon}<span>${esc(label)}</span></a>`;
  const initials = s.name.split(/[\s.]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
  return `<a href="/" class="sb-logo"><img src="/brand/kh-logo-white.png" alt="Konnected House"></a>
    <div class="sb-eyebrow">Design Studio</div>
    <nav class="sb-nav" aria-label="Site">
      <div class="sb-group">Overview</div>
      ${link("/", "home", "Home", ICONS.home)}
      <div class="sb-group">Studios</div>
      ${Object.values(STUDIOS).map(st => link(st.path, st.key, st.name, `<span class="sw" style="--c:${st.accent}"></span>`)).join("")}
      ${can.team(s.role) ? `<div class="sb-group">Admin</div>${link("/team/", "team", "Team", ICONS.team)}` : ""}
    </nav>
    <div class="sb-user">
      <span class="av" aria-hidden="true">${esc(initials)}</span>
      <span class="who"><b title="${esc(s.email)}">${esc(s.name)}</b><small>${esc(ROLES[s.role] ? ROLES[s.role].label : s.role)}</small></span>
      <button type="button" class="sb-out" data-kh-out title="Sign out" aria-label="Sign out">${ICONS.out}</button>
    </div>`;
}

export function wireNav(root) {
  root.addEventListener("click", async e => {
    if (e.target.closest("[data-kh-out]")) { await logOut(); location.replace("/"); }
  });
}

/* ---------- photo store ----------
   Photos live in Firestore, split into chunks under studios/{studio}/assets/{id}/chunks/{n},
   so the site runs on Firebase's free plan without Cloud Storage. Each photo is fetched once
   and then kept in the browser's cache. */
const CHUNK = 900 * 1024;
const MAX_BYTES = 20 * 1024 * 1024;
const CACHE = "kh-assets-v1";

export function assetStore(studio, onReady) {
  const urls = new Map(), pending = new Map();
  const cacheKey = id => new Request(`${location.origin}/__kh_asset/${studio}/${id}`);

  async function fromCache(id) {
    try { const c = await caches.open(CACHE); const r = await c.match(cacheKey(id)); return r ? await r.blob() : null; }
    catch (e) { return null; }
  }
  async function toCache(id, blob) {
    try { const c = await caches.open(CACHE); await c.put(cacheKey(id), new Response(blob, { headers: { "Content-Type": blob.type } })); }
    catch (e) { /* the cache is a speed-up only */ }
  }
  async function fetchAsset(id) {
    let blob = await fromCache(id);
    if (!blob) {
      const base = doc(db, "studios", studio, "assets", id);
      const meta = await getDoc(base);
      if (!meta.exists()) throw new Error("missing");
      const m = meta.data();
      const parts = (await getDocs(collection(base, "chunks"))).docs
        .sort((a, b) => +a.id - +b.id).map(d => d.data().d.toUint8Array());
      if (parts.length !== m.chunks) throw new Error("incomplete");
      blob = new Blob(parts, { type: m.type || "image/jpeg" });
      toCache(id, blob);
    }
    return URL.createObjectURL(blob);
  }
  function ready(id) {
    if (urls.has(id)) return Promise.resolve(urls.get(id));
    if (!pending.has(id)) {
      pending.set(id, fetchAsset(id).then(
        u => { urls.set(id, u); onReady(); return u; },
        () => { urls.set(id, ""); return ""; }
      ));
    }
    return pending.get(id);
  }
  return {
    src(id) { if (urls.has(id)) return urls.get(id); ready(id); return ""; },
    ready,
    async upload(file, by) {
      if (file.size > MAX_BYTES) { const e = new Error("too large"); e.code = "too_large"; throw e; }
      const blob = await shrink(file);
      const buf = new Uint8Array(await blob.arrayBuffer());
      const id = crypto.randomUUID().replace(/-/g, "");
      const base = doc(db, "studios", studio, "assets", id);
      const n = Math.ceil(buf.length / CHUNK);
      for (let i = 0; i < n; i++) {
        await setDoc(doc(base, "chunks", String(i)), { d: Bytes.fromUint8Array(buf.subarray(i * CHUNK, (i + 1) * CHUNK)) });
      }
      // The main record goes last, so a half-finished upload never looks complete.
      await setDoc(base, { name: file.name || "photo", type: blob.type || "image/jpeg", size: buf.length, chunks: n, by, createdAt: Date.now() });
      toCache(id, blob);
      urls.set(id, URL.createObjectURL(blob));
      return { id };
    }
  };
}

// Large photos are re-encoded so each one stays a few MB. 2700px on the long edge is
// still 2.5x the 1080px slide width, so zooming in keeps full quality.
async function shrink(file) {
  const LONG = 2700, KEEP_UNDER = 2.5 * 1024 * 1024;
  if (file.size <= KEEP_UNDER || !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) return file;
  let bmp;
  try { bmp = await createImageBitmap(file); } catch (e) { return file; }
  const k = Math.min(1, LONG / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const out = await new Promise(r => c.toBlob(r, "image/jpeg", 0.92));
  return out && out.size < file.size ? out : file;
}
