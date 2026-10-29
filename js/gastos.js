// Gastos e ingresos: tarjetas del mes (con comparación con el mes anterior), apartados
// (gastos que van aparte, como "Hogar"), gráficos, historial con filtros,
// formulario (con notas y repetición mensual), duplicar y deshacer.

import { leerDato, guardarDato } from './datos.js?v=24';
import {
    obtenerFechaHoy, obtenerMesActual, sumarMeses, nombreMesCorto, nombreMesLargo, formatoFechaES,
    formatoNumero, formatoEuros, formatoPorcentaje, escaparHTML, leerImporte
} from './utils.js?v=24';
import { crearLibroExcel, agruparPorMes, ordenarPorFecha, Hoja, ref, nombreHojaMes, COLORES_GRAFICO, COLOR_OTROS } from './excel.js?v=24';
import { obtenerCategorias, obtenerApartados, apartadoPorId, asegurarCategoria, asegurarApartado, abrirConfiguracion } from './configuracion.js?v=24';
import { crearRecurrente } from './recurrentes.js?v=24';
import { buscarRegla, aprenderRegla, iniciarReglas } from './reglas.js?v=24';
import { dibujarTarta, conectarInteraccion, agruparOtros, dibujarEvolucionMensual, conectarEvolucion } from './graficos.js?v=24';

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
let categoriaTocada = false; // si el usuario elige la categoría o el apartado, el autocompletado ya no los cambia
let apartadoTocado = false;
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

// --- AUTOCOMPLETAR EL CONCEPTO ---

// Conceptos ya usados de ese tipo (los más recientes primero) como sugerencias
function rellenarSugerenciasConcepto() {
    const vistos = new Set();
    const tipo = selectTipo.value;
    const opciones = [];
    ordenarPorFecha(movimientos).reverse().forEach(m => {
        const concepto = (m.concepto || '').trim();
        if (!concepto || (tipo === 'ingreso') !== esIngreso(m) || vistos.has(concepto.toLowerCase())) return;
        vistos.add(concepto.toLowerCase());
        if (opciones.length < 300) opciones.push(`<option value="${escaparHTML(concepto)}"></option>`);
    });
    $('lista-conceptos').innerHTML = opciones.join('');
}

// Si el concepto ya se usó, se copian su categoría, apartado e importe; si no, se aplica una regla aprendida
function autocompletarConcepto() {
    if (indiceEditando !== null) return;
    const texto = inputConcepto.value.trim().toLowerCase();
    if (!texto) return;
    const tipo = selectTipo.value;
    const anterior = ordenarPorFecha(movimientos).reverse()
        .find(m => (m.concepto || '').trim().toLowerCase() === texto && (tipo === 'ingreso') === esIngreso(m));
    const origen = anterior || buscarRegla(texto, tipo);
    if (!origen) return;
    if (!categoriaTocada && origen.categoria) rellenarCategorias(origen.categoria);
    if (!apartadoTocado) rellenarApartados(origen.apartado || '');
    if (anterior && !inputCantidad.value) inputCantidad.value = anterior.cantidad;
}

// opciones: { indice } para editar, { plantilla } para duplicar, o nada para uno nuevo
export function abrirFormularioGasto(opciones = {}) {
    formulario.reset();
    indiceEditando = opciones.indice !== undefined ? opciones.indice : null;
    categoriaTocada = false;
    apartadoTocado = false;
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
    rellenarSugerenciasConcepto();

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
    aprenderRegla(movimiento.concepto, movimiento.tipo, movimiento.categoria, movimiento.apartado);

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
    ayudas.mostrarToast(mensaje);
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
    renderizarAnalisis(mes);
    rellenarFiltros();
    renderizarHistorial(mes);
    if (ayudas.alCambiar) ayudas.alCambiar();
}

// --- EXCEL ---
// El gasto general es solo el personal. Cada apartado (Hogar, etc.) va aparte: su propia hoja,
// con sus tablas y gráficas, y no se suma al gasto ni al ahorro general.
// Hojas: "Total" (personal), "Movimientos", una por apartado y una por mes.

const CABECERA_MOVIMIENTOS = ['Fecha', 'Tipo', 'Apartado', 'Categoría', 'Concepto', 'Nota', 'Importe'];

function filaCabecera(hoja, titulos, numericasDesde) {
    return hoja.anadir(titulos.map((t, i) => ({ v: t, estilo: 'cabecera', derecha: numericasDesde !== undefined && i >= numericasDesde })));
}

// Cifras clave: etiqueta y valor en dos columnas combinadas cada una
function cifrasClave(hoja, cifras) {
    const filaEtiquetas = hoja.anadir([]);
    const filaValores = hoja.anadir([]);
    cifras.forEach((cifra, i) => {
        const col = i * 2;
        hoja.filas[filaEtiquetas - 1][col] = { v: cifra.etiqueta, estilo: 'kpiEtiqueta' };
        hoja.filas[filaEtiquetas - 1][col + 1] = { v: '', estilo: 'kpiEtiqueta' };
        hoja.filas[filaValores - 1][col] = { ...cifra.valor, estilo: 'kpiValor' };
        hoja.filas[filaValores - 1][col + 1] = { v: '', estilo: 'kpiEtiqueta' };
        hoja.combinadas.push(`${ref(col, filaEtiquetas)}:${ref(col + 1, filaEtiquetas)}`, `${ref(col, filaValores)}:${ref(col + 1, filaValores)}`);
    });
    return filaValores;
}

function nombreApartado(m) {
    const apartado = m.apartado ? apartadoPorId(m.apartado) : null;
    return apartado ? apartado.nombre : 'Personal';
}

// Lista de movimientos con filtros y totales (con fórmulas).
// alcance: 'personal' (los totales solo cuentan lo personal) o el nombre de un apartado.
function listaMovimientos(hoja, lista, alcance = 'personal') {
    const cabecera = filaCabecera(hoja, CABECERA_MOVIMIENTOS, 6);
    ordenarPorFecha(lista).forEach(m => hoja.anadir([
        { v: m.fecha, tipo: 'fecha' },
        { v: esIngreso(m) ? 'Ingreso' : 'Gasto' },
        { v: nombreApartado(m) },
        { v: m.categoria || 'Otros' },
        { v: m.concepto || 'Sin concepto' },
        { v: m.nota || '' },
        { v: esIngreso(m) ? importe(m) : -importe(m), tipo: 'dineroSigno' }
    ]));
    const ultima = Math.max(hoja.filaActual, cabecera + 1);
    const rango = c => `${ref(c, cabecera + 1)}:${ref(c, ultima)}`;
    hoja.filtro = `A${cabecera}:G${ultima}`;
    hoja.anadir([]);

    const delAlcance = lista.filter(m => alcance === 'personal' ? !m.apartado : nombreApartado(m) === alcance);
    const entradas = sumar(delAlcance.filter(esIngreso));
    const salidas = sumar(delAlcance.filter(m => !esIngreso(m)));
    const sumaSi = tipo => `SUMIFS(${rango(6)},${rango(1)},"${tipo}",${rango(2)},"${escaparComillas(alcance === 'personal' ? 'Personal' : alcance)}")`;
    const total = (texto, f, v, tipo) => hoja.anadir([null, null, null, null, null, { v: texto, estilo: 'total' }, { f, v, tipo, estilo: 'total' }]);
    if (alcance === 'personal') {
        total('Ingresos (personal)', sumaSi('Ingreso'), entradas, 'dinero');
        total('Gasto personal', `-${sumaSi('Gasto')}`, salidas, 'dinero');
        total('Ahorro', `${sumaSi('Ingreso')}+${sumaSi('Gasto')}`, entradas - salidas, 'dineroSigno');
        if (lista.some(m => m.apartado)) hoja.anadir([null, null, null, null, { v: 'Los movimientos de los apartados no cuentan en estos totales.', estilo: 'nota' }]);
    } else {
        total('Gastos', `-${sumaSi('Gasto')}`, salidas, 'dinero');
        total('Devoluciones', sumaSi('Ingreso'), entradas, 'dinero');
        total('Neto', `-(${sumaSi('Gasto')}+${sumaSi('Ingreso')})`, salidas - entradas, 'dineroSigno');
    }
    return cabecera;
}

function escaparComillas(texto) {
    return String(texto).replace(/"/g, '""');
}

function colorCategoria(categoria) {
    const indice = obtenerCategorias('gasto').indexOf(categoria);
    return indice >= 0 && indice < COLORES_GRAFICO.length ? COLORES_GRAFICO[indice] : COLOR_OTROS;
}

// Tabla "por categoría" con su gráfica de anillo. Devuelve si se ha añadido.
function tablaCategorias(hoja, lista, { titulo, tituloGrafico, ancla, meses }) {
    const porCategoria = {};
    lista.filter(m => !esIngreso(m)).forEach(m => { porCategoria[m.categoria || 'Otros'] = (porCategoria[m.categoria || 'Otros'] || 0) + importe(m); });
    const categorias = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
    if (!categorias.length) return false;
    const total = categorias.reduce((s, c) => s + c[1], 0);
    // Las categorías personales llevan su color de siempre; las demás (p. ej. las de un apartado), los siguientes libres
    const usados = new Set(categorias.map(c => colorCategoria(c[0])).filter(c => c !== COLOR_OTROS));
    const libres = COLORES_GRAFICO.filter(c => !usados.has(c));
    const colores = categorias.map(c => { const color = colorCategoria(c[0]); return color !== COLOR_OTROS ? color : (libres.shift() || COLOR_OTROS); });

    hoja.anadir([]);
    hoja.anadir([{ v: titulo, estilo: 'seccion' }]);
    // En una hoja de un solo mes no tiene sentido la media al mes
    const columnas = meses > 1 ? ['Categoría', 'Total', '% del total', 'Media al mes'] : ['Categoría', 'Gastado', '% del gasto'];
    const cab = filaCabecera(hoja, columnas, 1);
    categorias.forEach(([categoria, valor]) => {
        const f = hoja.filaActual + 1;
        const fila = [{ v: categoria }, { v: valor, tipo: 'dinero' }, { f: `B${f}/SUM($B$${cab + 1}:$B$${cab + categorias.length})`, v: valor / total, tipo: 'porcentaje' }];
        if (meses > 1) fila.push({ f: `B${f}/${meses}`, v: valor / meses, tipo: 'dinero' });
        hoja.anadir(fila);
    });
    const pc = cab + 1, uc = hoja.filaActual;
    hoja.anadir([{ v: 'Total', estilo: 'total' }, { f: `SUM(B${pc}:B${uc})`, v: total, tipo: 'dinero', estilo: 'total' }]);
    if (categorias.length > 1 || meses > 1) {
        hoja.graficos.push({
            tipo: 'anillo', titulo: tituloGrafico, ancla,
            categorias: { rango: `A${pc}:A${uc}`, valores: categorias.map(c => c[0]) },
            series: [{ nombre: 'Gasto', rango: `B${pc}:B${uc}`, valores: categorias.map(c => c[1]), colores }]
        });
    }
    return true;
}

// --- HOJA "TOTAL": solo lo personal ---

function hojaTotal(meses) {
    const hoja = new Hoja('Total');
    hoja.anchos = [18, 15, 16, 15, 15, 3];
    hoja.anadir([{ v: 'Gastos e ingresos', estilo: 'titulo' }]);
    hoja.anadir([{ v: `Generado el ${formatoFechaES(obtenerFechaHoy())} con Gestor de Gastos · De ${nombreHojaMes(meses[0])} a ${nombreHojaMes(meses[meses.length - 1])} · Gasto general = gasto personal (los apartados van en sus hojas)`, estilo: 'nota' }]);
    hoja.anadir([]);

    const datos = meses.map(mes => {
        const personales = personalesDelMes(mes);
        return { mes, ingresos: sumar(personales.filter(esIngreso)), gasto: sumar(personales.filter(m => !esIngreso(m))) };
    });
    const ingresos = datos.reduce((s, d) => s + d.ingresos, 0);
    const gasto = datos.reduce((s, d) => s + d.gasto, 0);

    // Las cifras clave apuntan a la fila de totales de la tabla mes a mes
    const filaTotal = 3 + 2 + 1 + 1 + 1 + datos.length + 1;
    cifrasClave(hoja, [
        { etiqueta: 'Ingresos', valor: { f: `B${filaTotal}`, v: ingresos, tipo: 'dinero' } },
        { etiqueta: 'Gasto personal', valor: { f: `C${filaTotal}`, v: gasto, tipo: 'dinero' } },
        { etiqueta: 'Ahorro', valor: { f: `D${filaTotal}`, v: ingresos - gasto, tipo: 'dineroSigno' } },
        { etiqueta: 'Tasa de ahorro', valor: { f: `IF(B${filaTotal}>0,D${filaTotal}/B${filaTotal},"")`, v: ingresos > 0 ? (ingresos - gasto) / ingresos : '', tipo: 'porcentajeSigno' } }
    ]);
    hoja.anadir([]);

    hoja.anadir([{ v: 'Mes a mes', estilo: 'seccion' }]);
    const cabecera = filaCabecera(hoja, ['Mes', 'Ingresos', 'Gasto personal', 'Ahorro', 'Tasa de ahorro'], 1);
    datos.forEach(d => {
        const f = hoja.filaActual + 1;
        hoja.anadir([
            { v: nombreHojaMes(d.mes) },
            { v: d.ingresos, tipo: 'dinero' },
            { v: d.gasto, tipo: 'dinero' },
            { f: `B${f}-C${f}`, v: d.ingresos - d.gasto, tipo: 'dineroSigno' },
            { f: `IF(B${f}>0,D${f}/B${f},"")`, v: d.ingresos > 0 ? (d.ingresos - d.gasto) / d.ingresos : '', tipo: 'porcentajeSigno' }
        ]);
    });
    const primera = cabecera + 1, ultima = hoja.filaActual;
    hoja.anadir([{ v: 'Total', estilo: 'total' },
        { f: `SUM(B${primera}:B${ultima})`, v: ingresos, tipo: 'dinero', estilo: 'total' },
        { f: `SUM(C${primera}:C${ultima})`, v: gasto, tipo: 'dinero', estilo: 'total' },
        { f: `SUM(D${primera}:D${ultima})`, v: ingresos - gasto, tipo: 'dineroSigno', estilo: 'total' },
        { f: `IF(B${filaTotal}>0,D${filaTotal}/B${filaTotal},"")`, v: ingresos > 0 ? (ingresos - gasto) / ingresos : '', tipo: 'porcentajeSigno', estilo: 'total' }]);

    const categoriasMes = { rango: `A${primera}:A${ultima}`, valores: datos.map(d => nombreHojaMes(d.mes)) };
    hoja.graficos.push({
        tipo: 'columnas', titulo: 'Ingresos y gasto personal por mes', ancla: { col: 6, fila: 3, ancho: 9, alto: 17 }, categorias: categoriasMes,
        series: [
            { nombre: 'Ingresos', rango: `B${primera}:B${ultima}`, valores: datos.map(d => d.ingresos), color: COLORES_GRAFICO[2] },
            { nombre: 'Gasto personal', rango: `C${primera}:C${ultima}`, valores: datos.map(d => d.gasto), color: COLORES_GRAFICO[1] }
        ]
    });
    hoja.graficos.push({
        tipo: 'columnas', titulo: 'Ahorro mensual', ancla: { col: 6, fila: 21, ancho: 9, alto: 15 }, sinLeyenda: true, categorias: categoriasMes,
        series: [{ nombre: 'Ahorro', rango: `D${primera}:D${ultima}`, valores: datos.map(d => d.ingresos - d.gasto), color: COLORES_GRAFICO[0], colorNegativo: COLORES_GRAFICO[7] }]
    });

    tablaCategorias(hoja, movimientos.filter(m => !m.apartado), {
        titulo: 'Gasto personal por categoría', tituloGrafico: 'Gasto personal por categoría',
        ancla: { col: 6, fila: 37, ancho: 9, alto: 17 }, meses: datos.length
    });

    // Resumen de los apartados (su detalle está en su propia hoja)
    const apartados = apartadosConDatos();
    if (apartados.length) {
        hoja.anadir([]);
        hoja.anadir([{ v: 'Apartados (van aparte, no suman al gasto personal)', estilo: 'seccion' }]);
        filaCabecera(hoja, ['Apartado', 'Gastos', 'Devoluciones', 'Neto', 'Cómo cuenta'], 1);
        apartados.forEach(({ apartado, lista }) => {
            const f = hoja.filaActual + 1;
            const gastos = sumar(lista.filter(m => !esIngreso(m)));
            const devoluciones = sumar(lista.filter(esIngreso));
            hoja.anadir([{ v: apartado.nombre }, { v: gastos, tipo: 'dinero' }, { v: devoluciones, tipo: 'dinero' },
                { f: `B${f}-C${f}`, v: gastos - devoluciones, tipo: 'dineroSigno' }, { v: apartado.acumulado ? 'Acumulado' : 'Mensual' }]);
        });
        hoja.anadir([{ v: 'Cada apartado tiene su detalle (mes a mes, categorías y movimientos) en su propia hoja.', estilo: 'nota' }]);
    }
    return hoja;
}

function apartadosConDatos() {
    return obtenerApartados()
        .map(apartado => ({ apartado, lista: movimientos.filter(m => m.apartado === apartado.id) }))
        .filter(a => a.lista.length);
}

// --- UNA HOJA POR APARTADO ---

function hojaApartado(apartado, lista, meses) {
    const hoja = new Hoja(apartado.nombre);
    // Las tablas usan las columnas A-E y la lista de movimientos A-G; las gráficas van a la derecha (columna I)
    hoja.anchos = [18, 14, 14, 16, 30, 24, 14, 3];
    const gastos = sumar(lista.filter(m => !esIngreso(m)));
    const devoluciones = sumar(lista.filter(esIngreso));
    // Meses desde el primer movimiento del apartado hasta el último mes del periodo
    const desde = lista.map(mesDe).filter(Boolean).sort()[0] || meses[0];
    const mesesApartado = meses.filter(m => m >= desde);

    hoja.anadir([{ v: apartado.nombre, estilo: 'titulo' }]);
    hoja.anadir([{ v: `Apartado: va aparte y no se suma al gasto personal · ${apartado.acumulado ? 'En la app se muestra acumulado' : 'En la app se muestra mes a mes'} · Las devoluciones (p. ej. Bizum) se restan`, estilo: 'nota' }]);
    hoja.anadir([]);
    const filaTotal = 3 + 2 + 1 + 1 + 1 + mesesApartado.length + 1;
    cifrasClave(hoja, [
        { etiqueta: 'Gastos', valor: { f: `B${filaTotal}`, v: gastos, tipo: 'dinero' } },
        { etiqueta: 'Devoluciones', valor: { f: `C${filaTotal}`, v: devoluciones, tipo: 'dinero' } },
        { etiqueta: 'Neto', valor: { f: `D${filaTotal}`, v: gastos - devoluciones, tipo: 'dineroSigno' } },
        { etiqueta: 'Neto medio al mes', valor: { f: `D${filaTotal}/${mesesApartado.length}`, v: (gastos - devoluciones) / mesesApartado.length, tipo: 'dineroSigno' } }
    ]);
    hoja.anadir([]);

    hoja.anadir([{ v: 'Mes a mes', estilo: 'seccion' }]);
    const cabecera = filaCabecera(hoja, ['Mes', 'Gastos', 'Devoluciones', 'Neto', 'Acumulado'], 1);
    let acumulado = 0;
    const datos = mesesApartado.map(mes => {
        const delMes = lista.filter(m => mesDe(m) === mes);
        const g = sumar(delMes.filter(m => !esIngreso(m)));
        const d = sumar(delMes.filter(esIngreso));
        acumulado += g - d;
        return { mes, gastos: g, devoluciones: d, neto: g - d, acumulado };
    });
    datos.forEach((d, i) => {
        const f = hoja.filaActual + 1;
        hoja.anadir([
            { v: nombreHojaMes(d.mes) },
            { v: d.gastos, tipo: 'dinero' },
            { v: d.devoluciones, tipo: 'dinero' },
            { f: `B${f}-C${f}`, v: d.neto, tipo: 'dineroSigno' },
            { f: i === 0 ? `D${f}` : `E${f - 1}+D${f}`, v: d.acumulado, tipo: 'dineroSigno' }
        ]);
    });
    const primera = cabecera + 1, ultima = hoja.filaActual;
    hoja.anadir([{ v: 'Total', estilo: 'total' },
        { f: `SUM(B${primera}:B${ultima})`, v: gastos, tipo: 'dinero', estilo: 'total' },
        { f: `SUM(C${primera}:C${ultima})`, v: devoluciones, tipo: 'dinero', estilo: 'total' },
        { f: `SUM(D${primera}:D${ultima})`, v: gastos - devoluciones, tipo: 'dineroSigno', estilo: 'total' }]);

    const categoriasMes = { rango: `A${primera}:A${ultima}`, valores: datos.map(d => nombreHojaMes(d.mes)) };
    const series = [{ nombre: 'Gastos', rango: `B${primera}:B${ultima}`, valores: datos.map(d => d.gastos), color: COLORES_GRAFICO[1] }];
    if (devoluciones > 0) series.push({ nombre: 'Devoluciones', rango: `C${primera}:C${ultima}`, valores: datos.map(d => d.devoluciones), color: COLORES_GRAFICO[2] });
    hoja.graficos.push({ tipo: 'columnas', titulo: `${apartado.nombre}: gastos y devoluciones por mes`, ancla: { col: 8, fila: 3, ancho: 8, alto: 17 }, sinLeyenda: series.length === 1, categorias: categoriasMes, series });
    hoja.graficos.push(apartado.acumulado
        ? { tipo: 'lineas', titulo: `${apartado.nombre}: saldo acumulado`, ancla: { col: 8, fila: 21, ancho: 8, alto: 15 }, sinLeyenda: true, categorias: categoriasMes,
            series: [{ nombre: 'Acumulado', rango: `E${primera}:E${ultima}`, valores: datos.map(d => d.acumulado), color: COLORES_GRAFICO[0], puntos: true }] }
        : { tipo: 'columnas', titulo: `${apartado.nombre}: neto por mes`, ancla: { col: 8, fila: 21, ancho: 8, alto: 15 }, sinLeyenda: true, categorias: categoriasMes,
            series: [{ nombre: 'Neto', rango: `D${primera}:D${ultima}`, valores: datos.map(d => d.neto), color: COLORES_GRAFICO[0], colorNegativo: COLORES_GRAFICO[2] }] });

    tablaCategorias(hoja, lista, {
        titulo: 'Gastos por categoría', tituloGrafico: `${apartado.nombre}: gastos por categoría`,
        ancla: { col: 8, fila: 37, ancho: 8, alto: 17 }, meses: mesesApartado.length
    });

    hoja.anadir([]);
    hoja.anadir([{ v: 'Movimientos', estilo: 'seccion' }]);
    listaMovimientos(hoja, lista, apartado.nombre);
    return hoja;
}

// --- UNA HOJA POR MES ---

function hojaMes(mes, lista) {
    const hoja = new Hoja(nombreHojaMes(mes));
    hoja.anchos = [12, 10, 14, 16, 30, 26, 14, 3];
    const personales = lista.filter(m => !m.apartado);
    const ingresos = sumar(personales.filter(esIngreso));
    const gastoPersonal = sumar(personales.filter(m => !esIngreso(m)));

    hoja.anadir([{ v: nombreHojaMes(mes), estilo: 'titulo' }]);
    hoja.anadir([{ v: `${lista.length} ${lista.length === 1 ? 'movimiento' : 'movimientos'} · Gasto general = gasto personal`, estilo: 'nota' }]);
    hoja.anadir([]);
    cifrasClave(hoja, [
        { etiqueta: 'Ingresos', valor: { v: ingresos, tipo: 'dinero' } },
        { etiqueta: 'Gasto personal', valor: { v: gastoPersonal, tipo: 'dinero' } },
        { etiqueta: 'Ahorro', valor: { v: ingresos - gastoPersonal, tipo: 'dineroSigno' } },
        { etiqueta: 'Tasa de ahorro', valor: { v: ingresos > 0 ? (ingresos - gastoPersonal) / ingresos : '', tipo: 'porcentajeSigno' } }
    ]);

    tablaCategorias(hoja, personales, {
        titulo: 'Gasto personal por categoría', tituloGrafico: `Gasto personal · ${nombreHojaMes(mes).toLowerCase()}`,
        ancla: { col: 8, fila: 3, ancho: 7, alto: 16 }, meses: 1
    });

    // Apartados de este mes, aparte
    const conApartado = lista.filter(m => m.apartado);
    if (conApartado.length) {
        hoja.anadir([]);
        hoja.anadir([{ v: 'Apartados (aparte del gasto personal)', estilo: 'seccion' }]);
        filaCabecera(hoja, ['Apartado', 'Gastos', 'Devoluciones', 'Neto'], 1);
        obtenerApartados().forEach(apartado => {
            const delApartado = conApartado.filter(m => m.apartado === apartado.id);
            if (!delApartado.length) return;
            const f = hoja.filaActual + 1;
            const g = sumar(delApartado.filter(m => !esIngreso(m)));
            const d = sumar(delApartado.filter(esIngreso));
            hoja.anadir([{ v: apartado.nombre }, { v: g, tipo: 'dinero' }, { v: d, tipo: 'dinero' }, { f: `B${f}-C${f}`, v: g - d, tipo: 'dineroSigno' }]);
        });
    }

    hoja.anadir([]);
    hoja.anadir([{ v: 'Movimientos', estilo: 'seccion' }]);
    listaMovimientos(hoja, lista, 'personal');
    return hoja;
}

export function generarExcelGastos() {
    if (movimientos.length === 0) return null;
    // Todos los meses entre el primero y el último con movimientos (también los vacíos, para las gráficas)
    const ordenados = movimientos.filter(m => /^\d{4}-\d{2}/.test(m.fecha || '')).map(mesDe).sort();
    const meses = [];
    if (ordenados.length) for (let m = ordenados[0]; m <= ordenados[ordenados.length - 1]; m = sumarMeses(m, 1)) meses.push(m);
    if (!meses.length) meses.push(obtenerMesActual());

    const total = hojaTotal(meses);
    const todos = new Hoja('Movimientos');
    todos.anchos = [12, 10, 14, 16, 30, 26, 14];
    todos.congelarFilas = 1;
    listaMovimientos(todos, movimientos, 'personal');

    const porApartado = apartadosConDatos().map(({ apartado, lista }) => hojaApartado(apartado, lista, meses));
    const porMes = agruparPorMes(movimientos).filter(g => g.mes !== 'sin-fecha').map(g => hojaMes(g.mes, g.elementos));
    return crearLibroExcel([total, todos, ...porApartado, ...porMes]);
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

    // Análisis
    document.querySelectorAll('#selector-analisis button').forEach(btn => btn.addEventListener('click', () => {
        modoAnalisis = btn.getAttribute('data-modo');
        localStorage.setItem('modoAnalisisGastos', modoAnalisis);
        renderizarAnalisis(inputMes.value);
    }));

    // Formulario
    selectTipo.addEventListener('change', () => { rellenarCategorias(null); actualizarAyudaApartado(); rellenarSugerenciasConcepto(); autocompletarConcepto(); });
    selectApartado.addEventListener('change', () => { apartadoTocado = true; actualizarAyudaApartado(); });
    inputConcepto.addEventListener('input', autocompletarConcepto);
    inputConcepto.addEventListener('change', autocompletarConcepto);
    selectCategoria.addEventListener('change', () => {
        categoriaTocada = true;
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

    iniciarReglas({ nombreApartado: id => { const a = apartadoPorId(id); return a ? a.nombre : ''; } });
    renderizarGastos();
}
