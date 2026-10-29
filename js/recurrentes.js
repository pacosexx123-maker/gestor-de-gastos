// Movimientos recurrentes: gastos/ingresos fijos (alquiler, suscripciones, nómina...) y
// aportaciones periódicas a inversiones. Cada mes, al abrir la app, se apuntan solos los que
// ya han llegado a su día. Nada se hace en segundo plano: solo cuando la app está abierta.
//
// recurrente = { id, ambito: 'gasto' | 'inversion', datos: {...plantilla sin fecha}, dia, ultimoMes: 'AAAA-MM', activo }

import { leerDato, guardarDato, nuevoId } from './datos.js?v=24';
import { obtenerFechaHoy, obtenerMesActual, sumarMeses, diasDelMes, formatoEuros, escaparHTML } from './utils.js?v=24';

const ICONO_ELIMINAR = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

let recurrentes = leerDato('recurrentes');
let ayudas = {}; // anadirGastos, anadirInversiones, mostrarToast

function guardar() {
    guardarDato('recurrentes', recurrentes);
}

export function obtenerRecurrentes() {
    return recurrentes;
}

export function reemplazarRecurrentes(lista) {
    recurrentes = Array.isArray(lista) ? lista : [];
    guardar();
}

// Se crea a partir del primer movimiento (que ya se guarda aparte): el siguiente se apuntará el mes que viene
export function crearRecurrente({ ambito, datos, fecha }) {
    const id = nuevoId();
    recurrentes.push({ id, ambito, datos, dia: Number(fecha.substring(8, 10)), ultimoMes: fecha.substring(0, 7), activo: true });
    guardar();
    renderizarRecurrentes();
    return id;
}

// Apunta los movimientos de los meses que han llegado a su día y aún no se habían apuntado
export function generarPendientes() {
    const hoy = obtenerFechaHoy();
    const mesActual = obtenerMesActual();
    const gastos = [];
    const inversiones = [];

    recurrentes.forEach(r => {
        if (!r.activo) return;
        let mes = sumarMeses(r.ultimoMes, 1);
        while (mes <= mesActual) {
            const fecha = `${mes}-${String(Math.min(r.dia, diasDelMes(mes))).padStart(2, '0')}`;
            if (fecha > hoy) break;
            const movimiento = { ...r.datos, fecha, recurrenteId: r.id };
            (r.ambito === 'inversion' ? inversiones : gastos).push(movimiento);
            r.ultimoMes = mes;
            mes = sumarMeses(mes, 1);
        }
    });

    if (gastos.length) ayudas.anadirGastos(gastos);
    if (inversiones.length) ayudas.anadirInversiones(inversiones);
    const total = gastos.length + inversiones.length;
    if (total) {
        guardar();
        ayudas.mostrarToast(total === 1 ? 'Se ha apuntado 1 movimiento recurrente' : `Se han apuntado ${total} movimientos recurrentes`);
    }
    return total;
}

// --- LISTA EN AJUSTES ---

function descripcion(r) {
    const d = r.datos;
    if (r.ambito === 'inversion') return { titulo: d.nombre || 'Aportación', detalle: `Aportación de ${formatoEuros(d.importe || 0)} · día ${r.dia} de cada mes` };
    const signo = d.tipo === 'ingreso' ? '+' : '−';
    return { titulo: d.concepto || d.categoria || 'Movimiento', detalle: `${signo}${formatoEuros(d.cantidad || 0)} · ${escaparHTML(d.categoria || '')} · día ${r.dia} de cada mes` };
}

export function renderizarRecurrentes() {
    const contenedor = document.getElementById('lista-recurrentes');
    if (!contenedor) return;
    if (recurrentes.length === 0) {
        contenedor.innerHTML = '<p class="estado-vacio">No tienes movimientos recurrentes. Al añadir un gasto, ingreso o inversión, marca "Repetir cada mes".</p>';
        return;
    }
    contenedor.innerHTML = recurrentes.map(r => {
        const { titulo, detalle } = descripcion(r);
        return `
            <div class="config-fila ${r.activo ? '' : 'pausado'}">
                <div class="config-texto">
                    <b>${escaparHTML(titulo)}</b>
                    <small>${detalle}${r.activo ? '' : ' · <em>en pausa</em>'}</small>
                </div>
                <div class="acciones-fila">
                    <button class="btn-secundario btn-mini" data-recurrente="${r.id}" data-accion="alternar">${r.activo ? 'Pausar' : 'Reanudar'}</button>
                    <button class="btn-eliminar" data-recurrente="${r.id}" data-accion="eliminar" title="Eliminar">${ICONO_ELIMINAR}</button>
                </div>
            </div>`;
    }).join('');

    contenedor.querySelectorAll('[data-recurrente]').forEach(btn => btn.addEventListener('click', () => {
        const r = recurrentes.find(x => x.id === btn.getAttribute('data-recurrente'));
        if (!r) return;
        if (btn.getAttribute('data-accion') === 'alternar') {
            r.activo = !r.activo;
            // Al reanudar no se apuntan de golpe los meses en pausa
            if (r.activo) r.ultimoMes = obtenerFechaHoy().substring(8, 10) >= String(r.dia).padStart(2, '0') ? obtenerMesActual() : sumarMeses(obtenerMesActual(), -1);
        } else {
            if (!confirm('¿Dejar de repetir este movimiento? Los que ya se apuntaron no se borran.')) return;
            recurrentes = recurrentes.filter(x => x.id !== r.id);
        }
        guardar();
        renderizarRecurrentes();
    }));
}

export function iniciarRecurrentes(funcionesAyuda) {
    ayudas = funcionesAyuda;
    renderizarRecurrentes();
    generarPendientes();
    // Si la app se queda abierta en segundo plano y se vuelve a ella otro día
    document.addEventListener('visibilitychange', () => { if (!document.hidden) generarPendientes(); });
}
