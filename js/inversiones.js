import {
    obtenerFechaHoy, cargarInversionesDesdeMemoria, guardarInversionesEnMemoria,
    calcularTotalInversion, calcularResumenPorActivo, calcularPosiciones, claveActivo, tieneDetalleTitulos, esVenta,
    formatoNumero, formatoEuros, formatoPorcentaje, formatoDecimalVariable, escaparHTML as escaparTexto, leerImporte
} from './utils.js?v=20';
import { crearLibroExcel, agruparPorMes, ordenarPorFecha } from './excel.js?v=20';
import { iniciarCarteras, carteraDeActivo, abrirModalCarteras, abrirEdicionCartera } from './carteras.js?v=20';
import { dibujarTarta, dibujarBarras, conectarInteraccion, agruparOtros, dibujarLineas } from './graficos.js?v=20';
import {
    iniciarValoraciones, abrirValorActual, valorActual, precioActual,
    rentabilidad, formatoRentabilidad, claseRentabilidad
} from './valoraciones.js?v=20';
import { leerDato, guardarDato } from './datos.js?v=20';
import { crearRecurrente } from './recurrentes.js?v=20';

const ICONO_EDITAR = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const ICONO_DESPLEGAR = '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>';
const SERIES_DISPONIBLES = 8;
const ICONO_DUPLICAR = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const ICONO_ELIMINAR = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

const modalInversion = document.getElementById('modal-inversion');
const formularioInversion = document.getElementById('formulario-inversion');
const inputNombre = document.getElementById('inv-nombre');
const inputIsin = document.getElementById('inv-isin');
const selectTipo = document.getElementById('inv-tipo');
const inputCantidad = document.getElementById('inv-cantidad');
const inputPrecio = document.getElementById('inv-precio');
const inputFecha = document.getElementById('inv-fecha');
const displayTotalFormulario = document.getElementById('inv-total-formulario');
const listaInversionesTabla = document.getElementById('lista-inversiones');
const listaActivos = document.getElementById('lista-activos');
const datalistNombres = document.getElementById('lista-nombres-activos');
const datalistIsin = document.getElementById('lista-isin-activos');
const inputComision = document.getElementById('inv-comision');
const inputImporteFinal = document.getElementById('inv-importe-final');
const displayDesglose = document.getElementById('inv-desglose-formulario');
const errorComision = document.getElementById('inv-error-comision');
const resumenOperaciones = document.getElementById('resumen-operaciones');
const filtroNombre = document.getElementById('filtro-inv-nombre');
const filtroTipo = document.getElementById('filtro-inv-tipo');
const inputImporteSolo = document.getElementById('inv-importe-solo');
const bloqueDetalle = document.getElementById('bloque-detalle-importe');
const bloqueSoloImporte = document.getElementById('bloque-solo-importe');
const checkPeriodica = document.getElementById('inv-recurrente');

let inversiones = cargarInversionesDesdeMemoria();
let historicoValor = leerDato('historicoValor'); // [{ fecha, invertido, valor }]: un punto por día en que se ve la cartera valorada
let indiceEditando = null;
let operacion = 'compra'; // 'compra' o 'venta'
let totalesCartera = { invertido: 0, valor: 0, realizado: 0 }; // para la pantalla de Resumen
let modoImporte = 'detalle'; // 'detalle' (títulos y precio) o 'total' (solo lo pagado)
let ultimoEditado = 'comision'; // 'comision' o 'final': el que escribió el usuario manda sobre el otro
let ayudas = {}; // abrirModal, cerrarModal, mostrarToast, formatoFechaES, alCambiar (vienen de main.js)

export function escaparHTML(texto) {
    return escaparTexto(texto);
}

// Participaciones y precios pueden tener muchos decimales (p. ej. valor liquidativo de un fondo)
export function formatoDecimal(numero, maxDecimales) {
    return formatoDecimalVariable(numero, maxDecimales);
}

export function normalizarIsin(isin) {
    return String(isin || '').replace(/\s/g, '').toUpperCase();
}

export function obtenerInversiones() {
    return inversiones;
}

// Lo invertido ahora y lo que vale (los activos sin valorar cuentan por lo invertido)
export function obtenerTotalesCartera() {
    return totalesCartera;
}

export function obtenerHistoricoValor() {
    return historicoValor;
}

export function reemplazarHistoricoValor(lista) {
    historicoValor = Array.isArray(lista) ? lista : [];
    guardarDato('historicoValor', historicoValor);
}

// Quita inversiones por su posición (p. ej. aportaciones periódicas sustituidas por la orden real importada)
export function eliminarInversiones(indices) {
    const quitar = new Set(indices);
    inversiones = inversiones.filter((_, indice) => !quitar.has(indice));
    guardarInversionesEnMemoria(inversiones);
}

export function reemplazarInversiones(lista) {
    inversiones = lista;
    guardarInversionesEnMemoria(inversiones);
    renderizarInversiones();
}

// Cambia el nombre de un activo en todas sus aportaciones
function renombrarActivo(clave, nuevoNombre) {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    inversiones.forEach(inv => { if (claveActivo(inv) === clave) inv.nombre = nombre; });
    guardarInversionesEnMemoria(inversiones);
    renderizarInversiones();
    ayudas.mostrarToast('Nombre actualizado');
}

function activarEdicionNombre(boton) {
    const fila = boton.closest('.activo-fila');
    const etiqueta = fila.querySelector('.activo-nombre');
    const clave = boton.getAttribute('data-clave');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input-nombre-activo';
    input.value = etiqueta.classList.contains('sin-nombre') ? '' : etiqueta.textContent;
    input.placeholder = 'Nombre del fondo / acción';
    etiqueta.replaceWith(input);
    boton.classList.add('oculto');
    input.focus();

    let terminado = false;
    const terminar = guardar => {
        if (terminado) return;
        terminado = true;
        if (guardar && input.value.trim()) renombrarActivo(clave, input.value);
        else renderizarInversiones();
    };
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') terminar(true);
        if (e.key === 'Escape') terminar(false);
    });
    input.addEventListener('blur', () => terminar(true));
}

export function anadirInversiones(lista) {
    inversiones.push(...lista);
    guardarInversionesEnMemoria(inversiones);
    renderizarInversiones();
}

// Busca un activo ya registrado (la aportación más reciente) por ISIN o por nombre
export function buscarActivo({ isin, nombre }) {
    const isinBuscado = normalizarIsin(isin);
    const nombreBuscado = String(nombre || '').trim().toLowerCase();
    const candidatos = ordenarPorFecha(inversiones).reverse();
    if (isinBuscado) return candidatos.find(inv => normalizarIsin(inv.isin) === isinBuscado) || null;
    if (nombreBuscado) return candidatos.find(inv => (inv.nombre || '').trim().toLowerCase() === nombreBuscado) || null;
    return null;
}

function fijarOperacion(nueva) {
    operacion = nueva;
    const venta = operacion === 'venta';
    document.querySelectorAll('#operacion-inversion button').forEach(btn => {
        const activo = btn.getAttribute('data-valor') === operacion;
        btn.classList.toggle('activo', activo);
        btn.setAttribute('aria-pressed', activo);
    });
    document.getElementById('etiqueta-precio-inversion').textContent = venta ? 'Precio de venta por título (€)' : 'Precio por título (€)';
    document.getElementById('etiqueta-final-inversion').textContent = venta ? 'Importe final recibido (€)' : 'Importe final pagado (€)';
    document.getElementById('etiqueta-solo-importe').textContent = venta ? 'Importe recibido (€) · vende toda la posición' : 'Importe total pagado (€)';
    document.getElementById('texto-total-formulario').textContent = venta ? 'Total recibido' : 'Total pagado';
    errorComision.textContent = venta ? 'El importe recibido no puede ser mayor que títulos × precio.' : 'El importe final no puede ser menor que títulos × precio.';
    document.getElementById('grupo-inv-recurrente').classList.toggle('oculto', venta || indiceEditando !== null);
    recalcularImportes();
}

function fijarModoImporte(modo) {
    modoImporte = modo;
    const soloTotal = modo === 'total';
    bloqueSoloImporte.classList.toggle('oculto', !soloTotal);
    bloqueDetalle.classList.toggle('oculto', soloTotal);
    inputImporteSolo.required = soloTotal;
    inputCantidad.required = !soloTotal;
    inputPrecio.required = !soloTotal;
    document.querySelectorAll('#modo-importe-inversion button').forEach(btn => {
        const activo = btn.getAttribute('data-valor') === modo;
        btn.classList.toggle('activo', activo);
        btn.setAttribute('aria-pressed', activo);
    });
    recalcularImportes();
}

function redondear(numero) {
    return Math.round(numero * 100) / 100;
}

// Comisión e importe final se calculan uno a partir del otro:
//   compra: importe final = títulos × precio + comisión   <->   comisión = importe final − títulos × precio
//   venta:  importe final = títulos × precio − comisión   <->   comisión = títulos × precio − importe final
function recalcularImportes(origen) {
    if (modoImporte === 'total') {
        const total = leerImporte(inputImporteSolo.value) || 0;
        errorComision.classList.add('oculto');
        displayTotalFormulario.textContent = formatoNumero(total);
        displayDesglose.textContent = 'Sin detalle de títulos ni precio';
        return { valor: 0, comision: 0, comisionNegativa: false };
    }
    if (origen === 'comision' || origen === 'final') ultimoEditado = origen;
    const cantidad = leerImporte(inputCantidad.value);
    const precio = leerImporte(inputPrecio.value);
    const hayValor = cantidad > 0 && precio > 0;
    const valor = hayValor ? cantidad * precio : 0;
    const signo = operacion === 'venta' ? -1 : 1;

    let comision;
    if (ultimoEditado === 'final' && inputImporteFinal.value !== '') {
        comision = signo * (leerImporte(inputImporteFinal.value) - valor);
        if (origen !== 'comision') inputComision.value = hayValor ? String(redondear(comision)) : '';
    } else {
        comision = leerImporte(inputComision.value || 0) || 0;
        if (origen !== 'final') inputImporteFinal.value = hayValor ? (valor + signo * comision).toFixed(2) : '';
    }

    const comisionNegativa = hayValor && comision < -0.005;
    errorComision.classList.toggle('oculto', !comisionNegativa);
    displayTotalFormulario.textContent = formatoNumero(valor + signo * comision);
    displayDesglose.textContent = `${formatoEuros(valor)} en títulos ${operacion === 'venta' ? '−' : '+'} ${formatoEuros(redondear(comision))} de comisión`;
    return { valor, comision: redondear(comision), comisionNegativa };
}

export function abrirFormularioInversion(opciones = {}) {
    formularioInversion.reset();
    const indice = opciones.indice !== undefined ? opciones.indice : null;
    indiceEditando = indice;
    ultimoEditado = 'comision';
    const origen = indice !== null ? inversiones[indice] : opciones.plantilla || null;

    if (origen) {
        const inv = origen;
        inputNombre.value = inv.nombre || '';
        inputIsin.value = inv.isin || '';
        selectTipo.value = inv.tipo || 'Fondo';
        inputCantidad.value = inv.cantidad || '';
        inputPrecio.value = inv.precio || '';
        inputComision.value = parseFloat(inv.comision || 0) > 0 ? inv.comision : '';
        if (!tieneDetalleTitulos(inv)) {
            inputCantidad.value = '';
            inputPrecio.value = '';
            inputImporteSolo.value = calcularTotalInversion(inv) || '';
        }
        // Al duplicar, la fecha es la de hoy
        inputFecha.value = indice !== null && inv.fecha ? inv.fecha : obtenerFechaHoy();
    } else {
        inputFecha.value = obtenerFechaHoy();
    }
    document.getElementById('titulo-form-inversion').textContent = indice !== null ? 'Editar operación' : opciones.plantilla ? 'Duplicar operación' : 'Nueva operación';
    document.getElementById('btn-guardar-inversion').textContent = indice !== null ? 'Actualizar' : 'Guardar';

    fijarModoImporte(origen && !tieneDetalleTitulos(origen) ? 'total' : 'detalle');
    fijarOperacion(origen && esVenta(origen) ? 'venta' : 'compra');
    ayudas.abrirModal(modalInversion);
}

function cerrarFormularioInversion() {
    indiceEditando = null;
    ayudas.cerrarModal(modalInversion);
}

export function renderizarInversiones() {
    const posiciones = calcularPosiciones(inversiones);
    const resumen = posiciones.filter(p => !p.cerrada).sort((a, b) => b.total - a.total);
    const totalInvertido = resumen.reduce((acumulado, activo) => acumulado + activo.total, 0);
    const realizado = posiciones.reduce((suma, p) => suma + p.realizado, 0);
    const hayVentas = inversiones.some(esVenta);

    const grupos = construirGruposDistribucion(resumen, totalInvertido);

    // Tarjetas de totales: lo invertido y lo que vale ahora (los activos sin valorar cuentan por lo invertido)
    document.getElementById('inv-total').textContent = formatoNumero(totalInvertido);
    let valorTotal = 0, sinValorar = 0;
    grupos.forEach(g => {
        if (g.valor === null) { valorTotal += g.total; sinValorar++; } else valorTotal += g.valor;
    });
    const rTotal = grupos.length > 0 && sinValorar < grupos.length ? rentabilidad(totalInvertido, valorTotal) : null;
    const lineaValor = document.getElementById('inv-valor-actual');
    lineaValor.classList.toggle('oculto', !rTotal);
    if (rTotal) {
        document.getElementById('inv-valor-total').textContent = formatoEuros(valorTotal);
        const etiqueta = document.getElementById('inv-rentabilidad-total');
        etiqueta.textContent = formatoRentabilidad(rTotal, true);
        etiqueta.className = `etiqueta-rentabilidad rentabilidad-${claseRentabilidad(rTotal)}`;
    }
    const lineaRealizado = document.getElementById('inv-realizado');
    lineaRealizado.classList.toggle('oculto', !hayVentas);
    if (hayVentas) {
        const etiqueta = document.getElementById('inv-realizado-importe');
        etiqueta.textContent = `${realizado >= 0 ? '+' : '−'}${formatoEuros(Math.abs(realizado))}`;
        etiqueta.className = `etiqueta-rentabilidad rentabilidad-${realizado > 0.005 ? 'positiva' : realizado < -0.005 ? 'negativa' : 'neutra'}`;
    }
    const compras = inversiones.filter(inv => !esVenta(inv)).length;
    const ventas = inversiones.length - compras;
    document.getElementById('inv-num-operaciones').textContent =
        `${compras} ${compras === 1 ? 'aportación' : 'aportaciones'}` + (ventas ? ` · ${ventas} ${ventas === 1 ? 'venta' : 'ventas'}` : '') +
        (rTotal && sinValorar > 0 ? ` · ${sinValorar} sin valorar` : '');
    registrarHistorico(totalInvertido, rTotal ? valorTotal : null);
    totalesCartera = { invertido: totalInvertido, valor: rTotal ? valorTotal : totalInvertido, realizado };
    document.getElementById('inv-num-activos').textContent = resumen.length;

    const ordenadas = inversiones
        .map((inv, indice) => ({ inv, indice }))
        .sort((a, b) => (b.inv.fecha || '').localeCompare(a.inv.fecha || ''));

    const ultima = ordenadas[0];
    document.getElementById('inv-ultima-fecha').textContent = ultima ? ayudas.formatoFechaES(ultima.inv.fecha) : '—';
    document.getElementById('inv-ultima-activo').textContent = ultima ? ultima.inv.nombre : 'Sin aportaciones';

    renderizarDistribucion(resumen, totalInvertido, grupos);

    // Sugerencias de nombres e ISIN en el formulario
    datalistNombres.innerHTML = resumen.map(a => `<option value="${escaparHTML(a.nombre)}"></option>`).join('');
    datalistIsin.innerHTML = resumen.filter(a => a.isin).map(a => `<option value="${escaparHTML(a.isin)}">${escaparHTML(a.nombre)}</option>`).join('');

    renderizarOperaciones();
    renderizarEvolucion(totalInvertido, rTotal ? valorTotal : null);
    if (ayudas.alCambiar) ayudas.alCambiar();
}

// --- EVOLUCIÓN DE LA CARTERA ---

// Guarda un punto al día con lo aportado y lo que vale la cartera (solo si hay algo valorado)
function registrarHistorico(invertido, valor) {
    if (valor === null) return;
    const hoy = obtenerFechaHoy();
    const punto = { fecha: hoy, invertido: Math.round(invertido * 100) / 100, valor: Math.round(valor * 100) / 100 };
    const ultimo = historicoValor[historicoValor.length - 1];
    if (ultimo && ultimo.fecha === hoy) {
        if (ultimo.invertido === punto.invertido && ultimo.valor === punto.valor) return;
        historicoValor[historicoValor.length - 1] = punto;
    } else {
        historicoValor.push(punto);
    }
    guardarDato('historicoValor', historicoValor);
}

function renderizarEvolucion(invertidoHoy, valorHoy) {
    const contenedor = document.getElementById('grafico-evolucion-cartera');
    // Lo aportado (coste de lo que se tiene) en cada fecha con operaciones, y lo que valía cada día guardado
    const fechas = [...new Set([...inversiones.map(inv => inv.fecha).filter(Boolean), ...historicoValor.map(p => p.fecha)])].sort();
    const puntos = fechas.map(fecha => {
        const hasta = inversiones.filter(inv => (inv.fecha || '') <= fecha);
        const invertido = calcularPosiciones(hasta).reduce((suma, p) => suma + p.total, 0);
        const guardado = historicoValor.find(p => p.fecha === fecha);
        return { fecha, invertido, valor: guardado ? guardado.valor : null };
    });
    const hoy = obtenerFechaHoy();
    if (!puntos.length || puntos[puntos.length - 1].fecha < hoy) puntos.push({ fecha: hoy, invertido: invertidoHoy, valor: valorHoy });

    if (puntos.length < 2 || !inversiones.length) {
        contenedor.innerHTML = '<p class="estado-vacio">El gráfico se irá dibujando con tus aportaciones y cada vez que actualices el valor actual de tus inversiones.</p>';
        return;
    }
    contenedor.innerHTML = dibujarLineas(puntos);
}

// --- DISTRIBUCIÓN POR ACTIVO (lista, tarta o barras; las carteras cuentan como un solo elemento) ---

let modoDistribucion = ['lista', 'tarta', 'barras'].includes(localStorage.getItem('modoDistribucion')) ? localStorage.getItem('modoDistribucion') : 'lista';
const carterasAbiertas = new Set();

function construirGruposDistribucion(resumen, total) {
    const grupos = [];
    const porCartera = new Map();
    resumen.forEach(activo => {
        const cartera = carteraDeActivo(activo.clave);
        if (!cartera) return grupos.push({ ...activo, esCartera: false });
        if (!porCartera.has(cartera.id)) {
            const grupo = { esCartera: true, id: cartera.id, clave: `cartera:${cartera.id}`, nombre: cartera.nombre, total: 0, hijos: [] };
            porCartera.set(cartera.id, grupo);
            grupos.push(grupo);
        }
        const grupo = porCartera.get(cartera.id);
        grupo.total += activo.total;
        grupo.hijos.push(activo);
    });

    // El color sigue a cada activo/cartera (por orden de su primera aportación), no a su posición
    const primeraFecha = {};
    inversiones.forEach(inv => {
        const clave = claveActivo(inv);
        if (!primeraFecha[clave] || (inv.fecha || '') < primeraFecha[clave]) primeraFecha[clave] = inv.fecha || '';
    });
    const fechaGrupo = g => g.esCartera
        ? g.hijos.map(h => primeraFecha[h.clave] || '').sort()[0] || ''
        : primeraFecha[g.clave] || '';
    [...grupos].sort((a, b) => fechaGrupo(a).localeCompare(fechaGrupo(b)) || a.clave.localeCompare(b.clave))
        .forEach((g, indice) => { g.color = indice < SERIES_DISPONIBLES ? `var(--serie-${indice + 1})` : 'var(--serie-otros)'; });

    grupos.forEach(g => {
        g.porcentaje = total > 0 ? (g.total / total) * 100 : 0;
        if (!g.esCartera) {
            g.valor = valorActual(g.clave, g.participaciones, g.total);
        } else {
            g.hijos.forEach(h => { h.valor = valorActual(h.clave, h.participaciones, h.total); });
            // Una cartera se valora entera o, si no, sumando sus activos (todos deben estar valorados)
            const valorCartera = valorActual(g.clave, 0, g.total);
            g.valor = valorCartera !== null ? valorCartera
                : g.hijos.every(h => h.valor !== null) ? g.hijos.reduce((suma, h) => suma + h.valor, 0) : null;
        }
    });
    return grupos.sort((a, b) => b.total - a.total);
}

// Mapa clave -> datos del activo para la ventana del valor actual
let activosValorables = {};

function botonRentabilidad(clave, coste, valor) {
    const r = rentabilidad(coste, valor);
    if (!r) return `<button class="btn-rentabilidad sin-valor" data-clave="${escaparHTML(clave)}" title="Añadir el valor actual">+ Valor actual</button>`;
    return `<button class="btn-rentabilidad rentabilidad-${claseRentabilidad(r)}" data-clave="${escaparHTML(clave)}" title="${formatoRentabilidad(r, true)} · tocar para actualizar el valor">${formatoRentabilidad(r)}</button>`;
}

function filaActivo(activo, porcentaje, color, esHijo = false) {
    activosValorables[activo.clave] = { clave: activo.clave, nombre: activo.nombre, coste: activo.total, participaciones: activo.participaciones, esCartera: false };
    const r = rentabilidad(activo.total, activo.valor);
    // Las órdenes importadas sin nombre usan el ISIN como nombre: se muestra "Sin nombre" para completarlo
    const sinNombre = !activo.nombre || activo.nombre === activo.isin;
    return `
        <div class="activo-fila ${esHijo ? 'activo-hijo' : ''}">
            <div class="activo-cabecera">
                <b class="activo-nombre ${sinNombre ? 'sin-nombre' : ''}">${sinNombre ? 'Sin nombre' : escaparHTML(activo.nombre)}</b>
                <button class="btn-editar btn-renombrar-activo" data-clave="${escaparHTML(activo.clave)}" title="Cambiar nombre">${ICONO_EDITAR}</button>
            </div>
            <div class="activo-info">
                <span class="pildora">${escaparHTML(activo.tipo)}</span>
                ${activo.isin ? `<small class="texto-isin">${escaparHTML(activo.isin)}</small>` : ''}
            </div>
            <div class="activo-datos">
                <span class="activo-total">${formatoEuros(activo.total)} ${botonRentabilidad(activo.clave, activo.total, activo.valor)}</span>
                <small>${r ? `Vale ${formatoEuros(r.valor)} · ` : ''}${activo.participaciones > 0 ? `${formatoDecimal(activo.participaciones, 6)} part. · ` : ''}${formatoPorcentaje(porcentaje)}</small>
            </div>
            <div class="activo-barra"><span style="width: ${porcentaje}%; background: ${color}"></span></div>
        </div>`;
}

function filaCartera(grupo) {
    activosValorables[grupo.clave] = { clave: grupo.clave, nombre: grupo.nombre, coste: grupo.total, participaciones: 0, esCartera: true };
    const r = rentabilidad(grupo.total, grupo.valor);
    const abierta = carterasAbiertas.has(grupo.id);
    const hijos = [...grupo.hijos].sort((a, b) => b.total - a.total)
        .map(h => filaActivo(h, grupo.total > 0 ? (h.total / grupo.total) * 100 : 0, grupo.color, true)).join('');
    return `
        <div class="activo-fila fila-cartera ${abierta ? 'abierta' : ''}" data-cartera="${grupo.id}">
            <div class="activo-cabecera">
                <button class="btn-desplegar-cartera" data-cartera="${grupo.id}" aria-expanded="${abierta}" title="Ver los activos de la cartera">${ICONO_DESPLEGAR}</button>
                <b class="activo-nombre">${escaparHTML(grupo.nombre)}</b>
                <button class="btn-editar btn-editar-cartera-dist" data-cartera="${grupo.id}" title="Editar cartera">${ICONO_EDITAR}</button>
            </div>
            <div class="activo-info">
                <span class="pildora pildora-cartera">Cartera</span>
                <small class="texto-isin">${grupo.hijos.length} ${grupo.hijos.length === 1 ? 'activo' : 'activos'}</small>
            </div>
            <div class="activo-datos">
                <span class="activo-total">${formatoEuros(grupo.total)} ${botonRentabilidad(grupo.clave, grupo.total, grupo.valor)}</span>
                <small>${r ? `Vale ${formatoEuros(r.valor)} · ` : ''}${formatoPorcentaje(grupo.porcentaje)}</small>
            </div>
            <div class="activo-barra"><span style="width: ${grupo.porcentaje}%; background: ${grupo.color}"></span></div>
            <div class="cartera-hijos ${abierta ? '' : 'oculto'}">${hijos}</div>
        </div>`;
}

function renderizarDistribucion(resumen, total, grupos) {
    document.querySelectorAll('.selector-grafico button').forEach(btn => {
        const activo = btn.getAttribute('data-modo') === modoDistribucion;
        btn.classList.toggle('activo', activo);
        btn.setAttribute('aria-pressed', activo);
    });
    document.getElementById('btn-gestionar-carteras').classList.toggle('oculto', resumen.length === 0);

    if (resumen.length === 0) {
        listaActivos.innerHTML = '<p class="estado-vacio">Aún no has añadido ninguna inversión. Pulsa + para empezar.</p>';
        return;
    }

    if (modoDistribucion !== 'lista') {
        const elementos = agruparOtros(grupos.map(g => ({ nombre: g.nombre, total: g.total, porcentaje: g.porcentaje, color: g.color })));
        listaActivos.innerHTML = modoDistribucion === 'tarta'
            ? dibujarTarta(elementos, total, escaparHTML)
            : dibujarBarras(elementos, total, escaparHTML);
        conectarInteraccion(listaActivos, elementos);
        return;
    }

    activosValorables = {};
    listaActivos.innerHTML = grupos.map(g => g.esCartera ? filaCartera(g) : filaActivo(g, g.porcentaje, g.color)).join('');

    listaActivos.querySelectorAll('.btn-rentabilidad').forEach(btn => {
        btn.addEventListener('click', () => abrirValorActual(activosValorables[btn.getAttribute('data-clave')]));
    });

    listaActivos.querySelectorAll('.btn-renombrar-activo').forEach(btn => {
        btn.addEventListener('click', () => activarEdicionNombre(btn));
    });
    listaActivos.querySelectorAll('.btn-desplegar-cartera').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-cartera');
            if (carterasAbiertas.has(id)) carterasAbiertas.delete(id); else carterasAbiertas.add(id);
            const abierta = carterasAbiertas.has(id);
            const fila = btn.closest('.fila-cartera');
            fila.classList.toggle('abierta', abierta);
            fila.querySelector('.cartera-hijos').classList.toggle('oculto', !abierta);
            btn.setAttribute('aria-expanded', abierta);
        });
    });
    listaActivos.querySelectorAll('.btn-editar-cartera-dist').forEach(btn => {
        btn.addEventListener('click', () => abrirEdicionCartera(btn.getAttribute('data-cartera')));
    });
}

function rentabilidadOperacion(inv) {
    const precio = precioActual(claveActivo(inv));
    if (precio === null || !tieneDetalleTitulos(inv) || esVenta(inv)) return '';
    const r = rentabilidad(calcularTotalInversion(inv), parseFloat(inv.cantidad) * precio);
    return r ? `<small class="rentabilidad-operacion rentabilidad-${claseRentabilidad(r)}">${formatoRentabilidad(r)}</small>` : '';
}

function coincideConFiltros(inv) {
    const texto = filtroNombre.value.trim().toLowerCase();
    const tipo = filtroTipo.value;
    if (tipo && (inv.tipo || 'Otro') !== tipo) return false;
    if (!texto) return true;
    return String(inv.nombre || '').toLowerCase().includes(texto) || String(inv.isin || '').toLowerCase().includes(texto);
}

// Tabla de operaciones (más recientes primero), con filtros por nombre/ISIN y tipo
function renderizarOperaciones() {
    const realizadoPorIndice = {};
    calcularPosiciones(inversiones, realizadoPorIndice);
    const ordenadas = inversiones
        .map((inv, indice) => ({ inv, indice }))
        .sort((a, b) => (b.inv.fecha || '').localeCompare(a.inv.fecha || ''));
    const visibles = ordenadas.filter(({ inv }) => coincideConFiltros(inv));

    const total = ordenadas.length;
    const textoTotal = `${total} ${total === 1 ? 'operación' : 'operaciones'}`;
    resumenOperaciones.textContent = visibles.length === total ? textoTotal : `${visibles.length} de ${textoTotal}`;

    listaInversionesTabla.innerHTML = '';
    if (visibles.length === 0) {
        const mensaje = total === 0 ? 'No hay operaciones registradas' : 'Ninguna operación coincide con el filtro';
        listaInversionesTabla.innerHTML = `<tr><td colspan="7" class="estado-vacio">${mensaje}</td></tr>`;
    }
    visibles.forEach(({ inv, indice }) => {
        const conTitulos = tieneDetalleTitulos(inv);
        const cantidad = conTitulos ? formatoDecimal(inv.cantidad, 6) : '—';
        const precio = conTitulos ? `${formatoDecimal(inv.precio, 4)} €` : '—';
        const comision = parseFloat(inv.comision || 0);
        const fechaEspanol = ayudas.formatoFechaES(inv.fecha || obtenerFechaHoy());
        const venta = esVenta(inv);
        const realizadoVenta = realizadoPorIndice[indice];
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td><span class="fecha-larga">${fechaEspanol}</span><span class="fecha-corta">${fechaEspanol.substring(0, 6)}${fechaEspanol.substring(8)}</span></td>
            <td>
                ${escaparHTML(inv.nombre || 'Sin nombre')}<br>
                ${venta ? '<span class="pildora pildora-venta">Venta</span>' : ''}
                ${inv.recurrenteId ? '<span class="pildora pildora-recurrente">Periódica</span>' : ''}
                <span class="pildora">${escaparHTML(inv.tipo || 'Otro')}</span>
                ${inv.isin ? `<small class="texto-isin">${escaparHTML(inv.isin)}</small>` : ''}
                <small class="detalle-movil">${conTitulos ? `${cantidad} × ${precio}${comision > 0 ? ` ${venta ? '−' : '+'} ${formatoEuros(comision)} com.` : ''}` : venta ? 'Venta de toda la posición' : 'Solo importe'}</small>
            </td>
            <td class="col-cantidad">${cantidad}</td>
            <td class="col-cantidad">${precio}</td>
            <td class="col-cantidad">${comision > 0 ? formatoEuros(comision) : '—'}</td>
            <td class="col-cantidad monto-inversion ${venta ? 'monto-venta' : ''}">${venta ? '+' : ''}${formatoEuros(calcularTotalInversion(inv))}${venta && realizadoVenta !== undefined
                ? `<small class="rentabilidad-operacion rentabilidad-${realizadoVenta > 0.005 ? 'positiva' : realizadoVenta < -0.005 ? 'negativa' : 'neutra'}">${realizadoVenta >= 0 ? '+' : '−'}${formatoEuros(Math.abs(realizadoVenta))} realizado</small>`
                : rentabilidadOperacion(inv)}</td>
            <td>
                <div class="acciones-fila acciones-tres">
                    <button class="btn-editar btn-duplicar-inversion" data-indice="${indice}" title="Duplicar">${ICONO_DUPLICAR}</button>
                    <button class="btn-editar btn-editar-inversion" data-indice="${indice}" title="Editar">${ICONO_EDITAR}</button>
                    <button class="btn-eliminar btn-eliminar-inversion" data-indice="${indice}" title="Eliminar">${ICONO_ELIMINAR}</button>
                </div>
            </td>`;
        listaInversionesTabla.appendChild(fila);
    });

    document.querySelectorAll('.btn-editar-inversion').forEach(btn => {
        btn.addEventListener('click', function() { abrirFormularioInversion({ indice: Number(this.getAttribute('data-indice')) }); });
    });
    document.querySelectorAll('.btn-duplicar-inversion').forEach(btn => {
        btn.addEventListener('click', function() {
            const { recurrenteId, ...plantilla } = inversiones[Number(this.getAttribute('data-indice'))];
            abrirFormularioInversion({ plantilla });
        });
    });

    // Borrar con opción de deshacer
    document.querySelectorAll('.btn-eliminar-inversion').forEach(btn => {
        btn.addEventListener('click', function() {
            const indice = Number(this.getAttribute('data-indice'));
            const [quitada] = inversiones.splice(indice, 1);
            guardarInversionesEnMemoria(inversiones);
            renderizarInversiones();
            ayudas.mostrarToast('Operación eliminada', {
                deshacer: () => {
                    inversiones.splice(Math.min(indice, inversiones.length), 0, quitada);
                    guardarInversionesEnMemoria(inversiones);
                    renderizarInversiones();
                }
            });
        });
    });
}

const COLUMNAS_EXCEL_INVERSIONES = [
    { titulo: 'Fecha', ancho: 12 },
    { titulo: 'Operación', ancho: 11 },
    { titulo: 'Activo', ancho: 36 },
    { titulo: 'ISIN', ancho: 15 },
    { titulo: 'Tipo', ancho: 10 },
    { titulo: 'Títulos', ancho: 12 },
    { titulo: 'Precio por título (€)', ancho: 20 },
    { titulo: 'Comisión (€)', ancho: 14 },
    { titulo: 'Importe (€)', ancho: 14 }
];

function filasExcelInversiones(lista) {
    const filas = ordenarPorFecha(lista).map(inv => [
        { v: inv.fecha, tipo: 'fecha' },
        { v: esVenta(inv) ? 'Venta' : 'Compra' },
        { v: inv.nombre || 'Sin nombre' },
        { v: inv.isin || '' },
        { v: inv.tipo || 'Otro' },
        tieneDetalleTitulos(inv) ? { v: inv.cantidad, tipo: 'numero' } : null,
        tieneDetalleTitulos(inv) ? { v: inv.precio, tipo: 'dinero' } : null,
        { v: parseFloat(inv.comision || 0), tipo: 'dinero' },
        { v: parseFloat(calcularTotalInversion(inv).toFixed(2)), tipo: 'dinero' }
    ]);
    const aportado = lista.filter(inv => !esVenta(inv)).reduce((acumulado, inv) => acumulado + calcularTotalInversion(inv), 0);
    const vendido = lista.filter(esVenta).reduce((acumulado, inv) => acumulado + calcularTotalInversion(inv), 0);
    const comisiones = lista.reduce((acumulado, inv) => acumulado + parseFloat(inv.comision || 0), 0);
    const fila = (texto, valor) => [null, null, null, null, null, null, null, { v: texto, negrita: true }, { v: parseFloat(valor.toFixed(2)), tipo: 'dinero', negrita: true }];
    filas.push([], fila('Total comisiones', comisiones), fila('Total aportado', aportado));
    if (vendido > 0) filas.push(fila('Total vendido', vendido));
    return filas;
}

// Libro Excel: hoja "Total" con todo + resumen por activo, y una hoja por cada mes
export function generarExcelInversiones() {
    if (inversiones.length === 0) return null;

    const filasTotal = filasExcelInversiones(inversiones);
    filasTotal.push([]);
    filasTotal.push([null, null, { v: 'Resumen por activo (invertido actual y beneficio realizado)', negrita: true }]);
    calcularPosiciones(inversiones).forEach(activo => {
        filasTotal.push([
            null,
            { v: activo.cerrada ? 'Cerrada' : 'Abierta' },
            { v: activo.nombre },
            { v: activo.isin },
            { v: activo.tipo },
            activo.participaciones > 0 ? { v: parseFloat(activo.participaciones.toFixed(6)), tipo: 'numero' } : null,
            null,
            Math.abs(activo.realizado) > 0.005 ? { v: parseFloat(activo.realizado.toFixed(2)), tipo: 'dinero' } : null,
            { v: parseFloat(activo.total.toFixed(2)), tipo: 'dinero' }
        ]);
    });

    const hojas = [{ nombre: 'Total', columnas: COLUMNAS_EXCEL_INVERSIONES, filas: filasTotal }];
    agruparPorMes(inversiones).forEach(mes => {
        hojas.push({ nombre: mes.nombre, columnas: COLUMNAS_EXCEL_INVERSIONES, filas: filasExcelInversiones(mes.elementos) });
    });
    return crearLibroExcel(hojas);
}

export function iniciarInversiones(funcionesAyuda) {
    ayudas = funcionesAyuda;

    inputCantidad.addEventListener('input', () => recalcularImportes());
    inputPrecio.addEventListener('input', () => recalcularImportes());
    inputComision.addEventListener('input', () => recalcularImportes('comision'));
    inputImporteFinal.addEventListener('input', () => recalcularImportes('final'));
    inputImporteSolo.addEventListener('input', () => recalcularImportes());
    document.querySelectorAll('#modo-importe-inversion button').forEach(btn => {
        btn.addEventListener('click', () => fijarModoImporte(btn.getAttribute('data-valor')));
    });
    document.querySelectorAll('#operacion-inversion button').forEach(btn => {
        btn.addEventListener('click', () => fijarOperacion(btn.getAttribute('data-valor')));
    });

    // Operaciones: desplegable (cerrado al empezar) con filtros
    const contenedorOperaciones = document.getElementById('contenedor-operaciones');
    const flechaOperaciones = document.getElementById('icono-flecha-operaciones');
    document.getElementById('cabecera-operaciones').addEventListener('click', () => {
        const abierto = contenedorOperaciones.classList.toggle('abierto');
        flechaOperaciones.style.transform = abierto ? 'rotate(180deg)' : 'rotate(0deg)';
    });
    filtroNombre.addEventListener('input', renderizarOperaciones);

    // Modo de la distribución por activo: lista, tarta o barras
    document.querySelectorAll('.selector-grafico button').forEach(btn => {
        btn.addEventListener('click', () => {
            modoDistribucion = btn.getAttribute('data-modo');
            try { localStorage.setItem('modoDistribucion', modoDistribucion); } catch (error) { /* sin memoria */ }
            renderizarInversiones();
        });
    });

    iniciarValoraciones({
        abrirModal: ayudas.abrirModal,
        cerrarModal: ayudas.cerrarModal,
        mostrarToast: ayudas.mostrarToast,
        formatoFechaES: ayudas.formatoFechaES,
        alCambiar: renderizarInversiones
    });

    iniciarCarteras({
        abrirModal: ayudas.abrirModal,
        cerrarModal: ayudas.cerrarModal,
        mostrarToast: ayudas.mostrarToast,
        escaparHTML,
        obtenerResumenActivos: () => calcularResumenPorActivo(inversiones),
        alCambiar: renderizarInversiones
    });
    document.getElementById('btn-gestionar-carteras').addEventListener('click', abrirModalCarteras);
    filtroTipo.addEventListener('change', renderizarOperaciones);

    // Activo ya registrado: al escribir su nombre se rellena el ISIN (y al revés), además del tipo
    inputNombre.addEventListener('input', () => {
        const existente = buscarActivo({ nombre: inputNombre.value });
        if (!existente) return;
        if (existente.isin) inputIsin.value = existente.isin;
        selectTipo.value = existente.tipo || 'Fondo';
    });

    inputIsin.addEventListener('input', () => {
        const posicion = inputIsin.selectionStart;
        inputIsin.value = normalizarIsin(inputIsin.value);
        inputIsin.setSelectionRange(posicion, posicion);
        const existente = buscarActivo({ isin: inputIsin.value });
        if (!existente) return;
        inputNombre.value = existente.nombre || '';
        selectTipo.value = existente.tipo || 'Fondo';
    });

    formularioInversion.addEventListener('submit', (evento) => {
        evento.preventDefault();
        const { comision, comisionNegativa } = recalcularImportes();
        if (comisionNegativa) return inputImporteFinal.focus();
        const datosInversion = {
            nombre: inputNombre.value.trim(),
            isin: normalizarIsin(inputIsin.value),
            tipo: selectTipo.value,
            cantidad: leerImporte(inputCantidad.value),
            precio: leerImporte(inputPrecio.value),
            comision: Math.max(0, comision),
            fecha: inputFecha.value
        };
        if (operacion === 'venta') datosInversion.operacion = 'venta';
        if (modoImporte === 'total') {
            const importe = leerImporte(inputImporteSolo.value);
            if (!(importe > 0)) return inputImporteSolo.focus();
            Object.assign(datosInversion, { cantidad: 0, precio: 0, comision: 0, importe: redondear(importe) });
        }

        // Una venta tiene que ser de un activo que se tiene
        if (operacion === 'venta') {
            const clave = claveActivo(datosInversion);
            const otras = inversiones.filter((_, i) => i !== indiceEditando);
            const posicion = calcularPosiciones(otras.filter(inv => (inv.fecha || '') <= datosInversion.fecha)).find(p => p.clave === clave);
            if (!posicion || posicion.cerrada) return alert('No tienes ese activo en esa fecha. Revisa el nombre o el ISIN.');
            if (modoImporte !== 'total' && datosInversion.cantidad > posicion.participaciones + 1e-9) {
                if (posicion.participaciones > 0) return alert(`Solo tienes ${formatoDecimal(posicion.participaciones, 6)} títulos de ese activo en esa fecha.`);
                return alert('Ese activo se añadió solo con importe: véndelo con "Solo importe" (toda la posición).');
            }
        }

        if (indiceEditando !== null) {
            const anterior = inversiones[indiceEditando];
            if (anterior.recurrenteId) datosInversion.recurrenteId = anterior.recurrenteId;
            inversiones[indiceEditando] = datosInversion;
            ayudas.mostrarToast('Operación actualizada');
        } else {
            // Aportación periódica: se repetirá cada mes con el mismo importe
            if (operacion === 'compra' && checkPeriodica.checked) {
                const { fecha, ...resto } = datosInversion;
                const plantilla = { ...resto, cantidad: 0, precio: 0, comision: 0, importe: redondear(calcularTotalInversion(datosInversion)) };
                datosInversion.recurrenteId = crearRecurrente({ ambito: 'inversion', datos: plantilla, fecha });
            }
            inversiones.push(datosInversion);
            ayudas.mostrarToast(operacion === 'venta' ? 'Venta añadida' : datosInversion.recurrenteId ? 'Inversión añadida · se repetirá cada mes' : 'Inversión añadida');
        }

        guardarInversionesEnMemoria(inversiones);
        renderizarInversiones();
        cerrarFormularioInversion();
    });

    document.getElementById('btn-cerrar-inversion').addEventListener('click', cerrarFormularioInversion);
    modalInversion.addEventListener('click', (e) => { if (e.target === modalInversion) cerrarFormularioInversion(); });

    renderizarInversiones();
}
