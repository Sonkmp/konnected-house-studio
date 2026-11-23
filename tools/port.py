#!/usr/bin/env python3
"""Turn a claude.ai studio source into a website page.

  python3 tools/port.py            # builds public/kmp/index.html and public/unbroken/index.html

The studio sources in studios/ are the same files the claude.ai artifacts are built from
(KM Studio Source/studio.src.html, and Unbroken Pod/Studio Source/studio.src.html), so a fix
made there can be copied in and re-ported. Every replacement must match exactly once, so a
change in a source fails loudly instead of producing a half-ported page.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STUDIOS = {
    "kmp": {"title": "KMP Studio"},
    "unbroken": {"title": "Unbroken Studio"},
}


# Content posters and the content lead don't edit designs, so their studio drops the editing controls.
# For posters the settings panel becomes a posting panel (download, copy the caption, mark posted);
# for the lead it becomes a review panel (read it through, comment, approve or send back).
SIMPLE_CSS = """<style>
.chip-st[data-s="review"]{color:#F5B83D;border-color:color-mix(in srgb,#F5B83D 50%,transparent);background:color-mix(in srgb,#F5B83D 10%,transparent)}
html[data-kh-simple] .post-head .meta-row, html[data-kh-simple] .post-head .guest-f,
html[data-kh-simple] #undoBtn, html[data-kh-simple] #redoBtn, html[data-kh-simple] .toolbar .hint,
html[data-kh-simple] #compactBtn, html[data-kh-simple] .photo-bar, html[data-kh-simple] .viewer-foot span + span,
html[data-kh-simple] .add-slide, html[data-kh-simple] #tabPost{display:none !important}
html[data-kh-simple] #preview, html[data-kh-simple] .title-input{pointer-events:none}
.kh-post-panel{display:flex;flex-direction:column;gap:14px;padding:4px 2px}
.kh-post-panel .kpp-state{display:flex;align-items:center;gap:8px;margin:0;font-weight:700;font-size:15px;color:var(--fg)}
.kh-post-panel .kpp-state i{width:9px;height:9px;border-radius:50%;background:#46C001;flex:none}
.kh-post-panel .kpp-state[data-s="posted"] i{background:var(--muted)}
.kh-post-panel ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px;counter-reset:kpp}
.kh-post-panel li{counter-increment:kpp;display:flex;flex-direction:column;gap:8px;padding:14px;border:1px solid var(--line);border-radius:12px}
.kh-post-panel li > b{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--fg)}
.kh-post-panel li > b::before{content:counter(kpp);display:grid;place-items:center;width:22px;height:22px;border-radius:50%;border:1px solid var(--line);font-size:12px;color:var(--muted)}
.kh-post-panel li > span, .kh-post-panel .kpp-note{font-size:13px;color:var(--muted);margin:0}
.kh-post-panel .kpp-cap{width:100%;box-sizing:border-box;min-height:180px;resize:vertical;font:inherit;font-size:13px;line-height:1.45;color:var(--fg);background:transparent;border:1px solid var(--line);border-radius:8px;padding:10px}
.kh-post-panel .btn.full{width:100%;justify-content:center}
.kh-post-panel .kpp-state[data-s="review"] i{background:#F5B83D}
.kh-post-panel .kpp-state[data-s="draft"] i{background:var(--muted)}
.kh-post-panel .kpp-row{display:flex;gap:8px}
.kh-post-panel .kpp-row .btn{flex:1;justify-content:center}
.kh-lowres{margin:0 auto 10px;max-width:640px;padding:9px 13px;border-radius:10px;background:rgba(245,184,61,.12);border:1px solid rgba(245,184,61,.5);color:#F7D79B;font-size:12.5px;line-height:1.45;text-align:left}
.kh-lowres b{color:#F5B83D}
</style>
"""


def port(key):
    src = open(os.path.join(ROOT, "studios", f"{key}.src.html"), encoding="utf8").read()

    def rep(old, new, count=1):
        nonlocal src
        n = src.count(old)
        if n != count:
            sys.exit(f"[{key}] expected {count} match(es), found {n}:\n{old[:160]}")
        src = src.replace(old, new)

    # ---------- document shell ----------
    start = src.index('<meta name="claude:viewport-fit-sides" content="cover">')
    src = src[start:]
    rep('<meta name="claude:viewport-fit-sides" content="cover">',
        f'<!doctype html>\n<html lang="en" data-studio="{key}"><head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        f'<title>{STUDIOS[key]["title"]} · Konnected House</title>\n'
        f'<meta name="kh-studio" content="{key}">\n'
        f'<link rel="icon" href="/brand/{key}-mark.png">\n'
        '<link rel="stylesheet" href="/css/studio-nav.css">\n'
        '<script src="/js/kh-boot.js"></script>')
    # the interface theme loads after the studio's own styles; it never touches the canvas artwork
    rep('\n<div class="app">', '\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">\n'
        '<link rel="stylesheet" href="/css/studio-theme.css">\n' + SIMPLE_CSS + '</head><body>\n<div class="app">')
    rep('__LOGO_FULL__', f'/brand/{key}-logo-full.png', 2)
    rep('__LOGO_MARK__', f'/brand/{key}-mark.png')
    src = src.rstrip() + '\n<script type="module" src="/js/studio.js"></script>\n</body></html>\n'

    # ---------- header: studio switcher and account ----------
    rep('    <div class="brand">',
        '    <a href="/" class="kh-homelink" title="Konnected House home" aria-label="Home"><img src="/brand/kh-mark.png" alt=""></a>\n    <div class="brand">')
    rep('<div class="save" id="saveState"',
        '<nav class="kh-nav" id="khNav" aria-label="Studios"></nav>\n'
        '    <label class="kh-search"><input type="search" id="khSearch" placeholder="Search posts, quotes, guests" aria-label="Search posts" autocomplete="off"><kbd>⌘K</kbd></label>\n'
        '    <div class="save" id="saveState"')
    rep('<div class="save" id="saveState" data-s="busy" role="status"><i></i><span>Connecting…</span></div>',
        '<div class="save" id="saveState" data-s="busy" role="status"><i></i><span>Connecting…</span></div>\n    <div class="kh-user" id="khUser"></div>')

    # ---------- format toggle (Carousels / Reel covers / Quote cards) replaces the format picker ----------
    quotes = 'const QUOTE_STYLE = null;' not in src  # a studio has quote cards once its design is set
    fmts = [("carousel", "Carousels"), ("reel", "Reels" if quotes else "Reel covers")] + ([("quote", "Quotes")] if quotes else [])
    rep('<span class="eyebrow">Posts</span>',
        '<div class="seg kh-fmt" id="fmtSeg" role="tablist" aria-label="Format">'
        + "".join('<button type="button" role="tab" data-fmt="%s" data-label="%s" aria-selected="%s"%s>%s</button>'
                  % (k, l, str(k == "carousel").lower(), ' class="on"' if k == "carousel" else "", l) for k, l in fmts)
        + '</div>')
    rep('aria-expanded="false">+ New post</button>', 'aria-expanded="false">+ New</button>')
    src, n = re.subn(r'        <label class="f full">Format\n\s*<select id="newFormat">.*?</select>\n\s*</label>\n', '', src, count=1)
    if n != 1: sys.exit(f"[{key}] format picker not found")
    rep('  confirm: null\n};', '  confirm: null, fmt: "carousel"\n};')
    rep('function renderList(){', 'function renderList(){ fmtCounts();')
    rep('return [...state.posts.values()].sort(',
        'return [...state.posts.values()].filter(p => (p.format || "carousel") === state.fmt && matchQ(p) && (!window.KH || KH.canSee(p))).sort(')
    rep('const format = $("#newFormat").value;',
        'const format = state.fmt;\n'
        '    if (window.KH && !KH.canCreate(format)){ toast(`Your role can\'t start ${format === "reel" ? "reel covers" : "carousels"}.`); return; }')
    rep('$("#newPostBtn").addEventListener("click"',
        '$("#fmtSeg").addEventListener("click", e => { const b = e.target.closest("[data-fmt]"); if (b) setFmt(b.dataset.fmt); });\n'
        '  $("#khSearch").addEventListener("input", e => { state.q = e.target.value; renderList(); });\n'
        '  document.addEventListener("keydown", e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"){ e.preventDefault(); $("#khSearch").focus(); $("#khSearch").select(); } });\n'
        '  $("#newPostBtn").addEventListener("click"')
    rep('function renderAll(){ renderList();', '''function setFmt(f){
  if (f === state.fmt) return;
  state.fmt = f;
  if (window.KH) KH.rememberFormat(f);
  $("#newForm").hidden = true; $("#newPostBtn").setAttribute("aria-expanded", "false");
  state.currentId = pickDefaultPost(); state.slideIdx = 0; state.confirm = null;
  if (state.currentId && !hist[state.currentId]) histInit(state.currentId);
  renderAll();
}
// Header search narrows the post list (title, date, pillar, caption, quote text, guest name).
function matchQ(p){
  const q = (state.q || "").trim().toLowerCase(); if (!q) return true;
  const has = x => String(x || "").toLowerCase().includes(q);
  return [p.title, p.date, fmtDate(p.date), themeOf(p).pillar, p.caption, p.guest].some(has) || p.slides.some(s => [s.headline, s.sub, s.chip && s.chip.name].some(has));
}
// The toggle shows how many posts each format has.
function fmtCounts(){
  const n = f => [...state.posts.values()].filter(p => (p.format || "carousel") === f && (!window.KH || KH.canSee(p))).length;
  document.querySelectorAll("#fmtSeg [data-fmt]").forEach(b => { b.innerHTML = `<i class="ic" aria-hidden="true"></i><span class="l">${b.dataset.label} <span class="n">${n(b.dataset.fmt)}</span></span>`; });
}
// Role rules live in js/kh.js; the page only reflects them (Firestore rules enforce them).
function syncAccess(){
  const poster = !!(window.KH && KH.role === "poster"), lead = !!(window.KH && KH.role === "lead");
  document.documentElement.toggleAttribute("data-kh-simple", poster || lead);
  if (poster || lead){ $("#tabSlide").textContent = poster ? "Posting" : "Review"; state.tab = "slide"; }
  let p = cur();
  if (p && window.KH && !KH.canSee(p)){ state.currentId = pickDefaultPost(); state.slideIdx = 0; p = cur(); }
  state.readOnly = !!(window.KH && p && !KH.canEdit(p));
  document.querySelectorAll("#fmtSeg [data-fmt]").forEach(b => { const on = b.dataset.fmt === state.fmt; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
  const nb = $("#newPostBtn"); if (nb){ nb.hidden = !!(window.KH && !KH.canCreate(state.fmt)); nb.textContent = "New " + ({carousel:"carousel", reel:"reel cover", quote:"quote card"}[state.fmt] || "post"); }
}
// Content posters: download a Ready post, copy its caption, post it, then mark it posted here (or undo that).
function khPosterPanel(){
  const p = cur(); if (!p) return `<p class="kpp-note">Nothing ready to post yet. Posts show up here once the content lead sets them to Ready.</p>`;
  const posted = p.status === "posted", one = single(p);
  const at = posted && p.postedAt ? new Date(p.postedAt).toLocaleString("en-GB", {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"}) : "";
  return `<div class="kh-post-panel">
    <p class="kpp-state" data-s="${posted ? "posted" : "ready"}"><i></i>${posted ? "Posted" : "Ready to post"}${p.date ? ` · ${esc(fmtDate(p.date))}` : ""}</p>
    <ol>
      <li><b>Download</b><span>${one ? "One image" : `All ${p.slides.length} slides in one ZIP`}, sized for Instagram.</span>
        <button class="btn primary full" type="button" data-kh-dl>${one ? `Download ${p.format === "quote" ? "card" : "cover"}` : "Download ZIP"}</button></li>
      <li><b>Copy the caption</b>
        <textarea class="kpp-cap" readonly aria-label="Caption">${esc(p.caption || "")}</textarea>
        <button class="btn full" type="button" data-kh-copy${p.caption ? "" : " disabled"}>${p.caption ? "Copy caption" : "No caption yet"}</button></li>
      <li><b>Post it, then mark it</b>
        ${posted ? `<button class="btn full" type="button" data-kh-posted="0">Not posted yet? Undo</button>` : `<button class="btn primary full" type="button" data-kh-posted="1">Mark as posted</button>`}</li>
    </ol>
    ${at ? `<p class="kpp-note">Marked posted ${esc(at)}.</p>` : ""}
  </div>`;
}
function khSimpleStage(){
  const t = $("#postTitle"); if (t){ t.readOnly = true; t.tabIndex = -1; }
  document.querySelectorAll(".thumb[draggable]").forEach(b => { b.draggable = false; b.title = "Slide " + (+b.dataset.i + 1); });
}
// Content lead: read the post through, comment, then approve it (Ready, so the poster gets it) or send it back.
const KH_REVIEW_HEAD = {draft: "Still being designed", review: "Waiting for your review", ready: "Approved · with the poster", posted: "Posted"};
function khReviewPanel(){
  const p = cur(); if (!p) return `<p class="kpp-note">Nothing to review yet. Posts show up here when the design team sends them for review.</p>`;
  const st = p.status || "draft", one = single(p);
  const decide = st === "posted" ? `<span>It's been posted. Nothing more to do.</span>`
    : st === "ready" ? `<span>The poster can see it now.</span><button class="btn full" type="button" data-kh-status="review">Take it back for changes</button>`
    : `${st === "draft" ? `<span>The design team hasn't sent this for review yet.</span>` : `<span>Happy with it? Approve it and it goes straight to the poster.</span>`}
      <div class="kpp-row"><button class="btn primary" type="button" data-kh-status="ready">Approve</button>${st === "review" ? `<button class="btn" type="button" data-kh-status="draft">Send back</button>` : ""}</div>`;
  return `<div class="kh-post-panel">
    <p class="kpp-state" data-s="${esc(st)}"><i></i>${KH_REVIEW_HEAD[st] || "Draft"}${p.date ? ` · ${esc(fmtDate(p.date))}` : ""}</p>
    <ol>
      <li><b>Read it through</b><span>${one ? "Check the image" : `Go through all ${p.slides.length} slides (arrows or the strip)`}, then the caption.</span>
        <textarea class="kpp-cap" readonly aria-label="Caption">${esc(p.caption || "")}</textarea></li>
      <li><b>Comment on anything to fix</b><span>Comments sit on the slide you're looking at, so the designer knows where.</span>
        <button class="btn full" type="button" data-kh-comment>Add a comment</button></li>
      <li><b>${st === "ready" || st === "posted" ? "Approved" : "Approve or send back"}</b>${decide}</li>
    </ol>
    ${p.reviewedBy && (st === "ready" || st === "posted") ? `<p class="kpp-note">Approved by ${esc(p.reviewedByName || p.reviewedBy.split("@")[0])}${p.reviewedAt ? " · " + esc(new Date(p.reviewedAt).toLocaleString("en-GB", {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"})) : ""}.</p>` : ""}
  </div>`;
}
document.addEventListener("click", async e => {
  const b = e.target.closest && e.target.closest("[data-kh-status]"), p = cur(); if (!b || !p || !window.KH) return;
  const to = b.dataset.khStatus, now = Date.now();
  const data = Object.assign({status: to, updatedAt: now}, to === "ready" ? {reviewedAt: now, reviewedBy: KH.email, reviewedByName: KH.name || ""} : {});
  b.disabled = true;
  try {
    await state.db.collection("posts").doc(p.id).update(data); Object.assign(p, data); renderAll();
    toast(to === "ready" ? "Approved. It's with the poster now." : to === "draft" ? "Sent back to the design team. Leave a comment saying what to change." : "Taken back for review.");
    if (to === "draft" && window.__khOpenComments) window.__khOpenComments();
  } catch(err){ b.disabled = false; toast("Couldn't change the status. Try again."); }
});
document.addEventListener("click", async e => {
  const p = cur(); if (!p || !e.target.closest) return;
  if (e.target.closest("[data-kh-comment]")){ if (window.__khOpenComments) window.__khOpenComments(); return; }
  if (e.target.closest("[data-kh-dl]")){ const b = $("#dlZip") || $("#dlSlide"); if (b) b.click(); return; }
  if (e.target.closest("[data-kh-copy]")){
    try { await navigator.clipboard.writeText(p.caption || ""); }
    catch(err){ const ta = document.querySelector(".kpp-cap"); if (ta){ ta.select(); document.execCommand("copy"); } }
    toast("Caption copied."); return;
  }
});
document.addEventListener("click", async e => {
  const b = e.target.closest && e.target.closest("[data-kh-posted]"), p = cur(); if (!b || !p || !window.KH) return;
  const posted = b.dataset.khPosted === "1", now = Date.now();
  const data = posted ? {status:"posted", postedAt: now, postedBy: KH.email, updatedAt: now} : {status:"ready", updatedAt: now};
  b.disabled = true;
  try { await state.db.collection("posts").doc(p.id).update(data); Object.assign(p, data); renderAll(); toast(posted ? "Marked as posted." : "Back to Ready."); }
  catch(err){ b.disabled = false; toast("Couldn't change the status. Try again."); }
});
function renderAll(){ syncAccess(); renderList();''')

    # ---------- photos come from the site's asset store ----------
    rep('if (ref.id) return "/_blob/" + ref.id;', 'if (ref.id) return window.KH ? KH.assetSrc(ref.id) : "";')
    rep('function loadImg(ref){',
        'async function loadImg(ref){\n  if (ref && ref.id && !ref.src && window.KH) await KH.assetReady(ref.id);')

    # ---------- copy that pointed at claude.ai ----------
    rep('<p>Send Claude the photos for a post in chat and it will fill the slides for you. You can also start a blank post here with <b>+ New post</b> and add photos yourself.</p>',
        '<p>Posts the content team queues show up here. You can also start one with <b>+ New</b> and add photos yourself.</p>')
    rep('''  if (state.mode === "local") b.innerHTML = `<div class="banner">Saving isn't available in this view, so edits last only until you close the tab. Open the studio on claude.ai while signed in to keep your changes.</div>`;''',
        '''  if (state.mode === "local") b.innerHTML = `<div class="banner">Can't reach the saved posts, so edits last only until you close the tab. Check your connection and reload.</div>`;
  else if (window.KH && (KH.role === "poster" || KH.role === "lead")) b.innerHTML = "";
  else if (state.readOnly && cur()) b.innerHTML = `<div class="banner">You can look at this ${cur().format === "reel" ? "reel cover" : "carousel"} and download it. Changes you make here aren't saved.</div>`;''')

    # ---------- start-up: format to open, deep links, photo refresh ----------
    rep('state.assets = assets; state.downloads = downloads;',
        'state.assets = assets; state.downloads = downloads;\n  if (window.KH) state.fmt = KH.startFormat();')
    rep('if (first){ first = false; renderAll(); }',
        'if (first){ first = false;\n'
        '      const m = location.hash.match(/^#post=(.+)$/), tp = m && [state.posts.get(decodeURIComponent(m[1]))].find(p => p && (!window.KH || KH.canSee(p)));\n'
        '      if (tp){ state.fmt = tp.format || "carousel"; openPost(tp.id); } else { state.currentId = pickDefaultPost(); renderAll(); }\n'
        '    }')
    rep('window.__studio = {state, normPost, openPost, renderAll, templateFor, drawSlide};',
        '''window.__studio = {state, normPost, openPost, renderAll, templateFor, drawSlide};
// Called by js/kh.js when a photo finishes loading from the asset store.
window.__khRefresh = () => {
  const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest("#insp, .post-head");
  if (typing) scheduleRender(true); else { renderStage(); renderInspector(); }
};''')

    # ---------- cover thumbnails for Home's grid view ----------
    # Each save stores a small JPEG of the first slide (post.thumb). It is drawn by the same drawSlide,
    # only scaled down; the artwork and exports are untouched.
    rep('const STATUS = {draft:"Draft", ready:"Ready", posted:"Posted"};', 'const STATUS = {draft:"Draft", review:"For review", ready:"Ready", posted:"Posted"};')
    rep('<select id="postStatus" data-pk="status">${Object.entries(STATUS).map(',
        '<select id="postStatus" data-pk="status">${Object.entries(STATUS).filter(([k]) => !window.KH || k === p.status || KH.canSetStatus(p.status, k)).map(')
    # the content lead opens on the first post waiting for review
    rep('return (posts.find(p => p.date >= today && p.status !== "posted")',
        'return ((window.KH && KH.role === "lead" && posts.find(p => p.status === "review")) || posts.find(p => p.date >= today && p.status !== "posted")')
    rep('$("#insp").innerHTML = state.tab === "slide" ? inspSlide() : inspPost();',
        '$("#insp").innerHTML = window.KH && KH.role === "poster" ? khPosterPanel() : window.KH && KH.role === "lead" ? khReviewPanel() : state.tab === "slide" ? inspSlide() : inspPost();')
    rep('    await state.db.collection("posts").doc(pid).set(cleanPost(p));',
        '    const data = cleanPost(p); try { data.thumb = khThumb(p); } catch(e){ /* a thumbnail is optional */ }\n'
        '    await state.db.collection("posts").doc(pid).set(data);')
    rep('      if (tp){ state.fmt = tp.format || "carousel"; openPost(tp.id); } else { state.currentId = pickDefaultPost(); renderAll(); }\n    }',
        '      if (tp){ state.fmt = tp.format || "carousel"; openPost(tp.id); } else { state.currentId = pickDefaultPost(); renderAll(); }\n'
        '      setTimeout(khBackfill, 2500);\n    }')
    rep('function renderAll(){ syncAccess(); renderList();', '''function khThumb(p){
  const s = p.slides[0]; if (!s) return null;
  const c = document.createElement("canvas"); c.width = 270; c.height = Math.round(270 * postH(p) / W);
  const ctx = c.getContext("2d"); ctx.setTransform(c.width / W, 0, 0, c.height / postH(p), 0, 0);
  drawSlide(ctx, p, s, 0, p.slides.length);
  return c.toDataURL("image/jpeg", .74);
}
// Posts saved before thumbnails existed get one in the background, once their photos load.
// Only posts this person may edit, one at a time, and only the thumb field is written.
async function khBackfill(){
  if (state.mode !== "db" || !window.KH) return;
  const todo = [...state.posts.values()].filter(p => !p.thumb && p.slides.length && KH.canEdit(p)).slice(0, 80);
  for (const p of todo){
    const s = p.slides[0];
    await Promise.all([loadImg(s.img), loadImg(s.img2), loadImg(s.bgImg), loadImg(p.bgImg)]);
    if (state.dirty.has(p.id) || state.saving.has(p.id)) continue;
    try { const thumb = khThumb(p); p.thumb = thumb; await state.db.collection("posts").doc(p.id).update({thumb}); } catch(e){ /* try again next visit */ }
    await new Promise(r => setTimeout(r, 300));
  }
}
function renderAll(){ syncAccess(); renderList();''')

    # the thumbnail is derived data, so undo history ignores it
    rep('function snapStr(p){ const o = Object.assign({}, p); delete o.updatedAt; return JSON.stringify(o); }',
        'function snapStr(p){ const o = Object.assign({}, p); delete o.updatedAt; delete o.thumb; return JSON.stringify(o); }')

    # who may delete photos comes from the site's roles (content leads, designers, admins)
    rep('(!window.KH || ["admin", "designer"].includes(KH.role))', '(!window.KH || KH.canDesign)')

    # ---------- Instagram preview (js/igpreview.js) ----------
    rep('      <span class="grow"></span>\n      ${reel ?',
        '      <span class="grow"></span>\n'
        '      <button class="btn" id="igPreviewBtn" type="button" title="See the post the way it will look on Instagram">'
        '<svg class="kh-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">'
        '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg> Preview</button>\n      ${reel ?')
    rep('<link rel="stylesheet" href="/css/studio-theme.css">\n', '<link rel="stylesheet" href="/css/studio-theme.css">\n<link rel="stylesheet" href="/css/igpreview.css">\n')

    # icon-only buttons on narrow screens keep a tooltip
    rep('<button class="btn" id="dlSlide">Download this slide</button>', '<button class="btn" id="dlSlide" title="Download this slide (PNG)">Download this slide</button>')

    # ---------- comments (js/comments.js draws the panel and the count badges) ----------
    rep('<button role="tab" id="tabPost" aria-selected="false">Post</button>',
        '<button role="tab" id="tabPost" aria-selected="false">Post</button>\n'
        '        <button role="tab" id="tabComments" aria-selected="false">Comments <span class="n" id="cmtCount" hidden></span></button>')
    rep('      <div class="insp-body" id="insp"></div>',
        '      <div class="insp-body" id="insp"></div>\n      <div class="kh-comments" id="khComments" hidden></div>')
    rep('  list.innerHTML = html;\n', '  list.innerHTML = html;\n  if (window.__khOnList) window.__khOnList();\n')
    rep('  fitCols(); // saved panel widths still leave the slide its minimum',
        '  fitCols(); // saved panel widths still leave the slide its minimum\n  if (window.__khOnStage) window.__khOnStage();\n  if (window.KH && (KH.role === "poster" || KH.role === "lead")) khSimpleStage();')
    rep('window.__khRefresh = () => {', 'window.__studio.goSlide = goSlide;\nwindow.__khRefresh = () => {')

    # ---------- engine for the simple feed (js/feed.js) ----------
    # The feed loads this page in a hidden frame (?engine=1) and asks it to draw posts, so what the
    # content lead approves and the poster downloads is exactly what this studio exports.
    rep('      setTimeout(khBackfill, 2500);\n    }',
        '      setTimeout(khBackfill, 2500); khEngineReady();\n    }')
    rep('  if (state.mode !== "db" || !window.KH) return;\n  const todo',
        '  if (state.mode !== "db" || !window.KH || KH.engine) return;\n  const todo')
    rep('window.__studio.goSlide = goSlide;\n', '''window.__studio.goSlide = goSlide;
let khEngineReady; const khEngineLoaded = new Promise(r => { khEngineReady = r; });
const khImgDone = im => im.complete ? Promise.resolve() : new Promise(r => { im.addEventListener("load", r, {once:true}); im.addEventListener("error", r, {once:true}); });
const khPost = (id, data) => normPost(id, JSON.parse(JSON.stringify(data)));
async function khSlide(p, i, type, q){
  const s = p.slides[i]; if (!s) throw new Error("no slide");
  await Promise.all([khImgDone(LOGO), khImgDone(MARK)]);
  if (!type || type === "image/png") return renderToBlob(p, s, i);
  await fontsReady; await Promise.all([loadImg(s.img), loadImg(s.img2), loadImg(s.bgImg), loadImg(p.bgImg), ...(s.ov || []).map(o => loadImg(o.img))]);
  const c = document.createElement("canvas"); c.width = W; c.height = postH(p);
  drawSlide(c.getContext("2d"), p, s, i, p.slides.length);
  return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("render")), type, q));
}
window.__studio.engine = {
  loaded: khEngineLoaded,
  info(id, data){ const p = khPost(id, data); return {pillar: themeOf(p).pillar || "", name: fileBase(p), slides: p.slides.length, ratio: W / postH(p)}; },
  // one slide as a Blob: PNG by default (the download), or e.g. "image/jpeg" for on-screen previews
  slide: (id, data, i, type, q) => khSlide(khPost(id, data), i, type, q),
  // every slide as PNG files, named like the studio's ZIP
  async files(id, data, onStep){
    const p = khPost(id, data), out = [], base = fileBase(p);
    for (let i = 0; i < p.slides.length; i++){
      if (onStep) onStep(i + 1, p.slides.length);
      const s = p.slides[i];
      out.push({name: single(p) ? `${base}.png` : `${base}_${pad2(i+1)}_${slug(s.tag || s.headline)}.png`, blob: await khSlide(p, i)});
    }
    return out;
  },
  // the same ZIP the studio's Download ZIP button builds: every slide plus caption.txt
  async zip(id, data, onStep){
    if (typeof JSZip === "undefined") throw new Error("zip");
    const p = khPost(id, data), zip = new JSZip();
    for (let i = 0; i < p.slides.length; i++){
      if (onStep) onStep(i + 1, p.slides.length);
      const s = p.slides[i];
      zip.file(`${pad2(i+1)}_${slug(s.tag || s.headline)}.png`, await khSlide(p, i));
    }
    if (p.caption) zip.file("caption.txt", p.caption);
    return {name: fileBase(p) + ".zip", blob: await zip.generateAsync({type:"blob"})};
  }
};
''')

    # ---------- export quality ----------
    # Downloads render at 2x (2160 px wide), like Canva/Figma "2x": text, logos and shapes stay sharp
    # and good photos keep their detail. The on-screen preview stays 1080 px.
    rep('loadImg(p.bgImg), ...(s.ov || []).map(o => loadImg(o.img))]);\n  const c = document.createElement("canvas"); c.width = W; c.height = postH(p);\n  drawSlide(c.getContext("2d"), p, s, i, p.slides.length);\n  return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("render")), "image/png"));',
        'loadImg(p.bgImg), ...(s.ov || []).map(o => loadImg(o.img))]);\n  const c = document.createElement("canvas"); c.width = W * KH_EXPORT_SCALE; c.height = postH(p) * KH_EXPORT_SCALE;\n'
        '  const cx = c.getContext("2d"); cx.scale(KH_EXPORT_SCALE, KH_EXPORT_SCALE);\n  drawSlide(cx, p, s, i, p.slides.length);\n  return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("render")), "image/png"));')
    # the black-and-white fallback (browsers without canvas filters) reads pixels in device space
    rep('      const X = Math.round(x), Y = Math.round(y), d = ctx.getImageData(X, Y, Math.round(w), Math.round(h)), a = d.data;',
        '      const m = ctx.getTransform(), X = Math.round(m.a * x + m.e), Y = Math.round(m.d * y + m.f), d = ctx.getImageData(X, Y, Math.round(w * m.a), Math.round(h * m.d)), a = d.data;')
    # low-resolution warning: how far each photo is stretched to fill its frame on the 1080 px preview
    rep('  const sc = Math.max(w/iw, h/ih) * (zoom || 1);',
        '  const sc = Math.max(w/iw, h/ih) * (zoom || 1);\n  if (ctx.canvas && ctx.canvas.id === "preview") khNoteRes(iw, ih, sc);')
    rep('  TXT = null; if (ctx.canvas && ctx.canvas.id === "preview") HIT = {};',
        '  TXT = null; if (ctx.canvas && ctx.canvas.id === "preview"){ HIT = {}; KH_RES = null; }')
    rep('  if (state.guides) drawGuides(ctx, p);\n  c.classList.toggle("draggable", hasPhoto(s));',
        '  if (state.guides) drawGuides(ctx, p);\n  khShowRes();\n  c.classList.toggle("draggable", hasPhoto(s));')
    rep('<div class="under"><div class="viewer-foot">', '<div class="under"><div class="kh-lowres" id="khLowres" role="status" hidden></div><div class="viewer-foot">')
    rep('function renderPreview(){', """const KH_EXPORT_SCALE = 2;
let KH_RES = null;
function khNoteRes(iw, ih, sc){ if (!KH_RES || sc > KH_RES.sc) KH_RES = {sc, iw, ih}; }
// A photo stretched past its real pixels looks soft on Instagram; say so while there's time to swap it.
function khShowRes(){
  const el = document.getElementById("khLowres"); if (!el) return;
  const r = KH_RES, bad = r && r.sc > 1.25; el.hidden = !bad; if (!bad) return;
  const need = Math.ceil(r.iw * r.sc / 100) * 100;
  el.innerHTML = `<b>${r.sc > 2 ? "Blurry photo" : "Soft photo"}:</b> it’s ${r.iw}×${r.ih} px, stretched ${r.sc.toFixed(1)}× to fill this frame, so it will look pixelated. Use a photo at least ${need} px wide (a full-size image or video frame, not a screenshot of a thumbnail).`;
}
function renderPreview(){""")

    out_dir = os.path.join(ROOT, "public", key)
    os.makedirs(out_dir, exist_ok=True)
    open(os.path.join(out_dir, "index.html"), "w", encoding="utf8").write(src)
    print(f"ported {key}: {len(src):,} bytes")


if __name__ == "__main__":
    for k in (sys.argv[1:] or STUDIOS):
        port(k)
