// ═══════════════════════════════════════════════════════════════
// GRUPO SOLE — Inspección de Contenedores · Service Worker
// Subir este archivo EXACTAMENTE con el nombre "sw.js" al repositorio
// de GitHub (raíz del repo), junto al index.html.
//
// ¿Qué hace?
//  1. Guarda una copia del app en el teléfono la PRIMERA vez que se
//     abre con internet.
//  2. Gracias a esa copia, el app se PUEDE ABRIR sin internet
//     (modo avión, zona sin señal, etc.).
//  3. Cuando hay internet, SIEMPRE baja la versión nueva del app y
//     actualiza la copia — así las actualizaciones que subas a GitHub
//     llegan a los teléfonos en el siguiente uso con red.
//
// IMPORTANTE: este archivo NO toca los datos (borrador, historial,
// fotos). Solo guarda el código del app, como un "sticker" de respaldo.
// ═══════════════════════════════════════════════════════════════

const CACHE = 'sole-contenedores-v9.2.1';
const BASE  = '/inspecci-n-contenedores/';
const ASSETS = [
  BASE,
  BASE + 'manifest.json',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png'
];

// Instalación: guardar la copia base del app
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(ASSETS).catch(function(){}); })
      .then(function(){ return self.skipWaiting(); })
  );
});

// Activación: borrar copias viejas de versiones anteriores
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(ks){
      return Promise.all(ks.filter(function(k){ return k !== CACHE; })
        .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// Estrategia por tipo de petición
self.addEventListener('fetch', function(e){
  const req = e.request;
  let url;
  try { url = new URL(req.url); } catch(err){ return; }

  // Solo se maneja lo MISMO ORIGEN (GitHub Pages).
  // Google Sheets, Apps Script, Microsoft/OneDrive y Power BI pasan
  // SIEMPRE directo a la red — nunca se cachean.
  if (url.origin !== location.origin) return;

  // 1) Página principal del app: primero RED (así siempre entras a la
  //    versión más nueva); si no hay internet → copia guardada.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function(r){
        try {
          const copy = r.clone();
          caches.open(CACHE).then(function(c){ c.put(BASE, copy); });
        } catch(err){}
        return r;
      }).catch(function(){
        return caches.match(BASE).then(function(hit){
          return hit || new Response('<h1>Sin conexión</h1><p>Abre el app una vez con internet para activar el modo sin conexión.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        });
      })
    );
    return;
  }

  // 2) Resto de archivos propios (manifest, iconos): primero copia
  //    local; si no existe, va a la red y se guarda.
  e.respondWith(
    caches.match(req).then(function(hit){
      if (hit) return hit;
      return fetch(req).then(function(r){
        try {
          if (r && r.status === 200 && r.type === 'basic') {
            const copy = r.clone();
            caches.open(CACHE).then(function(c){ c.put(req, copy); });
          }
        } catch(err){}
        return r;
      }).catch(function(){ return caches.match(BASE); });
    })
  );
});
