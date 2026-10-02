const BUILD='4fdf548a9674';
const CACHE=`ftl-shell-${BUILD}`;
const FILES=[{"url":"content/core-1.1.0.json","sha256":"9583743985bdb08b84ee69aa24925d1d7c12020a73b4107b5a64c3f04f552742"},{"url":"index.html","sha256":"46286d1e2237b89de3e83a0b43766998f1bdf70261fda04e358a10ba84ecf9ec"},{"url":"styles.css","sha256":"66155d0ed496418e0d625af9e9288b5d648bf960a94f7c485dce98f076446320"},{"url":"app.js","sha256":"26486030d3e3020aeda43a10613059a421b52d98b0c748f044c7971fd7c77e16"},{"url":"domain.js","sha256":"48f0f724c7d616f40a5ff83faaa59fc282473d271dd569c572690b3da4f0b081"},{"url":"storage.js","sha256":"2fbdfa88f95d93e72f73cb8cc8361ba1b6a884e8f2d45a554b34e7d0b58e7dba"},{"url":"zip.js","sha256":"f4353a760f557994ea9bab90e13b74e17832d26531d2a730ee5448b58b5d0499"},{"url":"review.js","sha256":"cd2b791ba9f0373b620c25ff0d8bdc857ed81070421f845d7d39bcd6019827aa"},{"url":"manifest.webmanifest","sha256":"c660cef97cbcf8cf04890f835ad5999c877aadbe00475b32b2b8aa42498b35c4"},{"url":"icons/icon.svg","sha256":"9103324b74c826baaa023e3b91d87ac9fc2d8cf5f4352c1aeda9be5f2d787488"},{"url":"icons/icon-192.png","sha256":"448743549aaf7b9d462df6238a7e385a4b1dac85f617c540c0ddcb9e03f59305"},{"url":"icons/icon-512.png","sha256":"4503f4597e1deb72e6e351ee1d26189f9205a52693be19d0b684a42455be97db"},{"url":"icons/apple-touch-icon.png","sha256":"fd67474360c641723220ff10f033bb385c464666157e14eaa772359c121e6125"}];
const ROOT=new URL('./',self.location.href);
const urls=FILES.map(f=>new URL(f.url,ROOT).href);
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
self.addEventListener('install',e=>e.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 try{for(const f of FILES){const url=new URL(f.url,ROOT);const r=await fetch(url,{cache:'no-store',credentials:'same-origin'});if(!r.ok||r.redirected)throw Error('App download/authentication failed');const bytes=await r.clone().arrayBuffer();if(await sha(bytes)!==f.sha256)throw Error('App integrity check failed');await cache.put(url,r);}}
 catch(error){await caches.delete(CACHE);throw error;}
})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 // Old app shell may remain open; keep one previous cache until the next activation.
 const names=(await caches.keys()).filter(k=>k.startsWith('ftl-shell-')&&k!==CACHE);
 for(const name of names.slice(0,-1))await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);
 if(u.origin!==ROOT.origin||!u.pathname.startsWith(ROOT.pathname))return;
 if(e.request.mode==='navigate'){
   // The installed app runs from a verified local shell; authentication gates downloads.
   e.respondWith((async()=>{const c=await caches.open(CACHE);return await c.match(new URL('index.html',ROOT))||fetch(e.request);})());return;
 }
 if(urls.includes(u.href))e.respondWith((async()=>{const c=await caches.open(CACHE);return await c.match(u.href)||fetch(e.request);})());
 // No caching of login redirects, API responses, exports, manifests or arbitrary files.
});
self.addEventListener('message',e=>{
 if(e.data?.type==='ACTIVATE')self.skipWaiting();
 if(e.data?.type==='CHECK_READY')e.waitUntil((async()=>{const c=await caches.open(CACHE);let ready=true;for(const url of urls)if(!await c.match(url)){ready=false;break;}e.ports[0]?.postMessage({ready,build:BUILD});})());
});
