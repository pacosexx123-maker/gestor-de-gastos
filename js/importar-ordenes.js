// Importación de órdenes descargadas del bróker (CSV o Excel .xlsx).
// Columnas reconocidas: Fecha de la orden, ISIN, Importe, Nº de participaciones, Estado
// (y opcionalmente Nombre/Fondo y Precio/Valor liquidativo).

import { leerPrimeraHojaExcel, excelAFecha } from './excel.js?v=11';
import {
    obtenerInversiones, anadirInversiones, buscarActivo, normalizarIsin, escaparHTML, formatoDecimal
} from './inversiones.js?v=11';

const modalImportar = document.getElementById('modal-importar-ordenes');
const listaOrdenes = document.getElementById('lista-ordenes-importar');
const resumenImportacion = document.getElementById('resumen-importacion');
const btnConfirmar = document.getElementById('btn-confirmar-importacion');

let ordenesPendientes = [];
let ayudas = {}; // abrirModal, cerrarModal, mostrarToast, formatoFechaES, alImportar (vienen de main.js)

// --- LECTURA DEL ARCHIVO ---

function decodificarTexto(bytes) {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (error) {
        return new TextDecoder('windows-1252').decode(bytes);
    }
}

function leerCSV(texto) {
    texto = texto.replace(/^﻿/, '');
    const primeraLinea = texto.split(/\r?\n/)[0];
    const separador = [';', '\t', ','].reduce((mejor, s) =>
        primeraLinea.split(s).length > primeraLinea.split(mejor).length ? s : mejor, ';');

    const filas = [];
    let fila = [], campo = '', entreComillas = false;
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (entreComillas) {
            if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
            else if (c === '"') entreComillas = false;
            else campo += c;
        } else if (c === '"') entreComillas = true;
        else if (c === separador) { fila.push(campo); campo = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && texto[i + 1] === '\n') i++;
            fila.push(campo); filas.push(fila); fila = []; campo = '';
        } else campo += c;
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
}

function normalizarCabecera(texto) {
    return String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function detectarColumnas(cabecera) {
    const columnas = {};
    cabecera.forEach((titulo, indice) => {
        const t = normalizarCabecera(titulo);
        const asignar = (campo) => { if (columnas[campo] === undefined) columnas[campo] = indice; };
        if (t.includes('isin')) asignar('isin');
        else if (t.includes('fecha')) asignar('fecha');
        else if (t.includes('particip') || t.includes('titulos') || t.includes('cantidad')) asignar('participaciones');
        else if (t.includes('precio') || t.includes('liquidativo') || t.includes('cotizacion')) asignar('precio');
        else if (t.includes('importe') || t.includes('efectivo') || t.includes('total')) asignar('importe');
        else if (t.includes('estado')) asignar('estado');
        else if (t.includes('nombre') || t.includes('fondo') || t.includes('producto') || t.includes('descripcion') || t.includes('activo')) asignar('nombre');
    });
    return columnas;
}

// "1,224" / "1.224,50" / "30 EUR" / 1.224 -> número
function leerNumero(valor) {
    if (typeof valor === 'number') return valor;
    let texto = String(valor || '').replace(/[^\d,.\-]/g, '');
    if (!texto) return NaN;
    const ultimaComa = texto.lastIndexOf(',');
    const ultimoPunto = texto.lastIndexOf('.');
    if (ultimaComa > -1 && ultimoPunto > -1) {
        texto = ultimaComa > ultimoPunto
            ? texto.replace(/\./g, '').replace(',', '.')
            : texto.replace(/,/g, '');
    } else if (ultimaComa > -1) {
        texto = texto.replace(/,/g, '.');
    }
    return parseFloat(texto);
}

// Número de Excel, "31/08/2026", "31-08-26", "2026-08-31" -> "AAAA-MM-DD"
function leerFecha(valor) {
    if (typeof valor === 'number' && valor > 0) return excelAFecha(valor);
    const texto = String(valor || '').trim();
    let m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = texto.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (m) {
        const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
        return `${anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    return '';
}

function estaFinalizada(estado) {
    if (!estado) return true;
    const e = normalizarCabecera(estado);
    return e.includes('finaliz') || e.includes('ejecutad') || e.includes('completad') || e.includes('liquidad');
}

async function leerOrdenes(archivo) {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const esExcel = bytes[0] === 0x50 && bytes[1] === 0x4B; // los .xlsx empiezan por "PK"
    const filas = esExcel ? await leerPrimeraHojaExcel(bytes) : leerCSV(decodificarTexto(bytes));

    const filaCabecera = filas.findIndex(fila => fila.some(c => normalizarCabecera(c).includes('isin')));
    if (filaCabecera < 0) throw new Error('No se ha encontrado la columna "ISIN" en el archivo.');
    const columnas = detectarColumnas(filas[filaCabecera]);
    if (columnas.fecha === undefined || columnas.participaciones === undefined || (columnas.importe === undefined && columnas.precio === undefined)) {
        throw new Error('El archivo debe tener las columnas: Fecha, ISIN, Importe (o Precio) y Nº de participaciones.');
    }

    const existentes = obtenerInversiones();
    return filas.slice(filaCabecera + 1).map(fila => {
        const isin = normalizarIsin(fila[columnas.isin]);
        const participaciones = leerNumero(fila[columnas.participaciones]);
        const importe = columnas.importe !== undefined ? leerNumero(fila[columnas.importe]) : NaN;
        let precio = columnas.precio !== undefined ? leerNumero(fila[columnas.precio]) : NaN;
        if (!(precio > 0) && importe > 0 && participaciones > 0) precio = importe / participaciones;
        const fecha = leerFecha(fila[columnas.fecha]);
        const estado = columnas.estado !== undefined ? String(fila[columnas.estado] || '').trim() : '';
        if (!isin || !fecha || !(participaciones > 0) || !(precio > 0)) return null;

        const conocido = buscarActivo({ isin });
        const duplicada = existentes.some(inv =>
            normalizarIsin(inv.isin) === isin && inv.fecha === fecha && Math.abs(parseFloat(inv.cantidad) - participaciones) < 1e-6);

        return {
            fecha, isin, estado, participaciones,
            precio: parseFloat(precio.toFixed(6)),
            nombre: conocido ? conocido.nombre : String(columnas.nombre !== undefined ? fila[columnas.nombre] || '' : '').trim(),
            tipo: conocido ? conocido.tipo || 'Fondo' : 'Fondo',
            conocido: !!conocido,
            duplicada,
            finalizada: estaFinalizada(estado),
            seleccionada: estaFinalizada(estado) && !duplicada
        };
    }).filter(Boolean);
}

// --- VISTA PREVIA ---

function actualizarResumen() {
    const seleccionadas = ordenesPendientes.filter(o => o.seleccionada).length;
    resumenImportacion.textContent = `${ordenesPendientes.length} ${ordenesPendientes.length === 1 ? 'orden encontrada' : 'órdenes encontradas'} · ${seleccionadas} ${seleccionadas === 1 ? 'seleccionada' : 'seleccionadas'}`;
    btnConfirmar.disabled = seleccionadas === 0;
    btnConfirmar.textContent = seleccionadas === 1 ? 'Importar 1 orden' : `Importar ${seleccionadas} órdenes`;
}

function renderizarVistaPrevia() {
    listaOrdenes.innerHTML = ordenesPendientes.map((orden, i) => {
        const aviso = orden.duplicada ? 'Ya importada' : (!orden.finalizada ? 'No finalizada' : '');
        const total = orden.participaciones * orden.precio;
        return `
            <div class="orden-fila ${orden.seleccionada ? '' : 'desmarcada'}">
                <input type="checkbox" class="orden-check" data-i="${i}" ${orden.seleccionada ? 'checked' : ''} aria-label="Importar esta orden">
                <div class="orden-info">
                    <div class="orden-cabecera">
                        <b>${ayudas.formatoFechaES(orden.fecha)}</b>
                        <span class="texto-isin">${escaparHTML(orden.isin)}</span>
                        ${orden.estado ? `<span class="pildora">${escaparHTML(orden.estado)}</span>` : ''}
                        ${aviso ? `<span class="pildora pildora-aviso">${aviso}</span>` : ''}
                    </div>
                    ${orden.conocido
                        ? `<span class="orden-nombre-conocido">${escaparHTML(orden.nombre)}</span>`
                        : `<input type="text" class="orden-nombre" data-isin="${escaparHTML(orden.isin)}" value="${escaparHTML(orden.nombre)}" placeholder="Nombre del fondo (nuevo ISIN)">`}
                    <small>${formatoDecimal(orden.participaciones, 6)} part. × ${formatoDecimal(orden.precio, 4)} € = <b>${total.toFixed(2)} €</b></small>
                </div>
            </div>`;
    }).join('');

    listaOrdenes.querySelectorAll('.orden-check').forEach(check => {
        check.addEventListener('change', () => {
            const orden = ordenesPendientes[Number(check.getAttribute('data-i'))];
            orden.seleccionada = check.checked;
            check.closest('.orden-fila').classList.toggle('desmarcada', !check.checked);
            actualizarResumen();
        });
    });

    // Un ISIN nuevo puede aparecer en varias órdenes: el nombre se escribe una sola vez
    listaOrdenes.querySelectorAll('.orden-nombre').forEach(input => {
        input.addEventListener('input', () => {
            const isin = input.getAttribute('data-isin');
            ordenesPendientes.filter(o => o.isin === isin).forEach(o => { o.nombre = input.value; });
            listaOrdenes.querySelectorAll(`.orden-nombre[data-isin="${isin}"]`).forEach(otro => {
                if (otro !== input) otro.value = input.value;
            });
        });
    });

    actualizarResumen();
}

export async function importarOrdenesDesdeArchivo(archivo) {
    try {
        ordenesPendientes = await leerOrdenes(archivo);
    } catch (error) {
        return alert(`No se ha podido leer el archivo de órdenes.\n\n${error.message}`);
    }
    if (ordenesPendientes.length === 0) return alert('No se ha encontrado ninguna orden válida en el archivo.');
    renderizarVistaPrevia();
    ayudas.abrirModal(modalImportar);
}

function confirmarImportacion() {
    const nuevas = ordenesPendientes.filter(o => o.seleccionada).map(o => ({
        nombre: o.nombre.trim() || o.isin,
        isin: o.isin,
        tipo: o.tipo,
        cantidad: o.participaciones,
        precio: o.precio,
        fecha: o.fecha
    }));
    anadirInversiones(nuevas);
    ayudas.cerrarModal(modalImportar);
    ayudas.alImportar();
    ayudas.mostrarToast(nuevas.length === 1 ? '1 orden importada' : `${nuevas.length} órdenes importadas`);
}

export function iniciarImportacionOrdenes(funcionesAyuda) {
    ayudas = funcionesAyuda;
    btnConfirmar.addEventListener('click', confirmarImportacion);
    document.getElementById('btn-cerrar-importar').addEventListener('click', () => ayudas.cerrarModal(modalImportar));
    modalImportar.addEventListener('click', (e) => { if (e.target === modalImportar) ayudas.cerrarModal(modalImportar); });
}
