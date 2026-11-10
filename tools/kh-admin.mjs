#!/usr/bin/env node
// Admin tasks run from this Mac with the Firebase service-account key (never committed).
//
//   node tools/kh-admin.mjs rules                         deploy firestore.rules
//   node tools/kh-admin.mjs member <email> <role> [name]  add or change someone without an invite email
//   node tools/kh-admin.mjs push <studio> <posts.json>    upsert posts ({id: post, ...}) into a studio
//   node tools/kh-admin.mjs upload <studio> <file> [id]   add one photo; prints its id
//   node tools/kh-admin.mjs import <studio> <posts.json> [photo dir]   photos (named <id>.<ext>) + posts
//   node tools/kh-admin.mjs pull <studio> [out.json]      export a studio's posts
//
// Key: $KH_SA_KEY, or ../.secrets/firebase-admin.json next to the repo.
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(here);
const keyPath = process.env.KH_SA_KEY || path.join(repo, "..", ".secrets", "firebase-admin.json");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, "utf8"))) });
const db = admin.firestore();

const STUDIOS = ["kmp", "unbroken"];
const ROLES = ["admin", "designer", "smm", "contributor", "viewer"];
const CHUNK = 900 * 1024;
const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function studioArg(s) { if (!STUDIOS.includes(s)) die(`studio must be one of ${STUDIOS.join(", ")}`); return s; }
function die(m) { console.error(m); process.exit(1); }

export async function uploadAsset(studio, file, id, by = "claude-code") {
  const buf = fs.readFileSync(file);
  id = id || crypto.randomUUID().replace(/-/g, "");
  const base = db.collection("studios").doc(studio).collection("assets").doc(id);
  const n = Math.ceil(buf.length / CHUNK);
  for (let i = 0; i < n; i++) await base.collection("chunks").doc(String(i)).set({ d: buf.subarray(i * CHUNK, (i + 1) * CHUNK) });
  await base.set({ name: path.basename(file), type: TYPES[path.extname(file).toLowerCase()] || "image/jpeg", size: buf.length, chunks: n, by, createdAt: Date.now() });
  return id;
}

export async function pushPosts(studio, posts) {
  const col = db.collection("studios").doc(studio).collection("posts");
  let n = 0;
  for (const [id, p] of Object.entries(posts)) {
    const data = JSON.parse(JSON.stringify(p));
    delete data.id;
    data.updatedAt = Date.now();
    await col.doc(id).set(data);
    n++;
  }
  return n;
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "rules") {
  const src = fs.readFileSync(path.join(repo, "firestore.rules"), "utf8");
  const r = await admin.securityRules().releaseFirestoreRulesetFromSource(src);
  console.log("rules deployed:", r.name);
} else if (cmd === "member") {
  const [emailRaw, role, ...name] = args;
  const email = String(emailRaw || "").trim().toLowerCase();
  if (!email || !ROLES.includes(role)) die(`usage: member <email> <${ROLES.join("|")}> [name]`);
  try { await admin.auth().getUserByEmail(email); }
  catch (e) { await admin.auth().createUser({ email }); console.log("created login for", email, "(no password yet: use “First time here?” on the sign-in page)"); }
  await db.collection("members").doc(email).set({ role, name: name.join(" ") || email.split("@")[0], addedBy: "claude-code", addedAt: Date.now() }, { merge: true });
  console.log(`${email} → ${role}`);
} else if (cmd === "push") {
  const [studio, file] = args;
  const n = await pushPosts(studioArg(studio), JSON.parse(fs.readFileSync(file, "utf8")));
  console.log(`pushed ${n} post(s) to ${studio}`);
} else if (cmd === "upload") {
  const [studio, file, id] = args;
  console.log(await uploadAsset(studioArg(studio), file, id));
} else if (cmd === "import") {
  // Photos named <id>.<ext> keep their id, so posts that already point at them still work.
  const [studio, postsFile, photoDir] = args;
  studioArg(studio);
  if (photoDir) for (const f of fs.readdirSync(photoDir).filter(f => TYPES[path.extname(f).toLowerCase()])) {
    const id = path.basename(f, path.extname(f));
    await uploadAsset(studio, path.join(photoDir, f), id, "import");
    console.log("photo", id);
  }
  console.log(`pushed ${await pushPosts(studio, JSON.parse(fs.readFileSync(postsFile, "utf8")))} post(s) to ${studio}`);
} else if (cmd === "pull") {
  const [studio, out] = args;
  const snap = await db.collection("studios").doc(studioArg(studio)).collection("posts").get();
  const posts = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
  const json = JSON.stringify(posts, null, 2);
  if (out) { fs.writeFileSync(out, json); console.log(`wrote ${snap.size} post(s) to ${out}`); } else console.log(json);
} else if (cmd) {
  die(`unknown command ${cmd}`);
}
if (cmd) process.exit(0);
