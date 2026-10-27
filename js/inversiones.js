import {
    obtenerFechaHoy, cargarInversionesDesdeMemoria, guardarInversionesEnMemoria,
    calcularTotalInversion, calcularResumenPorActivo
} from './utils.js?v=4';

const ICONO_EDITAR = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const ICONO_ELIMINAR = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

const modalInversion = document.getElementById('modal-inversion');
const formularioInversion = document.getElementById('formulario-inversion');
const inputNombre = document.getElementById('inv-nombre');
const selectTipo = document.getElementById('inv-tipo');
const inputCantidad = document.getElementById('inv-cantidad');
const inputPrecio = document.getElementById('inv-precio');
const inputFecha = document.getElementById('inv-fecha');
const displayTotalFormulario = document.getElementById('inv-total-formulario');
const listaInversionesTabla = document.getElementById('lista-inversiones');
const listaActivos = document.getElementById('lista-activos');
const datalistNombres = document.getElementById('lista-nombres-activos');

let inversiones = cargarInversionesDesdeMemoria();
let indiceEditando = null;
let ayudas = {}; // abrirModal, cerrarModal, mostrarToast, formatoFechaES (vienen de main.js)

function escaparHTML(texto) {
    return String(texto).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Participaciones y precios pueden tener muchos decimales (p. ej. valor liquidativo de un fondo)
function formatoDecimal(numero, maxDecimales) {
    return parseFloat(parseFloat(numero || 0).toFixed(maxDecimales)).toString();
}

export function obtenerInversiones() {
    return inversiones;
}

export function reemplazarInversiones(lista) {
    inversiones = lista;
    guardarInversionesEnMemoria(inversiones);
    renderizarInversiones();
}

function actualizarTotalFormulario() {
    const total = parseFloat(inputCantidad.value || 0) * parseFloat(inputPrecio.value || 0);
    displayTotalFormulario.textContent = total.toFixed(2);
}

export function abrirFormularioInversion(indice = null) {
    formularioInversion.reset();
    indiceEditando = indice;

    if (indice !== null) {
        const inv = inversiones[indice];
        inputNombre.value = inv.nombre || '';
        selectTipo.value = inv.tipo || 'Fondo';
        inputCantidad.value = inv.cantidad || '';
        inputPrecio.value = inv.precio || '';
        inputFecha.value = inv.fecha || obtenerFechaHoy();
        document.getElementById('titulo-form-inversion').textContent = 'Editar Inversión';
        document.getElementById('btn-guardar-inversion').textContent = 'Actualizar Inversión';
    } else {
        inputFecha.value = obtenerFechaHoy();
        document.getElementById('titulo-form-inversion').textContent = 'Nueva Inversión';
        document.getElementById('btn-guardar-inversion').textContent = 'Guardar Inversión';
    }

    actualizarTotalFormulario();
    ayudas.abrirModal(modalInversion);
}

function cerrarFormularioInversion() {
    indiceEditando = null;
    ayudas.cerrarModal(modalInversion);
}

export function renderizarInversiones() {
    const resumen = calcularResumenPorActivo(inversiones);
    const totalInvertido = resumen.reduce((acumulado, activo) => acumulado + activo.total, 0);

    // Tarjetas de totales
    document.getElementById('inv-total').textContent = totalInvertido.toFixed(2);
    document.getElementById('inv-num-operaciones').textContent =
        `${inversiones.length} ${inversiones.length === 1 ? 'aportación' : 'aportaciones'}`;
    document.getElementById('inv-num-activos').textContent = resumen.length;

    const ordenadas = inversiones
        .map((inv, indice) => ({ inv, indice }))
        .sort((a, b) => (b.inv.fecha || '').localeCompare(a.inv.fecha || ''));

    const ultima = ordenadas[0];
    document.getElementById('inv-ultima-fecha').textContent = ultima ? ayudas.formatoFechaES(ultima.inv.fecha) : '—';
    document.getElementById('inv-ultima-activo').textContent = ultima ? ultima.inv.nombre : 'Sin aportaciones';

    // Distribución por activo
    listaActivos.innerHTML = '';
    if (resumen.length === 0) {
        listaActivos.innerHTML = '<p class="estado-vacio">Aún no has añadido ninguna inversión. Pulsa + para empezar.</p>';
    }
    resumen.forEach(activo => {
        const porcentaje = totalInvertido > 0 ? (activo.total / totalInvertido) * 100 : 0;
        listaActivos.innerHTML += `
            <div class="activo-fila">
                <div class="activo-info">
                    <b>${escaparHTML(activo.nombre)}</b>
                    <span class="pildora">${escaparHTML(activo.tipo)}</span>
                </div>
                <div class="activo-datos">
                    <span class="activo-total">${activo.total.toFixed(2)} €</span>
                    <small>${formatoDecimal(activo.participaciones, 6)} part. · ${porcentaje.toFixed(1)}%</small>
                </div>
                <div class="activo-barra"><span style="width: ${porcentaje}%"></span></div>
            </div>`;
    });

    // Sugerencias de nombres en el formulario
    datalistNombres.innerHTML = resumen.map(a => `<option value="${escaparHTML(a.nombre)}"></option>`).join('');

    // Tabla de operaciones (más recientes primero)
    listaInversionesTabla.innerHTML = '';
    if (ordenadas.length === 0) {
        listaInversionesTabla.innerHTML = '<tr><td colspan="6" class="estado-vacio">No hay operaciones registradas</td></tr>';
    }
    ordenadas.forEach(({ inv, indice }) => {
        const cantidad = formatoDecimal(inv.cantidad, 6);
        const precio = formatoDecimal(inv.precio, 4);
        const fechaEspanol = ayudas.formatoFechaES(inv.fecha || obtenerFechaHoy());
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td><span class="fecha-larga">${fechaEspanol}</span><span class="fecha-corta">${fechaEspanol.substring(0, 6)}${fechaEspanol.substring(8)}</span></td>
            <td>
                ${escaparHTML(inv.nombre || 'Sin nombre')}<br>
                <span class="pildora">${escaparHTML(inv.tipo || 'Otro')}</span>
                <small class="detalle-movil">${cantidad} × ${precio} €</small>
            </td>
            <td class="col-cantidad">${cantidad}</td>
            <td class="col-cantidad">${precio} €</td>
            <td class="col-cantidad monto-inversion">${calcularTotalInversion(inv).toFixed(2)} €</td>
            <td>
                <div class="acciones-fila">
                    <button class="btn-editar btn-editar-inversion" data-indice="${indice}" title="Editar">${ICONO_EDITAR}</button>
                    <button class="btn-eliminar btn-eliminar-inversion" data-indice="${indice}" title="Eliminar">${ICONO_ELIMINAR}</button>
                </div>
            </td>`;
        listaInversionesTabla.appendChild(fila);
    });

    document.querySelectorAll('.btn-editar-inversion').forEach(btn => {
        btn.addEventListener('click', function() { abrirFormularioInversion(Number(this.getAttribute('data-indice'))); });
    });

    document.querySelectorAll('.btn-eliminar-inversion').forEach(btn => {
        btn.addEventListener('click', function() {
            inversiones.splice(Number(this.getAttribute('data-indice')), 1);
            guardarInversionesEnMemoria(inversiones);
            renderizarInversiones();
            ayudas.mostrarToast('Inversión eliminada');
        });
    });
}

export function generarCSVInversiones() {
    if (inversiones.length === 0) return null;
    let csv = '﻿Fecha,Activo,Tipo,Participaciones,Precio de mercado (€),Total (€)\n';
    inversiones.forEach(inv => {
        csv += `${ayudas.formatoFechaES(inv.fecha || obtenerFechaHoy())},"${inv.nombre || ''}","${inv.tipo || ''}",${inv.cantidad || 0},${inv.precio || 0},${calcularTotalInversion(inv).toFixed(2)}\n`;
    });
    return csv;
}

export function iniciarInversiones(funcionesAyuda) {
    ayudas = funcionesAyuda;

    inputCantidad.addEventListener('input', actualizarTotalFormulario);
    inputPrecio.addEventListener('input', actualizarTotalFormulario);

    // Si se elige un activo ya existente, se rellena su tipo automáticamente
    inputNombre.addEventListener('change', () => {
        const existente = inversiones.find(inv => (inv.nombre || '').trim() === inputNombre.value.trim());
        if (existente) selectTipo.value = existente.tipo || 'Fondo';
    });

    formularioInversion.addEventListener('submit', (evento) => {
        evento.preventDefault();
        const datosInversion = {
            nombre: inputNombre.value.trim(),
            tipo: selectTipo.value,
            cantidad: parseFloat(inputCantidad.value),
            precio: parseFloat(inputPrecio.value),
            fecha: inputFecha.value
        };

        if (indiceEditando !== null) {
            inversiones[indiceEditando] = datosInversion;
            ayudas.mostrarToast('Inversión actualizada');
        } else {
            inversiones.push(datosInversion);
            ayudas.mostrarToast('Inversión añadida');
        }

        guardarInversionesEnMemoria(inversiones);
        renderizarInversiones();
        cerrarFormularioInversion();
    });

    document.getElementById('btn-cerrar-inversion').addEventListener('click', cerrarFormularioInversion);
    modalInversion.addEventListener('click', (e) => { if (e.target === modalInversion) cerrarFormularioInversion(); });

    renderizarInversiones();
}
