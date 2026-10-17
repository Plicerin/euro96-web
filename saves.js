"use strict";
window.euroSaves = (() => {
  const limit=64*1048576, fileLimit=1048576;
  const allowed=p=>typeof p==="string" && /^(tournament\.(sav|prefs)(\.bak)?|replays\/[A-Za-z0-9_-]{1,120}\.a96r)$/.test(p);
  function validate(files) {
    if(!Array.isArray(files)||files.length>1004)throw Error("Invalid save file list.");
    const seen=new Set();let total=0,replays=0;
    for(const f of files){
      if(!f||!allowed(f.path)||seen.has(f.path)||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>fileLimit)throw Error("Invalid save entry.");
      seen.add(f.path);total+=f.bytes;if(f.path.startsWith("replays/"))++replays;
    }
    if(replays>1000)throw Error("Replay library exceeds 1000 clips.");
    if(total>limit)throw Error("Save backup exceeds the 64 MiB limit.");
  }
  const describe=entries=>entries.map(f=>({path:f.path,bytes:f.data.length}));
  function snapshot(FS) {
    const files=[];
    function visit(dir) {for(const name of FS.readdir(dir)){if(name==="."||name==="..")continue;const path=dir+"/"+name,stat=FS.lstat(path);if(FS.isDir(stat.mode)){if(path==="/saves/replays")visit(path);}else if(FS.isFile(stat.mode)&&allowed(path.slice(7)))files.push({path:path.slice(7),bytes:stat.size});}}
    visit("/saves");validate(files); // Bound allocations before reading file bodies.
    const out=files.map(f=>({path:f.path,data:FS.readFile("/saves/"+f.path).slice()}));
    validate(describe(out));return out.sort((a,b)=>a.path.localeCompare(b.path));
  }
  function encode(bytes) {let s="";for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
  async function pack(entries) {
    validate(describe(entries));
    const files=[];
    for(const f of entries){if(!allowed(f.path)||f.data.length>fileLimit)throw Error("Unsupported save file: "+f.path);files.push({path:f.path,bytes:f.data.length,sha256:await euroFiles.hash(f.data),data:encode(f.data)});}
    return JSON.stringify({format:"euro96-save-backup",schema:1,created:new Date().toISOString(),files});
  }
  async function unpack(text) {
    if(text.length>90*1048576)throw Error("Backup is too large.");
    const archive=JSON.parse(text);
    if(!archive||archive.format!=="euro96-save-backup"||archive.schema!==1||!Array.isArray(archive.files)||!archive.files.length)throw Error("This is not a supported Euro 96 save backup.");
    validate(archive.files);
    const entries=[];
    for(const f of archive.files){
      if(typeof f.data!=="string"||f.data.length!==4*Math.ceil(f.bytes/3)||typeof f.sha256!=="string"||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error("Invalid save entry.");
      const data=Uint8Array.from(atob(f.data),c=>c.charCodeAt(0));
      if(data.length!==f.bytes||await euroFiles.hash(data)!==f.sha256)throw Error("Damaged save file: "+f.path);
      entries.push({path:f.path,data});
    }
    return entries;
  }
  const sync=FS=>new Promise((resolve,reject)=>FS.syncfs(false,error=>error?reject(error):resolve()));
  function write(FS,entries) {for(const f of entries){const path="/saves/"+f.path;FS.mkdirTree(path.slice(0,path.lastIndexOf("/")));FS.writeFile(path,f.data);}}
  async function restore(FS,entries) {
    // Called only before main(), when native save writers are inactive.
    validate(describe(entries));
    const old=snapshot(FS);
    // Unrelated replays are retained. Check the resulting library as well as
    // the archive, otherwise repeated valid imports can exceed native limits.
    const merged=new Map(describe(old).map(f=>[f.path,f]));
    for(const f of describe(entries))merged.set(f.path,f);
    validate([...merged.values()]);
    try {write(FS,entries);await sync(FS);}
    catch(error){
      for(const f of entries)try{FS.unlink("/saves/"+f.path);}catch{}
      write(FS,old);
      try{await sync(FS);}catch{const failure=Error("Import failed and browser storage is unavailable. Keep your downloaded backup and reload this page before playing.");failure.storageUnavailable=true;throw failure;}
      throw Error("Import failed; your previous saves were restored. "+error.message);
    }
  }
  function download(text,name) {const url=URL.createObjectURL(new Blob([text],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  return {snapshot,pack,unpack,restore,download};
})();
