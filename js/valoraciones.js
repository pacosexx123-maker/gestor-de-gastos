// Valor actual de cada activo (o de una cartera entera) para calcular la rentabilidad.
// Lo introduce el usuario (p. ej. copiándolo de su bróker): no se consulta ningún
// servicio externo, así ningún dato sale del dispositivo.
//
// valoraciones = { [clave]: { tipo: 'precio' | 'total' | 'rentabilidad', valor, fecha } }
//   'precio'       -> precio actual por título (valor = títulos × precio)
//   'total'        -> valor total actual de la posición
//   'rentabilidad' -> % de rentabilidad (valor = invertido × (1 + %/100)); se guarda el %,
//                     así las aportaciones nuevas no aparecen como pérdida

import { formatoNumero, formatoEuros, formatoDecimalVariable } from './utils.js?v=24';

const modalValor = document.getElementById('modal-valor');
const tituloValor = document.getElementById('valor-titulo');
const resumenValor = document.getElementById('valor-resumen');
const inputValor = document.getElementById('valor-importe');
const etiquetaValor = document.getElementById('valor-etiqueta');
const vistaPrevia = document.getElementById('valor-vista-previa');
const grupoModo = document.getElementById('valor-modo');
const btnQuitar = document.getElementById('btn-quitar-valor');

let valoraciones = cargar();
let editando = null; // { clave, nombre, coste, participaciones }
let modo = 'precio';
let ayudas = {}; // abrirModal, cerrarModal, mostrarToast, alCambiar, formatoFechaES

function cargar() {
    try {
        const guardadas = JSON.parse(localStorage.getItem('valoraciones') || '{}');
        return guardadas && typeof guardadas === 'object' && !Array.isArray(guardadas) ? guardadas : {};
    } catch (error) {
        return {};
    }
}

function guardar() {
    localStorage.setItem('valoraciones', JSON.stringify(valoraciones));
    ayudas.alCambiar();
}

export function obtenerValoraciones() {
    return valoraciones;
}

export function reemplazarValoraciones(datos) {
    valoraciones = datos && typeof datos === 'object' && !Array.isArray(datos) ? datos : {};
    localStorage.setItem('valoraciones', JSON.stringify(valoraciones));
}

// Valor actual de una posición, o null si no está valorada
export function valorActual(clave, participaciones, coste) {
    const v = valoraciones[clave];
    if (!v || !isFinite(parseFloat(v.valor))) return null;
    const valor = parseFloat(v.valor);
    if (v.tipo === 'rentabilidad') return coste > 0 && valor > -100 ? coste * (1 + valor / 100) : null;
    if (valor < 0) return null;
    if (v.tipo === 'precio') return participaciones > 0 ? participaciones * valor : null;
    return valor;
}

export function precioActual(clave) {
    const v = valoraciones[clave];
    return v && v.tipo === 'precio' ? parseFloat(v.valor) : null;
}

export function fechaValoracion(clave) {
    const v = valoraciones[clave];
    return v ? v.fecha : null;
}

// { valor, ganancia, porcentaje } a partir de lo invertido y el valor actual
export function rentabilidad(coste, valor) {
    if (valor === null || valor === undefined || !(coste > 0)) return null;
    const ganancia = valor - coste;
    return { valor, ganancia, porcentaje: (ganancia / coste) * 100 };
}

export function formatoRentabilidad(r, conEuros = false) {
    const signo = r.ganancia > 0.005 ? '+' : r.ganancia < -0.005 ? '−' : '';
    const porcentaje = `${signo}${formatoNumero(Math.abs(r.porcentaje))}%`;
    return conEuros ? `${signo}${formatoEuros(Math.abs(r.ganancia))} · ${porcentaje}` : porcentaje;
}

export function claseRentabilidad(r) {
    return r.ganancia > 0.005 ? 'positiva' : r.ganancia < -0.005 ? 'negativa' : 'neutra';
}

// --- VENTANA PARA INTRODUCIR EL VALOR ACTUAL ---

function fijarModo(nuevo) {
    modo = nuevo;
    grupoModo.querySelectorAll('button').forEach(btn => {
        const activo = btn.getAttribute('data-valor') === modo;
        btn.classList.toggle('activo', activo);
        btn.setAttribute('aria-pressed', activo);
    });
    const textos = {
        precio: ['Precio actual por título (€)', '0.00'],
        total: ['Valor total actual (€)', '0.00'],
        rentabilidad: ['Rentabilidad actual (%)', 'Ej. 5.3 o -2.1']
    };
    [etiquetaValor.textContent, inputValor.placeholder] = textos[modo];
    // La rentabilidad puede ser negativa; precio y valor no
    if (modo === 'rentabilidad') inputValor.removeAttribute('min'); else inputValor.setAttribute('min', '0');
    actualizarVistaPrevia();
}

function numeroValido(numero) {
    return modo === 'rentabilidad' ? isFinite(numero) && numero > -100 : numero >= 0;
}

function valorIntroducido() {
    const numero = parseFloat(String(inputValor.value).replace(',', '.'));
    if (!numeroValido(numero)) return null;
    if (modo === 'precio') return numero * editando.participaciones;
    if (modo === 'rentabilidad') return editando.coste * (1 + numero / 100);
    return numero;
}

function actualizarVistaPrevia() {
    const r = rentabilidad(editando.coste, valorIntroducido());
    if (!r) {
        vistaPrevia.className = 'valor-vista-previa';
        vistaPrevia.textContent = 'Escribe el valor para ver la rentabilidad';
        return;
    }
    vistaPrevia.className = `valor-vista-previa rentabilidad-${claseRentabilidad(r)}`;
    vistaPrevia.innerHTML = `<span>Valor actual <b>${formatoEuros(r.valor)}</b></span><b>${formatoRentabilidad(r, true)}</b>`;
}

// activo: { clave, nombre, coste, participaciones, esCartera }
export function abrirValorActual(activo) {
    editando = activo;
    tituloValor.textContent = activo.nombre;
    const actual = valoraciones[activo.clave];
    const puedePrecio = activo.participaciones > 0 && !activo.esCartera;

    resumenValor.textContent = `Invertido: ${formatoEuros(activo.coste)}` +
        (puedePrecio ? ` · ${formatoDecimalVariable(activo.participaciones, 6)} títulos` : '') +
        (actual ? ` · actualizado el ${ayudas.formatoFechaES(actual.fecha.substring(0, 10))}` : '');

    // Sin títulos (cartera o inversión añadida solo con importe) no se puede indicar el precio por título
    grupoModo.querySelector('[data-valor="precio"]').classList.toggle('oculto', !puedePrecio);
    inputValor.value = actual ? actual.valor : '';
    const modoInicial = actual && (actual.tipo !== 'precio' || puedePrecio) ? actual.tipo : (puedePrecio ? 'precio' : 'total');
    fijarModo(modoInicial);
    btnQuitar.classList.toggle('oculto', !actual);
    ayudas.abrirModal(modalValor);
    setTimeout(() => inputValor.focus(), 150);
}

function guardarValor() {
    const numero = parseFloat(String(inputValor.value).replace(',', '.'));
    if (!numeroValido(numero)) return inputValor.focus();
    valoraciones[editando.clave] = { tipo: modo, valor: numero, fecha: new Date().toISOString() };
    ayudas.cerrarModal(modalValor);
    guardar();
    ayudas.mostrarToast('Valor actualizado');
}

function quitarValor() {
    delete valoraciones[editando.clave];
    ayudas.cerrarModal(modalValor);
    guardar();
    ayudas.mostrarToast('Valoración quitada');
}

export function iniciarValoraciones(funcionesAyuda) {
    ayudas = funcionesAyuda;
    grupoModo.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => fijarModo(btn.getAttribute('data-valor'))));
    inputValor.addEventListener('input', actualizarVistaPrevia);
    inputValor.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardarValor(); } });
    document.getElementById('btn-guardar-valor').addEventListener('click', guardarValor);
    btnQuitar.addEventListener('click', quitarValor);
    document.getElementById('btn-cerrar-valor').addEventListener('click', () => ayudas.cerrarModal(modalValor));
    modalValor.addEventListener('click', (e) => { if (e.target === modalValor) ayudas.cerrarModal(modalValor); });
}
