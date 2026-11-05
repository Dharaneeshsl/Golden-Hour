// Cache only the build-time public allowlist. Never cache API, navigation responses or QR credentials.
self.addEventListener("install",event=>event.waitUntil(caches.open(SHELL_VERSION).then(cache=>cache.addAll(SHELL_ASSETS))));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("goldenhour-shell-")&&key!==SHELL_VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=="GET" || url.origin!==self.location.origin || url.pathname.startsWith("/api/") || url.search)return;
  if(event.request.mode==="navigate"){
    event.respondWith(fetch(event.request).catch(()=>caches.open(SHELL_VERSION).then(cache=>cache.match("/index.html"))));return;
  }
  if(SHELL_ASSETS.includes(url.pathname))event.respondWith(caches.open(SHELL_VERSION).then(async cache=>(await cache.match(url.pathname))||fetch(event.request)));
});
