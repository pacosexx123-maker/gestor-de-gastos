// Copias de seguridad: cifrado con contraseña (AES-GCM + PBKDF2, con la Web Crypto del
// propio navegador), aviso periódico y envío con el menú de compartir del móvil.
// Los datos solo salen del dispositivo cifrados y por la app que elija el usuario.

import { obtenerFechaHoy, descargarArchivo } from './utils.js?v=20';
import { bytesABase64, base64ABytes } from './excel.js?v=20';

const FORMATO_CIFRADO = 'gestor-gastos-cifrado';
const ITERACIONES = 310000;
const UN_DIA = 86400000;

const modalCopia = document.getElementById('modal-copia');
const formularioCopia = document.getElementById('formulario-copia');
const avisoCopia = document.getElementById('aviso-copia');
const checkCifrar = document.getElementById('copia-cifrar');
const grupoContrasena = document.getElementById('grupo-contrasena');
const inputContrasena = document.getElementById('copia-contrasena');
const inputContrasena2 = document.getElementById('copia-contrasena-2');
const checkRecordar = document.getElementById('copia-recordar');
const selectFrecuencia = document.getElementById('copia-frecuencia');
const btnGenerar = document.getElementById('btn-generar-copia');
const btnCompartir = document.getElementById('btn-compartir-copia');
const textoUltimaCopia = document.getElementById('texto-ultima-copia');

const modalContrasena = document.getElementById('modal-contrasena');
const inputRestaurar = document.getElementById('restaurar-contrasena');
const errorContrasena = document.getElementById('error-contrasena');
const btnRestaurar = document.getElementById('btn-restaurar-copia');

let ayudas = {}; // abrirModal, cerrarModal, mostrarToast, obtenerDatos, registrarExportacion (vienen de main.js)
let abiertoComoRecordatorio = false;
let archivoPreparado = null;   // copia lista tras pedir un segundo toque
let copiaAnticipada = null;    // copia cifrada por adelantado: { clave, promesa, resultado }
let temporizadorPreparar = null;

function leer(clave) {
    try { return localStorage.getItem(clave); } catch (error) { return null; }
}
function escribir(clave, valor) {
    try { valor === null ? localStorage.removeItem(clave) : localStorage.setItem(clave, valor); } catch (error) { /* sin memoria */ }
}

function diasRecordatorio() {
    const guardado = leer('diasRecordatorio');
    return guardado === null ? 7 : Number(guardado);
}

function diasDesdeUltimaCopia() {
    const ultima = leer('ultimaCopia');
    return ultima ? Math.floor((Date.now() - new Date(ultima).getTime()) / UN_DIA) : null;
}

// --- CIFRADO ---

async function derivarClave(contrasena, sal, iteraciones) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(contrasena), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: sal, iterations: iteraciones, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
}

async function cifrar(texto, contrasena) {
    const sal = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const clave = await derivarClave(contrasena, sal, ITERACIONES);
    const datos = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, new TextEncoder().encode(texto)));
    return {
        formato: FORMATO_CIFRADO,
        version: 1,
        algoritmo: 'AES-GCM-256',
        derivacion: 'PBKDF2-SHA256',
        iteraciones: ITERACIONES,
        fecha: new Date().toISOString(),
        sal: bytesABase64(sal),
        iv: bytesABase64(iv),
        datos: bytesABase64(datos)
    };
}

async function descifrar(copia, contrasena) {
    const clave = await derivarClave(contrasena, base64ABytes(copia.sal), copia.iteraciones || ITERACIONES);
    const datos = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ABytes(copia.iv) }, clave, base64ABytes(copia.datos));
    return JSON.parse(new TextDecoder().decode(datos));
}

export function esCopiaCifrada(datos) {
    return !!datos && datos.formato === FORMATO_CIFRADO;
}

// --- CREAR Y ENVIAR LA COPIA ---

function actualizarFormulario() {
    grupoContrasena.classList.toggle('oculto', !checkCifrar.checked);
    inputContrasena.required = checkCifrar.checked;
    inputContrasena2.required = checkCifrar.checked;

    const dias = diasDesdeUltimaCopia();
    textoUltimaCopia.textContent = dias === null
        ? 'Aún no has hecho ninguna copia'
        : `Última copia: ${dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`}`;
}

export function abrirModalCopia(comoRecordatorio = false) {
    abiertoComoRecordatorio = comoRecordatorio;
    archivoPreparado = null;
    copiaAnticipada = null; // los datos pueden haber cambiado desde la última vez
    btnCompartir.classList.add('oculto');
    btnGenerar.classList.remove('oculto');
    btnGenerar.disabled = false;

    const recordada = leer('contrasenaCopia');
    inputContrasena.value = recordada || '';
    inputContrasena2.value = recordada || '';
    checkRecordar.checked = recordada !== null;
    selectFrecuencia.value = String(diasRecordatorio());

    const dias = diasDesdeUltimaCopia();
    avisoCopia.classList.toggle('oculto', !comoRecordatorio);
    avisoCopia.textContent = dias === null
        ? 'Todavía no has hecho ninguna copia de seguridad. Envíatela por correo para no perder tus datos si le pasa algo al móvil.'
        : `Han pasado ${dias} días desde tu última copia de seguridad. Envíatela por correo para tenerla a salvo.`;

    const movil = window.matchMedia('(pointer: coarse)').matches;
    btnGenerar.textContent = movil ? 'Enviar copia de seguridad' : 'Descargar copia de seguridad';

    actualizarFormulario();
    ayudas.abrirModal(modalCopia);
    prepararPorAdelantado();
}

function cerrarModalCopia() {
    // Cerrar el aviso con la cruz lo pospone hasta mañana
    if (abiertoComoRecordatorio) {
        escribir('recordatorioPospuesto', new Date().toISOString());
        ayudas.mostrarToast('Te lo recordaré mañana');
    }
    abiertoComoRecordatorio = false;
    ayudas.cerrarModal(modalCopia);
}

function copiaCompletada({ archivo, contenido, formato }) {
    escribir('ultimaCopia', new Date().toISOString());
    escribir('recordatorioPospuesto', null);
    ayudas.registrarExportacion({ nombreArchivo: archivo.name, tipo: 'copia', formato, contenido, mime: 'application/json', codificacion: 'texto' });
    abiertoComoRecordatorio = false;
    copiaAnticipada = null;
    ayudas.cerrarModal(modalCopia);
    ayudas.mostrarToast('Copia de seguridad guardada');
}

function textoBotonGenerar() {
    return window.matchMedia('(pointer: coarse)').matches ? 'Enviar copia de seguridad' : 'Descargar copia de seguridad';
}

// En el móvil se comparte como .txt: es el tipo de archivo que admiten todos los menús de compartir
// (Chrome en Android no deja compartir .json). Al importar, la app la reconoce igual.
function crearArchivos(contenido, base) {
    return {
        descarga: new File([contenido], `${base}.json`, { type: 'application/json' }),
        compartir: new File([contenido], `${base}.txt`, { type: 'text/plain' })
    };
}

async function crearCopia(cifrada, contrasena) {
    const datos = ayudas.obtenerDatos();
    const fecha = obtenerFechaHoy();
    if (cifrada) {
        const contenido = JSON.stringify(await cifrar(JSON.stringify(datos), contrasena));
        return { contenido, formato: 'CIFRADA', ...crearArchivos(contenido, `copia_cifrada_${fecha}`) };
    }
    const contenido = JSON.stringify(datos, null, 2);
    return { contenido, formato: 'JSON', ...crearArchivos(contenido, `backup_gastos_${fecha}`) };
}

function claveCopia() {
    return checkCifrar.checked ? `cifrada|${inputContrasena.value}` : 'sin-cifrar';
}

function contrasenaValida() {
    return !checkCifrar.checked || (inputContrasena.value.length >= 6 && inputContrasena.value === inputContrasena2.value);
}

// Cifrar lleva un momento; se hace antes de pulsar "Enviar" para que el menú de compartir
// se abra en el mismo toque (los móviles solo lo permiten justo al tocar)
function prepararPorAdelantado() {
    clearTimeout(temporizadorPreparar);
    temporizadorPreparar = setTimeout(() => {
        if (modalCopia.classList.contains('oculto') || !contrasenaValida()) return;
        if (!window.crypto || !crypto.subtle) return;
        const clave = claveCopia();
        if (copiaAnticipada && copiaAnticipada.clave === clave) return;
        const anticipada = { clave, resultado: null };
        anticipada.promesa = crearCopia(checkCifrar.checked, inputContrasena.value)
            .then(copia => { anticipada.resultado = copia; return copia; })
            .catch(() => null);
        copiaAnticipada = anticipada;
    }, 300);
}

function mostrarSegundoToque(copia) {
    archivoPreparado = copia;
    btnGenerar.classList.add('oculto');
    btnCompartir.classList.remove('oculto');
}

async function entregar(copia) {
    const compartirDisponible = window.matchMedia('(pointer: coarse)').matches &&
        !!navigator.share && !!navigator.canShare && navigator.canShare({ files: [copia.compartir] });

    if (!compartirDisponible) {
        descargarArchivo(copia.descarga, copia.descarga.name);
        return copiaCompletada({ archivo: copia.descarga, contenido: copia.contenido, formato: copia.formato });
    }
    try {
        await navigator.share({
            files: [copia.compartir],
            title: 'Copia de seguridad',
            text: `Copia de seguridad de Gestor de Gastos (${obtenerFechaHoy()})`
        });
        copiaCompletada({ archivo: copia.compartir, contenido: copia.contenido, formato: copia.formato });
    } catch (error) {
        if (error.name === 'AbortError') return ayudas.mostrarToast('Copia no enviada');
        // El móvil pide tocar otra vez (ha pasado demasiado tiempo desde el toque)
        if (error.name === 'NotAllowedError' && archivoPreparado !== copia) return mostrarSegundoToque(copia);
        // Último recurso: descargar el archivo
        descargarArchivo(copia.descarga, copia.descarga.name);
        copiaCompletada({ archivo: copia.descarga, contenido: copia.contenido, formato: copia.formato });
        alert(`No se ha podido abrir el menú de compartir (${error.message || error.name}). La copia se ha descargado en el dispositivo.`);
    }
}

async function generarCopia(evento) {
    evento.preventDefault();
    const datos = ayudas.obtenerDatos();
    if (datos.movimientos.length === 0 && datos.inversiones.length === 0) return alert('No hay datos que guardar.');

    if (checkCifrar.checked) {
        if (inputContrasena.value.length < 6) return alert('La contraseña debe tener al menos 6 caracteres.');
        if (inputContrasena.value !== inputContrasena2.value) return alert('Las contraseñas no coinciden.');
        if (!window.crypto || !crypto.subtle) return alert('Este navegador no permite cifrar. Abre la app desde su dirección https.');
        escribir('contrasenaCopia', checkRecordar.checked ? inputContrasena.value : null);
    }

    try {
        // Copia ya cifrada por adelantado: se comparte en este mismo toque
        if (copiaAnticipada && copiaAnticipada.clave === claveCopia() && copiaAnticipada.resultado) {
            return await entregar(copiaAnticipada.resultado);
        }

        btnGenerar.disabled = true;
        btnGenerar.textContent = checkCifrar.checked ? 'Cifrando...' : 'Preparando...';
        let copia = null;
        if (copiaAnticipada && copiaAnticipada.clave === claveCopia()) copia = await copiaAnticipada.promesa;
        if (!copia) copia = await crearCopia(checkCifrar.checked, inputContrasena.value);
        btnGenerar.disabled = false;
        btnGenerar.textContent = textoBotonGenerar();

        // Ha habido que esperar: en el móvil se pide un segundo toque para abrir el menú de compartir
        if (window.matchMedia('(pointer: coarse)').matches && navigator.share) return mostrarSegundoToque(copia);
        await entregar(copia);
    } catch (error) {
        btnGenerar.disabled = false;
        btnGenerar.textContent = textoBotonGenerar();
        alert(`No se ha podido crear la copia de seguridad: ${error.message || error}`);
    }
}

// --- RESTAURAR UNA COPIA CIFRADA ---

// Pide la contraseña y devuelve los datos descifrados (o null si se cancela)
export function pedirContrasenaYDescifrar(copia) {
    return new Promise(resolver => {
        inputRestaurar.value = leer('contrasenaCopia') || '';
        errorContrasena.classList.add('oculto');
        ayudas.abrirModal(modalContrasena);
        setTimeout(() => inputRestaurar.focus(), 100);

        const terminar = resultado => {
            btnRestaurar.removeEventListener('click', intentar);
            inputRestaurar.removeEventListener('keydown', alPulsarTecla);
            document.getElementById('btn-cerrar-contrasena').removeEventListener('click', cancelar);
            ayudas.cerrarModal(modalContrasena);
            resolver(resultado);
        };
        const cancelar = () => terminar(null);
        const alPulsarTecla = e => { if (e.key === 'Enter') intentar(); };
        async function intentar() {
            if (!inputRestaurar.value) return;
            btnRestaurar.disabled = true;
            btnRestaurar.textContent = 'Descifrando...';
            try {
                terminar(await descifrar(copia, inputRestaurar.value));
            } catch (error) {
                errorContrasena.classList.remove('oculto');
            } finally {
                btnRestaurar.disabled = false;
                btnRestaurar.textContent = 'Restaurar copia';
            }
        }

        btnRestaurar.addEventListener('click', intentar);
        inputRestaurar.addEventListener('keydown', alPulsarTecla);
        document.getElementById('btn-cerrar-contrasena').addEventListener('click', cancelar);
    });
}

// --- AVISO PERIÓDICO ---

function comprobarRecordatorio() {
    const dias = diasRecordatorio();
    if (dias === 0) return;
    const datos = ayudas.obtenerDatos();
    if (datos.movimientos.length === 0 && datos.inversiones.length === 0) return;

    const desde = diasDesdeUltimaCopia();
    if (desde !== null && desde < dias) return;

    const pospuesto = leer('recordatorioPospuesto');
    if (pospuesto && Date.now() - new Date(pospuesto).getTime() < UN_DIA) return;

    if (document.querySelectorAll('.modal-overlay:not(.oculto)').length === 0) abrirModalCopia(true);
}

export function iniciarCopiaSeguridad(funcionesAyuda) {
    ayudas = funcionesAyuda;

    checkCifrar.addEventListener('change', () => { actualizarFormulario(); prepararPorAdelantado(); });
    inputContrasena.addEventListener('input', prepararPorAdelantado);
    inputContrasena2.addEventListener('input', prepararPorAdelantado);
    selectFrecuencia.addEventListener('change', () => escribir('diasRecordatorio', selectFrecuencia.value));
    formularioCopia.addEventListener('submit', generarCopia);
    btnCompartir.addEventListener('click', () => { if (archivoPreparado) entregar(archivoPreparado); });
    document.getElementById('btn-cerrar-copia').addEventListener('click', cerrarModalCopia);
    modalCopia.addEventListener('click', (e) => { if (e.target === modalCopia) cerrarModalCopia(); });

    setTimeout(comprobarRecordatorio, 1200);
}

// --- PARA LA PANTALLA DE AJUSTES ---

export function hayContrasenaGuardada() {
    return leer('contrasenaCopia') !== null;
}

// null la olvida; un texto la guarda para las próximas copias
export function guardarContrasenaCopia(contrasena) {
    escribir('contrasenaCopia', contrasena);
}

export function obtenerDiasRecordatorio() {
    return diasRecordatorio();
}

export function fijarDiasRecordatorio(dias) {
    escribir('diasRecordatorio', String(dias));
}

export function describirUltimaCopia() {
    const dias = diasDesdeUltimaCopia();
    if (dias === null) return 'Aún no has hecho ninguna copia';
    return `Última copia: ${dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`}`;
}
