// Barra de navegación inferior: la píldora de la pestaña activa se mueve poco a poco de una pestaña
// a otra, siguiendo al dedo al deslizar la pantalla, y el nombre aparece debajo del icono de la activa.
//
// La posición es un número: 0 = primera pestaña, 1 = segunda, 1,5 = a medio camino entre las dos.

const DURACION = 280; // la misma que tarda la pantalla en terminar de deslizarse

const barra = document.querySelector('.barra-navegacion');
const botones = Array.from(barra.querySelectorAll('.nav-item'));

let posicion = Math.max(0, botones.findIndex(btn => btn.classList.contains('activo')));
let animacion = null;

function pintar(valor) {
    posicion = valor;
    barra.style.setProperty('--nav-pos', valor);
    botones.forEach((btn, i) => btn.style.setProperty('--activo', Math.max(0, 1 - Math.abs(valor - i)).toFixed(3)));
}

function pararAnimacion() {
    if (animacion !== null) cancelAnimationFrame(animacion);
    animacion = null;
}

// Mientras el dedo arrastra la pantalla
export function moverBarra(valor) {
    pararAnimacion();
    pintar(valor);
}

// Desde donde esté hasta una pestaña, frenando al final
export function animarBarra(indice) {
    pararAnimacion();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return pintar(indice);
    const origen = posicion;
    const inicio = performance.now();
    const paso = ahora => {
        const avance = Math.min(1, Math.max(0, (ahora - inicio) / DURACION));
        pintar(origen + (indice - origen) * (1 - Math.pow(1 - avance, 3)));
        animacion = avance < 1 ? requestAnimationFrame(paso) : null;
    };
    animacion = requestAnimationFrame(paso);
}

// Marca la pestaña activa. Sin animar, la píldora se coloca directamente en su sitio
export function marcarPestana(seccion, animar) {
    const indice = botones.findIndex(btn => btn.getAttribute('data-seccion') === seccion);
    botones.forEach((btn, i) => {
        btn.classList.toggle('activo', i === indice);
        if (i === indice) btn.setAttribute('aria-current', 'page');
        else btn.removeAttribute('aria-current');
    });
    if (animar) animarBarra(indice);
    else moverBarra(indice);
}
