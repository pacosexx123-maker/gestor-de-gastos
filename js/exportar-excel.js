// Formulario "Exportar a Excel" de la pestaña Archivos: qué datos (gastos, inversiones o ambos)
// y de qué fechas (este mes, los últimos meses, este año, todo o los meses que se elijan).

import { obtenerFechaHoy, obtenerMesActual, sumarMeses, nombreMesLargo, descargarArchivo, enRangoDeMeses } from './utils.js?v=41';
import { crearLibroExcel, MIME_EXCEL } from './excel.js?v=41';
import { obtenerMovimientos, hojasExcelGastos } from './gastos.js?v=41';
import { obtenerInversiones, hojasExcelInversiones } from './inversiones.js?v=41';
import { registrarExportacion } from './exportaciones.js?v=41';

const PERIODOS = [
    { id: 'mes', texto: 'Este mes', rango: mes => ({ desde: mes, hasta: mes }) },
    { id: 'dos', texto: 'Últimos 2 meses', rango: mes => ({ desde: sumarMeses(mes, -1), hasta: mes }) },
    { id: 'tres', texto: 'Últimos 3 meses', rango: mes => ({ desde: sumarMeses(mes, -2), hasta: mes }) },
    { id: 'anio', texto: 'Este año', rango: mes => ({ desde: `${mes.substring(0, 4)}-01`, hasta: `${mes.substring(0, 4)}-12` }) },
    { id: 'todo', texto: 'Todo', rango: () => null },
    { id: 'elegir', texto: 'Elegir meses', rango: () => null } // sus meses salen de los desplegables
];

const TIPOS = {
    gastos: { nombre: 'TusGastos', hecho: 'Gastos exportados' },
    inversiones: { nombre: 'TusInversiones', hecho: 'Inversiones exportadas' },
    todo: { nombre: 'TusGastosEInversiones', hecho: 'Gastos e inversiones exportados en un Excel' }
};

const $ = id => document.getElementById(id);

let ayudas = {}; // mostrarToast (viene de main.js)
let tipoElegido = 'gastos';
let periodoElegido = 'todo';

const contar = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

function listasDelTipo() {
    return {
        movimientos: tipoElegido === 'inversiones' ? [] : obtenerMovimientos(),
        inversiones: tipoElegido === 'gastos' ? [] : obtenerInversiones()
    };
}

function rangoElegido() {
    if (periodoElegido === 'elegir') {
        const desde = $('exportar-desde').value;
        const hasta = $('exportar-hasta').value;
        return desde && hasta ? { desde, hasta } : { desde: '', hasta: '' };
    }
    return PERIODOS.find(p => p.id === periodoElegido).rango(obtenerMesActual());
}

// Los desplegables solo ofrecen los meses que tienen datos, del más reciente al más antiguo
function rellenarMeses() {
    const { movimientos, inversiones } = listasDelTipo();
    const meses = [...new Set([...movimientos, ...inversiones]
        .map(elemento => (elemento.fecha || '').substring(0, 7))
        .filter(mes => /^\d{4}-\d{2}$/.test(mes)))].sort().reverse();

    [$('exportar-desde'), $('exportar-hasta')].forEach(select => {
        const anterior = select.value;
        select.innerHTML = meses.length
            ? meses.map(mes => `<option value="${mes}">${nombreMesLargo(mes)}</option>`).join('')
            : '<option value="">Sin datos</option>';
        select.disabled = !meses.length;
        select.value = meses.includes(anterior) ? anterior : (meses[0] || '');
    });
}

function textoPeriodo(rango) {
    if (!rango) return 'todo el historial';
    if (rango.desde === rango.hasta) return nombreMesLargo(rango.desde);
    return `${nombreMesLargo(rango.desde)} a ${nombreMesLargo(rango.hasta)}`;
}

export function renderizarExportarExcel() {
    document.querySelectorAll('#exportar-tipo button').forEach(btn => {
        const activo = btn.getAttribute('data-valor') === tipoElegido;
        btn.classList.toggle('activo', activo);
        btn.setAttribute('aria-pressed', activo);
    });
    document.querySelectorAll('#exportar-periodo button').forEach(btn => {
        const activo = btn.getAttribute('data-valor') === periodoElegido;
        btn.classList.toggle('activo', activo);
        btn.setAttribute('aria-pressed', activo);
    });
    $('exportar-meses').classList.toggle('oculto', periodoElegido !== 'elegir');
    rellenarMeses();

    const rango = rangoElegido();
    const { movimientos, inversiones } = listasDelTipo();
    const numMovimientos = movimientos.filter(m => enRangoDeMeses(m.fecha, rango)).length;
    const numInversiones = inversiones.filter(i => enRangoDeMeses(i.fecha, rango)).length;
    const partes = [];
    if (tipoElegido !== 'inversiones') partes.push(contar(numMovimientos, 'movimiento', 'movimientos'));
    if (tipoElegido !== 'gastos') partes.push(contar(numInversiones, 'operación', 'operaciones'));

    const hayDatos = numMovimientos + numInversiones > 0;
    $('exportar-resumen').textContent = hayDatos
        ? `${partes.join(' y ')} · ${textoPeriodo(rango)}`
        : 'No hay datos en este periodo';
    $('btn-exportar-excel').disabled = !hayDatos;
}

function generarLibro(rango) {
    const gastos = tipoElegido === 'inversiones' ? [] : hojasExcelGastos(rango) || [];
    const inversiones = tipoElegido === 'gastos' ? [] : hojasExcelInversiones(rango) || [];
    // En el Excel conjunto, las hojas de inversiones llevan "Inv." delante para distinguirlas
    if (tipoElegido === 'todo') inversiones.forEach(hoja => { hoja.nombre = `Inv. ${hoja.nombre}`; });
    const hojas = [...gastos, ...inversiones];
    return hojas.length ? crearLibroExcel(hojas) : null;
}

function nombreArchivo(rango) {
    const periodo = !rango ? obtenerFechaHoy() : rango.desde === rango.hasta ? rango.desde : `${rango.desde}_a_${rango.hasta}`;
    return `${TIPOS[tipoElegido].nombre}_${periodo}.xlsx`;
}

function exportar() {
    const rango = rangoElegido();
    let libro;
    try {
        libro = generarLibro(rango);
    } catch (error) {
        console.error('Error al crear el Excel:', error);
        return alert('No se ha podido crear el Excel.');
    }
    if (!libro) return alert('No hay datos que exportar en este periodo.');

    const nombre = nombreArchivo(rango);
    descargarArchivo(new Blob([libro], { type: MIME_EXCEL }), nombre);
    registrarExportacion({
        nombreArchivo: nombre,
        tipo: tipoElegido,
        formato: 'XLSX',
        mime: MIME_EXCEL,
        contenido: libro
    });
    ayudas.mostrarToast(TIPOS[tipoElegido].hecho);
}

export function iniciarExportarExcel(funcionesAyuda) {
    ayudas = funcionesAyuda;

    $('exportar-periodo').innerHTML = PERIODOS
        .map(p => `<button type="button" data-valor="${p.id}">${p.texto}</button>`).join('');

    document.querySelectorAll('#exportar-tipo button').forEach(btn => btn.addEventListener('click', () => {
        tipoElegido = btn.getAttribute('data-valor');
        renderizarExportarExcel();
    }));
    document.querySelectorAll('#exportar-periodo button').forEach(btn => btn.addEventListener('click', () => {
        periodoElegido = btn.getAttribute('data-valor');
        renderizarExportarExcel();
    }));

    // "Desde" nunca puede quedar por detrás de "Hasta"
    $('exportar-desde').addEventListener('change', () => {
        if ($('exportar-desde').value > $('exportar-hasta').value) $('exportar-hasta').value = $('exportar-desde').value;
        renderizarExportarExcel();
    });
    $('exportar-hasta').addEventListener('change', () => {
        if ($('exportar-hasta').value < $('exportar-desde').value) $('exportar-desde').value = $('exportar-hasta').value;
        renderizarExportarExcel();
    });
    $('btn-exportar-excel').addEventListener('click', exportar);

    renderizarExportarExcel();
}
