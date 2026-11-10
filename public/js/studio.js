// Connects a studio page (public/kmp, public/unbroken) to Firebase: checks the login,
// then hands the studio the same db / assets / downloads interface it uses on claude.ai.
import {
  db, requireMember, assetStore, can, navHTML, wireNav, STUDIOS
} from "./kh.js";
import {
  collection, doc, onSnapshot, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const studio = document.querySelector('meta[name="kh-studio"]').content;
const s = await requireMember();

const nav = document.getElementById("khNav");
nav.innerHTML = navHTML(s, studio);
wireNav(nav);

const assets = assetStore(studio, () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => window.__khRefresh && window.__khRefresh(), 120);
});
let refreshTimer = 0;

const fmtKey = "kh.fmt." + studio;
window.KH = {
  studio, role: s.role, email: s.email,
  canEdit: post => can.edit(s.role, post),
  canCreate: fmt => can.create(s.role, fmt),
  assetSrc: id => assets.src(id),
  assetReady: id => assets.ready(id),
  rememberFormat(f) {
    try { localStorage.setItem(fmtKey, f); } catch (e) { /* per-browser convenience only */ }
  },
  startFormat() {
    if (location.hash === "#reel") return "reel";
    if (location.hash === "#carousel") return "carousel";
    try { const f = localStorage.getItem(fmtKey); if (f === "reel" || f === "carousel") return f; } catch (e) { /* ignore */ }
    return can.create(s.role, "carousel") ? "carousel" : "reel";
  }
};

// Firestore errors use names like "permission-denied"; the studio treats "invalid_argument"
// as "this view can't save", which is the right reaction to a denied write.
const wrap = p => p.catch(e => {
  const err = new Error(e && e.message);
  err.code = e && e.code === "permission-denied" ? "invalid_argument" : (e && e.code);
  throw err;
});

function collectionApi(name) {
  const ref = collection(db, "studios", studio, name);
  return {
    onSnapshot: (next, error) => onSnapshot(ref, { includeMetadataChanges: true }, next, error),
    doc: id => ({
      set: data => wrap(setDoc(doc(ref, id), data)),
      delete: () => wrap(deleteDoc(doc(ref, id)))
    })
  };
}

const api = {
  db: { collection: collectionApi },
  assets: { upload: file => assets.upload(file, s.email) },
  downloads: {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  },
  user: { email: s.email, name: s.name, role: s.role }
};

document.title = `${STUDIOS[studio].name} · Konnected House`;
window.__khResolve({ use: async name => api[name] || null });
