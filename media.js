"use strict";
// Optional clips never participate in startup readiness or save persistence.
window.createEuroMedia = (game, files, status, retry, log) => {
  const catalog = new Map(files.map(file => [file.key, file]));
  const states = new Map(), queue = [];
  let active = 0, resident = 0, clock = 0;
  const budget = 64 * 1048576;
  function report() {
    const failed = [...states.values()].some(s => s.state === -1);
    retry.hidden = !failed;
    status.textContent = active || queue.length ? "Loading optional media…" : failed ? "Some media could not load. You can keep playing or retry." : "";
  }
  function evict(current) {
    const old = [...states].filter(([key, s]) => key !== current && s.state === 1).sort((a, b) => a[1].used - b[1].used);
    for (const [key, s] of old) {
      if (resident <= budget) break;
      game.FS.unlink(catalog.get(key).path); resident -= catalog.get(key).bytes;
      states.delete(key);
    }
  }
  async function download(key) {
    const file = catalog.get(key), state = states.get(key);
    try {
      let bytes;
      if(window.euroFiles)bytes=await euroFiles.load(file);
      else {const response = await fetch(file.url);
      if (!response.ok) throw new Error("HTTP " + response.status);
      bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== file.bytes) throw new Error("Incomplete download");
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
      if (hash !== file.sha256) throw new Error("Checksum mismatch");}
      game.FS.mkdirTree(file.path.slice(0, file.path.lastIndexOf("/")));
      game.FS.writeFile(file.path, bytes, {canOwn: true});
      state.state = 1; state.used = ++clock; resident += bytes.length;
      evict(key); log(file.label + " ready: " + key);
    } catch (error) {
      state.state = -1; log(file.label + " download failed: " + key + ": " + error.message);
    } finally { --active; pump(); }
  }
  function pump() {
    while (active < 2 && queue.length) { ++active; download(queue.shift()); }
    report();
  }
  function request(key) {
    if (!catalog.has(key)) return -2;
    const found = states.get(key);
    if (found) { found.used = ++clock; return found.state; }
    states.set(key, {state: 0, used: ++clock}); queue.push(key); pump(); return 0;
  }
  retry.onclick = () => {
    for (const [key, s] of states) if (s.state === -1) { states.delete(key); request(key); }
    report();
  };
  return {request, has: key => catalog.has(key)};
};
