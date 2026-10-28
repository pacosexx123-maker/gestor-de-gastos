// Gastos e ingresos: tarjetas del mes (con comparación con el mes anterior), apartados
// (gastos que van aparte, como "Hogar"), presupuestos, gráficos, historial con filtros,
// formulario (con notas y repetición mensual), duplicar y deshacer.

import { leerDato, guardarDato } from './datos.js?v=20';
import {
    obtenerFechaHoy, obtenerMesActual, sumarMeses, nombreMesCorto, nombreMesLargo, formatoFechaES,
    formatoNumero, formatoEuros, formatoPorcentaje, escaparHTML, leerImporte
} from './utils.js?v=20';
import { crearLibroExcel, agruparPorMes, ordenarPorFecha } from './excel.js?v=20';
import { obtenerCategorias, obtenerApartados, apartadoPorId, asegurarCategoria, asegurarApartado, abrirConfiguracion } from './configuracion.js?v=20';
import { crearRecurrente } from './recurrentes.js?v=20';
import { dibujarTarta, conectarInteraccion, agruparOtros, dibujarEvolucionMensual, conectarEvolucion } from './graficos.js?v=20';

const ICONO = {
    editar: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    eliminar: '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
    duplicar: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    hogar: '<svg viewBox="0 0 24 24"><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    apartado: '<svg viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
    flecha: '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
    repetir: '<svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>'
};
const COLORES_APARTADO = [
    ['var(--hogar)', 'var(--hogar-suave)'], ['var(--inversion)', 'var(--inversion-suave)'],
    ['var(--activos)', 'var(--activos-suave)'], ['var(--ultima)', 'var(--ultima-suave)']
];

const $ = id => document.getElementById(id);
const inputMes = $('selector-mes-activo');
const tituloMes = $('titulo-mes-actual');
const formulario = $('formulario');
const modalFormulario = $('contenedor-formulario');
const modalDetalle = $('modal-detalle');
const modalPresupuestos = $('modal-presupuestos');
const selectTipo = $('tipo-movimiento');
const selectApartado = $('mov-apartado');
const selectCategoria = $('categoria');
const inputConcepto = $('concepto');
const inputCantidad = $('cantidad');
const inputFecha = $('fecha');
const inputNota = $('mov-nota');
const checkRecurrente = $('mov-recurrente');

let movimientos = leerDato('movimientos');
let presupuestos = leerDato('presupuestos');
let indiceEditando = null;
let detalleAbierto = null; // { tipo: 'personal' | 'ingresos' | 'apartado', id }
let modoAnalisis = localStorage.getItem('modoAnalisisGastos') === 'meses' ? 'meses' : 'categorias';
let ayudas = {}; // abrirModal, cerrarModal, mostrarToast, alCambiar

// --- DATOS ---

const esIngreso = m => m.tipo === 'ingreso';
const importe = m => parseFloat(m.cantidad) || 0;
const mesDe = m => (m.fecha || '').substring(0, 7);
const sumar = lista => lista.reduce((suma, m) => suma + importe(m), 0);

function guardar() {
    guardarDato('movimientos', movimientos);
}

export function obtenerMovimientos() {
    return movimientos;
}

// Datos antiguos: la categoría "Hogar" y el ingreso "Bizum Hogar" pasan al apartado "Hogar"
export function migrarMovimientos(lista) {
    let usaHogar = false;
    const migrados = lista.map(m => {
        if (m.apartado) return m;
        if (m.categoria === 'Bizum Hogar') { usaHogar = true; return { ...m, categoria: 'Bizum', apartado: 'hogar' }; }
        if (m.categoria === 'Hogar' && !esIngreso(m)) { usaHogar = true; return { ...m, apartado: 'hogar' }; }
        return m;
    });
    if (usaHogar) asegurarApartado('hogar', 'Hogar');
    return migrados;
}

export function reemplazarMovimientos(lista, esCopiaAntigua) {
    movimientos = esCopiaAntigua ? migrarMovimientos(lista) : lista;
    guardar();
    renderizarGastos();
}

export function reemplazarPresupuestos(datos) {
    presupuestos = datos && typeof datos === 'object' && !Array.isArray(datos) ? datos : {};
    guardarDato('presupuestos', presupuestos);
}

export function obtenerPresupuestos() {
    return presupuestos;
}

export function anadirMovimientos(lista) {
    movimientos.push(...lista);
    guardar();
    renderizarGastos();
}

// Al renombrar o borrar una categoría en la configuración
export function renombrarCategoriaEnMovimientos(tipo, anterior, nueva) {
    movimientos.forEach(m => { if ((tipo === 'ingreso') === esIngreso(m) && m.categoria === anterior) m.categoria = nueva; });
    if (presupuestos[anterior] !== undefined && tipo === 'gasto') {
        presupuestos[nueva] = presupuestos[anterior];
        delete presupuestos[anterior];
        guardarDato('presupuestos', presupuestos);
    }
    guardar();
}

export function quitarApartadoDeMovimientos(id) {
    movimientos.forEach(m => { if (m.apartado === id) delete m.apartado; });
    guardar();
}

function personalesDelMes(mes) {
    return movimientos.filter(m => !m.apartado && mesDe(m) === mes);
}

function movimientosApartado(apartado, mes) {
    return movimientos.filter(m => m.apartado === apartado.id && (apartado.acumulado ? mesDe(m) <= mes : mesDe(m) === mes));
}

function gastoPorCategoria(mes) {
    const totales = {};
    personalesDelMes(mes).filter(m => !esIngreso(m)).forEach(m => {
        const categoria = m.categoria || 'Otros';
        totales[categoria] = (totales[categoria] || 0) + importe(m);
    });
    return totales;
}

// Para la pantalla de Resumen: ingresos y gastos de un mes, incluidos los apartados
// (en los apartados cuenta lo gastado ese mes menos lo devuelto ese mes)
export function resumenMes(mes) {
    const delMes = movimientos.filter(m => mesDe(m) === mes);
    const ingresos = sumar(delMes.filter(m => esIngreso(m) && !m.apartado));
    const gastosPersonales = sumar(delMes.filter(m => !esIngreso(m) && !m.apartado));
    const conApartado = delMes.filter(m => m.apartado);
    const gastosApartados = sumar(conApartado.filter(m => !esIngreso(m))) - sumar(conApartado.filter(esIngreso));
    return { ingresos, gastos: gastosPersonales + gastosApartados, gastosPersonales, gastosApartados };
}

// --- TARJETAS DEL MES ---

function comparacion(elemento, actual, anterior, mesAnterior, subirEsMalo) {
    if (!(anterior > 0)) { elemento.textContent = ''; elemento.className = 'comparacion'; return; }
    const variacion = ((actual - anterior) / anterior) * 100;
    const sube = variacion > 0.05;
    const baja = variacion < -0.05;
    elemento.textContent = `${sube ? '▲' : baja ? '▼' : '='} ${formatoPorcentaje(Math.abs(variacion))} vs ${nombreMesCorto(mesAnterior)}`;
    const malo = subirEsMalo ? sube : baja;
    const bueno = subirEsMalo ? baja : sube;
    elemento.className = `comparacion ${malo ? 'comparacion-mala' : bueno ? 'comparacion-buena' : ''}`;
}

function renderizarTarjetas(mes) {
    const mesAnterior = sumarMeses(mes, -1);
    const personales = personalesDelMes(mes);
    const anteriores = personalesDelMes(mesAnterior);
    const ingresos = sumar(personales.filter(esIngreso));
    const gastos = sumar(personales.filter(m => !esIngreso(m)));

    $('ingresos-totales').textContent = formatoNumero(ingresos);
    $('gasto-total').textContent = formatoNumero(gastos);
    comparacion($('comparacion-ingresos'), ingresos, sumar(anteriores.filter(esIngreso)), mesAnterior, false);
    comparacion($('comparacion-gastos'), gastos, sumar(anteriores.filter(m => !esIngreso(m))), mesAnterior, true);

    // Una tarjeta por apartado
    const contenedor = $('totales-gastos');
    contenedor.querySelectorAll('.tarjeta-apartado').forEach(t => t.remove());
    obtenerApartados().forEach((apartado, indice) => {
        const lista = movimientosApartado(apartado, mes);
        const saldo = sumar(lista.filter(m => !esIngreso(m))) - sumar(lista.filter(esIngreso));
        const [color, suave] = COLORES_APARTADO[indice % COLORES_APARTADO.length];
        const tarjeta = document.createElement('div');
        tarjeta.className = 'tarjeta-total tarjeta-apartado clicable';
        tarjeta.style.setProperty('--color-tarjeta', color);
        tarjeta.style.setProperty('--color-tarjeta-suave', suave);
        tarjeta.title = `Ver desglose de ${apartado.nombre}`;
        tarjeta.innerHTML = `
            <div class="total-cabecera">
                <span class="total-icono">${apartado.id === 'hogar' ? ICONO.hogar : ICONO.apartado}</span>
                <h3>${escaparHTML(apartado.nombre)}</h3>
            </div>
            <p class="total-importe">${formatoEuros(saldo)}</p>
            <span class="total-pie">${apartado.acumulado ? 'Acumulado' : 'Del mes'} · Ver desglose ${ICONO.flecha}</span>`;
        tarjeta.addEventListener('click', () => abrirDetalle({ tipo: 'apartado', id: apartado.id }));
        contenedor.appendChild(tarjeta);
    });
}

// --- PRESUPUESTOS ---

function renderizarPresupuestos(mes) {
    const contenedor = $('lista-presupuestos');
    const gastado = gastoPorCategoria(mes);
    const conPresupuesto = Object.entries(presupuestos).filter(([, limite]) => parseFloat(limite) > 0);
    if (conPresupuesto.length === 0) {
        contenedor.innerHTML = '<p class="estado-vacio">Define cuánto quieres gastar al mes en cada categoría y verás aquí cuánto te queda. Pulsa "Editar".</p>';
        return;
    }
    const filas = conPresupuesto.map(([categoria, limite]) => {
        const usado = gastado[categoria] || 0;
        const porcentaje = (usado / parseFloat(limite)) * 100;
        return { categoria, limite: parseFloat(limite), usado, porcentaje };
    }).sort((a, b) => b.porcentaje - a.porcentaje);

    contenedor.innerHTML = filas.map(f => {
        const estado = f.porcentaje > 100 ? 'superado' : f.porcentaje >= 85 ? 'cerca' : 'bien';
        const resto = f.limite - f.usado;
        return `
            <div class="presupuesto-fila presupuesto-${estado}">
                <div class="presupuesto-texto">
                    <b>${escaparHTML(f.categoria)}</b>
                    <span>${formatoEuros(f.usado)} <small>de ${formatoEuros(f.limite)}</small></span>
                </div>
                <div class="presupuesto-barra"><span style="width: ${Math.min(100, f.porcentaje)}%"></span></div>
                <small class="presupuesto-estado">${resto >= 0 ? `Quedan ${formatoEuros(resto)}` : `Te has pasado ${formatoEuros(-resto)}`} · ${formatoPorcentaje(f.porcentaje, 0)}</small>
            </div>`;
    }).join('');
}

function abrirEdicionPresupuestos() {
    $('lista-editar-presupuestos').innerHTML = obtenerCategorias('gasto').map(categoria => `
        <div class="presupuesto-edicion">
            <label for="presupuesto-${escaparHTML(categoria)}">${escaparHTML(categoria)}</label>
            <input type="number" id="presupuesto-${escaparHTML(categoria)}" data-categoria="${escaparHTML(categoria)}" min="0" step="any" inputmode="decimal" placeholder="Sin límite" value="${presupuestos[categoria] > 0 ? presupuestos[categoria] : ''}">
        </div>`).join('');
    ayudas.abrirModal(modalPresupuestos);
}

function guardarPresupuestos() {
    const nuevos = {};
    $('lista-editar-presupuestos').querySelectorAll('input').forEach(input => {
        const valor = leerImporte(input.value);
        if (valor > 0) nuevos[input.getAttribute('data-categoria')] = valor;
    });
    reemplazarPresupuestos(nuevos);
    ayudas.cerrarModal(modalPresupuestos);
    renderizarGastos();
    ayudas.mostrarToast('Presupuestos guardados');
}

// Aviso al añadir un gasto que hace superar el presupuesto de su categoría
function avisoPresupuesto(movimiento, gastadoAntes) {
    if (esIngreso(movimiento) || movimiento.apartado) return '';
    const limite = parseFloat(presupuestos[movimiento.categoria]);
    if (!(limite > 0)) return '';
    const gastadoAhora = gastoPorCategoria(mesDe(movimiento))[movimiento.categoria] || 0;
    return gastadoAntes <= limite && gastadoAhora > limite ? ` · Has superado el presupuesto de ${movimiento.categoria}` : '';
}

// --- ANÁLISIS (gráficos) ---

function renderizarAnalisis(mes) {
    document.querySelectorAll('#selector-analisis button').forEach(btn => {
        const activo = btn.getAttribute('data-modo') === modoAnalisis;
        btn.classList.toggle('activo', activo);
        btn.setAttribute('aria-pressed', activo);
    });
    const contenedor = $('grafico-gastos');

    if (modoAnalisis === 'categorias') {
        const totales = gastoPorCategoria(mes);
        const total = Object.values(totales).reduce((a, b) => a + b, 0);
        if (total <= 0) {
            contenedor.innerHTML = `<p class="estado-vacio">No hay gastos personales en ${nombreMesLargo(mes)}.</p>`;
            return;
        }
        // El color sigue a la categoría (su posición en la lista de categorías), no a su importe
        const orden = obtenerCategorias('gasto');
        const elementos = agruparOtros(Object.entries(totales)
            .map(([nombre, valor]) => {
                const indice = orden.indexOf(nombre);
                return { nombre, total: valor, porcentaje: (valor / total) * 100, color: indice >= 0 && indice < 8 ? `var(--serie-${indice + 1})` : 'var(--serie-otros)' };
            })
            .sort((a, b) => b.total - a.total));
        contenedor.innerHTML = dibujarTarta(elementos, total, escaparHTML, ['categoría', 'categorías']);
        conectarInteraccion(contenedor, elementos);
        return;
    }

    const meses = [];
    for (let i = 11; i >= 0; i--) {
        const m = sumarMeses(mes, -i);
        const delMes = personalesDelMes(m);
        meses.push({ mes: m, etiqueta: nombreMesCorto(m), ingresos: sumar(delMes.filter(esIngreso)), gastos: sumar(delMes.filter(x => !esIngreso(x))) });
    }
    contenedor.innerHTML = dibujarEvolucionMensual(meses);
    conectarEvolucion(contenedor, meses);
}

// --- HISTORIAL CON FILTROS ---

function pildoras(m) {
    const apartado = m.apartado ? apartadoPorId(m.apartado) : null;
    let html = '';
    if (!apartado || (m.categoria && m.categoria !== apartado.nombre)) html += `<span class="pildora">${escaparHTML(m.categoria || 'Otros')}</span>`;
    if (apartado) html += `<span class="pildora pildora-apartado">${escaparHTML(apartado.nombre)}</span>`;
    if (m.recurrenteId) html += `<span class="pildora pildora-recurrente" title="Se repite cada mes">${ICONO.repetir}</span>`;
    return html;
}

function botonesAcciones(indice) {
    return `
        <div class="acciones-fila acciones-tres">
            <button class="btn-editar" data-accion="duplicar" data-indice="${indice}" title="Duplicar">${ICONO.duplicar}</button>
            <button class="btn-editar" data-accion="editar" data-indice="${indice}" title="Editar">${ICONO.editar}</button>
            <button class="btn-eliminar" data-accion="eliminar" data-indice="${indice}" title="Eliminar">${ICONO.eliminar}</button>
        </div>`;
}

function filaMovimiento(m, indice, fechaCorta) {
    const signo = esIngreso(m) ? '+' : '−';
    const fecha = formatoFechaES(m.fecha || obtenerFechaHoy());
    return `
        <tr>
            <td>${fechaCorta ? fecha.substring(0, 5) : `${fecha.substring(0, 6)}${fecha.substring(8)}`}</td>
            <td>
                ${escaparHTML(m.concepto || 'Sin concepto')}
                ${m.nota ? `<small class="nota-movimiento">${escaparHTML(m.nota)}</small>` : ''}
                <span class="pildoras-movil">${pildoras(m)}</span>
            </td>
            <td><span class="pildoras">${pildoras(m)}</span></td>
            <td class="${esIngreso(m) ? 'monto-positivo' : 'monto-negativo'}">${signo} ${formatoEuros(importe(m))}</td>
            <td>${botonesAcciones(indice)}</td>
        </tr>`;
}

function conectarAcciones(contenedor) {
    contenedor.querySelectorAll('[data-accion]').forEach(btn => btn.addEventListener('click', () => {
        const indice = Number(btn.getAttribute('data-indice'));
        const accion = btn.getAttribute('data-accion');
        if (accion === 'editar') { ayudas.cerrarModal(modalDetalle); abrirFormularioGasto({ indice }); }
        if (accion === 'duplicar') { ayudas.cerrarModal(modalDetalle); abrirFormularioGasto({ plantilla: movimientos[indice] }); }
        if (accion === 'eliminar') eliminarMovimiento(indice);
    }));
}

function rellenarFiltros() {
    const selectCat = $('filtro-mov-categoria');
    const actual = selectCat.value;
    const nombres = [...new Set([...obtenerCategorias('gasto'), ...obtenerCategorias('ingreso'), ...movimientos.map(m => m.categoria).filter(Boolean)])];
    selectCat.innerHTML = '<option value="">Todas las categorías</option>' + nombres.map(c => `<option value="${escaparHTML(c)}">${escaparHTML(c)}</option>`).join('');
    selectCat.value = nombres.includes(actual) ? actual : '';

    const selectAmbito = $('filtro-mov-ambito');
    const ambito = selectAmbito.value;
    selectAmbito.innerHTML = '<option value="">Personal y apartados</option><option value="personal">Solo personal</option>' +
        obtenerApartados().map(a => `<option value="${a.id}">${escaparHTML(a.nombre)}</option>`).join('');
    selectAmbito.value = [...selectAmbito.options].some(o => o.value === ambito) ? ambito : '';
}

function renderizarHistorial(mes) {
    const texto = $('filtro-mov-texto').value.trim().toLowerCase();
    const categoria = $('filtro-mov-categoria').value;
    const ambito = $('filtro-mov-ambito').value;
    const todos = $('filtro-mov-todos').checked;

    const base = movimientos.map((m, indice) => ({ m, indice })).filter(({ m }) => todos || mesDe(m) === mes);
    const filtrados = base.filter(({ m }) => {
        if (categoria && m.categoria !== categoria) return false;
        if (ambito === 'personal' && m.apartado) return false;
        if (ambito && ambito !== 'personal' && m.apartado !== ambito) return false;
        if (texto && !`${m.concepto || ''} ${m.nota || ''} ${m.categoria || ''}`.toLowerCase().includes(texto)) return false;
        return true;
    }).sort((a, b) => (b.m.fecha || '').localeCompare(a.m.fecha || '') || b.indice - a.indice);

    const n = base.length;
    const textoTotal = `${n} ${n === 1 ? 'movimiento' : 'movimientos'}${todos ? ' en total' : ' este mes'}`;
    $('resumen-historial').textContent = filtrados.length === n ? textoTotal : `${filtrados.length} de ${textoTotal}`;

    const tabla = $('lista-gastos');
    tabla.innerHTML = filtrados.length
        ? filtrados.map(({ m, indice }) => filaMovimiento(m, indice, !todos)).join('')
        : `<tr><td colspan="5" class="estado-vacio">${n === 0 ? 'No hay movimientos' : 'Ningún movimiento coincide con el filtro'}</td></tr>`;
    conectarAcciones(tabla);
}

// --- DETALLE (al pulsar una tarjeta) ---

function abrirDetalle(detalle) {
    detalleAbierto = detalle;
    const mes = inputMes.value;
    let titulo, lista, resumen;

    if (detalle.tipo === 'apartado') {
        const apartado = apartadoPorId(detalle.id);
        if (!apartado) return;
        lista = movimientosApartado(apartado, mes);
        const gastos = sumar(lista.filter(m => !esIngreso(m)));
        const devoluciones = sumar(lista.filter(esIngreso));
        titulo = `${apartado.nombre} · ${apartado.acumulado ? `hasta ${nombreMesLargo(mes)}` : nombreMesLargo(mes)}`;
        resumen = [[apartado.acumulado ? 'Gastos acumulados' : 'Gastos', gastos], ['Devoluciones', devoluciones], ['Saldo', gastos - devoluciones]];
    } else {
        const ingresos = detalle.tipo === 'ingresos';
        lista = personalesDelMes(mes).filter(m => esIngreso(m) === ingresos);
        titulo = `${ingresos ? 'Ingresos' : 'Gasto personal'} · ${nombreMesLargo(mes)}`;
        const porCategoria = {};
        lista.forEach(m => { porCategoria[m.categoria || 'Otros'] = (porCategoria[m.categoria || 'Otros'] || 0) + importe(m); });
        resumen = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
    }

    $('titulo-modal-detalle').textContent = titulo;
    $('resumen-categorias').innerHTML = resumen.map(([nombre, valor]) => `<span class="resumen-badge">${escaparHTML(nombre)}: ${formatoEuros(valor)}</span>`).join('');
    const filas = lista.map(m => ({ m, indice: movimientos.indexOf(m) }))
        .sort((a, b) => (b.m.fecha || '').localeCompare(a.m.fecha || ''));
    const cuerpo = $('lista-detalle');
    cuerpo.innerHTML = filas.length ? filas.map(({ m, indice }) => {
        const signo = esIngreso(m) ? '+' : '−';
        return `
            <tr>
                <td>${formatoFechaES(m.fecha || obtenerFechaHoy())}</td>
                <td>${pildoras(m)}<br><small>${escaparHTML(m.concepto || 'Sin concepto')}</small>${m.nota ? `<small class="nota-movimiento">${escaparHTML(m.nota)}</small>` : ''}</td>
                <td class="${esIngreso(m) ? 'monto-positivo' : 'monto-negativo'}">${signo} ${formatoEuros(importe(m))}</td>
                <td>${botonesAcciones(indice)}</td>
            </tr>`;
    }).join('') : '<tr><td colspan="4" class="estado-vacio">No hay movimientos</td></tr>';
    conectarAcciones(cuerpo);
    ayudas.abrirModal(modalDetalle);
}

// --- BORRAR CON OPCIÓN DE DESHACER ---

function eliminarMovimiento(indice) {
    const [quitado] = movimientos.splice(indice, 1);
    guardar();
    renderizarGastos();
    if (detalleAbierto && !modalDetalle.classList.contains('oculto')) abrirDetalle(detalleAbierto);
    ayudas.mostrarToast('Movimiento eliminado', {
        deshacer: () => {
            movimientos.splice(Math.min(indice, movimientos.length), 0, quitado);
            guardar();
            renderizarGastos();
            if (detalleAbierto && !modalDetalle.classList.contains('oculto')) abrirDetalle(detalleAbierto);
        }
    });
}

// --- FORMULARIO ---

function rellenarCategorias(seleccionada) {
    const tipo = selectTipo.value;
    const lista = [...obtenerCategorias(tipo)];
    if (seleccionada && !lista.includes(seleccionada)) lista.push(seleccionada);
    selectCategoria.innerHTML = lista.map(c => `<option value="${escaparHTML(c)}">${escaparHTML(c)}</option>`).join('') +
        '<option value="__nueva__">+ Nueva categoría…</option>';
    selectCategoria.value = seleccionada && lista.includes(seleccionada) ? seleccionada : lista[0];
}

function rellenarApartados(seleccionado) {
    selectApartado.innerHTML = '<option value="">Personal (común)</option>' +
        obtenerApartados().map(a => `<option value="${a.id}">${escaparHTML(a.nombre)}</option>`).join('');
    selectApartado.value = seleccionado && apartadoPorId(seleccionado) ? seleccionado : '';
    actualizarAyudaApartado();
}

function actualizarAyudaApartado() {
    const apartado = apartadoPorId(selectApartado.value);
    const ayuda = $('ayuda-apartado');
    if (!apartado) { ayuda.textContent = ''; ayuda.classList.add('oculto'); return; }
    ayuda.textContent = selectTipo.value === 'ingreso'
        ? `Se restará de "${apartado.nombre}" (por ejemplo, un Bizum que te devuelven).`
        : `Irá a "${apartado.nombre}" y no se sumará a tu gasto personal.`;
    ayuda.classList.remove('oculto');
}

// opciones: { indice } para editar, { plantilla } para duplicar, o nada para uno nuevo
export function abrirFormularioGasto(opciones = {}) {
    formulario.reset();
    indiceEditando = opciones.indice !== undefined ? opciones.indice : null;
    const origen = indiceEditando !== null ? movimientos[indiceEditando] : opciones.plantilla || null;

    selectTipo.value = origen ? (origen.tipo || 'gasto') : 'gasto';
    rellenarCategorias(origen ? origen.categoria : null);
    rellenarApartados(origen ? origen.apartado : '');
    inputConcepto.value = origen ? origen.concepto || '' : '';
    inputCantidad.value = origen ? origen.cantidad || '' : '';
    inputNota.value = origen ? origen.nota || '' : '';
    // Al duplicar, la fecha es la de hoy
    inputFecha.value = indiceEditando !== null && origen.fecha ? origen.fecha : obtenerFechaHoy();
    $('grupo-recurrente').classList.toggle('oculto', indiceEditando !== null);

    $('titulo-formulario-gasto').textContent = indiceEditando !== null ? 'Editar movimiento' : opciones.plantilla ? 'Duplicar movimiento' : 'Nuevo movimiento';
    $('btn-guardar-gasto').textContent = indiceEditando !== null ? 'Actualizar movimiento' : 'Guardar movimiento';
    ayudas.abrirModal(modalFormulario);
}

function cerrarFormulario() {
    indiceEditando = null;
    ayudas.cerrarModal(modalFormulario);
}

function guardarFormulario(evento) {
    evento.preventDefault();
    const cantidad = leerImporte(inputCantidad.value);
    if (!(cantidad > 0)) return inputCantidad.focus();
    const movimiento = {
        tipo: selectTipo.value,
        concepto: inputConcepto.value.trim(),
        cantidad,
        fecha: inputFecha.value,
        categoria: selectCategoria.value === '__nueva__' ? obtenerCategorias(selectTipo.value)[0] : selectCategoria.value
    };
    if (selectApartado.value) movimiento.apartado = selectApartado.value;
    if (inputNota.value.trim()) movimiento.nota = inputNota.value.trim();
    const gastadoAntes = gastoPorCategoria(movimiento.fecha.substring(0, 7))[movimiento.categoria] || 0;

    let mensaje;
    if (indiceEditando !== null) {
        const anterior = movimientos[indiceEditando];
        if (anterior.recurrenteId) movimiento.recurrenteId = anterior.recurrenteId;
        movimientos[indiceEditando] = movimiento;
        mensaje = 'Movimiento actualizado';
    } else {
        if (checkRecurrente.checked) {
            const { fecha, ...plantilla } = movimiento;
            movimiento.recurrenteId = crearRecurrente({ ambito: 'gasto', datos: plantilla, fecha });
        }
        movimientos.push(movimiento);
        mensaje = checkRecurrente.checked ? 'Movimiento añadido · se repetirá cada mes' : 'Movimiento añadido';
    }

    guardar();
    inputMes.value = movimiento.fecha.substring(0, 7);
    renderizarGastos();
    cerrarFormulario();
    ayudas.mostrarToast(mensaje + avisoPresupuesto(movimiento, indiceEditando === null ? gastadoAntes : Infinity));
}

// --- PINTAR TODO ---

export function renderizarGastos() {
    const mes = inputMes.value || obtenerMesActual();
    tituloMes.textContent = nombreMesLargo(mes);
    [tituloMes, $('totales-gastos')].forEach(el => {
        el.classList.remove('animacion-suave');
        void el.offsetWidth;
        el.classList.add('animacion-suave');
    });
    renderizarTarjetas(mes);
    renderizarPresupuestos(mes);
    renderizarAnalisis(mes);
    rellenarFiltros();
    renderizarHistorial(mes);
    if (ayudas.alCambiar) ayudas.alCambiar();
}

// --- EXCEL ---

const COLUMNAS_EXCEL = [
    { titulo: 'Fecha', ancho: 12 }, { titulo: 'Tipo', ancho: 10 }, { titulo: 'Apartado', ancho: 14 },
    { titulo: 'Categoría', ancho: 16 }, { titulo: 'Concepto', ancho: 32 }, { titulo: 'Nota', ancho: 28 }, { titulo: 'Cantidad (€)', ancho: 14 }
];

function filasExcel(lista) {
    const filas = ordenarPorFecha(lista).map(m => {
        const apartado = m.apartado ? apartadoPorId(m.apartado) : null;
        return [
            { v: m.fecha, tipo: 'fecha' },
            { v: esIngreso(m) ? 'Ingreso' : 'Gasto' },
            { v: apartado ? apartado.nombre : 'Personal' },
            { v: m.categoria || 'Otros' },
            { v: m.concepto || 'Sin concepto' },
            { v: m.nota || '' },
            { v: importe(m), tipo: 'dinero' }
        ];
    });
    const ingresos = sumar(lista.filter(esIngreso));
    const gastos = sumar(lista.filter(m => !esIngreso(m)));
    const fila = (texto, valor) => [null, null, null, null, null, { v: texto, negrita: true }, { v: parseFloat(valor.toFixed(2)), tipo: 'dinero', negrita: true }];
    filas.push([], fila('Total ingresos', ingresos), fila('Total gastos', gastos), fila('Balance', ingresos - gastos));
    return filas;
}

export function generarExcelGastos() {
    if (movimientos.length === 0) return null;
    const hojas = [{ nombre: 'Total', columnas: COLUMNAS_EXCEL, filas: filasExcel(movimientos) }];
    agruparPorMes(movimientos).forEach(mes => hojas.push({ nombre: mes.nombre, columnas: COLUMNAS_EXCEL, filas: filasExcel(mes.elementos) }));
    return crearLibroExcel(hojas);
}

// --- INICIO ---

function cambiarMes(incremento) {
    inputMes.value = sumarMeses(inputMes.value || obtenerMesActual(), incremento);
    renderizarGastos();
}

export function iniciarGastos(funcionesAyuda) {
    ayudas = funcionesAyuda;
    inputMes.value = obtenerMesActual();

    // Migración única de los datos antiguos (Hogar -> apartado)
    if (!localStorage.getItem('migracionApartados')) {
        movimientos = migrarMovimientos(movimientos);
        guardar();
        localStorage.setItem('migracionApartados', '1');
    }

    // Cambiar de mes: flechas, selector y deslizar sobre el título
    $('btn-mes-anterior').addEventListener('click', () => cambiarMes(-1));
    $('btn-mes-siguiente').addEventListener('click', () => cambiarMes(1));
    inputMes.addEventListener('change', renderizarGastos);
    let inicioX = null;
    const zona = $('zona-swipe-mes');
    zona.addEventListener('touchstart', e => { inicioX = e.changedTouches[0].clientX; }, { passive: true });
    zona.addEventListener('touchend', e => {
        if (inicioX === null) return;
        const dx = e.changedTouches[0].clientX - inicioX;
        inicioX = null;
        if (Math.abs(dx) > 50) cambiarMes(dx < 0 ? 1 : -1);
    }, { passive: true });

    // Tarjetas fijas
    $('btn-ver-personal').addEventListener('click', () => abrirDetalle({ tipo: 'personal' }));
    $('btn-ver-ingresos').addEventListener('click', () => abrirDetalle({ tipo: 'ingresos' }));

    // Desplegables
    [['cabecera-historial', 'contenedor-acordeon', 'icono-flecha']].forEach(([cabecera, contenedor, flecha]) => {
        $(cabecera).addEventListener('click', () => {
            const abierto = $(contenedor).classList.toggle('abierto');
            $(flecha).style.transform = abierto ? 'rotate(180deg)' : 'rotate(0deg)';
        });
    });

    // Filtros del historial
    ['filtro-mov-texto'].forEach(id => $(id).addEventListener('input', () => renderizarHistorial(inputMes.value)));
    ['filtro-mov-categoria', 'filtro-mov-ambito', 'filtro-mov-todos'].forEach(id => $(id).addEventListener('change', () => renderizarHistorial(inputMes.value)));

    // Presupuestos y análisis
    $('btn-editar-presupuestos').addEventListener('click', abrirEdicionPresupuestos);
    $('btn-guardar-presupuestos').addEventListener('click', guardarPresupuestos);
    $('btn-cerrar-presupuestos').addEventListener('click', () => ayudas.cerrarModal(modalPresupuestos));
    modalPresupuestos.addEventListener('click', (e) => { if (e.target === modalPresupuestos) ayudas.cerrarModal(modalPresupuestos); });
    document.querySelectorAll('#selector-analisis button').forEach(btn => btn.addEventListener('click', () => {
        modoAnalisis = btn.getAttribute('data-modo');
        localStorage.setItem('modoAnalisisGastos', modoAnalisis);
        renderizarAnalisis(inputMes.value);
    }));

    // Formulario
    selectTipo.addEventListener('change', () => { rellenarCategorias(null); actualizarAyudaApartado(); });
    selectApartado.addEventListener('change', actualizarAyudaApartado);
    selectCategoria.addEventListener('change', () => {
        if (selectCategoria.value !== '__nueva__') return;
        const nombre = prompt('Nombre de la nueva categoría:');
        rellenarCategorias(nombre && nombre.trim() ? asegurarCategoria(selectTipo.value, nombre) : null);
    });
    $('btn-config-desde-formulario').addEventListener('click', abrirConfiguracion);
    formulario.addEventListener('submit', guardarFormulario);
    $('btn-cerrar-formulario').addEventListener('click', cerrarFormulario);
    modalFormulario.addEventListener('click', (e) => { if (e.target === modalFormulario) cerrarFormulario(); });
    $('btn-cerrar-detalle').addEventListener('click', () => { detalleAbierto = null; ayudas.cerrarModal(modalDetalle); });
    modalDetalle.addEventListener('click', (e) => { if (e.target === modalDetalle) { detalleAbierto = null; ayudas.cerrarModal(modalDetalle); } });

    renderizarGastos();
}
