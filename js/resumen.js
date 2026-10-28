// Pantalla de Resumen: ahorro del mes y tasa de ahorro, últimos meses, patrimonio
// (inversiones + saldos de tus cuentas) y objetivos de ahorro.

import { leerDato, guardarDato, nuevoId } from './datos.js?v=20';
import {
    obtenerMesActual, sumarMeses, nombreMesLargo, nombreMesCorto, obtenerFechaHoy, formatoFechaES,
    formatoEuros, formatoPorcentaje, escaparHTML, leerImporte
} from './utils.js?v=20';
import { resumenMes } from './gastos.js?v=20';
import { obtenerTotalesCartera } from './inversiones.js?v=20';

const ICONO_EDITAR = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const ICONO_ELIMINAR = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

const $ = id => document.getElementById(id);
const modalCuenta = $('modal-cuenta');
const modalObjetivo = $('modal-objetivo');

let cuentas = leerDato('cuentas');     // [{ id, nombre, saldo, fecha }]
let objetivos = leerDato('objetivos'); // [{ id, nombre, meta, ahorrado, fechaLimite }]
let editandoCuenta = null;
let editandoObjetivo = null;
let ayudas = {}; // abrirModal, cerrarModal, mostrarToast, irA

export function obtenerDatosResumen() {
    return { cuentas, objetivos };
}

export function reemplazarDatosResumen(datos) {
    cuentas = Array.isArray(datos.cuentas) ? datos.cuentas : [];
    objetivos = Array.isArray(datos.objetivos) ? datos.objetivos : [];
    guardarDato('cuentas', cuentas);
    guardarDato('objetivos', objetivos);
}

function clase(valor) {
    return valor > 0.005 ? 'positiva' : valor < -0.005 ? 'negativa' : 'neutra';
}

function botonesFila(tipo, id) {
    return `
        <div class="acciones-fila">
            <button class="btn-editar" data-${tipo}="${id}" data-accion="editar" title="Editar">${ICONO_EDITAR}</button>
            <button class="btn-eliminar" data-${tipo}="${id}" data-accion="eliminar" title="Eliminar">${ICONO_ELIMINAR}</button>
        </div>`;
}

export function renderizarResumen() {
    const mes = obtenerMesActual();
    $('resumen-mes').textContent = nombreMesLargo(mes);

    // Ahorro del mes (incluye los apartados: lo gastado menos lo devuelto)
    const actual = resumenMes(mes);
    const ahorro = actual.ingresos - actual.gastos;
    $('resumen-ahorro').textContent = formatoEuros(ahorro);
    $('resumen-ahorro').className = `total-importe importe-${clase(ahorro)}`;
    $('resumen-ahorro-detalle').textContent = `Ingresos ${formatoEuros(actual.ingresos)} · Gastos ${formatoEuros(actual.gastos)}`;
    $('resumen-tasa').textContent = actual.ingresos > 0 ? `Tasa de ahorro: ${formatoPorcentaje((ahorro / actual.ingresos) * 100)}` : 'Sin ingresos este mes';

    // Patrimonio
    const cartera = obtenerTotalesCartera();
    const totalCuentas = cuentas.reduce((suma, c) => suma + (parseFloat(c.saldo) || 0), 0);
    $('resumen-patrimonio').textContent = formatoEuros(cartera.valor + totalCuentas);
    $('resumen-patrimonio-detalle').textContent = `Inversiones ${formatoEuros(cartera.valor)} · Cuentas ${formatoEuros(totalCuentas)}`;

    // Últimos 6 meses
    const meses = [];
    for (let i = 5; i >= 0; i--) {
        const m = sumarMeses(mes, -i);
        const r = resumenMes(m);
        meses.push({ mes: m, ahorro: r.ingresos - r.gastos, ingresos: r.ingresos });
    }
    const maximo = Math.max(...meses.map(m => Math.abs(m.ahorro)), 1);
    $('resumen-meses').innerHTML = meses.map(m => `
        <div class="mes-ahorro">
            <span class="mes-ahorro-nombre">${nombreMesCorto(m.mes)}</span>
            <div class="mes-ahorro-barra"><span class="rentabilidad-${clase(m.ahorro)}" style="width: ${(Math.abs(m.ahorro) / maximo) * 100}%"></span></div>
            <span class="mes-ahorro-valor rentabilidad-${clase(m.ahorro)}">${m.ahorro >= 0 ? '+' : '−'}${formatoEuros(Math.abs(m.ahorro))}</span>
            <small class="mes-ahorro-tasa">${m.ingresos > 0 ? formatoPorcentaje((m.ahorro / m.ingresos) * 100, 0) : '—'}</small>
        </div>`).join('');

    // Cuentas
    $('lista-cuentas').innerHTML = cuentas.length ? cuentas.map(c => `
        <div class="config-fila">
            <div class="config-texto"><b>${escaparHTML(c.nombre)}</b><small>Actualizado el ${formatoFechaES(c.fecha)}</small></div>
            <span class="importe-fila">${formatoEuros(parseFloat(c.saldo) || 0)}</span>
            ${botonesFila('cuenta', c.id)}
        </div>`).join('') : '<p class="estado-vacio">Añade tus cuentas (banco, efectivo, cuenta remunerada…) para ver tu patrimonio total.</p>';

    // Objetivos de ahorro
    $('lista-objetivos').innerHTML = objetivos.length ? objetivos.map(o => {
        const meta = parseFloat(o.meta) || 0;
        const ahorrado = parseFloat(o.ahorrado) || 0;
        const porcentaje = meta > 0 ? (ahorrado / meta) * 100 : 0;
        const falta = Math.max(0, meta - ahorrado);
        let ritmo = '';
        if (falta > 0 && o.fechaLimite) {
            const restantes = Math.max(1, (Number(o.fechaLimite.substring(0, 4)) - Number(mes.substring(0, 4))) * 12 + Number(o.fechaLimite.substring(5, 7)) - Number(mes.substring(5, 7)) + 1);
            ritmo = ` · ${formatoEuros(falta / restantes)}/mes hasta ${formatoFechaES(o.fechaLimite)}`;
        }
        return `
            <div class="objetivo-fila">
                <div class="objetivo-cabecera">
                    <b>${escaparHTML(o.nombre)}</b>
                    ${botonesFila('objetivo', o.id)}
                </div>
                <div class="presupuesto-barra objetivo-barra"><span style="width: ${Math.min(100, porcentaje)}%"></span></div>
                <small>${formatoEuros(ahorrado)} de ${formatoEuros(meta)} · ${formatoPorcentaje(porcentaje, 0)}${falta > 0 ? ` · faltan ${formatoEuros(falta)}${ritmo}` : ' · ¡Conseguido!'}</small>
            </div>`;
    }).join('') : '<p class="estado-vacio">Crea un objetivo (fondo de emergencia, viaje, entrada de un piso…) y sigue cuánto te falta.</p>';

    document.querySelectorAll('#lista-cuentas [data-cuenta], #lista-objetivos [data-objetivo]').forEach(btn => btn.addEventListener('click', () => {
        const esCuenta = btn.hasAttribute('data-cuenta');
        const id = btn.getAttribute(esCuenta ? 'data-cuenta' : 'data-objetivo');
        if (btn.getAttribute('data-accion') === 'editar') return esCuenta ? abrirCuenta(id) : abrirObjetivo(id);
        eliminar(esCuenta ? 'cuenta' : 'objetivo', id);
    }));
}

function eliminar(tipo, id) {
    const lista = tipo === 'cuenta' ? cuentas : objetivos;
    const indice = lista.findIndex(x => x.id === id);
    if (indice < 0) return;
    const [quitado] = lista.splice(indice, 1);
    guardarDato(tipo === 'cuenta' ? 'cuentas' : 'objetivos', lista);
    renderizarResumen();
    ayudas.mostrarToast(tipo === 'cuenta' ? 'Cuenta eliminada' : 'Objetivo eliminado', {
        deshacer: () => {
            lista.splice(indice, 0, quitado);
            guardarDato(tipo === 'cuenta' ? 'cuentas' : 'objetivos', lista);
            renderizarResumen();
        }
    });
}

// --- VENTANAS ---

function abrirCuenta(id = null) {
    editandoCuenta = id;
    const cuenta = cuentas.find(c => c.id === id);
    $('cuenta-nombre').value = cuenta ? cuenta.nombre : '';
    $('cuenta-saldo').value = cuenta ? cuenta.saldo : '';
    $('titulo-modal-cuenta').textContent = cuenta ? 'Editar cuenta' : 'Nueva cuenta';
    ayudas.abrirModal(modalCuenta);
    setTimeout(() => $(cuenta ? 'cuenta-saldo' : 'cuenta-nombre').focus(), 150);
}

function guardarCuenta(evento) {
    evento.preventDefault();
    const nombre = $('cuenta-nombre').value.trim();
    const saldo = leerImporte($('cuenta-saldo').value);
    if (!nombre || !isFinite(saldo)) return;
    const datos = { nombre, saldo, fecha: obtenerFechaHoy() };
    const existente = cuentas.find(c => c.id === editandoCuenta);
    if (existente) Object.assign(existente, datos); else cuentas.push({ id: nuevoId(), ...datos });
    guardarDato('cuentas', cuentas);
    ayudas.cerrarModal(modalCuenta);
    renderizarResumen();
    ayudas.mostrarToast('Cuenta guardada');
}

function abrirObjetivo(id = null) {
    editandoObjetivo = id;
    const objetivo = objetivos.find(o => o.id === id);
    $('objetivo-nombre').value = objetivo ? objetivo.nombre : '';
    $('objetivo-meta').value = objetivo ? objetivo.meta : '';
    $('objetivo-ahorrado').value = objetivo ? objetivo.ahorrado : '';
    $('objetivo-fecha').value = objetivo && objetivo.fechaLimite ? objetivo.fechaLimite : '';
    $('titulo-modal-objetivo').textContent = objetivo ? 'Editar objetivo' : 'Nuevo objetivo';
    ayudas.abrirModal(modalObjetivo);
    setTimeout(() => $(objetivo ? 'objetivo-ahorrado' : 'objetivo-nombre').focus(), 150);
}

function guardarObjetivo(evento) {
    evento.preventDefault();
    const nombre = $('objetivo-nombre').value.trim();
    const meta = leerImporte($('objetivo-meta').value);
    const ahorrado = leerImporte($('objetivo-ahorrado').value || 0) || 0;
    if (!nombre || !(meta > 0)) return;
    const datos = { nombre, meta, ahorrado, fechaLimite: $('objetivo-fecha').value || '' };
    const existente = objetivos.find(o => o.id === editandoObjetivo);
    if (existente) Object.assign(existente, datos); else objetivos.push({ id: nuevoId(), ...datos });
    guardarDato('objetivos', objetivos);
    ayudas.cerrarModal(modalObjetivo);
    renderizarResumen();
    ayudas.mostrarToast('Objetivo guardado');
}

export function iniciarResumen(funcionesAyuda) {
    ayudas = funcionesAyuda;
    $('btn-nueva-cuenta').addEventListener('click', () => abrirCuenta());
    $('btn-nuevo-objetivo').addEventListener('click', () => abrirObjetivo());
    $('formulario-cuenta').addEventListener('submit', guardarCuenta);
    $('formulario-objetivo').addEventListener('submit', guardarObjetivo);
    $('btn-cerrar-cuenta').addEventListener('click', () => ayudas.cerrarModal(modalCuenta));
    $('btn-cerrar-objetivo').addEventListener('click', () => ayudas.cerrarModal(modalObjetivo));
    [modalCuenta, modalObjetivo].forEach(modal => modal.addEventListener('click', (e) => { if (e.target === modal) ayudas.cerrarModal(modal); }));
    $('resumen-ir-gastos').addEventListener('click', () => ayudas.irA('gastos'));
    $('resumen-ir-inversiones').addEventListener('click', () => ayudas.irA('inversiones'));
    renderizarResumen();
}
