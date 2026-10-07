const CACHE='atelier-v1100';

const ASSETS=[
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/gifts.js',
  '/manger.html',
  '/minargent.html',
  '/boissons.html',
  '/epicerie.html',
  '/coffrets.html',
  '/cadeaux.html',
  '/compte.html',
  '/reservation.html',
  '/cadeau-retour.html'
];

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(ASSETS))
  );
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys=>
        Promise.all(
          keys
            .filter(k=>k!==CACHE)
            .map(k=>caches.delete(k))
        )
      )
    ])
  );
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;

  const u=new URL(e.request.url);

  // Les fonctions Netlify sont toujours récupérées sur le réseau.
  if(u.pathname.startsWith('/.netlify/functions/')){
    e.respondWith(
      fetch(e.request,{cache:'no-store'})
    );
    return;
  }

  // CSS et JavaScript : réseau en priorité pour recevoir les mises à jour.
  if(
    u.pathname==='/style.css' ||
    u.pathname==='/app.js' ||
    u.pathname==='/gifts.js' ||
    u.pathname==='/mobile-nav.js' ||
    u.pathname==='/reservation.js' ||
    u.pathname==='/privacy-consent.js' ||
    u.pathname==='/analytics.js' ||
    u.pathname==='/public-ui-2026.css'
  ){
    e.respondWith(
      fetch(e.request,{cache:'no-store'})
        .then(r=>{
          const copy=r.clone();
          caches.open(CACHE).then(c=>c.put(e.request,copy));
          return r;
        })
        .catch(()=>caches.match(e.request))
    );
    return;
  }

  // Navigation : réseau en priorité.
  if(e.request.mode==='navigate'){
    e.respondWith(
      fetch(e.request)
        .then(r=>{
          const copy=r.clone();
          caches.open(CACHE).then(c=>c.put(e.request,copy));
          return r;
        })
        .catch(()=>caches.match(e.request))
    );
    return;
  }

  // Autres ressources statiques : cache puis réseau.
  e.respondWith(
    caches.match(e.request)
      .then(r=>
        r ||
        fetch(e.request).then(res=>{
          const copy=res.clone();
          caches.open(CACHE).then(c=>c.put(e.request,copy));
          return res;
        })
      )
  );
});
