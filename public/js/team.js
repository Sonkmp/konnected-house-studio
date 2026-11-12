// Team page (admins only): add people, change roles, remove access.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {
  db, firebaseConfig, requireMember, sidebarHTML, wireNav, can, ROLES, normEmail, sendSetPassword, esc
} from "./kh.js";

const $ = s => document.querySelector(s);
const s = await requireMember();
if (!can.team(s.role)) { location.replace("/"); throw new Error("admins only"); }
$("#team").hidden = false;
const sb = $("#sidebar"); sb.innerHTML = sidebarHTML(s, "team"); wireNav(sb);

const roleOptions = sel => Object.entries(ROLES).map(([k, r]) => `<option value="${k}"${k === sel ? " selected" : ""}>${esc(r.label)}</option>`).join("");
$("#invRole").innerHTML = roleOptions("designer");
$("#roles").innerHTML = Object.values(ROLES).map(r => `<div class="card"><b>${esc(r.label)}</b>${esc(r.blurb)}</div>`).join("");

// A second Firebase app creates the new account, so the admin stays signed in.
const inviter = getAuth(initializeApp(firebaseConfig, "invite"));
function randomPassword() {
  const a = new Uint8Array(24); crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a));
}

const msg = $("#invMsg");
const say = (t, cls = "") => { msg.textContent = t; msg.className = "msg " + cls; };

$("#inviteForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("#invName").value.trim(), email = normEmail($("#invEmail").value), role = $("#invRole").value;
  if (!email) return;
  say("Adding…");
  try {
    await setDoc(doc(db, "members", email), { name, role, addedBy: s.email, addedAt: Date.now() });
  } catch (err) { say("Couldn't add them. Check your connection and try again.", "bad"); return; }
  try {
    await createUserWithEmailAndPassword(inviter, email, randomPassword());
    await signOut(inviter);
  } catch (err) {
    if (!(err && err.code === "auth/email-already-in-use")) { say("They're on the list, but the account couldn't be created. Try “Resend invite”.", "bad"); return; }
  }
  try {
    await sendSetPassword(email);
    say(`Added ${name || email}. They'll get an email to set their password (it can land in spam).`, "ok");
    e.target.reset(); $("#invRole").value = "designer";
  } catch (err) { say("They're added, but the email didn't send. Try “Resend invite”.", "bad"); }
});

onSnapshot(collection(db, "members"), snap => {
  const rows = snap.docs.map(d => ({ email: d.id, ...d.data() }))
    .sort((a, b) => (a.role === "admin" ? 0 : 1) - (b.role === "admin" ? 0 : 1) || String(a.name).localeCompare(String(b.name)));
  $("#people").innerHTML = rows.map(m => `<tr data-email="${esc(m.email)}">
    <td>${esc(m.name || "")}</td>
    <td class="e">${esc(m.email)}</td>
    <td>${m.email === s.email ? esc(ROLES[m.role] ? ROLES[m.role].label : m.role) : `<select data-role aria-label="Role for ${esc(m.email)}">${roleOptions(m.role)}</select>`}</td>
    <td style="text-align:right;white-space:nowrap">
      <button class="btn sm" data-resend>Resend invite</button>
      ${m.email === s.email ? "" : `<button class="btn sm danger" data-remove>Remove</button>`}
    </td></tr>`).join("") || `<tr><td colspan="4" class="e">No one yet.</td></tr>`;
});

$("#people").addEventListener("change", async e => {
  const sel = e.target.closest("[data-role]"); if (!sel) return;
  const email = sel.closest("tr").dataset.email;
  try { await updateDoc(doc(db, "members", email), { role: sel.value }); say(`${email} is now ${ROLES[sel.value].label}.`, "ok"); }
  catch (err) { say("Couldn't change the role. Try again.", "bad"); }
});
$("#people").addEventListener("click", async e => {
  const tr = e.target.closest("tr"); if (!tr) return;
  const email = tr.dataset.email;
  if (e.target.closest("[data-resend]")) {
    try { await sendSetPassword(email); say(`Sent ${email} a new link to set their password.`, "ok"); }
    catch (err) { say("Couldn't send the email. Try again in a minute.", "bad"); }
  }
  if (e.target.closest("[data-remove]")) {
    if (!confirm(`Remove ${email}? They won't be able to open the studios any more. Their work stays.`)) return;
    try { await deleteDoc(doc(db, "members", email)); say(`Removed ${email}.`, "ok"); }
    catch (err) { say("Couldn't remove them. Try again.", "bad"); }
  }
});
