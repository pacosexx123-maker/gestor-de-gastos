// Service worker: guarda la app en el dispositivo para que abra sin conexión.
// Solo guarda los archivos de la propia app (nunca datos del usuario, que están en el navegador)
// y no hace peticiones a ningún otro sitio.
//
// - La página (index.html): primero la red, para recibir las actualizaciones; sin conexión, la copia guardada.
// - El resto (css, js, icono): primero la copia guardada. Sus direcciones llevan ?v=N, así que una
//   versión nueva es una dirección nueva y se descarga sola.

const CACHE = 'gestor-gastos';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (evento) => {
    evento.waitUntil(self.clients.claim());
});

// La página envía la lista de archivos que ya ha cargado para dejarlos guardados
self.addEventListener('message', (evento) => {
    const datos = evento.data || {};
    if (datos.tipo !== 'guardar' || !Array.isArray(datos.archivos)) return;
    evento.waitUntil((async () => {
        for (const url of datos.archivos) {
            if (new URL(url).origin !== self.location.origin || !esArchivoDeLaApp(new URL(url))) continue;
            const peticion = new Request(url);
            const esPagina = new URL(url).pathname.endsWith('/') || new URL(url).pathname.endsWith('.html');
            try { await (esPagina ? primeroRed(peticion) : primeroCache(peticion)); } catch (error) { /* sin conexión */ }
        }
    })());
});

self.addEventListener('fetch', (evento) => {
    const peticion = evento.request;
    const url = new URL(peticion.url);
    if (peticion.method !== 'GET' || url.origin !== self.location.origin || !esArchivoDeLaApp(url)) return;

    const esPagina = peticion.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
    // Si la caché fallara por cualquier motivo, se carga de internet como una web normal
    evento.respondWith((esPagina ? primeroRed(peticion) : primeroCache(peticion)).catch(() => fetch(peticion)));
});

// Solo los archivos de la app: páginas, estilos, código, iconos y manifiesto
function esArchivoDeLaApp(url) {
    return url.pathname.endsWith('/') || /\.(html|css|js|png|json|svg|ico)$/.test(url.pathname);
}

async function abrirCache() {
    try { return await caches.open(CACHE); } catch (error) { return null; }
}

async function primeroRed(peticion) {
    const cache = await abrirCache();
    try {
        const respuesta = await fetch(peticion);
        if (respuesta.ok && cache) cache.put(peticion, respuesta.clone()).catch(() => {});
        return respuesta;
    } catch (error) {
        const guardada = cache && ((await cache.match(peticion, { ignoreSearch: true })) ||
                                   (await cache.match(new URL('./', self.registration.scope).href)));
        if (guardada) return guardada;
        throw error;
    }
}

async function primeroCache(peticion) {
    const cache = await abrirCache();
    if (!cache) return fetch(peticion);
    const guardada = await cache.match(peticion);
    if (guardada) return guardada;

    const respuesta = await fetch(peticion);
    if (respuesta.ok) {
        // Se borran las versiones anteriores del mismo archivo (mismo nombre, distinto ?v=)
        const ruta = new URL(peticion.url).pathname;
        for (const anterior of await cache.keys()) {
            if (new URL(anterior.url).pathname === ruta && anterior.url !== peticion.url) await cache.delete(anterior);
        }
        cache.put(peticion, respuesta.clone());
    }
    return respuesta;
}
