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
        '<link rel="stylesheet" href="/css/studio-theme.css">\n</head><body>\n<div class="app">')
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
        'return [...state.posts.values()].filter(p => (p.format || "carousel") === state.fmt && matchQ(p)).sort(')
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
  return [p.title, p.date, fmtDate(p.date), themeOf(p).pillar, p.caption].some(has) || p.slides.some(s => [s.headline, s.sub, s.chip && s.chip.name].some(has));
}
// The toggle shows how many posts each format has.
function fmtCounts(){
  const n = f => [...state.posts.values()].filter(p => (p.format || "carousel") === f).length;
  document.querySelectorAll("#fmtSeg [data-fmt]").forEach(b => { b.innerHTML = `<i class="ic" aria-hidden="true"></i><span class="l">${b.dataset.label} <span class="n">${n(b.dataset.fmt)}</span></span>`; });
}
// Role rules live in js/kh.js; the page only reflects them (Firestore rules enforce them).
function syncAccess(){
  const p = cur();
  state.readOnly = !!(window.KH && p && !KH.canEdit(p));
  document.querySelectorAll("#fmtSeg [data-fmt]").forEach(b => { const on = b.dataset.fmt === state.fmt; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
  const nb = $("#newPostBtn"); if (nb){ nb.hidden = !!(window.KH && !KH.canCreate(state.fmt)); nb.textContent = "New " + ({carousel:"carousel", reel:"reel cover", quote:"quote card"}[state.fmt] || "post"); }
}
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
  else if (state.readOnly && cur()) b.innerHTML = `<div class="banner">You can look at this ${cur().format === "reel" ? "reel cover" : "carousel"} and download it. Changes you make here aren't saved.</div>`;''')

    # ---------- start-up: format to open, deep links, photo refresh ----------
    rep('state.assets = assets; state.downloads = downloads;',
        'state.assets = assets; state.downloads = downloads;\n  if (window.KH) state.fmt = KH.startFormat();')
    rep('if (first){ first = false; renderAll(); }',
        'if (first){ first = false;\n'
        '      const m = location.hash.match(/^#post=(.+)$/), tp = m && state.posts.get(decodeURIComponent(m[1]));\n'
        '      if (tp){ state.fmt = tp.format || "carousel"; openPost(tp.id); } else { state.currentId = pickDefaultPost(); renderAll(); }\n'
        '    }')
    rep('window.__studio = {state, normPost, openPost, renderAll, templateFor, drawSlide};',
        '''window.__studio = {state, normPost, openPost, renderAll, templateFor, drawSlide};
// Called by js/kh.js when a photo finishes loading from the asset store.
window.__khRefresh = () => {
  const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest("#insp, .post-head");
  if (typing) scheduleRender(true); else { renderStage(); renderInspector(); }
};''')

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
        '  fitCols(); // saved panel widths still leave the slide its minimum\n  if (window.__khOnStage) window.__khOnStage();')
    rep('window.__khRefresh = () => {', 'window.__studio.goSlide = goSlide;\nwindow.__khRefresh = () => {')

    out_dir = os.path.join(ROOT, "public", key)
    os.makedirs(out_dir, exist_ok=True)
    open(os.path.join(out_dir, "index.html"), "w", encoding="utf8").write(src)
    print(f"ported {key}: {len(src):,} bytes")


if __name__ == "__main__":
    for k in (sys.argv[1:] or STUDIOS):
        port(k)
