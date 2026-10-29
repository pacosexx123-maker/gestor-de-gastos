// Importación del extracto del banco (CSV o Excel .xlsx) como gastos e ingresos.
// Reconoce los formatos habituales de los bancos españoles:
//   Fecha (o "Fecha operación") · Concepto / Descripción / Movimiento · Importe (con signo)
//   o bien columnas separadas Cargo/Debe y Abono/Haber.
// Cada movimiento se categoriza con las reglas aprendidas; lo que se cambie en la vista
// previa se aprende para la próxima vez.

import { normalizarCabecera, leerNumero, leerFecha } from './importar-ordenes.js?v=24';
import { obtenerMovimientos, anadirMovimientos } from './gastos.js?v=24';
import { obtenerCategorias, obtenerApartados } from './configuracion.js?v=24';
import { buscarRegla, aprenderRegla, patronDe, palabrasClave } from './reglas.js?v=24';
import { escaparHTML, formatoEuros, formatoFechaES } from './utils.js?v=24';

const $ = id => document.getElementById(id);
const modal = $('modal-importar-banco');
const lista = $('lista-movimientos-banco');
const resumen = $('resumen-importacion-banco');
const btnConfirmar = $('btn-confirmar-banco');

let pendientes = [];
let ayudas = {}; // abrirModal, cerrarModal, mostrarToast, alImportar

// --- LECTURA ---

function detectarColumnas(cabecera) {
    const columnas = {};
    const asignar = (campo, i) => { if (columnas[campo] === undefined) columnas[campo] = i; };
    cabecera.forEach((titulo, i) => {
        const t = normalizarCabecera(titulo);
        if (!t) return;
        if (t.includes('fecha') || /^f\.?\s?(valor|operacion|oper)/.test(t)) { if (!t.includes('valor')) asignar('fecha', i); else asignar('fechaValor', i); }
        else if (t.includes('saldo')) asignar('saldo', i);
        else if (t.includes('cargo') || t === 'debe' || t.includes('debito') || t === 'gastos' || t === 'salidas') asignar('cargo', i);
        else if (t.includes('abono') || t === 'haber' || t.includes('credito') || t === 'ingresos' || t === 'entradas') asignar('abono', i);
        else if (t.includes('importe') || t.includes('cantidad') || t.includes('monto')) asignar('importe', i);
        else if (t.includes('concepto') || t.includes('descripcion') || t.includes('movimiento') || t.includes('detalle') || t.includes('beneficiario') || t.includes('comercio')) asignar('concepto', i);
        else if (t.includes('observacion') || t.includes('mas datos') || t.includes('informacion')) asignar('extra', i);
    });
    if (columnas.fecha === undefined) columnas.fecha = columnas.fechaValor;
    return columnas;
}

// Sin regla, se mira lo ya apuntado: el movimiento más reciente del mismo comercio
function buscarEnHistorial(concepto, tipo, existentes) {
    const palabras = new Set(palabrasClave(concepto));
    let mejor = null;
    existentes.forEach(m => {
        if ((m.tipo === 'ingreso') !== (tipo === 'ingreso') || !m.categoria) return;
        const patron = patronDe(m.concepto);
        if (patron && palabras.has(patron) && (!mejor || m.fecha > mejor.fecha)) mejor = m;
    });
    return mejor ? { categoria: mejor.categoria, apartado: mejor.apartado || '' } : null;
}

function leerMovimientosBanco(filas) {
    const indice = filas.findIndex(fila => {
        const c = detectarColumnas(fila);
        return c.fecha !== undefined && c.concepto !== undefined && (c.importe !== undefined || c.cargo !== undefined || c.abono !== undefined);
    });
    if (indice < 0) throw new Error('No se han encontrado las columnas de fecha, concepto e importe. Comprueba que es el extracto de movimientos del banco.');
    const columnas = detectarColumnas(filas[indice]);
    const existentes = obtenerMovimientos();

    return filas.slice(indice + 1).map(fila => {
        const fecha = leerFecha(fila[columnas.fecha]);
        let concepto = String(fila[columnas.concepto] || '').replace(/\s+/g, ' ').trim();
        if (columnas.extra !== undefined && String(fila[columnas.extra] || '').trim() && concepto.length < 12) concepto = `${concepto} ${String(fila[columnas.extra]).trim()}`.trim();
        let importe;
        if (columnas.importe !== undefined) importe = leerNumero(fila[columnas.importe]);
        else {
            const cargo = Math.abs(leerNumero(fila[columnas.cargo])) || 0;
            const abono = Math.abs(leerNumero(fila[columnas.abono])) || 0;
            importe = abono - cargo;
        }
        if (!fecha || !concepto || !isFinite(importe) || Math.abs(importe) < 0.005) return null;

        const tipo = importe < 0 ? 'gasto' : 'ingreso';
        const cantidad = Math.round(Math.abs(importe) * 100) / 100;
        const regla = buscarRegla(concepto, tipo) || buscarEnHistorial(concepto, tipo, existentes);
        const categorias = obtenerCategorias(tipo);
        const duplicado = existentes.some(m => m.fecha === fecha && (m.tipo === 'ingreso') === (tipo === 'ingreso') && Math.abs((parseFloat(m.cantidad) || 0) - cantidad) < 0.005);
        return {
            fecha, concepto, tipo, cantidad,
            categoria: regla && categorias.includes(regla.categoria) ? regla.categoria : (categorias.includes('Otros') ? 'Otros' : categorias[0]),
            apartado: regla ? regla.apartado || '' : '',
            reconocido: !!regla,
            duplicado,
            seleccionado: !duplicado
        };
    }).filter(Boolean);
}

// --- VISTA PREVIA ---

function opcionesCategoria(tipo, actual) {
    return obtenerCategorias(tipo).map(c => `<option value="${escaparHTML(c)}" ${c === actual ? 'selected' : ''}>${escaparHTML(c)}</option>`).join('');
}

function opcionesApartado(actual) {
    return '<option value="">Personal</option>' + obtenerApartados().map(a => `<option value="${a.id}" ${a.id === actual ? 'selected' : ''}>${escaparHTML(a.nombre)}</option>`).join('');
}

function actualizarResumen() {
    const n = pendientes.filter(p => p.seleccionado).length;
    const reconocidos = pendientes.filter(p => p.reconocido).length;
    resumen.textContent = `${pendientes.length} movimientos · ${n} seleccionados · ${reconocidos} categorizados solos`;
    btnConfirmar.disabled = n === 0;
    btnConfirmar.textContent = n === 1 ? 'Importar 1 movimiento' : `Importar ${n} movimientos`;
}

function renderizar() {
    lista.innerHTML = pendientes.map((p, i) => `
        <div class="orden-fila ${p.seleccionado ? '' : 'desmarcada'}">
            <input type="checkbox" class="orden-check" data-i="${i}" ${p.seleccionado ? 'checked' : ''} aria-label="Importar este movimiento">
            <div class="orden-info">
                <div class="orden-cabecera">
                    <b>${formatoFechaES(p.fecha)}</b>
                    <span class="${p.tipo === 'ingreso' ? 'monto-positivo' : 'monto-negativo'}">${p.tipo === 'ingreso' ? '+' : '−'}${formatoEuros(p.cantidad)}</span>
                    ${p.duplicado ? '<span class="pildora pildora-aviso">Ya apuntado</span>' : ''}
                    ${p.reconocido ? '<span class="pildora pildora-recurrente">Reconocido</span>' : ''}
                </div>
                <span class="banco-concepto">${escaparHTML(p.concepto)}</span>
                <div class="banco-selectores">
                    <select class="banco-categoria" data-i="${i}" aria-label="Categoría">${opcionesCategoria(p.tipo, p.categoria)}</select>
                    <select class="banco-apartado" data-i="${i}" aria-label="Personal o apartado">${opcionesApartado(p.apartado)}</select>
                </div>
            </div>
        </div>`).join('');

    lista.querySelectorAll('.orden-check').forEach(check => check.addEventListener('change', () => {
        pendientes[Number(check.getAttribute('data-i'))].seleccionado = check.checked;
        check.closest('.orden-fila').classList.toggle('desmarcada', !check.checked);
        actualizarResumen();
    }));
    // Al cambiar la categoría de uno, se aplica a los demás con el mismo comercio que aún no estaban reconocidos
    const aplicarParecidos = (i, campo, valor) => {
        const origen = pendientes[i];
        origen[campo] = valor;
        origen.cambiado = true;
        const clave = patronDe(origen.concepto);
        pendientes.forEach((p, j) => {
            if (j === i || p.tipo !== origen.tipo || p.cambiado || p.reconocido || !clave) return;
            if (patronDe(p.concepto) === clave) {
                p[campo] = valor;
                const select = lista.querySelector(`.banco-${campo === 'categoria' ? 'categoria' : 'apartado'}[data-i="${j}"]`);
                if (select) select.value = valor;
            }
        });
    };
    lista.querySelectorAll('.banco-categoria').forEach(sel => sel.addEventListener('change', () => aplicarParecidos(Number(sel.getAttribute('data-i')), 'categoria', sel.value)));
    lista.querySelectorAll('.banco-apartado').forEach(sel => sel.addEventListener('change', () => aplicarParecidos(Number(sel.getAttribute('data-i')), 'apartado', sel.value)));
    actualizarResumen();
}

export function importarBancoDesdeFilas(filas) {
    try {
        pendientes = leerMovimientosBanco(filas);
    } catch (error) {
        return alert(`No se ha podido leer el extracto.\n\n${error.message}`);
    }
    if (!pendientes.length) return alert('No se ha encontrado ningún movimiento en el archivo.');
    pendientes.sort((a, b) => b.fecha.localeCompare(a.fecha));
    renderizar();
    ayudas.abrirModal(modal);
}

function confirmar() {
    const elegidos = pendientes.filter(p => p.seleccionado);
    const nuevos = elegidos.map(p => {
        const movimiento = { tipo: p.tipo, concepto: p.concepto, cantidad: p.cantidad, fecha: p.fecha, categoria: p.categoria };
        if (p.apartado) movimiento.apartado = p.apartado;
        return movimiento;
    });
    // Se aprende lo que se ha cambiado a mano: la próxima vez esos comercios se categorizan solos
    elegidos.filter(p => p.cambiado).forEach(p => aprenderRegla(p.concepto, p.tipo, p.categoria, p.apartado));
    anadirMovimientos(nuevos);
    ayudas.cerrarModal(modal);
    ayudas.alImportar();
    ayudas.mostrarToast(nuevos.length === 1 ? '1 movimiento importado' : `${nuevos.length} movimientos importados`);
}

export function iniciarImportacionBanco(funcionesAyuda) {
    ayudas = funcionesAyuda;
    btnConfirmar.addEventListener('click', confirmar);
    $('btn-cerrar-banco').addEventListener('click', () => ayudas.cerrarModal(modal));
    modal.addEventListener('click', (e) => { if (e.target === modal) ayudas.cerrarModal(modal); });
    $('btn-marcar-todos-banco').addEventListener('click', () => {
        const marcar = pendientes.some(p => !p.seleccionado);
        pendientes.forEach(p => { p.seleccionado = marcar; });
        renderizar();
    });
}
