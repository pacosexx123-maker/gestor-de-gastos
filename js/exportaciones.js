import { descargarArchivo, formatoNumero } from './utils.js?v=40';
import { base64ABytes } from './excel.js?v=40';
import { guardarTexto } from './datos.js?v=40';
import { guardarArchivo, leerArchivo, borrarArchivo } from './almacen-archivos.js?v=40';

// El registro (nombre, fecha, tamaño...) está en localStorage y el contenido de cada archivo, en IndexedDB.
// Los archivos antiguos llevaban el contenido en el propio registro: al arrancar se trasladan.

const ICONO_DESCARGAR = '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
const ICONO_ELIMINAR = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
const ICONO_ARCHIVO = '<svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 3 14 9 20 9"/></svg>';

const TIPOS = {
    gastos: { etiqueta: 'Gastos', clase: 'archivo-gastos' },
    inversiones: { etiqueta: 'Inversiones', clase: 'archivo-inversiones' },
    copia: { etiqueta: 'Gastos e inversiones', clase: 'archivo-copia' },
    todo: { etiqueta: 'Gastos e inversiones', clase: 'archivo-inversiones' } // Excel conjunto, desde Archivos
};

const listaArchivos = document.getElementById('lista-archivos');

let exportaciones = cargarExportaciones();
let ayudas = {}; // mostrarToast (viene de main.js)

function cargarExportaciones() {
    try {
        const datosGuardados = localStorage.getItem('exportaciones');
        return datosGuardados ? JSON.parse(datosGuardados) : [];
    } catch (error) {
        return [];
    }
}

function guardarExportaciones() {
    guardarTexto('exportaciones', JSON.stringify(exportaciones));
}

function escaparHTML(texto) {
    return String(texto).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatoFechaHora(fechaISO) {
    const fecha = new Date(fechaISO);
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const horas = String(fecha.getHours()).padStart(2, '0');
    const minutos = String(fecha.getMinutes()).padStart(2, '0');
    return `${dia}/${mes}/${fecha.getFullYear()} · ${horas}:${minutos}`;
}

// Contenido de un archivo antiguo, guardado todavía dentro del registro
function bytesAntiguos(exp) {
    return exp.codificacion === 'base64' ? base64ABytes(exp.contenido) : new TextEncoder().encode(exp.contenido);
}

function tamanoEnBytes(exp) {
    if (typeof exp.tamano === 'number') return exp.tamano;
    try { return exp.contenido ? bytesAntiguos(exp).length : null; } catch (error) { return null; }
}

function formatoTamano(bytes) {
    return bytes < 1024 ? `${bytes} B` : `${formatoNumero(bytes / 1024, 1)} KB`;
}

const estaDisponible = exp => !!exp.guardado || !!exp.contenido;

// contenido: bytes (Excel) o texto (copia de seguridad)
export function registrarExportacion({ nombreArchivo, tipo, formato, contenido, mime }) {
    const bytes = contenido instanceof Uint8Array ? contenido : new TextEncoder().encode(contenido);
    const exp = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        nombreArchivo,
        tipo,
        formato,
        fecha: new Date().toISOString(),
        tamano: bytes.length,
        guardado: false,
        mime
    };
    exportaciones.unshift(exp);
    guardarExportaciones();
    renderizarExportaciones();

    // El archivo ya se ha descargado: si aquí falla, solo queda sin poder volver a descargarse desde el historial
    guardarArchivo(exp.id, bytes).then(() => {
        if (!exportaciones.includes(exp)) return borrarArchivo(exp.id);
        exp.guardado = true;
        guardarExportaciones();
        renderizarExportaciones();
    }).catch(error => console.warn('No se ha podido guardar el archivo en el historial:', error));
}

// Pasa a IndexedDB los archivos antiguos. El original solo se quita tras comprobar que la copia está bien
async function trasladarArchivosAntiguos() {
    for (const exp of exportaciones.filter(e => e.contenido)) {
        try {
            const bytes = bytesAntiguos(exp);
            await guardarArchivo(exp.id, bytes);
            const copia = await leerArchivo(exp.id);
            if (!copia || copia.length !== bytes.length || copia.some((byte, i) => byte !== bytes[i])) continue;
            exp.guardado = true;
            exp.tamano = bytes.length;
            delete exp.contenido;
            delete exp.codificacion;
            guardarExportaciones();
        } catch (error) {
            console.warn('Archivo no trasladado (sigue donde estaba):', error);
        }
    }
    renderizarExportaciones();
}

async function descargarDelHistorial(exp) {
    let bytes = null;
    try {
        bytes = exp.guardado ? await leerArchivo(exp.id) : bytesAntiguos(exp);
    } catch (error) {
        return ayudas.mostrarToast('No se ha podido abrir el archivo');
    }
    if (!bytes) {
        exp.guardado = false;
        guardarExportaciones();
        renderizarExportaciones();
        return ayudas.mostrarToast('Este archivo ya no está disponible');
    }
    descargarArchivo(new Blob([bytes], { type: exp.mime }), exp.nombreArchivo);
    ayudas.mostrarToast('Archivo descargado');
}

export function renderizarExportaciones() {
    document.getElementById('num-archivos').textContent =
        `${exportaciones.length} ${exportaciones.length === 1 ? 'archivo exportado' : 'archivos exportados'}`;

    listaArchivos.innerHTML = '';
    if (exportaciones.length === 0) {
        listaArchivos.innerHTML = '<p class="estado-vacio">Todavía no has exportado ningún archivo.</p>';
        return;
    }

    exportaciones.forEach(exp => {
        const tipo = TIPOS[exp.tipo] || TIPOS.gastos;
        const disponible = estaDisponible(exp);
        const tamano = tamanoEnBytes(exp);
        listaArchivos.innerHTML += `
            <div class="archivo-fila">
                <span class="archivo-icono ${tipo.clase}">${ICONO_ARCHIVO}<em>${escaparHTML(exp.formato)}</em></span>
                <div class="archivo-info">
                    <b>${escaparHTML(exp.nombreArchivo)}</b>
                    <div class="archivo-meta">
                        <span class="pildora ${tipo.clase}">${tipo.etiqueta}</span>
                        <small>${formatoFechaHora(exp.fecha)}${disponible && tamano !== null ? ' · ' + formatoTamano(tamano) : ''}</small>
                    </div>
                </div>
                <div class="acciones-fila">
                    <button class="btn-editar btn-descargar-archivo" data-id="${exp.id}" title="${disponible ? 'Volver a descargar' : 'Archivo no disponible'}" ${disponible ? '' : 'disabled'}>${ICONO_DESCARGAR}</button>
                    <button class="btn-eliminar btn-eliminar-archivo" data-id="${exp.id}" title="Eliminar del registro">${ICONO_ELIMINAR}</button>
                </div>
            </div>`;
    });

    document.querySelectorAll('.btn-descargar-archivo').forEach(btn => {
        btn.addEventListener('click', function() {
            const exp = exportaciones.find(e => String(e.id) === this.getAttribute('data-id'));
            if (exp && estaDisponible(exp)) descargarDelHistorial(exp);
        });
    });

    document.querySelectorAll('.btn-eliminar-archivo').forEach(btn => {
        btn.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            exportaciones = exportaciones.filter(e => String(e.id) !== id);
            guardarExportaciones();
            borrarArchivo(id).catch(() => { /* sin IndexedDB no hay nada que borrar */ });
            renderizarExportaciones();
            ayudas.mostrarToast('Archivo eliminado del registro');
        });
    });
}

export function iniciarExportaciones(funcionesAyuda) {
    ayudas = funcionesAyuda;

    // Historial desplegable: cerrado hasta que se pulse la cabecera
    const contenedor = document.getElementById('contenedor-archivos');
    const flecha = document.getElementById('icono-flecha-archivos');
    document.getElementById('cabecera-archivos').addEventListener('click', () => {
        const abierto = contenedor.classList.toggle('abierto');
        flecha.style.transform = abierto ? 'rotate(180deg)' : 'rotate(0deg)';
    });
    renderizarExportaciones();
    trasladarArchivosAntiguos();
}
