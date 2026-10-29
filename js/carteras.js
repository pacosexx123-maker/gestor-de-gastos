// Carteras: agrupan varios activos (p. ej. los fondos de una cartera automatizada)
// para verlos como uno solo en "Distribución por activo".
// Cada cartera guarda las claves de sus activos (ISIN o nombre), así las nuevas
// aportaciones de esos fondos, también las importadas, entran solas en la cartera.

import { formatoEuros } from './utils.js?v=24';

const ICONO_EDITAR = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const ICONO_ELIMINAR = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

const modalCarteras = document.getElementById('modal-carteras');
const vistaLista = document.getElementById('carteras-vista-lista');
const vistaEdicion = document.getElementById('carteras-vista-edicion');
const listaCarteras = document.getElementById('lista-carteras');
const inputNombreCartera = document.getElementById('cartera-nombre');
const listaActivosCartera = document.getElementById('cartera-activos');
const tituloModal = document.getElementById('titulo-modal-carteras');

let carteras = cargarCarteras();
let editando = null; // id de la cartera en edición, o 'nueva'
let ayudas = {}; // abrirModal, cerrarModal, mostrarToast, obtenerResumenActivos, alCambiar, escaparHTML

function cargarCarteras() {
    try {
        const guardadas = JSON.parse(localStorage.getItem('carteras') || '[]');
        return Array.isArray(guardadas) ? guardadas : [];
    } catch (error) {
        return [];
    }
}

function guardarCarteras() {
    localStorage.setItem('carteras', JSON.stringify(carteras));
    ayudas.alCambiar();
}

export function obtenerCarteras() {
    return carteras;
}

export function reemplazarCarteras(lista) {
    carteras = Array.isArray(lista) ? lista : [];
    localStorage.setItem('carteras', JSON.stringify(carteras));
}

export function carteraDeActivo(clave) {
    return carteras.find(c => (c.activos || []).includes(clave)) || null;
}

// --- MODAL ---

function mostrarLista() {
    editando = null;
    tituloModal.textContent = 'Mis carteras';
    vistaLista.classList.remove('oculto');
    vistaEdicion.classList.add('oculto');

    const resumen = ayudas.obtenerResumenActivos();
    if (carteras.length === 0) {
        listaCarteras.innerHTML = '<p class="estado-vacio">Aún no tienes carteras. Crea una para agrupar los fondos de una cartera automatizada y verlos como uno solo.</p>';
        return;
    }
    listaCarteras.innerHTML = carteras.map(cartera => {
        const activos = resumen.filter(a => (cartera.activos || []).includes(a.clave));
        const total = activos.reduce((suma, a) => suma + a.total, 0);
        return `
            <div class="cartera-fila">
                <div class="cartera-info">
                    <b>${ayudas.escaparHTML(cartera.nombre)}</b>
                    <small>${activos.length} ${activos.length === 1 ? 'activo' : 'activos'} · ${formatoEuros(total)}</small>
                </div>
                <div class="acciones-fila">
                    <button class="btn-editar btn-editar-cartera" data-id="${cartera.id}" title="Editar cartera">${ICONO_EDITAR}</button>
                    <button class="btn-eliminar btn-eliminar-cartera" data-id="${cartera.id}" title="Eliminar cartera">${ICONO_ELIMINAR}</button>
                </div>
            </div>`;
    }).join('');

    listaCarteras.querySelectorAll('.btn-editar-cartera').forEach(btn => {
        btn.addEventListener('click', () => mostrarEdicion(btn.getAttribute('data-id')));
    });
    listaCarteras.querySelectorAll('.btn-eliminar-cartera').forEach(btn => {
        btn.addEventListener('click', () => {
            const cartera = carteras.find(c => c.id === btn.getAttribute('data-id'));
            if (!cartera || !confirm(`¿Eliminar la cartera "${cartera.nombre}"? Sus fondos y aportaciones no se borran: volverán a aparecer por separado.`)) return;
            carteras = carteras.filter(c => c.id !== cartera.id);
            guardarCarteras();
            mostrarLista();
            ayudas.mostrarToast('Cartera eliminada');
        });
    });
}

function mostrarEdicion(id) {
    editando = id;
    const cartera = carteras.find(c => c.id === id);
    tituloModal.textContent = cartera ? 'Editar cartera' : 'Nueva cartera';
    vistaLista.classList.add('oculto');
    vistaEdicion.classList.remove('oculto');
    inputNombreCartera.value = cartera ? cartera.nombre : '';

    const resumen = ayudas.obtenerResumenActivos();
    if (resumen.length === 0) {
        listaActivosCartera.innerHTML = '<p class="estado-vacio">Primero añade alguna inversión.</p>';
        return;
    }
    listaActivosCartera.innerHTML = resumen.map(activo => {
        const actual = carteraDeActivo(activo.clave);
        const marcado = cartera && actual && actual.id === cartera.id;
        const enOtra = actual && (!cartera || actual.id !== cartera.id);
        return `
            <label class="cartera-activo">
                <input type="checkbox" value="${ayudas.escaparHTML(activo.clave)}" ${marcado ? 'checked' : ''}>
                <span class="cartera-activo-info">
                    <b>${ayudas.escaparHTML(activo.nombre)}</b>
                    <small>${activo.isin ? `<span class="texto-isin">${ayudas.escaparHTML(activo.isin)}</span> · ` : ''}${formatoEuros(activo.total)}${enOtra ? ` · <em>ahora en "${ayudas.escaparHTML(actual.nombre)}"</em>` : ''}</small>
                </span>
            </label>`;
    }).join('');
    setTimeout(() => inputNombreCartera.focus(), 100);
}

function guardarEdicion() {
    const nombre = inputNombreCartera.value.trim();
    if (!nombre) return inputNombreCartera.focus();
    const seleccionados = Array.from(listaActivosCartera.querySelectorAll('input:checked')).map(i => i.value);

    let cartera = carteras.find(c => c.id === editando);
    if (!cartera) {
        cartera = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, nombre, activos: [] };
        carteras.push(cartera);
    }
    cartera.nombre = nombre;
    // Un activo solo puede estar en una cartera: si se marca aquí, sale de la otra
    carteras.forEach(c => {
        if (c !== cartera) c.activos = (c.activos || []).filter(clave => !seleccionados.includes(clave));
    });
    cartera.activos = seleccionados;

    guardarCarteras();
    ayudas.mostrarToast('Cartera guardada');
    mostrarLista();
}

export function abrirModalCarteras() {
    mostrarLista();
    ayudas.abrirModal(modalCarteras);
}

export function abrirEdicionCartera(id) {
    mostrarEdicion(id);
    ayudas.abrirModal(modalCarteras);
}

export function iniciarCarteras(funcionesAyuda) {
    ayudas = funcionesAyuda;
    document.getElementById('btn-nueva-cartera').addEventListener('click', () => mostrarEdicion('nueva'));
    document.getElementById('btn-guardar-cartera').addEventListener('click', guardarEdicion);
    document.getElementById('btn-cancelar-cartera').addEventListener('click', mostrarLista);
    document.getElementById('btn-cerrar-carteras').addEventListener('click', () => ayudas.cerrarModal(modalCarteras));
    modalCarteras.addEventListener('click', (e) => { if (e.target === modalCarteras) ayudas.cerrarModal(modalCarteras); });
    inputNombreCartera.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardarEdicion(); } });
}
