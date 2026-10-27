import { descargarArchivo } from './utils.js?v=17';
import { base64ABytes } from './excel.js?v=17';

const ICONO_DESCARGAR = '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
const ICONO_ELIMINAR = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
const ICONO_ARCHIVO = '<svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 3 14 9 20 9"/></svg>';

const TIPOS = {
    gastos: { etiqueta: 'Gastos', clase: 'archivo-gastos' },
    inversiones: { etiqueta: 'Inversiones', clase: 'archivo-inversiones' },
    copia: { etiqueta: 'Gastos e inversiones', clase: 'archivo-copia' }
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

// Si la memoria del navegador se llena, se guarda el registro sin el contenido del archivo
function guardarExportaciones() {
    try {
        localStorage.setItem('exportaciones', JSON.stringify(exportaciones));
    } catch (error) {
        if (exportaciones[0]) exportaciones[0].contenido = null;
        try { localStorage.setItem('exportaciones', JSON.stringify(exportaciones)); } catch (e) { /* memoria llena */ }
    }
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

function bytesDelArchivo(exp) {
    return exp.codificacion === 'base64' ? base64ABytes(exp.contenido) : exp.contenido;
}

function formatoTamano(exp) {
    const bytes = new Blob([bytesDelArchivo(exp)]).size;
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function registrarExportacion({ nombreArchivo, tipo, formato, contenido, mime, codificacion = 'texto' }) {
    exportaciones.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        nombreArchivo,
        tipo,
        formato,
        fecha: new Date().toISOString(),
        contenido,
        codificacion,
        mime
    });
    guardarExportaciones();
    renderizarExportaciones();
}

export function renderizarExportaciones() {
    document.getElementById('num-archivos').textContent =
        `${exportaciones.length} ${exportaciones.length === 1 ? 'archivo exportado' : 'archivos exportados'}`;

    listaArchivos.innerHTML = '';
    if (exportaciones.length === 0) {
        listaArchivos.innerHTML = '<p class="estado-vacio">Todavía no has exportado ningún archivo. Usa Excel o Exportar en la parte superior.</p>';
        return;
    }

    exportaciones.forEach(exp => {
        const tipo = TIPOS[exp.tipo] || TIPOS.gastos;
        const disponible = !!exp.contenido;
        listaArchivos.innerHTML += `
            <div class="archivo-fila">
                <span class="archivo-icono ${tipo.clase}">${ICONO_ARCHIVO}<em>${escaparHTML(exp.formato)}</em></span>
                <div class="archivo-info">
                    <b>${escaparHTML(exp.nombreArchivo)}</b>
                    <div class="archivo-meta">
                        <span class="pildora ${tipo.clase}">${tipo.etiqueta}</span>
                        <small>${formatoFechaHora(exp.fecha)}${disponible ? ' · ' + formatoTamano(exp) : ''}</small>
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
            if (!exp || !exp.contenido) return;
            descargarArchivo(new Blob([bytesDelArchivo(exp)], { type: exp.mime }), exp.nombreArchivo);
            ayudas.mostrarToast('Archivo descargado');
        });
    });

    document.querySelectorAll('.btn-eliminar-archivo').forEach(btn => {
        btn.addEventListener('click', function() {
            exportaciones = exportaciones.filter(e => String(e.id) !== this.getAttribute('data-id'));
            guardarExportaciones();
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
}
