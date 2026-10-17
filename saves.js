"use strict";
window.euroSaves = (() => {
  const limit=64*1048576, fileLimit=1048576;
  const allowed=p=>/^(tournament\.(sav|prefs)(\.bak)?|replays\/[A-Za-z0-9_-]{1,120}\.a96r)$/.test(p);
  function snapshot(FS) {
    const out=[];
    function visit(dir) {for(const name of FS.readdir(dir)){if(name==="."||name==="..")continue;const path=dir+"/"+name,stat=FS.lstat(path);if(FS.isDir(stat.mode)){if(path==="/saves/replays")visit(path);}else if(FS.isFile(stat.mode)&&allowed(path.slice(7)))out.push({path:path.slice(7),data:FS.readFile(path).slice()});}}
    visit("/saves");return out.sort((a,b)=>a.path.localeCompare(b.path));
  }
  function encode(bytes) {let s="";for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
  async function pack(entries) {
    if(entries.length>1004 || entries.reduce((n,f)=>n+f.data.length,0)>limit)throw Error("Save backup exceeds the 64 MiB limit.");
    const files=[];
    for(const f of entries){if(!allowed(f.path)||f.data.length>fileLimit)throw Error("Unsupported save file: "+f.path);files.push({path:f.path,bytes:f.data.length,sha256:await euroFiles.hash(f.data),data:encode(f.data)});}
    return JSON.stringify({format:"euro96-save-backup",schema:1,created:new Date().toISOString(),files});
  }
  async function unpack(text) {
    if(text.length>90*1048576)throw Error("Backup is too large.");
    const archive=JSON.parse(text);
    if(archive.format!=="euro96-save-backup"||archive.schema!==1||!Array.isArray(archive.files)||!archive.files.length||archive.files.length>1004)throw Error("This is not a supported Euro 96 save backup.");
    const seen=new Set(),entries=[];let total=0;
    for(const f of archive.files){
      if(typeof f.path!=="string"||!allowed(f.path)||seen.has(f.path)||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>fileLimit||typeof f.data!=="string"||f.data.length!==4*Math.ceil(f.bytes/3)||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error("Invalid save entry.");
      seen.add(f.path);total+=f.bytes;if(total>limit)throw Error("Backup exceeds 64 MiB.");
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
    const old=snapshot(FS);
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
