// Categorías de gastos/ingresos y apartados (gastos que van aparte, como "Hogar").
// Un apartado no se suma al gasto personal: tiene su propia tarjeta. Los ingresos
// asignados a un apartado (p. ej. un Bizum que te devuelven) se le restan.

import { leerDato, guardarDato, nuevoId } from './datos.js?v=20';
import { escaparHTML } from './utils.js?v=20';

const ICONO_EDITAR = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const ICONO_ELIMINAR = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

let categorias = leerDato('categorias');
let apartados = leerDato('apartados');
let ayudas = {}; // abrirModal, cerrarModal, mostrarToast, renombrarEnMovimientos, quitarApartadoDeMovimientos, alCambiar

const modal = document.getElementById('modal-config-gastos');

export function obtenerCategorias(tipo) {
    const lista = categorias[tipo];
    return Array.isArray(lista) && lista.length ? lista : (tipo === 'gasto' ? ['Otros'] : ['Otros']);
}

export function obtenerApartados() {
    return apartados;
}

export function apartadoPorId(id) {
    return apartados.find(a => a.id === id) || null;
}

export function reemplazarConfiguracion(datos) {
    if (datos && datos.categorias && Array.isArray(datos.categorias.gasto)) categorias = datos.categorias;
    if (datos && Array.isArray(datos.apartados)) apartados = datos.apartados;
    guardarDato('categorias', categorias);
    guardarDato('apartados', apartados);
}

// Añade una categoría si no existe (p. ej. al importar movimientos o al escribirla en el formulario)
export function asegurarCategoria(tipo, nombre) {
    const limpio = String(nombre || '').trim();
    if (!limpio || obtenerCategorias(tipo).some(c => c.toLowerCase() === limpio.toLowerCase())) return limpio;
    categorias[tipo] = [...(categorias[tipo] || []), limpio];
    guardarDato('categorias', categorias);
    return limpio;
}

export function asegurarApartado(id, nombre) {
    if (apartadoPorId(id)) return;
    apartados.push({ id, nombre, acumulado: true });
    guardarDato('apartados', apartados);
}

// --- VENTANA DE GESTIÓN ---

function filaEditable({ texto, detalle = '', datos }) {
    return `
        <div class="config-fila">
            <div class="config-texto"><b>${escaparHTML(texto)}</b>${detalle ? `<small>${detalle}</small>` : ''}</div>
            <div class="acciones-fila">
                <button class="btn-editar" data-accion="renombrar" ${datos} title="Cambiar nombre">${ICONO_EDITAR}</button>
                <button class="btn-eliminar" data-accion="eliminar" ${datos} title="Eliminar">${ICONO_ELIMINAR}</button>
            </div>
        </div>`;
}

function renderizar() {
    document.getElementById('config-apartados').innerHTML = apartados.length
        ? apartados.map(a => `
            <div class="config-fila">
                <div class="config-texto">
                    <b>${escaparHTML(a.nombre)}</b>
                    <small>${a.acumulado ? 'Suma todos los meses hasta el actual' : 'Solo el mes seleccionado'}</small>
                </div>
                <div class="acciones-fila">
                    <button class="btn-secundario btn-mini" data-accion="alternar" data-apartado="${a.id}">${a.acumulado ? 'Acumulado' : 'Mensual'}</button>
                    <button class="btn-editar" data-accion="renombrar" data-apartado="${a.id}" title="Cambiar nombre">${ICONO_EDITAR}</button>
                    <button class="btn-eliminar" data-accion="eliminar" data-apartado="${a.id}" title="Eliminar">${ICONO_ELIMINAR}</button>
                </div>
            </div>`).join('')
        : '<p class="estado-vacio">No tienes apartados. Todo cuenta como gasto personal.</p>';

    ['gasto', 'ingreso'].forEach(tipo => {
        document.getElementById(`config-categorias-${tipo}`).innerHTML = obtenerCategorias(tipo)
            .map(c => filaEditable({ texto: c, datos: `data-tipo="${tipo}" data-categoria="${escaparHTML(c)}"` })).join('');
    });

    modal.querySelectorAll('[data-accion]').forEach(btn => btn.addEventListener('click', () => accion(btn)));
}

function accion(btn) {
    const tipo = btn.getAttribute('data-accion');
    const idApartado = btn.getAttribute('data-apartado');

    if (idApartado) {
        const apartado = apartadoPorId(idApartado);
        if (tipo === 'alternar') apartado.acumulado = !apartado.acumulado;
        if (tipo === 'renombrar') {
            const nombre = prompt('Nuevo nombre del apartado:', apartado.nombre);
            if (!nombre || !nombre.trim()) return;
            apartado.nombre = nombre.trim();
        }
        if (tipo === 'eliminar') {
            if (!confirm(`¿Eliminar el apartado "${apartado.nombre}"? Sus movimientos pasarán a contar como gasto personal.`)) return;
            apartados = apartados.filter(a => a.id !== idApartado);
            ayudas.quitarApartadoDeMovimientos(idApartado);
        }
    } else {
        const tipoMov = btn.getAttribute('data-tipo');
        const categoria = btn.getAttribute('data-categoria');
        if (tipo === 'renombrar') {
            const nombre = prompt('Nuevo nombre de la categoría:', categoria);
            if (!nombre || !nombre.trim() || nombre.trim() === categoria) return;
            categorias[tipoMov] = obtenerCategorias(tipoMov).map(c => c === categoria ? nombre.trim() : c);
            ayudas.renombrarEnMovimientos(tipoMov, categoria, nombre.trim());
        }
        if (tipo === 'eliminar') {
            if (obtenerCategorias(tipoMov).length <= 1) return alert('Tiene que quedar al menos una categoría.');
            const destino = obtenerCategorias(tipoMov).find(c => c !== categoria && c.toLowerCase() === 'otros') || obtenerCategorias(tipoMov).find(c => c !== categoria);
            if (!confirm(`¿Eliminar la categoría "${categoria}"? Sus movimientos pasarán a "${destino}".`)) return;
            categorias[tipoMov] = obtenerCategorias(tipoMov).filter(c => c !== categoria);
            ayudas.renombrarEnMovimientos(tipoMov, categoria, destino);
        }
    }
    guardarDato('categorias', categorias);
    guardarDato('apartados', apartados);
    renderizar();
    ayudas.alCambiar();
}

function anadirApartado() {
    const nombre = prompt('Nombre del nuevo apartado (por ejemplo: Coche, Viaje, Mascota):');
    if (!nombre || !nombre.trim()) return;
    apartados.push({ id: nuevoId(), nombre: nombre.trim(), acumulado: true });
    guardarDato('apartados', apartados);
    renderizar();
    ayudas.alCambiar();
    ayudas.mostrarToast('Apartado creado');
}

function anadirCategoria(tipo) {
    const nombre = prompt(tipo === 'gasto' ? 'Nombre de la nueva categoría de gasto:' : 'Nombre de la nueva categoría de ingreso:');
    if (!nombre || !nombre.trim()) return;
    asegurarCategoria(tipo, nombre);
    renderizar();
    ayudas.alCambiar();
}

export function abrirConfiguracion() {
    renderizar();
    ayudas.abrirModal(modal);
}

export function iniciarConfiguracion(funcionesAyuda) {
    ayudas = funcionesAyuda;
    document.getElementById('btn-nuevo-apartado').addEventListener('click', anadirApartado);
    document.getElementById('btn-nueva-categoria-gasto').addEventListener('click', () => anadirCategoria('gasto'));
    document.getElementById('btn-nueva-categoria-ingreso').addEventListener('click', () => anadirCategoria('ingreso'));
    document.getElementById('btn-cerrar-config-gastos').addEventListener('click', () => ayudas.cerrarModal(modal));
    modal.addEventListener('click', (e) => { if (e.target === modal) ayudas.cerrarModal(modal); });
}

export function obtenerConfiguracion() {
    return { categorias, apartados };
}
