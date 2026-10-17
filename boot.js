"use strict";
(async()=>{
  const response=await fetch("release.json",{cache:"no-store"});
  if(!response.ok)throw Error("Release index could not load (HTTP "+response.status+").");
  const release=await response.json();
  if(release.schema!==1 || !/^[a-f0-9]{64}$/.test(release.id))throw Error("Invalid release index");
  window.euroRelease=release;
  const resource=name=>{const f=release.files.find(f=>f.url===name);if(!f||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error("Missing release file: "+name);return f;};
  const versioned=f=>f.url+"?sha256="+f.sha256;
  const integrity=f=>"sha256-"+btoa(String.fromCharCode(...f.sha256.match(/../g).map(b=>parseInt(b,16))));
  const css=resource("browser.css"),link=document.createElement("link");link.rel="stylesheet";link.href=versioned(css);link.integrity=integrity(css);document.head.append(link);
  for(const name of ["files.js","euro96.js","media.js","saves.js","browser.js"]){
    const f=resource(name);
    await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=versioned(f);s.integrity=integrity(f);s.onload=resolve;s.onerror=()=>reject(Error("Could not load "+name+". Reload to check for updates."));document.head.append(s);});
  }
})().catch(error=>{document.getElementById("status").textContent=error.message;console.error(error);});
