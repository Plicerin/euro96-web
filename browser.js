"use strict";
(() => {
  const el = id => document.getElementById(id);
  const canvas = el("canvas"), status = el("status"), storage = el("storage");
  const log = message => {
    el("log").textContent = (el("log").textContent + String(message) + "\n").slice(-16000);
    console.log(message);
  };
  let game, started = false, dirty = 0, saved = 0, syncing = false, timer, ready = false, saveBusy = false, incoming;
  const transfer=el("transfer-status"),dialog=el("import-review");
  function buttons() {
    el("start").disabled=el("watch").disabled=!ready||started||saveBusy;
    el("export-save").disabled=!ready||saveBusy;
    el("import-save").disabled=!ready||started||saveBusy;
  }
  // Firefox restores dynamic button states on reload. Reset them before the
  // module becomes visible; saves and assets must finish loading before play.
  buttons();
  const backupName=()=>"Euro96-saves-"+new Date().toISOString().replace(/[:.]/g,"-")+".json";
  el("export-save").onclick=async()=>{
    saveBusy=true;buttons();
    try{const files=euroSaves.snapshot(game.FS);if(!files.length)throw Error("There are no saved championships, preferences or replays to export yet.");euroSaves.download(await euroSaves.pack(files),backupName());transfer.textContent="Save backup downloaded. Keep it somewhere safe.";}
    catch(error){transfer.textContent=error.message;}finally{saveBusy=false;buttons();}
  };
  el("import-save").onclick=()=>el("save-file").click();
  el("save-file").onchange=async event=>{
    const file=event.target.files[0];event.target.value="";if(!file||started)return;
    saveBusy=true;buttons();
    try {
      if(file.size>90*1048576)throw Error("Backup is too large (maximum 90 MiB).");
      incoming=await euroSaves.unpack(await file.text());
      el("import-summary").textContent=incoming.length+" files · "+Math.ceil(incoming.reduce((n,f)=>n+f.data.length,0)/1024)+" KiB";
      el("import-files").textContent=incoming.map(f=>f.path).join("\n");
      dialog.showModal();
    } catch(error){transfer.textContent="Import rejected: "+error.message;saveBusy=false;buttons();}
  };
  function cancelImport(){incoming=null;dialog.close();saveBusy=false;buttons();}
  el("cancel-import").onclick=cancelImport;
  dialog.addEventListener("cancel",event=>{event.preventDefault();if(!el("confirm-import").disabled)cancelImport();});
  el("confirm-import").onclick=async()=>{
    el("confirm-import").disabled=el("cancel-import").disabled=true;
    try {
      const previous=euroSaves.snapshot(game.FS);
      if(previous.length)euroSaves.download(await euroSaves.pack(previous),backupName());
      await euroSaves.restore(game.FS,incoming);
      transfer.textContent="Backup imported and saved to this browser. Choose Play, then Resume to continue a championship.";
      storage.textContent="Saved to this browser";
    }catch(error){transfer.textContent=error.message;if(error.storageUnavailable)ready=false;}
    finally{el("confirm-import").disabled=el("cancel-import").disabled=false;cancelImport();}
  };
  el("check-update").onclick=async()=>{
    el("check-update").disabled=true;
    try{const r=await fetch("release.json",{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);const next=await r.json();if(next.schema!==1||!/^[a-f0-9]{64}$/.test(next.id))throw Error("Invalid release index");const changed=next.id!==euroRelease.id;el("update-status").textContent=changed?"An update is available. Finish your match and export a backup, then reload this page.":"You have the latest build on this server.";}
    catch(error){el("update-status").textContent="Could not check for updates. "+error.message;}finally{el("check-update").disabled=false;}
  };
  function fail(error) {
    log(error?.stack || error);
    status.textContent = "The game could not start. " + (error?.message || error);
    el("launch").hidden = false;
    el("start").disabled = el("watch").disabled = true;
  }
  function syncSaves() {
    clearTimeout(timer);
    if (!game || syncing || dirty === saved) return;
    syncing = true;
    const revision = dirty;
    storage.textContent = "Saving to this browser…";
    game.FS.syncfs(false, error => {
      syncing = false;
      if (error) {
        storage.textContent = "Browser save failed — keep this tab open and retry.";
        el("retry-save").hidden = false;
        log("IndexedDB save failed: " + error);
        return;
      }
      saved = revision;
      el("retry-save").hidden = true;
      storage.textContent = "Saved to this browser";
      if (dirty !== saved) syncSaves();
    });
  }
  function queueSave() {
    ++dirty;
    storage.textContent = "Save pending…";
    clearTimeout(timer);
    timer = setTimeout(syncSaves, 100);
  }
  el("retry-save").onclick = syncSaves;
  window.addEventListener("beforeunload", event => {
    if (dirty !== saved) { event.preventDefault(); event.returnValue = ""; }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) syncSaves();
  });
  canvas.addEventListener("contextmenu", event => event.preventDefault());
  canvas.addEventListener("keydown", event => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab"].includes(event.code)) event.preventDefault();
  });
  el("fullscreen").onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el("stage").requestFullscreen();
      canvas.focus();
    } catch (error) { log("Fullscreen unavailable: " + error.message); }
  };
  function setPresentation() {
    const height = Number(el("presentation").value);
    document.documentElement.style.setProperty("--game-aspect", height ? "16 / 9" : "1200 / 830");
    document.documentElement.style.setProperty("--game-ratio", height ? String(16 / 9) : String(1200 / 830));
    if (game) game._set_presentation(height);
    el("textures").disabled = !height;
    setTextures();
    if (started) canvas.focus();
  }
  el("presentation").onchange = setPresentation;
  function setTextures() {
    if (game) game._set_enhanced_textures(el("textures").value === "enhanced" && el("presentation").value !== "0" ? 1 : 0);
  }
  el("textures").onchange = () => { setTextures(); if (started) canvas.focus(); };
  setPresentation();
  // SDL listens for window resize; a CSS aspect change alone does not emit it.
  // This also covers entering/exiting fullscreen and responsive layout changes.
  new ResizeObserver(() => window.dispatchEvent(new Event("resize"))).observe(canvas);
  function start(watch) {
    if (!game || !ready || started || saveBusy) return;
    setPresentation();
    started = true;
    buttons();
    el("import-note").textContent="To import a backup, finish your game and reload this page first.";
    document.body.classList.add("playing");
    el("launch").hidden = true;
    el("fullscreen").disabled = false;
    canvas.focus();
    // main() is invoked directly inside this click, enabling browser audio.
    try { game.callMain(["--data", "/data", "--audio-data", "/audio", watch ? "--cpu-teams" : "--front-end"]); }
    catch (error) { fail(error); }
  }
  el("start").onclick = () => start(false);
  el("watch").onclick = () => start(true);
  async function prepare() {
    if (typeof createEuro96 !== "function") throw new Error("The browser build is missing. Run tools/build_web.ps1 first.");
    const runtime=name=>{const f=euroRelease.files.find(f=>f.url===name);if(!f)throw Error("Release file missing: "+name);return f;};
    euroFiles.protect([runtime("euro96.wasm"),runtime("assets.json")]);
    const manifest=JSON.parse(new TextDecoder().decode(await euroFiles.load(runtime("assets.json"))));
    euroFiles.protect(manifest.files);
    status.textContent="Loading game engine…";
    const wasmBinary=await euroFiles.load(runtime("euro96.wasm"));
    game = await createEuro96({canvas, wasmBinary, noInitialRun: true, print: log, printErr: log,
      queueSave, onAbort: reason => fail(new Error(String(reason))),
      onExit: code => {
        syncSaves();
        el("launch").hidden = false;
        status.textContent = code ? "The game stopped with an error. See the technical log." : "Game closed. Reload this page to play again.";
        el("start").disabled = el("watch").disabled = true;
      }});
    // Exposed only by this proof-of-concept shell for browser QA and diagnostics.
    window.euro96 = game;
    game.FS.mkdirTree("/saves");
    game.FS.mount(game.FS.filesystems.IDBFS, {}, "/saves");
    await new Promise((resolve, reject) => game.FS.syncfs(true, error => error ? reject(new Error("Browser storage is unavailable: " + error)) : resolve()));
    storage.textContent = "Browser saves ready";
    const media = createEuroMedia(game, manifest.optional || [], el("media-status"), el("retry-media"), log);
    game.requestMedia = media.request;
    game.hasMedia = media.has;
    const total = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
    let completed = 0, index = 0;
    // Limit concurrent temporary buffers; originals are mounted in the Wasm FS.
    await Promise.all(Array.from({length: 3}, async () => {
      while (index < manifest.files.length) {
        const file = manifest.files[index++];
        const bytes = await euroFiles.load(file);
        game.FS.mkdirTree(file.path.slice(0, file.path.lastIndexOf("/")));
        game.FS.writeFile(file.path, bytes, {canOwn: true});
        completed += bytes.length;
        el("progress").value = completed / total;
        status.textContent = `Loading game assets · ${Math.round(completed / 1048576)} / ${Math.round(total / 1048576)} MiB`;
      }
    }));
    status.textContent = "Ready. Choose Play to enable sound and open the original menus.";
    ready=true;buttons();
    log("Browser assets verified: " + manifest.files.length + " files, " + total + " bytes.");
  }
  prepare().catch(fail);
})();
