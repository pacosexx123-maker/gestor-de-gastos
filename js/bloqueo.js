// Bloqueo de la app con PIN y, si el dispositivo lo permite, Face ID / huella (WebAuthn).
// El PIN no se guarda: se guarda su huella (PBKDF2-SHA256 con sal). Es un bloqueo de
// privacidad para quien coja el móvil; los datos siguen en el navegador sin cifrar.
//
// localStorage 'bloqueo' = { sal, hash, iteraciones, credencial, minutos }

import { bytesABase64, base64ABytes } from './excel.js?v=23';

const ITERACIONES = 150000;
const $ = id => document.getElementById(id);
const pantalla = $('pantalla-bloqueo');
const modalPin = $('modal-pin');

let config = leerConfig();
let pinEscrito = '';
let fallos = 0;
let esperaHasta = 0;
let ocultaDesde = null;
let ayudas = {}; // abrirModal, cerrarModal, mostrarToast
let modoModal = 'activar'; // 'activar' | 'cambiar' | 'desactivar'

function leerConfig() {
    try {
        const datos = JSON.parse(localStorage.getItem('bloqueo') || 'null');
        return datos && datos.hash && datos.sal ? datos : null;
    } catch (error) {
        return null;
    }
}

function guardarConfig() {
    if (config) localStorage.setItem('bloqueo', JSON.stringify(config)); else localStorage.removeItem('bloqueo');
}

async function huellaPin(pin, sal, iteraciones) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: base64ABytes(sal), iterations: iteraciones, hash: 'SHA-256' }, base, 256);
    return bytesABase64(new Uint8Array(bits));
}

async function pinCorrecto(pin) {
    return !!config && (await huellaPin(pin, config.sal, config.iteraciones || ITERACIONES)) === config.hash;
}

async function biometriaDisponible() {
    try {
        return !!(window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable &&
            await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch (error) {
        return false;
    }
}

// --- PANTALLA DE BLOQUEO ---

function pintarPuntos() {
    $('bloqueo-puntos').innerHTML = Array.from({ length: Math.max(4, pinEscrito.length) }, (_, i) => `<span class="${i < pinEscrito.length ? 'lleno' : ''}"></span>`).join('');
}

function mostrarError(texto) {
    const error = $('bloqueo-error');
    error.textContent = texto;
    pantalla.classList.remove('temblar');
    void pantalla.offsetWidth;
    if (texto) pantalla.classList.add('temblar');
}

export function bloquear() {
    if (!config) return;
    document.documentElement.classList.add('bloqueada');
    pantalla.classList.remove('oculto');
    pinEscrito = '';
    pintarPuntos();
    mostrarError('');
    $('bloqueo-biometria').classList.toggle('oculto', !config.credencial);
}

function desbloquear() {
    document.documentElement.classList.remove('bloqueada');
    pantalla.classList.add('oculto');
    pinEscrito = '';
    fallos = 0;
}

async function comprobarPin() {
    if (Date.now() < esperaHasta) return mostrarError(`Demasiados intentos. Espera ${Math.ceil((esperaHasta - Date.now()) / 1000)} s.`);
    const pin = pinEscrito;
    if (await pinCorrecto(pin)) return desbloquear();
    fallos++;
    pinEscrito = '';
    pintarPuntos();
    if (fallos >= 5) {
        esperaHasta = Date.now() + 30000;
        fallos = 0;
        return mostrarError('Demasiados intentos. Espera 30 s.');
    }
    mostrarError('PIN incorrecto');
}

function pulsarTecla(tecla) {
    if (tecla === 'borrar') pinEscrito = pinEscrito.slice(0, -1);
    else if (pinEscrito.length < 8) pinEscrito += tecla;
    mostrarError('');
    pintarPuntos();
}

async function desbloquearConBiometria() {
    if (!config || !config.credencial) return;
    try {
        await navigator.credentials.get({
            publicKey: {
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                allowCredentials: [{ type: 'public-key', id: base64ABytes(config.credencial) }],
                userVerification: 'required',
                timeout: 60000
            }
        });
        desbloquear();
    } catch (error) {
        mostrarError('No se ha podido verificar. Usa tu PIN.');
    }
}

// --- AJUSTES: ACTIVAR, CAMBIAR Y DESACTIVAR ---

async function renderizarSeguridad() {
    const activo = !!config;
    $('seguridad-estado').textContent = activo ? 'Bloqueo con PIN activado' : 'Bloqueo con PIN desactivado';
    $('seguridad-detalle').textContent = activo
        ? 'La app pedirá el PIN al abrirse y al volver a ella.'
        : 'Pide un PIN (o Face ID / huella) al abrir la app, para que nadie que coja tu móvil vea tus datos.';
    $('btn-activar-pin').classList.toggle('oculto', activo);
    $('btn-cambiar-pin').classList.toggle('oculto', !activo);
    $('btn-desactivar-pin').classList.toggle('oculto', !activo);
    $('fila-tiempo-bloqueo').classList.toggle('oculto', !activo);
    $('ajuste-tiempo-bloqueo').value = String(activo ? (config.minutos || 0) : 0);

    const disponible = activo && await biometriaDisponible();
    $('fila-biometria').classList.toggle('oculto', !disponible);
    $('check-biometria').checked = !!(config && config.credencial);
}

function abrirModalPin(modo) {
    modoModal = modo;
    ['pin-actual', 'pin-nuevo', 'pin-repetir'].forEach(id => { $(id).value = ''; });
    $('grupo-pin-actual').classList.toggle('oculto', modo === 'activar');
    $('grupo-pin-nuevo').classList.toggle('oculto', modo === 'desactivar');
    $('titulo-modal-pin').textContent = modo === 'activar' ? 'Activar bloqueo con PIN' : modo === 'cambiar' ? 'Cambiar PIN' : 'Desactivar bloqueo';
    $('btn-guardar-pin').textContent = modo === 'desactivar' ? 'Desactivar' : 'Guardar PIN';
    $('error-pin').classList.add('oculto');
    ayudas.abrirModal(modalPin);
    setTimeout(() => $(modo === 'activar' ? 'pin-nuevo' : 'pin-actual').focus(), 150);
}

function errorModal(texto) {
    $('error-pin').textContent = texto;
    $('error-pin').classList.remove('oculto');
}

async function guardarPin(evento) {
    evento.preventDefault();
    if (!window.crypto || !crypto.subtle) return errorModal('Este navegador no permite el bloqueo. Abre la app desde su dirección https.');
    if (modoModal !== 'activar' && !(await pinCorrecto($('pin-actual').value))) return errorModal('El PIN actual no es correcto.');

    if (modoModal === 'desactivar') {
        config = null;
        guardarConfig();
        ayudas.cerrarModal(modalPin);
        renderizarSeguridad();
        return ayudas.mostrarToast('Bloqueo desactivado');
    }

    const nuevo = $('pin-nuevo').value;
    if (!/^\d{4,8}$/.test(nuevo)) return errorModal('El PIN debe tener entre 4 y 8 números.');
    if (nuevo !== $('pin-repetir').value) return errorModal('Los PIN no coinciden.');
    const sal = bytesABase64(crypto.getRandomValues(new Uint8Array(16)));
    config = {
        sal,
        hash: await huellaPin(nuevo, sal, ITERACIONES),
        iteraciones: ITERACIONES,
        credencial: config ? config.credencial : null,
        minutos: config ? config.minutos : 0
    };
    guardarConfig();
    ayudas.cerrarModal(modalPin);
    renderizarSeguridad();
    ayudas.mostrarToast(modoModal === 'activar' ? 'Bloqueo activado' : 'PIN cambiado');
}

async function alternarBiometria(activar) {
    if (!config) return;
    if (!activar) {
        config.credencial = null;
        guardarConfig();
        return ayudas.mostrarToast('Face ID / huella desactivado');
    }
    try {
        const credencial = await navigator.credentials.create({
            publicKey: {
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                rp: { name: 'Gestor de Gastos' },
                user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'gestor-de-gastos', displayName: 'Gestor de Gastos' },
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
                authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
                attestation: 'none',
                timeout: 60000
            }
        });
        config.credencial = bytesABase64(new Uint8Array(credencial.rawId));
        guardarConfig();
        ayudas.mostrarToast('Face ID / huella activado');
    } catch (error) {
        $('check-biometria').checked = false;
        ayudas.mostrarToast('No se ha podido activar Face ID / huella');
    }
}

export function iniciarBloqueo(funcionesAyuda) {
    ayudas = funcionesAyuda;

    // Teclado de la pantalla de bloqueo (también con el teclado físico)
    pantalla.querySelectorAll('[data-tecla]').forEach(btn => btn.addEventListener('click', () => {
        pulsarTecla(btn.getAttribute('data-tecla'));
    }));
    $('bloqueo-entrar').addEventListener('click', comprobarPin);
    $('bloqueo-biometria').addEventListener('click', desbloquearConBiometria);
    document.addEventListener('keydown', (e) => {
        if (pantalla.classList.contains('oculto')) return;
        if (/^\d$/.test(e.key)) pulsarTecla(e.key);
        if (e.key === 'Backspace') pulsarTecla('borrar');
        if (e.key === 'Enter') comprobarPin();
    });

    // Ajustes
    $('btn-activar-pin').addEventListener('click', () => abrirModalPin('activar'));
    $('btn-cambiar-pin').addEventListener('click', () => abrirModalPin('cambiar'));
    $('btn-desactivar-pin').addEventListener('click', () => abrirModalPin('desactivar'));
    $('formulario-pin').addEventListener('submit', guardarPin);
    $('btn-cerrar-pin').addEventListener('click', () => ayudas.cerrarModal(modalPin));
    modalPin.addEventListener('click', (e) => { if (e.target === modalPin) ayudas.cerrarModal(modalPin); });
    $('check-biometria').addEventListener('change', (e) => alternarBiometria(e.target.checked));
    $('ajuste-tiempo-bloqueo').addEventListener('change', (e) => {
        if (!config) return;
        config.minutos = Number(e.target.value);
        guardarConfig();
    });

    // Volver a bloquear al volver a la app tras el tiempo elegido
    document.addEventListener('visibilitychange', () => {
        if (!config) return;
        if (document.hidden) { ocultaDesde = Date.now(); return; }
        if (ocultaDesde !== null && Date.now() - ocultaDesde >= (config.minutos || 0) * 60000) bloquear();
        ocultaDesde = null;
    });

    renderizarSeguridad();
    if (config) bloquear(); else document.documentElement.classList.remove('bloqueada');
}
