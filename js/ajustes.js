// Pantalla de Ajustes: tema, copia de seguridad, pantalla de inicio y datos guardados.

import {
    abrirModalCopia, hayContrasenaGuardada, guardarContrasenaCopia,
    obtenerDiasRecordatorio, fijarDiasRecordatorio, describirUltimaCopia
} from './copia-seguridad.js?v=19';
import { formatoNumero } from './utils.js?v=19';

const TEMAS = ['sistema', 'claro', 'oscuro'];
const CLAVES_DATOS = ['gastos', 'inversiones', 'carteras', 'valoraciones', 'exportaciones', 'ultimaCopia', 'recordatorioPospuesto',
    'contrasenaCopia', 'diasRecordatorio', 'seccionActiva', 'seccionInicio', 'modoDistribucion'];

let ayudas = {}; // mostrarToast, obtenerDatos (vienen de main.js)

function leer(clave) {
    try { return localStorage.getItem(clave); } catch (error) { return null; }
}
function escribir(clave, valor) {
    try { valor === null ? localStorage.removeItem(clave) : localStorage.setItem(clave, valor); } catch (error) { /* sin memoria */ }
}

// --- TEMA ---

export function aplicarTema(tema) {
    const raiz = document.documentElement;
    if (tema === 'claro') raiz.setAttribute('data-theme', 'light');
    else if (tema === 'oscuro') raiz.setAttribute('data-theme', 'dark');
    else raiz.removeAttribute('data-theme');

    // Color de la barra del navegador / del sistema en el móvil
    const fondo = getComputedStyle(document.body).backgroundColor;
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
        if (tema === 'sistema') meta.setAttribute('content', meta.getAttribute('data-original') || meta.getAttribute('content'));
        else meta.setAttribute('content', fondo);
    });
}

function temaGuardado() {
    const tema = leer('tema');
    return TEMAS.includes(tema) ? tema : 'sistema';
}

// --- PINTAR LA PANTALLA ---

function marcarOpcion(grupo, valor) {
    document.querySelectorAll(`[data-grupo="${grupo}"] button`).forEach(btn => {
        const activo = btn.getAttribute('data-valor') === valor;
        btn.classList.toggle('activo', activo);
        btn.setAttribute('aria-pressed', activo);
    });
}

function formatoTamano(bytes) {
    return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${formatoNumero(bytes / 1024, 1)} KB` : `${formatoNumero(bytes / 1048576, 2)} MB`;
}

export function renderizarAjustes() {
    marcarOpcion('tema', temaGuardado());
    marcarOpcion('inicio', leer('seccionInicio') || 'ultima');

    // Copia de seguridad
    document.getElementById('ajuste-ultima-copia').textContent = describirUltimaCopia();
    document.getElementById('ajuste-estado-contrasena').textContent = hayContrasenaGuardada()
        ? 'Guardada en este móvil: las copias se cifran sin tener que escribirla'
        : 'No guardada: se pedirá cada vez que hagas una copia';
    document.getElementById('btn-olvidar-contrasena').classList.toggle('oculto', !hayContrasenaGuardada());
    document.getElementById('ajuste-frecuencia').value = String(obtenerDiasRecordatorio());

    // Datos guardados
    const datos = ayudas.obtenerDatos();
    let exportaciones = [];
    try { exportaciones = JSON.parse(leer('exportaciones') || '[]'); } catch (error) { /* sin datos */ }
    let bytes = 0;
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const clave = localStorage.key(i);
            bytes += (clave.length + (localStorage.getItem(clave) || '').length) * 2;
        }
    } catch (error) { /* sin acceso */ }
    const contar = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;
    document.getElementById('ajuste-resumen-datos').textContent = [
        contar(datos.movimientos.length, 'movimiento', 'movimientos'),
        contar(datos.inversiones.length, 'inversión', 'inversiones'),
        contar(datos.carteras.length, 'cartera', 'carteras'),
        contar(exportaciones.length, 'archivo', 'archivos')
    ].join(' · ');
    document.getElementById('ajuste-espacio').textContent = `Ocupan ${formatoTamano(bytes)} en este dispositivo`;
    comprobarProteccion();
}

// ¿El navegador garantiza que no borrará los datos aunque falte espacio o pase tiempo sin abrir la app?
async function comprobarProteccion() {
    const titulo = document.getElementById('ajuste-proteccion');
    const detalle = document.getElementById('ajuste-proteccion-detalle');
    let protegido = false;
    try {
        if (navigator.storage && navigator.storage.persisted) {
            protegido = await navigator.storage.persisted();
            if (!protegido && navigator.storage.persist) protegido = await navigator.storage.persist();
        }
    } catch (error) { /* navegador sin esta opción */ }
    const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    titulo.textContent = protegido ? 'Datos protegidos frente al borrado' : 'Protección de los datos';
    detalle.textContent = protegido
        ? 'El navegador no borrará tus datos automáticamente.'
        : instalada
            ? 'Al estar instalada en la pantalla de inicio, el riesgo de borrado es bajo. Haz copias de seguridad de vez en cuando.'
            : 'Instala la app en la pantalla de inicio (Compartir → Añadir a pantalla de inicio) para que el navegador no borre tus datos, y haz copias de seguridad.';
}

// --- ACCIONES ---

function cambiarContrasena() {
    const nueva = document.getElementById('ajuste-contrasena-nueva');
    const repetida = document.getElementById('ajuste-contrasena-repetir');
    if (nueva.value.length < 6) return alert('La contraseña debe tener al menos 6 caracteres.');
    if (nueva.value !== repetida.value) return alert('Las contraseñas no coinciden.');
    guardarContrasenaCopia(nueva.value);
    nueva.value = '';
    repetida.value = '';
    renderizarAjustes();
    ayudas.mostrarToast('Contraseña guardada');
}

function borrarTodo() {
    if (!confirm('¿Borrar TODOS los datos de la app en este dispositivo? Gastos, inversiones, carteras y archivos exportados.\n\nAntes de seguir, asegúrate de tener una copia de seguridad.')) return;
    const confirmacion = prompt('Para confirmar, escribe BORRAR:');
    if (!confirmacion || confirmacion.trim().toUpperCase() !== 'BORRAR') return ayudas.mostrarToast('No se ha borrado nada');
    CLAVES_DATOS.forEach(clave => escribir(clave, null));
    location.reload();
}

export function iniciarAjustes(funcionesAyuda) {
    ayudas = funcionesAyuda;

    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.setAttribute('data-original', meta.getAttribute('content')));
    aplicarTema(temaGuardado());

    document.querySelectorAll('[data-grupo="tema"] button').forEach(btn => {
        btn.addEventListener('click', () => {
            const tema = btn.getAttribute('data-valor');
            escribir('tema', tema === 'sistema' ? null : tema);
            aplicarTema(tema);
            marcarOpcion('tema', tema);
        });
    });

    document.querySelectorAll('[data-grupo="inicio"] button').forEach(btn => {
        btn.addEventListener('click', () => {
            const valor = btn.getAttribute('data-valor');
            escribir('seccionInicio', valor === 'ultima' ? null : valor);
            marcarOpcion('inicio', valor);
            ayudas.mostrarToast('Se aplicará la próxima vez que abras la app');
        });
    });

    document.getElementById('ajuste-frecuencia').addEventListener('change', (e) => {
        fijarDiasRecordatorio(e.target.value);
        ayudas.mostrarToast('Recordatorio actualizado');
    });
    document.getElementById('btn-cambiar-contrasena').addEventListener('click', cambiarContrasena);
    document.getElementById('btn-olvidar-contrasena').addEventListener('click', () => {
        guardarContrasenaCopia(null);
        renderizarAjustes();
        ayudas.mostrarToast('Contraseña olvidada en este móvil');
    });
    document.getElementById('btn-copia-ahora').addEventListener('click', () => abrirModalCopia());
    document.getElementById('btn-borrar-todo').addEventListener('click', borrarTodo);

    renderizarAjustes();
}
