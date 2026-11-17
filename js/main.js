// Arranque de la app: navegación entre pestañas, avisos, ventanas, menú de datos
// (exportar, copia de seguridad e importar) y conexión entre los módulos.

import { obtenerFechaHoy, descargarArchivo, formatoFechaES } from './utils.js?v=33';
import { bytesABase64, MIME_EXCEL } from './excel.js?v=33';
import { iniciarExportaciones, registrarExportacion } from './exportaciones.js?v=33';
import {
    iniciarInversiones, abrirFormularioInversion, obtenerInversiones, reemplazarInversiones,
    generarExcelInversiones, anadirInversiones, obtenerHistoricoValor, reemplazarHistoricoValor
} from './inversiones.js?v=33';
import { iniciarImportacionOrdenes, importarOrdenesDesdeArchivo, leerFilasArchivo, sonOrdenesDeBroker } from './importar-ordenes.js?v=33';
import { iniciarImportacionBanco, importarBancoDesdeFilas } from './importar-banco.js?v=33';
import { obtenerReglas, reemplazarReglas } from './reglas.js?v=33';
import { iniciarCopiaSeguridad, abrirModalCopia, esCopiaCifrada, pedirContrasenaYDescifrar } from './copia-seguridad.js?v=33';
import { obtenerCarteras, reemplazarCarteras } from './carteras.js?v=33';
import { obtenerValoraciones, reemplazarValoraciones } from './valoraciones.js?v=33';
import { iniciarAjustes, renderizarAjustes } from './ajustes.js?v=33';
import {
    iniciarGastos, abrirFormularioGasto, obtenerMovimientos, reemplazarMovimientos, anadirMovimientos,
    generarExcelGastos, renombrarCategoriaEnMovimientos, quitarApartadoDeMovimientos,
    obtenerPresupuestos, reemplazarPresupuestos, renderizarGastos
} from './gastos.js?v=33';
import { iniciarConfiguracion, obtenerConfiguracion, reemplazarConfiguracion } from './configuracion.js?v=33';
import { iniciarRecurrentes, obtenerRecurrentes, reemplazarRecurrentes, renderizarRecurrentes } from './recurrentes.js?v=33';
import { iniciarResumen, renderizarResumen, obtenerDatosResumen, reemplazarDatosResumen } from './resumen.js?v=33';
import { iniciarBloqueo } from './bloqueo.js?v=33';

// --- AVISOS (con opción de deshacer) ---

const toast = document.getElementById('toast-notificacion');
let temporizadorToast = null;

function mostrarToast(mensaje, opciones = {}) {
    clearTimeout(temporizadorToast);
    toast.querySelector('.toast-texto').textContent = mensaje;
    const boton = toast.querySelector('.toast-accion');
    boton.classList.toggle('oculto', !opciones.deshacer);
    boton.onclick = opciones.deshacer ? () => {
        opciones.deshacer();
        toast.classList.remove('mostrar');
        mostrarToast('Deshecho');
    } : null;
    toast.classList.add('mostrar');
    temporizadorToast = setTimeout(() => toast.classList.remove('mostrar'), opciones.deshacer ? 6000 : 2500);
}

// --- VENTANAS ---

function abrirModal(modal) {
    modal.classList.remove('oculto');
    document.body.classList.add('body-fijo');
}

function cerrarModal(modal) {
    modal.classList.add('oculto');
    if (document.querySelectorAll('.modal-overlay:not(.oculto)').length === 0) document.body.classList.remove('body-fijo');
}

// --- NAVEGACIÓN ENTRE PESTAÑAS ---

const SECCIONES = ['resumen', 'gastos', 'inversiones', 'archivos', 'ajustes'];
// Texto de "Exportar a Excel" en el menú de datos según la pestaña
const QUE_EXPORTA = {
    gastos: { titulo: 'Exportar a Excel (solo gastos)', detalle: 'Gastos (.xlsx)' },
    inversiones: { titulo: 'Exportar a Excel (solo inversiones)', detalle: 'Inversiones (.xlsx)' },
    archivos: { titulo: 'Exportar a Excel', detalle: 'Gastos e inversiones, dos archivos (.xlsx)' }
};
// Pantalla al abrir: la elegida en Ajustes o, por defecto, la última que se usó
const seccionInicio = localStorage.getItem('seccionInicio');
const seccionGuardada = SECCIONES.includes(seccionInicio) ? seccionInicio : localStorage.getItem('seccionActiva');
let seccionActiva = SECCIONES.includes(seccionGuardada) ? seccionGuardada : 'gastos';

// opciones.sinAnimacion: al terminar de deslizar con el dedo (la pestaña ya ha entrado)
function cambiarSeccion(seccion, opciones = {}) {
    const anterior = seccionActiva;
    seccionActiva = seccion;
    localStorage.setItem('seccionActiva', seccion);
    SECCIONES.forEach(s => document.getElementById(`seccion-${s}`).classList.toggle('oculto', s !== seccion));

    // La sección nueva entra desde el lado hacia el que se avanza
    if (anterior !== seccion && !opciones.sinAnimacion) {
        const elemento = document.getElementById(`seccion-${seccion}`);
        const clase = SECCIONES.indexOf(seccion) > SECCIONES.indexOf(anterior) ? 'entrar-derecha' : 'entrar-izquierda';
        elemento.classList.remove('entrar-derecha', 'entrar-izquierda');
        void elemento.offsetWidth;
        elemento.classList.add(clase);
    }
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('activo', btn.getAttribute('data-seccion') === seccion));

    // En Archivos y Ajustes no hay nada que añadir
    const btnFlotante = document.getElementById('btn-abrir-formulario');
    btnFlotante.classList.toggle('oculto', seccion === 'archivos' || seccion === 'ajustes');
    btnFlotante.title = seccion === 'inversiones' ? 'Nueva inversión' : 'Nuevo movimiento';
    document.getElementById('texto-btn-flotante').textContent = btnFlotante.title;
    const exportar = QUE_EXPORTA[seccion] || QUE_EXPORTA.gastos;
    document.getElementById('titulo-exportar').textContent = exportar.titulo;
    document.getElementById('texto-exportar-seccion').textContent = exportar.detalle;
    if (seccion === 'ajustes') intentar(() => { renderizarAjustes(); renderizarRecurrentes(); });
    if (seccion === 'resumen') intentar(renderizarResumen);
    cerrarMenuDatos();
    window.scrollTo(0, 0);
}

document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => cambiarSeccion(btn.getAttribute('data-seccion'))));

// --- MENÚ DE DATOS (botón opuesto al +): exportar, copia de seguridad e importar ---

const btnMenuDatos = document.getElementById('btn-menu-datos');
const menuDatos = document.getElementById('menu-datos');

function cerrarMenuDatos() {
    menuDatos.classList.add('oculto');
    btnMenuDatos.setAttribute('aria-expanded', 'false');
    btnMenuDatos.classList.remove('abierto');
}

btnMenuDatos.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrir = menuDatos.classList.contains('oculto');
    menuDatos.classList.toggle('oculto', !abrir);
    btnMenuDatos.setAttribute('aria-expanded', String(abrir));
    btnMenuDatos.classList.toggle('abierto', abrir);
});
menuDatos.querySelectorAll('.menu-opcion').forEach(opcion => opcion.addEventListener('click', cerrarMenuDatos));
document.addEventListener('click', (e) => {
    if (!menuDatos.classList.contains('oculto') && !menuDatos.contains(e.target)) cerrarMenuDatos();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMenuDatos(); });

// --- GESTOS EN EL MÓVIL ---

// Deslizar hacia abajo una ventana para cerrarla (igual que la X)
let arrastreVentana = null;

document.addEventListener('touchstart', e => {
    arrastreVentana = null;
    const contenido = e.target.closest('.modal-overlay:not(.oculto) .modal-contenido');
    if (!contenido || e.touches.length !== 1 || contenido.scrollTop > 0) return;
    if (e.target.closest('input, select, textarea')) return;
    arrastreVentana = { contenido, inicioY: e.touches[0].clientY, desplazamiento: 0, tiempo: Date.now(), activo: false };
}, { passive: true });

document.addEventListener('touchmove', e => {
    if (!arrastreVentana) return;
    const dy = e.touches[0].clientY - arrastreVentana.inicioY;
    if (!arrastreVentana.activo) {
        // Solo hacia abajo con la ventana en su parte superior; hacia arriba es scroll normal
        if (dy < -4 || arrastreVentana.contenido.scrollTop > 0) { arrastreVentana = null; return; }
        if (dy < 8) return;
        arrastreVentana.activo = true;
        arrastreVentana.contenido.style.transition = 'none';
    }
    arrastreVentana.desplazamiento = Math.max(0, dy);
    arrastreVentana.contenido.style.transform = `translateY(${arrastreVentana.desplazamiento}px)`;
    if (e.cancelable) e.preventDefault();
}, { passive: false });

document.addEventListener('touchend', () => {
    if (!arrastreVentana || !arrastreVentana.activo) { arrastreVentana = null; return; }
    const { contenido, desplazamiento, tiempo } = arrastreVentana;
    arrastreVentana = null;
    const rapido = desplazamiento > 50 && Date.now() - tiempo < 300;
    contenido.style.transition = 'transform 0.2s ease';
    if (desplazamiento > 110 || rapido) {
        contenido.style.transform = 'translateY(100%)';
        setTimeout(() => {
            const ventana = contenido.closest('.modal-overlay');
            const botonCerrar = ventana.querySelector('.btn-cerrar');
            if (botonCerrar) botonCerrar.click(); else cerrarModal(ventana);
            contenido.style.transform = '';
            contenido.style.transition = '';
        }, 180);
    } else {
        contenido.style.transform = '';
        setTimeout(() => { contenido.style.transition = ''; }, 200);
    }
});

// Deslizar hacia los lados para cambiar de pestaña. La pantalla sigue al dedo y la pestaña de al lado
// entra a la vez (a mitad del gesto se ven las dos). Sobre el selector de mes se cambia de mes.
//
// Mientras se arrastra, la pestaña que entra se pasa a una capa fija (.capa-deslizar) colocada al
// lado de la actual; al soltar se completa el cambio o se vuelve atrás, y la pestaña vuelve a su sitio.
const TRANSICION_DESLIZAR = 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)';
let deslizar = null; // { x, y, tiempo, horizontal, sentido, dx, actual, destino, entrante, capa, interior, hueco, animando }

function sePuedeDeslizarDesde(objetivo) {
    if (document.body.classList.contains('body-fijo') || document.documentElement.classList.contains('bloqueada')) return false;
    if (objetivo.closest('#zona-swipe-mes, input, select, textarea, .mov')) return false; // en un movimiento, deslizar muestra sus opciones
    const tabla = objetivo.closest('.tabla-contenedor');
    return !(tabla && tabla.scrollWidth > tabla.clientWidth); // tabla que se desplaza de lado
}

// Prepara la pestaña que entra (la siguiente si sentido = 1, la anterior si -1)
function prepararDeslizar(sentido) {
    deslizar.sentido = sentido;
    deslizar.actual = document.getElementById(`seccion-${seccionActiva}`);
    deslizar.actual.classList.remove('entrar-derecha', 'entrar-izquierda');
    deslizar.actual.style.transition = 'none';
    deslizar.destino = SECCIONES[SECCIONES.indexOf(seccionActiva) + sentido] || null;
    if (!deslizar.destino) return; // primera o última pestaña: solo se estira un poco

    if (deslizar.destino === 'ajustes') intentar(() => { renderizarAjustes(); renderizarRecurrentes(); });
    if (deslizar.destino === 'resumen') intentar(renderizarResumen);
    const entrante = document.getElementById(`seccion-${deslizar.destino}`);
    const hueco = document.createComment('pestaña');
    entrante.before(hueco);
    const capa = document.createElement('div');
    capa.className = 'capa-deslizar';
    const interior = document.createElement('div');
    interior.className = 'app-contenedor';
    interior.style.transition = 'none';
    interior.appendChild(entrante);
    capa.appendChild(interior);
    document.body.appendChild(capa);
    entrante.classList.remove('oculto', 'entrar-derecha', 'entrar-izquierda');
    Object.assign(deslizar, { entrante, hueco, capa, interior });
}

function pintarDeslizar(dx) {
    const x = deslizar.destino ? dx : dx / 4; // sin pestaña al lado, resistencia
    deslizar.actual.style.transform = `translateX(${x}px)`;
    if (deslizar.interior) deslizar.interior.style.transform = `translateX(${x + deslizar.sentido * window.innerWidth}px)`;
}

// Devuelve la pestaña que entraba a su sitio y quita la capa
function deshacerCapa(d, quedaVisible) {
    if (d.entrante) {
        d.hueco.replaceWith(d.entrante);
        d.entrante.classList.toggle('oculto', !quedaVisible);
        d.capa.remove();
    }
    d.actual.style.transform = '';
    d.actual.style.transition = '';
    Object.assign(d, { entrante: null, hueco: null, capa: null, interior: null });
}

document.addEventListener('touchstart', e => {
    if (deslizar && deslizar.animando) return;
    deslizar = null;
    if (e.touches.length !== 1 || !sePuedeDeslizarDesde(e.target)) return;
    deslizar = { x: e.touches[0].clientX, y: e.touches[0].clientY, tiempo: Date.now(), horizontal: null, dx: 0 };
}, { passive: true });

document.addEventListener('touchmove', e => {
    if (!deslizar || deslizar.animando) return;
    const dx = e.touches[0].clientX - deslizar.x;
    const dy = e.touches[0].clientY - deslizar.y;
    if (deslizar.horizontal === null) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        deslizar.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
        if (!deslizar.horizontal) { deslizar = null; return; } // es scroll vertical
        cerrarMenuDatos();
        prepararDeslizar(dx < 0 ? 1 : -1);
    }
    // Si el dedo vuelve y cruza el punto de partida, entra la pestaña del otro lado
    const sentido = dx < 0 ? 1 : -1;
    if (dx !== 0 && sentido !== deslizar.sentido) {
        deshacerCapa(deslizar, false);
        prepararDeslizar(sentido);
    }
    deslizar.dx = dx;
    pintarDeslizar(dx);
    if (e.cancelable) e.preventDefault(); // que la página no haga scroll mientras se desliza de lado
}, { passive: false });

function terminarDeslizar() {
    if (!deslizar || deslizar.animando) return;
    const d = deslizar;
    if (!d.horizontal) { deslizar = null; return; }
    d.animando = true;
    const ancho = window.innerWidth;
    const velocidad = Math.abs(d.dx) / Math.max(1, Date.now() - d.tiempo);
    // Se completa si se ha deslizado más de un tercio de la pantalla o con un gesto rápido
    const completar = !!d.destino && (Math.abs(d.dx) > ancho / 3 || (velocidad > 0.5 && Math.abs(d.dx) > 40));
    d.actual.style.transition = TRANSICION_DESLIZAR;
    if (d.interior) d.interior.style.transition = TRANSICION_DESLIZAR;
    d.actual.style.transform = completar ? `translateX(${-d.sentido * ancho}px)` : '';
    if (d.interior) d.interior.style.transform = completar ? 'translateX(0)' : `translateX(${d.sentido * ancho}px)`;

    setTimeout(() => {
        deshacerCapa(d, completar);
        if (completar) cambiarSeccion(d.destino, { sinAnimacion: true });
        deslizar = null;
    }, 290);
}
document.addEventListener('touchend', terminarDeslizar, { passive: true });
document.addEventListener('touchcancel', terminarDeslizar, { passive: true });

// --- DATOS DE TODA LA APP (copias de seguridad) ---

function obtenerDatosApp() {
    const { categorias, apartados } = obtenerConfiguracion();
    return {
        version: 2,
        movimientos: obtenerMovimientos(),
        inversiones: obtenerInversiones(),
        carteras: obtenerCarteras(),
        valoraciones: obtenerValoraciones(),
        categorias,
        apartados,
        presupuestos: obtenerPresupuestos(),
        recurrentes: obtenerRecurrentes(),
        historicoValor: obtenerHistoricoValor(),
        reglas: obtenerReglas(),
        ...obtenerDatosResumen()
    };
}

function restaurarCopia(datos) {
    if (Array.isArray(datos)) {
        // Copias muy antiguas: solo contienen los movimientos de gastos
        reemplazarMovimientos(datos, true);
    } else if (datos && Array.isArray(datos.movimientos)) {
        const copiaAntigua = !Array.isArray(datos.apartados);
        if (!copiaAntigua) reemplazarConfiguracion({ categorias: datos.categorias, apartados: datos.apartados });
        reemplazarPresupuestos(datos.presupuestos || {});
        reemplazarRecurrentes(datos.recurrentes || []);
        if (Array.isArray(datos.reglas)) reemplazarReglas(datos.reglas);
        reemplazarDatosResumen(datos);
        reemplazarCarteras(Array.isArray(datos.carteras) ? datos.carteras : []);
        reemplazarValoraciones(datos.valoraciones || {});
        reemplazarHistoricoValor(datos.historicoValor || []);
        reemplazarInversiones(Array.isArray(datos.inversiones) ? datos.inversiones : []);
        reemplazarMovimientos(datos.movimientos, copiaAntigua);
    } else {
        return alert('El archivo seleccionado no es válido.');
    }
    intentar(renderizarResumen);
    mostrarToast('Copia restaurada con éxito');
}

// --- EXPORTAR ---

// Descarga el archivo y lo deja anotado en la pestaña "Archivos" (texto o bytes)
function exportarYRegistrar({ contenido, mime, nombreArchivo, tipo, formato }) {
    descargarArchivo(new Blob([contenido], { type: mime }), nombreArchivo);
    const esBinario = contenido instanceof Uint8Array;
    registrarExportacion({
        nombreArchivo, tipo, formato, mime,
        contenido: esBinario ? bytesABase64(contenido) : contenido,
        codificacion: esBinario ? 'base64' : 'texto'
    });
}

const EXCELS = {
    gastos: { generar: () => generarExcelGastos(), nombre: 'TusGastos', vacio: 'No hay movimientos que exportar.', hecho: 'Gastos exportados' },
    inversiones: { generar: () => generarExcelInversiones(), nombre: 'TusInversiones', vacio: 'No hay inversiones que exportar.', hecho: 'Inversiones exportadas' }
};

function exportarExcel(tipo) {
    const excel = EXCELS[tipo].generar();
    if (!excel) return false;
    exportarYRegistrar({
        contenido: excel,
        mime: MIME_EXCEL,
        nombreArchivo: `${EXCELS[tipo].nombre}_${obtenerFechaHoy()}.xlsx`,
        tipo,
        formato: 'XLSX'
    });
    return true;
}

// Gastos: solo gastos · Inversiones: solo inversiones · Archivos: los dos Excel ·
// Resumen y Ajustes: los gastos, como hasta ahora
document.getElementById('btn-exportar').addEventListener('click', () => {
    if (seccionActiva === 'archivos') {
        const hechoGastos = exportarExcel('gastos');
        // Un pequeño margen entre las dos descargas para que el navegador del móvil no bloquee la segunda
        setTimeout(() => {
            const hechoInversiones = exportarExcel('inversiones');
            if (!hechoGastos && !hechoInversiones) return alert('No hay movimientos ni inversiones que exportar.');
            mostrarToast(hechoGastos && hechoInversiones ? 'Gastos e inversiones exportados' : hechoGastos ? 'Gastos exportados (no hay inversiones)' : 'Inversiones exportadas (no hay movimientos)');
        }, 800);
        return;
    }
    const tipo = seccionActiva === 'inversiones' ? 'inversiones' : 'gastos';
    if (!exportarExcel(tipo)) return alert(EXCELS[tipo].vacio);
    mostrarToast(EXCELS[tipo].hecho);
});

document.getElementById('btn-exportar-json').addEventListener('click', () => abrirModalCopia());

// --- IMPORTAR (copia de seguridad, extracto del banco u órdenes del bróker) ---

// CSV o Excel: con columna ISIN son órdenes del bróker; si no, el extracto del banco
async function importarTabla(archivo) {
    let filas;
    try {
        filas = await leerFilasArchivo(archivo);
    } catch (error) {
        return alert(`No se ha podido leer el archivo.\n\n${error.message}`);
    }
    if (sonOrdenesDeBroker(filas)) return importarOrdenesDesdeArchivo(archivo);
    importarBancoDesdeFilas(filas);
}

const inputArchivo = document.getElementById('input-archivo-json');
document.getElementById('btn-importar-json').addEventListener('click', () => inputArchivo.click());

inputArchivo.addEventListener('change', (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    const extension = archivo.name.split('.').pop().toLowerCase();
    if (extension === 'xls') {
        inputArchivo.value = '';
        return alert('Este formato de Excel antiguo (.xls) no se puede leer. Ábrelo y guárdalo como .xlsx o .csv.');
    }
    if (['csv', 'xlsx'].includes(extension)) {
        importarTabla(archivo).finally(() => { inputArchivo.value = ''; });
        return;
    }

    const lector = new FileReader();
    lector.onload = (e) => {
        inputArchivo.value = '';
        const texto = String(e.target.result || '').replace(/^﻿/, '').trim();
        // Un .txt puede ser una copia de seguridad (las del móvil se comparten como .txt) o órdenes del bróker
        if (extension === 'txt' && !texto.startsWith('{') && !texto.startsWith('[')) {
            importarTabla(archivo);
            return;
        }
        let datos;
        try {
            datos = JSON.parse(texto);
        } catch (error) {
            return alert('Error al leer el archivo de la copia de seguridad.');
        }
        if (esCopiaCifrada(datos)) pedirContrasenaYDescifrar(datos).then(descifrados => { if (descifrados) restaurarCopia(descifrados); });
        else restaurarCopia(datos);
    };
    lector.readAsText(archivo);
});

// --- BOTÓN + ---

document.getElementById('btn-abrir-formulario').addEventListener('click', () => {
    if (seccionActiva === 'inversiones') abrirFormularioInversion();
    else abrirFormularioGasto();
});

// --- ARRANQUE ---

// Si una parte falla al arrancar (p. ej. por un dato guardado incorrecto), el resto sigue funcionando
function intentar(funcion, nombre) {
    try {
        funcion();
    } catch (error) {
        console.error(`Error${nombre ? ` en ${nombre}` : ''}:`, error);
        if (nombre) mostrarToast(`No se ha podido cargar ${nombre}`);
    }
}

const comunes = { abrirModal, cerrarModal, mostrarToast, formatoFechaES };

intentar(() => iniciarConfiguracion({
    ...comunes,
    renombrarEnMovimientos: renombrarCategoriaEnMovimientos,
    quitarApartadoDeMovimientos,
    alCambiar: renderizarGastos
}), 'las categorías');
intentar(() => iniciarGastos({ ...comunes, alCambiar: () => { if (seccionActiva === 'resumen') intentar(renderizarResumen); } }), 'los gastos');
intentar(() => iniciarInversiones({ ...comunes, alCambiar: () => { if (seccionActiva === 'resumen') intentar(renderizarResumen); } }), 'las inversiones');
intentar(() => iniciarExportaciones({ mostrarToast }), 'los archivos');
intentar(() => iniciarImportacionOrdenes({ ...comunes, alImportar: () => cambiarSeccion('inversiones') }), 'la importación');
intentar(() => iniciarImportacionBanco({ ...comunes, alImportar: () => cambiarSeccion('gastos') }), 'la importación del banco');
intentar(() => iniciarCopiaSeguridad({ ...comunes, registrarExportacion, obtenerDatos: obtenerDatosApp }), 'las copias de seguridad');
intentar(() => iniciarResumen({ ...comunes, irA: cambiarSeccion }), 'el resumen');
intentar(() => iniciarRecurrentes({ mostrarToast, anadirGastos: anadirMovimientos, anadirInversiones }), 'los recurrentes');
intentar(() => iniciarAjustes({ ...comunes, obtenerDatos: obtenerDatosApp }), 'los ajustes');
intentar(() => iniciarBloqueo({ ...comunes }), 'el bloqueo');
cambiarSeccion(seccionActiva);
