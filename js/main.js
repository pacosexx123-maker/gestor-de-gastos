import { 
    obtenerFechaHoy, obtenerMesActual, cargarGastosDesdeMemoria, guardarGastosEnMemoria, 
    filtrarMovimientosPorMes, calcularGastos, calcularIngresosNomina, calcularGastoHogar, 
    calcularDesglosePersonal, calcularDesgloseHogar, descargarArchivo
} from './utils.js?v=14';
import { crearLibroExcel, agruparPorMes, ordenarPorFecha, bytesABase64, MIME_EXCEL } from './excel.js?v=14';
import { iniciarExportaciones, registrarExportacion } from './exportaciones.js?v=14';
import { 
    iniciarInversiones, abrirFormularioInversion, obtenerInversiones, 
    reemplazarInversiones, generarExcelInversiones 
} from './inversiones.js?v=14';
import { iniciarImportacionOrdenes, importarOrdenesDesdeArchivo } from './importar-ordenes.js?v=14';
import { iniciarCopiaSeguridad, abrirModalCopia, esCopiaCifrada, pedirContrasenaYDescifrar } from './copia-seguridad.js?v=14';
import { obtenerCarteras, reemplazarCarteras } from './carteras.js?v=14';
import { iniciarAjustes, renderizarAjustes } from './ajustes.js?v=14';

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
    touchstartX = e.changedTouches[0].clientX;
}, {passive: true});

zonaSwipeMes.addEventListener('touchend', e => {
    touchendX = e.changedTouches[0].clientX;
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
const SECCIONES = ['gastos', 'inversiones', 'archivos', 'ajustes'];
// Pantalla al abrir: la elegida en Ajustes o, por defecto, la última que se usó
const seccionInicio = localStorage.getItem('seccionInicio');
const seccionGuardada = SECCIONES.includes(seccionInicio) ? seccionInicio : localStorage.getItem('seccionActiva');
let seccionActiva = SECCIONES.includes(seccionGuardada) ? seccionGuardada : 'gastos';

function cambiarSeccion(seccion) {
    const anterior = seccionActiva;
    seccionActiva = seccion;
    localStorage.setItem('seccionActiva', seccion);
    SECCIONES.forEach(s => document.getElementById(`seccion-${s}`).classList.toggle('oculto', s !== seccion));

    // La sección nueva entra desde el lado hacia el que se avanza
    if (anterior !== seccion) {
        const elemento = document.getElementById(`seccion-${seccion}`);
        const clase = SECCIONES.indexOf(seccion) > SECCIONES.indexOf(anterior) ? 'entrar-derecha' : 'entrar-izquierda';
        elemento.classList.remove('entrar-derecha', 'entrar-izquierda');
        void elemento.offsetWidth;
        elemento.classList.add(clase);
    }
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('activo', btn.getAttribute('data-seccion') === seccion);
    });
    // En Archivos y Ajustes no hay nada que añadir
    const btnFlotante = document.getElementById('btn-abrir-formulario');
    btnFlotante.classList.toggle('oculto', seccion === 'archivos' || seccion === 'ajustes');
    if (seccion === 'ajustes') { try { renderizarAjustes(); } catch (error) { console.error(error); } }
    btnFlotante.title = seccion === 'inversiones' ? 'Nueva inversión' : 'Nuevo movimiento';
    document.getElementById('texto-btn-flotante').textContent = btnFlotante.title;
    document.getElementById('texto-exportar-seccion').textContent = seccion === 'inversiones' ? 'Inversiones (.xlsx)' : 'Gastos (.xlsx)';
    cerrarMenuDatos();
    window.scrollTo(0, 0);
}

document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => cambiarSeccion(btn.getAttribute('data-seccion')));
});

// MENÚ DE DATOS (botón opuesto al +): exportar, copia de seguridad e importar
const btnMenuDatos = document.getElementById('btn-menu-datos');
const menuDatos = document.getElementById('menu-datos');

function cerrarMenuDatos() {
    menuDatos.classList.add('oculto');
    btnMenuDatos.setAttribute('aria-expanded', 'false');
    btnMenuDatos.classList.remove('abierto');
}

btnMenuDatos.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrir = menuDatos.classList.contains('oculto');
    menuDatos.classList.toggle('oculto', !abrir);
    btnMenuDatos.setAttribute('aria-expanded', String(abrir));
    btnMenuDatos.classList.toggle('abierto', abrir);
});
// Cada opción hace su acción (sus propios eventos) y después se cierra el menú
menuDatos.querySelectorAll('.menu-opcion').forEach(opcion => opcion.addEventListener('click', cerrarMenuDatos));
document.addEventListener('click', (e) => {
    if (!menuDatos.classList.contains('oculto') && !menuDatos.contains(e.target)) cerrarMenuDatos();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMenuDatos(); });

// DESLIZAR HACIA ABAJO UNA VENTANA PARA CERRARLA (igual que la X)
let arrastreVentana = null;

document.addEventListener('touchstart', e => {
    arrastreVentana = null;
    const contenido = e.target.closest('.modal-overlay:not(.oculto) .modal-contenido');
    if (!contenido || e.touches.length !== 1 || contenido.scrollTop > 0) return;
    if (e.target.closest('input, select, textarea')) return;
    arrastreVentana = { contenido, inicioY: e.touches[0].clientY, desplazamiento: 0, tiempo: Date.now(), activo: false };
}, {passive: true});

document.addEventListener('touchmove', e => {
    if (!arrastreVentana) return;
    const dy = e.touches[0].clientY - arrastreVentana.inicioY;
    if (!arrastreVentana.activo) {
        // Solo si se arrastra hacia abajo con la ventana en su parte superior; hacia arriba es scroll normal
        if (dy < -4 || arrastreVentana.contenido.scrollTop > 0) { arrastreVentana = null; return; }
        if (dy < 8) return;
        arrastreVentana.activo = true;
        arrastreVentana.contenido.style.transition = 'none';
    }
    arrastreVentana.desplazamiento = Math.max(0, dy);
    arrastreVentana.contenido.style.transform = `translateY(${arrastreVentana.desplazamiento}px)`;
    if (e.cancelable) e.preventDefault();
}, {passive: false});

document.addEventListener('touchend', () => {
    if (!arrastreVentana || !arrastreVentana.activo) { arrastreVentana = null; return; }
    const { contenido, desplazamiento, tiempo } = arrastreVentana;
    arrastreVentana = null;
    const rapido = desplazamiento > 50 && Date.now() - tiempo < 300;
    contenido.style.transition = 'transform 0.2s ease';
    if (desplazamiento > 110 || rapido) {
        contenido.style.transform = 'translateY(100%)';
        setTimeout(() => {
            const ventana = contenido.closest('.modal-overlay');
            const botonCerrar = ventana.querySelector('.btn-cerrar');
            if (botonCerrar) botonCerrar.click(); else cerrarModal(ventana);
            contenido.style.transform = '';
            contenido.style.transition = '';
        }, 180);
    } else {
        contenido.style.transform = '';
        setTimeout(() => { contenido.style.transition = ''; }, 200);
    }
});

// DESLIZAR HACIA LOS LADOS PARA CAMBIAR DE SECCIÓN
// (sobre el selector de mes se sigue cambiando de mes)
let inicioToque = null;

document.addEventListener('touchstart', e => {
    inicioToque = null;
    if (e.touches.length !== 1 || document.body.classList.contains('body-fijo')) return;
    const objetivo = e.target;
    if (objetivo.closest('#zona-swipe-mes, input, select, textarea')) return;
    const tabla = objetivo.closest('.tabla-contenedor');
    if (tabla && tabla.scrollWidth > tabla.clientWidth) return; // tabla que se desplaza de lado
    inicioToque = { x: e.touches[0].clientX, y: e.touches[0].clientY, tiempo: Date.now() };
}, {passive: true});

document.addEventListener('touchend', e => {
    if (!inicioToque) return;
    const dx = e.changedTouches[0].clientX - inicioToque.x;
    const dy = e.changedTouches[0].clientY - inicioToque.y;
    const duracion = Date.now() - inicioToque.tiempo;
    inicioToque = null;

    // Solo gestos claramente horizontales y rápidos, para no interferir con el scroll
    if (duracion > 800 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const destino = SECCIONES.indexOf(seccionActiva) + (dx < 0 ? 1 : -1);
    if (destino >= 0 && destino < SECCIONES.length) cambiarSeccion(SECCIONES[destino]);
}, {passive: true});

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
// El contenido puede ser texto (JSON) o bytes (Excel)
function exportarYRegistrar({ contenido, mime, nombreArchivo, tipo, formato }) {
    descargarArchivo(new Blob([contenido], { type: mime }), nombreArchivo);
    const esBinario = contenido instanceof Uint8Array;
    registrarExportacion({
        nombreArchivo, tipo, formato, mime,
        contenido: esBinario ? bytesABase64(contenido) : contenido,
        codificacion: esBinario ? 'base64' : 'texto'
    });
}

// --- COPIA DE SEGURIDAD (gastos e inversiones, cifrada con contraseña) ---
document.getElementById('btn-exportar-json').addEventListener('click', () => abrirModalCopia());

function restaurarCopia(datosImportados) {
    if (Array.isArray(datosImportados)) {
        // Copias antiguas: solo contienen los movimientos de gastos
        movimientos = datosImportados;
    } else if (datosImportados && Array.isArray(datosImportados.movimientos)) {
        movimientos = datosImportados.movimientos;
        reemplazarCarteras(Array.isArray(datosImportados.carteras) ? datosImportados.carteras : []);
        reemplazarInversiones(Array.isArray(datosImportados.inversiones) ? datosImportados.inversiones : []);
    } else {
        return alert('El archivo seleccionado no es válido.');
    }
    guardarGastosEnMemoria(movimientos);
    renderizarMovimientos();
    mostrarToast('Copia restaurada con éxito');
}

// --- IMPORTAR COPIA DE SEGURIDAD (JSON) ---
const btnImportarJson = document.getElementById('btn-importar-json');
const inputArchivoJson = document.getElementById('input-archivo-json');

btnImportarJson.addEventListener('click', () => {
    inputArchivoJson.click();
});

inputArchivoJson.addEventListener('change', (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;

    // Órdenes del bróker (CSV o Excel): se añaden a las inversiones tras una vista previa
    const extension = archivo.name.split('.').pop().toLowerCase();
    if (extension === 'xls') {
        inputArchivoJson.value = '';
        return alert('Este formato de Excel antiguo (.xls) no se puede leer. Ábrelo y guárdalo como .xlsx o .csv.');
    }
    if (['csv', 'xlsx', 'txt'].includes(extension)) {
        importarOrdenesDesdeArchivo(archivo).finally(() => { inputArchivoJson.value = ''; });
        return;
    }

    const lector = new FileReader();
    lector.onload = function(e) {
        inputArchivoJson.value = ''; // Limpiar input
        let datosImportados;
        try {
            datosImportados = JSON.parse(e.target.result);
        } catch (error) {
            return alert('Error al leer el archivo JSON.');
        }
        if (esCopiaCifrada(datosImportados)) {
            pedirContrasenaYDescifrar(datosImportados).then(datos => { if (datos) restaurarCopia(datos); });
        } else {
            restaurarCopia(datosImportados);
        }
    };
    lector.readAsText(archivo);
});

// --- EXPORTAR EXCEL (.xlsx): hoja "Total" + una hoja por mes ---
const COLUMNAS_EXCEL_GASTOS = [
    { titulo: 'Fecha', ancho: 12 },
    { titulo: 'Tipo', ancho: 10 },
    { titulo: 'Categoría', ancho: 16 },
    { titulo: 'Concepto', ancho: 36 },
    { titulo: 'Cantidad (€)', ancho: 14 }
];

function filasExcelGastos(lista) {
    const filas = ordenarPorFecha(lista).map(m => [
        { v: m.fecha, tipo: 'fecha' },
        { v: m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto' },
        { v: m.categoria || 'Otros' },
        { v: m.concepto || 'Sin concepto' },
        { v: parseFloat(m.cantidad || 0), tipo: 'dinero' }
    ]);
    const ingresos = lista.filter(m => m.tipo === 'ingreso').reduce((acumulado, m) => acumulado + parseFloat(m.cantidad || 0), 0);
    const gastos = lista.filter(m => m.tipo !== 'ingreso').reduce((acumulado, m) => acumulado + parseFloat(m.cantidad || 0), 0);
    filas.push([]);
    filas.push([null, null, null, { v: 'Total ingresos', negrita: true }, { v: parseFloat(ingresos.toFixed(2)), tipo: 'dinero', negrita: true }]);
    filas.push([null, null, null, { v: 'Total gastos', negrita: true }, { v: parseFloat(gastos.toFixed(2)), tipo: 'dinero', negrita: true }]);
    filas.push([null, null, null, { v: 'Balance', negrita: true }, { v: parseFloat((ingresos - gastos).toFixed(2)), tipo: 'dinero', negrita: true }]);
    return filas;
}

function generarExcelGastos() {
    const hojas = [{ nombre: 'Total', columnas: COLUMNAS_EXCEL_GASTOS, filas: filasExcelGastos(movimientos) }];
    agruparPorMes(movimientos).forEach(mes => {
        hojas.push({ nombre: mes.nombre, columnas: COLUMNAS_EXCEL_GASTOS, filas: filasExcelGastos(mes.elementos) });
    });
    return crearLibroExcel(hojas);
}

// Exporta la sección activa (en "Archivos" exporta los gastos)
document.getElementById('btn-exportar').addEventListener('click', () => {
    if (seccionActiva === 'inversiones') {
        const excelInversiones = generarExcelInversiones();
        if (!excelInversiones) return alert('No hay inversiones que exportar.');
        exportarYRegistrar({
            contenido: excelInversiones,
            mime: MIME_EXCEL,
            nombreArchivo: `TusInversiones_${obtenerFechaHoy()}.xlsx`,
            tipo: 'inversiones',
            formato: 'XLSX'
        });
        return mostrarToast('Inversiones exportadas');
    }
    if(movimientos.length === 0) return alert('No hay movimientos que exportar.');
    exportarYRegistrar({
        contenido: generarExcelGastos(),
        mime: MIME_EXCEL,
        nombreArchivo: `TusGastos_${obtenerFechaHoy()}.xlsx`,
        tipo: 'gastos',
        formato: 'XLSX'
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
// Si una sección falla al arrancar (p. ej. por un dato guardado incorrecto), el resto de la app sigue funcionando
function iniciarConSeguridad(nombre, iniciar) {
    try {
        iniciar();
    } catch (error) {
        console.error(`Error al iniciar ${nombre}:`, error);
        mostrarToast(`No se ha podido cargar ${nombre}`);
    }
}

iniciarConSeguridad('Inversiones', () => iniciarInversiones({ abrirModal, cerrarModal, mostrarToast, formatoFechaES }));
iniciarConSeguridad('Archivos', () => iniciarExportaciones({ mostrarToast }));
iniciarConSeguridad('la importación', () => iniciarImportacionOrdenes({ abrirModal, cerrarModal, mostrarToast, formatoFechaES, alImportar: () => cambiarSeccion('inversiones') }));
iniciarConSeguridad('las copias de seguridad', () => iniciarCopiaSeguridad({
    abrirModal, cerrarModal, mostrarToast, registrarExportacion,
    obtenerDatos: () => ({ movimientos, inversiones: obtenerInversiones(), carteras: obtenerCarteras() })
}));
const obtenerDatosApp = () => ({ movimientos, inversiones: obtenerInversiones(), carteras: obtenerCarteras() });
iniciarConSeguridad('los ajustes', () => iniciarAjustes({ mostrarToast, obtenerDatos: obtenerDatosApp }));
cambiarSeccion(seccionActiva);