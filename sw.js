// ══════════════════════════════════════════════════════
// SERVICE WORKER — Grupo Sole Inspección de Contenedores
// Versión: 1.0
// Propósito: guardar fotos en caché permanente que Android
// no puede borrar, aunque pasen 5 horas de sesión.
// ══════════════════════════════════════════════════════

const SW_VERSION = 'sole-v1';
const FOTO_CACHE = 'sole-fotos-v1';
const APP_CACHE  = 'sole-app-v1';

// Archivos del app que siempre deben estar disponibles offline
const APP_SHELL = [
  '/inspecci-n-contenedores/',
  '/inspecci-n-contenedores/index.html',
];

// ── INSTALACIÓN ──
// Se ejecuta una sola vez cuando el SW se instala
self.addEventListener('install', event => {
  console.log('[SW] Instalando versión:', SW_VERSION);
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()) // Tomar control inmediatamente
  );
});

// ── ACTIVACIÓN ──
// Limpiar versiones viejas del caché
self.addEventListener('activate', event => {
  console.log('[SW] Activando versión:', SW_VERSION);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== FOTO_CACHE && k !== APP_CACHE)
          .map(k => {
            console.log('[SW] Eliminando caché viejo:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim()) // Tomar control de todas las pestañas
  );
});

// ── MENSAJES DESDE EL APP ──
// El app envía fotos aquí para guardarlas permanentemente
self.addEventListener('message', event => {
  const { type, key, dataUrl } = event.data || {};

  if(type === 'GUARDAR_FOTO' && key && dataUrl){
    // Guardar la foto como respuesta de caché permanente
    guardarFotoEnCache(key, dataUrl);
  }

  if(type === 'RECUPERAR_TODAS'){
    // El app pide todas las fotos guardadas (al iniciar después de crash)
    recuperarTodasLasFotos(event.source);
  }
});

// Guardar una foto en el caché permanente del SW
async function guardarFotoEnCache(key, dataUrl){
  try{
    const cache = await caches.open(FOTO_CACHE);
    // Convertir dataUrl a Response para guardarlo en caché
    const response = new Response(dataUrl, {
      headers: { 'Content-Type': 'text/plain', 'X-Foto-Key': key }
    });
    // La key se usa como URL del caché
    const cacheUrl = '/sole-foto/' + encodeURIComponent(key);
    await cache.put(cacheUrl, response);
  } catch(e){
    console.warn('[SW] Error guardando foto:', key, e);
  }
}

// Recuperar todas las fotos guardadas y enviarlas al app
async function recuperarTodasLasFotos(client){
  try{
    const cache = await caches.open(FOTO_CACHE);
    const keys  = await cache.keys();
    let count = 0;
    for(const request of keys){
      const response = await cache.match(request);
      if(response){
        const dataUrl = await response.text();
        const key = decodeURIComponent(request.url.split('/sole-foto/')[1] || '');
        if(key && dataUrl && client){
          client.postMessage({
            type: 'FOTO_RECUPERADA',
            key: key,
            dataUrl: dataUrl
          });
          count++;
        }
      }
    }
    if(client){
      client.postMessage({ type: 'RECUPERACION_COMPLETA', total: count });
    }
    console.log('[SW] Fotos recuperadas enviadas al app:', count);
  } catch(e){
    console.warn('[SW] Error recuperando fotos:', e);
  }
}

// ── INTERCEPTAR PETICIONES ──
// Servir el app desde caché cuando no hay internet
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // No interceptar peticiones a APIs externas (OneDrive, Google Sheets, CDN)
  if(url.includes('graph.microsoft.com') ||
     url.includes('googleapis.com') ||
     url.includes('cdnjs.cloudflare.com') ||
     url.includes('api.anthropic.com')){
    return; // Dejar pasar normal
  }

  // Para el app shell: caché primero, luego red
  event.respondWith(
    caches.match(event.request).then(cached => {
      if(cached) return cached;
      return fetch(event.request).then(response => {
        // Guardar respuesta nueva en caché del app
        if(response.ok && event.request.method === 'GET'){
          const clone = response.clone();
          caches.open(APP_CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Sin internet y sin caché — devolver página de offline básica
        if(event.request.destination === 'document'){
          return caches.match('/inspecci-n-contenedores/index.html');
        }
      });
    })
  );
});
