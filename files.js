"use strict";
// Content-addressed assets; storage failures must never prevent play.
window.euroFiles = (() => {
  const cacheName = "euro96-verified-assets-v1", pending = new Map();
  const protectedKeys = new Set();
  let unavailable = false, warned = false, maintenance = Promise.resolve();
  const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2,"0")).join("");
  const url = file => {const u=new URL(file.url,location.href);u.searchParams.set("sha256",file.sha256);return u.href;};
  function warning() {if(!warned){console.info("Asset cache unavailable; verified downloads will still work.");warned=true;}}
  async function cache() {try {return unavailable?null:await caches.open(cacheName);}catch{unavailable=true;warning();return null;}}
  async function valid(bytes,file) {return bytes.length===file.bytes && await hash(bytes)===file.sha256;}
  async function trim(c) {
    const entries=await Promise.all((await c.keys()).map(async key=>{const r=await c.match(key);return {key,bytes:Number(r.headers.get("Content-Length"))||0,age:Number(r.headers.get("X-Euro-Cached"))||0};}));
    let bytes=entries.reduce((n,e)=>n+e.bytes,0);
    for(const e of entries.sort((a,b)=>a.age-b.age)) {
      if(bytes<=256*1048576)break;
      if(!protectedKeys.has(e.key.url)){await c.delete(e.key);bytes-=e.bytes;}
    }
  }
  async function fetchFile(file) {
    if(!/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes<0)throw Error("Invalid asset manifest");
    const key=url(file), c=await cache();
    if(c)try {
      const hit=await c.match(key);
      if(hit){const bytes=new Uint8Array(await hit.arrayBuffer());if(await valid(bytes,file))return bytes;await c.delete(key);}
    } catch {warning();}
    const response=await fetch(key,{cache:"no-store"});
    if(!response.ok)throw Error((file.path||file.url)+" failed to load (HTTP "+response.status+")");
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(!await valid(bytes,file))throw Error("Asset checksum mismatch: "+(file.path||file.url)+". Check for an update and reload.");
    if(c)try {
      await c.put(key,new Response(bytes,{headers:{"Content-Length":String(bytes.length),"X-Euro-Cached":String(Date.now())}}));
      maintenance=maintenance.then(()=>trim(c)).catch(warning);
    } catch {warning();}
    return bytes;
  }
  function load(file) {
    const key=url(file);
    if(!pending.has(key))pending.set(key,fetchFile(file).finally(()=>pending.delete(key)));
    return pending.get(key);
  }
  return {load,hash,url,protect:files=>files.forEach(f=>protectedKeys.add(url(f)))};
})();
