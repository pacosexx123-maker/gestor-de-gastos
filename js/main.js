import { 
    obtenerFechaHoy, obtenerMesActual, cargarGastosDesdeMemoria, guardarGastosEnMemoria, 
    filtrarMovimientosPorMes, calcularGastos, calcularIngresosNomina, calcularGastoHogar, 
    calcularDesglosePersonal, calcularDesgloseHogar, descargarArchivo
} from './utils.js?v=4';
import { iniciarExportaciones, registrarExportacion } from './exportaciones.js?v=4';
import { 
    iniciarInversiones, abrirFormularioInversion, obtenerInversiones, 
    reemplazarInversiones, generarCSVInversiones 
} from './inversiones.js?v=4';

const formulario = document.getElementById('formulario');
const listaGastosTabla = document.getElementById('lista-gastos');
const inputFecha = document.getElementById('fecha');
const inputSelectorMes = document.getElementById('selector-mes-activo');
const tituloMesActual = document.getElementById('titulo-mes-actual');
const displayGasto = document.getElementById('gasto-total');
const displayIngreso = document.getElementById('ingresos-totales');
const displayHogar = document.getElementById('gasto-hogar');
const contenedorFormulario = document.getElementById('contenedor-formulario');
const tipoMovimiento = document.getElementById('tipo-movimiento');
const selectCategoria = document.getElementById('categoria');
const modalDetalle = document.getElementById('modal-detalle');

let movimientos = cargarGastosDesdeMemoria();
let indiceEditando = null; 

inputSelectorMes.value = obtenerMesActual();

// GESTIÓN DE SWIPE PARA EL MES
let touchstartX = 0;
let touchendX = 0;
const zonaSwipeMes = document.getElementById('zona-swipe-mes');

zonaSwipeMes.addEventListener('touchstart', e => {
    touchstartX = e.changedTouches[0].screenX;
}, {passive: true});

zonaSwipeMes.addEventListener('touchend', e => {
    touchendX = e.changedTouches[0].screenX;
    manejarSwipeMes();
}, {passive: true});

function manejarSwipeMes() {
    const umbral = 50; 
    if (touchendX < touchstartX - umbral) cambiarMesActivo(1);  // Avanzar
    if (touchendX > touchstartX + umbral) cambiarMesActivo(-1); // Retroceder
}

function cambiarMesActivo(incremento) {
    let [anio, mes] = inputSelectorMes.value.split('-').map(Number);
    mes += incremento;
    if (mes > 12) { mes = 1; anio++; }
    else if (mes < 1) { mes = 12; anio--; }
    inputSelectorMes.value = `${anio}-${String(mes).padStart(2, '0')}`;
    renderizarMovimientos();
}

document.getElementById('btn-mes-anterior').addEventListener('click', () => cambiarMesActivo(-1));
document.getElementById('btn-mes-siguiente').addEventListener('click', () => cambiarMesActivo(1));

// NAVEGACIÓN ENTRE SECCIONES (barra inferior)
const SECCIONES = ['gastos', 'inversiones', 'archivos'];
let seccionActiva = SECCIONES.includes(localStorage.getItem('seccionActiva')) ? localStorage.getItem('seccionActiva') : 'gastos';

function cambiarSeccion(seccion) {
    seccionActiva = seccion;
    localStorage.setItem('seccionActiva', seccion);
    SECCIONES.forEach(s => document.getElementById(`seccion-${s}`).classList.toggle('oculto', s !== seccion));
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('activo', btn.getAttribute('data-seccion') === seccion);
    });
    // En la pestaña de archivos no hay nada que añadir
    const btnFlotante = document.getElementById('btn-abrir-formulario');
    btnFlotante.classList.toggle('oculto', seccion === 'archivos');
    btnFlotante.title = seccion === 'inversiones' ? 'Nueva inversión' : 'Nuevo movimiento';
    document.getElementById('texto-btn-flotante').textContent = btnFlotante.title;
    window.scrollTo(0, 0);
}

document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => cambiarSeccion(btn.getAttribute('data-seccion')));
});

// ACORDEÓN HISTORIAL
const cabeceraHistorial = document.getElementById('cabecera-historial');
const contenedorAcordeon = document.getElementById('contenedor-acordeon');
const iconoFlecha = document.getElementById('icono-flecha');

cabeceraHistorial.addEventListener('click', () => {
    contenedorAcordeon.classList.toggle('abierto');
    if (contenedorAcordeon.classList.contains('abierto')) {
        iconoFlecha.style.transform = 'rotate(180deg)';
    } else {
        iconoFlecha.style.transform = 'rotate(0deg)';
    }
});

// FUNCIÓN PARA EL TOAST (MENSAJES EMERGENTES)
function mostrarToast(mensaje) {
    const toast = document.getElementById('toast-notificacion');
    toast.textContent = mensaje;
    toast.classList.add('mostrar');
    
    setTimeout(() => {
        toast.classList.remove('mostrar');
    }, 2500); 
}

function formatoFechaES(fechaStr) {
    if(!fechaStr) return '';
    const [anio, mes, dia] = fechaStr.split('-');
    return `${dia}/${mes}/${anio}`;
}

function abrirModal(modal) {
    modal.classList.remove('oculto');
    document.body.classList.add('body-fijo');
}
function cerrarModal(modal) {
    modal.classList.add('oculto');
    if (document.querySelectorAll('.modal-overlay:not(.oculto)').length === 0) {
        document.body.classList.remove('body-fijo');
    }
}

function actualizarTextoMes(valorMes) {
    const [anio, mes] = valorMes.split('-');
    const fechaTemp = new Date(anio, mes - 1, 1);
    tituloMesActual.textContent = `${fechaTemp.toLocaleString('es-ES', { month: 'long' })} ${anio}`;
}

function actualizarCategorias() {
    selectCategoria.innerHTML = ''; 
    const opciones = tipoMovimiento.value === 'gasto' 
        ? ['Comida', 'Transporte', 'Ocio', 'Hogar', 'Otros'] 
        : ['Nómina', 'Bizum Hogar'];
    opciones.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat; option.textContent = cat;
        selectCategoria.appendChild(option);
    });
}
tipoMovimiento.addEventListener('change', actualizarCategorias);
actualizarCategorias(); 

function activarEdicionGlobal(indice) {
    const mov = movimientos[indice];
    tipoMovimiento.value = mov.tipo || 'gasto';
    actualizarCategorias(); 
    selectCategoria.value = mov.categoria || '';
    document.getElementById('concepto').value = mov.concepto || '';
    document.getElementById('cantidad').value = mov.cantidad || '';
    inputFecha.value = mov.fecha || obtenerFechaHoy();
    indiceEditando = indice; 
    document.querySelector('.cabecera-formulario b').textContent = 'Editar Movimiento';
    document.querySelector('.btn-guardar').textContent = 'Actualizar Movimiento';
    abrirModal(contenedorFormulario);
}

function abrirModalDetalle(tipo) {
    const mesSeleccionado = inputSelectorMes.value;
    const titulo = document.getElementById('titulo-modal-detalle');
    const resumenContenedor = document.getElementById('resumen-categorias');
    const listaDetalle = document.getElementById('lista-detalle');
    
    let desglose = {};
    let filtrados = [];

    if (tipo === 'personal') {
        titulo.textContent = 'Detalle: Gasto Personal';
        desglose = calcularDesglosePersonal(movimientos, mesSeleccionado);
        filtrados = filtrarMovimientosPorMes(movimientos, mesSeleccionado)
            .filter(mov => (mov.tipo === 'gasto' || !mov.tipo) && mov.categoria !== 'Hogar');
    } else {
        titulo.textContent = 'Detalle: Gasto Hogar';
        desglose = calcularDesgloseHogar(movimientos, mesSeleccionado);
        filtrados = movimientos.filter(mov => 
            (mov.categoria === 'Hogar' || mov.categoria === 'Bizum Hogar') && 
            (mov.fecha || '').substring(0, 7) <= mesSeleccionado
        );
    }

    resumenContenedor.innerHTML = '';
    for (const [cat, monto] of Object.entries(desglose)) {
        resumenContenedor.innerHTML += `<span class="resumen-badge">${cat}: ${Math.abs(monto).toFixed(2)} €</span>`;
    }

    listaDetalle.innerHTML = '';
    filtrados.forEach(mov => {
        const indiceReal = movimientos.indexOf(mov);
        const esIngreso = mov.tipo === 'ingreso';
        const claseColor = esIngreso ? 'monto-positivo' : 'monto-negativo';
        const signo = esIngreso ? '+' : '-';
        const fechaEspanol = formatoFechaES(mov.fecha || obtenerFechaHoy());

        listaDetalle.innerHTML += `
            <tr>
                <td>${fechaEspanol}</td>
                <td><span class="pildora">${mov.categoria || 'Otros'}</span> <br> <small>${mov.concepto || 'Sin concepto'}</small></td>
                <td class="${claseColor}">${signo} ${parseFloat(mov.cantidad || 0).toFixed(2)} €</td>
                <td>
                    <div class="acciones-fila">
                        <button class="btn-editar btn-editar-detalle" data-indice="${indiceReal}" title="Editar"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                        <button class="btn-eliminar btn-eliminar-detalle" data-indice="${indiceReal}" title="Eliminar"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
                    </div>
                </td>
            </tr>`;
    });

    document.querySelectorAll('.btn-eliminar-detalle').forEach(btn => {
        btn.addEventListener('click', function() {
            movimientos.splice(this.getAttribute('data-indice'), 1);
            guardarGastosEnMemoria(movimientos);
            renderizarMovimientos();
            abrirModalDetalle(tipo); 
            mostrarToast('Movimiento eliminado');
        });
    });

    document.querySelectorAll('.btn-editar-detalle').forEach(btn => {
        btn.addEventListener('click', function() {
            cerrarModal(modalDetalle);
            activarEdicionGlobal(this.getAttribute('data-indice'));
        });
    });

    abrirModal(modalDetalle);
}

function renderizarMovimientos() {
    listaGastosTabla.innerHTML = ''; 
    const mesSeleccionado = inputSelectorMes.value;
    
    const elementosAAnimar = [tituloMesActual, document.querySelector('.contenedor-totales'), listaGastosTabla];
    elementosAAnimar.forEach(el => {
        el.classList.remove('animacion-suave');
        void el.offsetWidth; 
        el.classList.add('animacion-suave');
    });

    actualizarTextoMes(mesSeleccionado);

    filtrarMovimientosPorMes(movimientos, mesSeleccionado).forEach((mov) => {
        const indiceReal = movimientos.indexOf(mov);
        const esIngreso = mov.tipo === 'ingreso';
        const claseColor = esIngreso ? 'monto-positivo' : 'monto-negativo';
        const signo = esIngreso ? '+' : '-';
        
        const fechaEspanol = formatoFechaES(mov.fecha || obtenerFechaHoy());
        const fechaSinAnio = fechaEspanol.substring(0, 5); 

        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${fechaSinAnio}</td>
            <td>${mov.concepto || 'Sin concepto'}<br><span class="pildora categoria-movil">${mov.categoria || 'Otros'}</span></td>
            <td><span class="pildora">${mov.categoria || 'Otros'}</span></td>
            <td class="${claseColor}">${signo} ${parseFloat(mov.cantidad || 0).toFixed(2)} €</td>
            <td>
                <div class="acciones-fila">
                    <button class="btn-editar btn-editar-main" data-indice="${indiceReal}" title="Editar"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                    <button class="btn-eliminar btn-eliminar-main" data-indice="${indiceReal}" title="Eliminar"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
                </div>
            </td>
        `;
        listaGastosTabla.appendChild(fila); 
    });

    document.querySelectorAll('.btn-eliminar-main').forEach(btn => {
        btn.addEventListener('click', function() {
            movimientos.splice(this.getAttribute('data-indice'), 1);
            guardarGastosEnMemoria(movimientos);
            renderizarMovimientos();
            mostrarToast('Movimiento eliminado');
        });
    });

    document.querySelectorAll('.btn-editar-main').forEach(btn => {
        btn.addEventListener('click', function() { activarEdicionGlobal(this.getAttribute('data-indice')); });
    });

    displayGasto.textContent = calcularGastos(movimientos, mesSeleccionado).toFixed(2);
    displayIngreso.textContent = calcularIngresosNomina(movimientos, mesSeleccionado).toFixed(2);
    displayHogar.textContent = calcularGastoHogar(movimientos, mesSeleccionado).toFixed(2);
}

inputSelectorMes.addEventListener('change', renderizarMovimientos);

document.getElementById('btn-ver-personal').addEventListener('click', () => abrirModalDetalle('personal'));
document.getElementById('btn-ver-hogar').addEventListener('click', () => abrirModalDetalle('hogar'));

function resetearFormularioYModal() {
    formulario.reset();
    inputFecha.value = obtenerFechaHoy(); 
    actualizarCategorias(); 
    indiceEditando = null;
    document.querySelector('.cabecera-formulario b').textContent = 'Nuevo Movimiento';
    document.querySelector('.btn-guardar').textContent = 'Guardar Movimiento';
    cerrarModal(contenedorFormulario);
}

formulario.addEventListener('submit', function(evento) {
    evento.preventDefault(); 
    const datosMovimiento = {
        tipo: tipoMovimiento.value, 
        concepto: document.getElementById('concepto').value,
        cantidad: parseFloat(document.getElementById('cantidad').value),
        fecha: inputFecha.value,
        categoria: selectCategoria.value
    };
    
    if (indiceEditando !== null) { 
        movimientos[indiceEditando] = datosMovimiento; 
        mostrarToast('Movimiento actualizado');
    } else { 
        movimientos.push(datosMovimiento); 
        mostrarToast('Movimiento añadido');
    }

    guardarGastosEnMemoria(movimientos);
    inputSelectorMes.value = datosMovimiento.fecha.substring(0, 7);
    renderizarMovimientos();
    resetearFormularioYModal();
});

// Descarga el archivo y lo deja anotado en la pestaña "Archivos"
function exportarYRegistrar({ contenido, mime, nombreArchivo, tipo, formato }) {
    descargarArchivo(new Blob([contenido], { type: mime }), nombreArchivo);
    registrarExportacion({ nombreArchivo, tipo, formato, contenido, mime });
}

// --- EXPORTAR COPIA DE SEGURIDAD (JSON): gastos e inversiones ---
document.getElementById('btn-exportar-json').addEventListener('click', () => {
    const inversiones = obtenerInversiones();
    if(movimientos.length === 0 && inversiones.length === 0) return alert('No hay datos que exportar.');
    exportarYRegistrar({
        contenido: JSON.stringify({ movimientos, inversiones }, null, 2),
        mime: 'application/json',
        nombreArchivo: `backup_gastos_${obtenerFechaHoy()}.json`,
        tipo: 'copia',
        formato: 'JSON'
    });
    mostrarToast('Copia de seguridad guardada');
});

// --- IMPORTAR COPIA DE SEGURIDAD (JSON) ---
const btnImportarJson = document.getElementById('btn-importar-json');
const inputArchivoJson = document.getElementById('input-archivo-json');

btnImportarJson.addEventListener('click', () => {
    inputArchivoJson.click();
});

inputArchivoJson.addEventListener('change', (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;

    const lector = new FileReader();
    lector.onload = function(e) {
        try {
            const datosImportados = JSON.parse(e.target.result);
            if (Array.isArray(datosImportados)) {
                // Copias antiguas: solo contienen los movimientos de gastos
                movimientos = datosImportados;
                guardarGastosEnMemoria(movimientos);
                renderizarMovimientos();
                mostrarToast('Copia restaurada con éxito');
            } else if (datosImportados && Array.isArray(datosImportados.movimientos)) {
                movimientos = datosImportados.movimientos;
                guardarGastosEnMemoria(movimientos);
                renderizarMovimientos();
                reemplazarInversiones(Array.isArray(datosImportados.inversiones) ? datosImportados.inversiones : []);
                mostrarToast('Copia restaurada con éxito');
            } else {
                alert('El archivo seleccionado no es válido.');
            }
        } catch (error) {
            alert('Error al leer el archivo JSON.');
        }
        inputArchivoJson.value = ''; // Limpiar input
    };
    lector.readAsText(archivo);
});

// --- EXPORTAR EXCEL (CSV): exporta la sección activa ---
document.getElementById('btn-exportar').addEventListener('click', () => {
    if (seccionActiva === 'inversiones') {
        const csvInversiones = generarCSVInversiones();
        if (!csvInversiones) return alert('No hay inversiones que exportar.');
        exportarYRegistrar({
            contenido: csvInversiones,
            mime: 'text/csv;charset=utf-8;',
            nombreArchivo: `TusInversiones_${obtenerFechaHoy()}.csv`,
            tipo: 'inversiones',
            formato: 'CSV'
        });
        return mostrarToast('Inversiones exportadas');
    }
    if(movimientos.length === 0) return alert('No hay movimientos que exportar.');
    let csv = '\uFEFFFecha,Tipo,Categoría,Concepto,Cantidad (€)\n';
    movimientos.forEach(m => {
        csv += `${formatoFechaES(m.fecha || obtenerFechaHoy())},${m.tipo || 'gasto'},"${m.categoria || ''}","${m.concepto || ''}",${m.cantidad || 0}\n`;
    });
    exportarYRegistrar({
        contenido: csv,
        mime: 'text/csv;charset=utf-8;',
        nombreArchivo: `TusGastos_${obtenerFechaHoy()}.csv`,
        tipo: 'gastos',
        formato: 'CSV'
    });
    mostrarToast('Gastos exportados');
});

document.getElementById('btn-abrir-formulario').addEventListener('click', () => { 
    if (seccionActiva === 'inversiones') return abrirFormularioInversion();
    resetearFormularioYModal(); 
    abrirModal(contenedorFormulario); 
});
document.getElementById('btn-cerrar-formulario').addEventListener('click', resetearFormularioYModal);
document.getElementById('btn-cerrar-detalle').addEventListener('click', () => cerrarModal(modalDetalle));

contenedorFormulario.addEventListener('click', (e) => { if (e.target === contenedorFormulario) resetearFormularioYModal(); });
modalDetalle.addEventListener('click', (e) => { if (e.target === modalDetalle) cerrarModal(modalDetalle); });

inputFecha.value = obtenerFechaHoy(); 
renderizarMovimientos();
iniciarInversiones({ abrirModal, cerrarModal, mostrarToast, formatoFechaES });
iniciarExportaciones({ mostrarToast });
cambiarSeccion(seccionActiva);