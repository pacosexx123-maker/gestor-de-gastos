// Controles táctiles de los formularios:
// - chipsDesdeSelect: muestra las opciones de un <select> como botones. El <select> sigue en la
//   página (oculto) y es el que guarda el valor, así que el resto del código no cambia.
// - atajosFecha: botones "Hoy" y "Ayer" junto al campo de fecha, que sigue sirviendo para elegir otra.

import { escaparHTML } from './utils.js?v=33';

// Devuelve una función para volver a pintar los botones cuando cambian las opciones o el valor
// opciones.color(valor): color de un puntito delante del texto, o null para no ponerlo
export function chipsDesdeSelect(select, contenedor, opciones = {}) {
    const pintar = () => {
        contenedor.innerHTML = [...select.options].map(opcion => {
            const activo = opcion.value === select.value;
            const extra = opcion.value === '__nueva__' ? ' chip-nueva' : '';
            const color = opciones.color ? opciones.color(opcion.value) : null;
            const punto = color ? `<i class="chip-punto" style="background:${color}"></i>` : '';
            return `<button type="button" class="${activo ? 'activo' : ''}${extra}" data-valor="${escaparHTML(opcion.value)}" aria-pressed="${activo}">${punto}${escaparHTML(opcion.textContent.trim())}</button>`;
        }).join('');
    };
    contenedor.addEventListener('click', evento => {
        const boton = evento.target.closest('[data-valor]');
        if (!boton) return;
        select.value = boton.getAttribute('data-valor');
        select.dispatchEvent(new Event('change', { bubbles: true }));
        pintar();
    });
    pintar();
    return pintar;
}

function fechaRelativa(dias) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + dias);
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

// contenedor: elemento con botones [data-dias] y el propio <input type="date">
export function atajosFecha(input, contenedor) {
    const pintar = () => {
        let alguno = false;
        contenedor.querySelectorAll('[data-dias]').forEach(boton => {
            const activo = input.value === fechaRelativa(Number(boton.getAttribute('data-dias')));
            alguno = alguno || activo;
            boton.classList.toggle('activo', activo);
            boton.setAttribute('aria-pressed', activo);
        });
        input.classList.toggle('activo', !alguno && !!input.value);
    };
    contenedor.addEventListener('click', evento => {
        const boton = evento.target.closest('[data-dias]');
        if (!boton) return;
        input.value = fechaRelativa(Number(boton.getAttribute('data-dias')));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        pintar();
    });
    input.addEventListener('change', pintar);
    input.addEventListener('input', pintar);
    pintar();
    return pintar;
}
