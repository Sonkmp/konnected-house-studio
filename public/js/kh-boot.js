// Loaded before the studio script. The studio asks window.claude.use("db" | "assets" | ...)
// for its storage, the same way it does on claude.ai; here those calls wait for js/studio.js
// to sign in and hand back the Firebase-backed versions.
(function () {
  let resolve;
  const ready = new Promise(r => { resolve = r; });
  window.__khResolve = resolve;
  window.claude = { use: name => ready.then(api => api.use(name)) };
})();
