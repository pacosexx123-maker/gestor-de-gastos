import { 
    obtenerFechaHoy, obtenerMesActual, cargarGastosDesdeMemoria, guardarGastosEnMemoria, 
    filtrarMovimientosPorMes, calcularGastos, calcularIngresosNomina, calcularGastoHogar, 
    calcularDesglosePersonal, calcularDesgloseHogar 
} from './utils.js';

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
    }, 2500); // Se oculta tras 2.5 segundos
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
                    <div style="display: flex; gap: 4px; justify-content: center;">
                        <button class="btn-editar btn-editar-detalle" data-indice="${indiceReal}">✏️</button>
                        <button class="btn-eliminar btn-eliminar-detalle" data-indice="${indiceReal}">✕</button>
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
            mostrarToast('🗑️ Movimiento eliminado');
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
    
    // Aplicar animación suave a los elementos principales al cambiar el mes
    const elementosAAnimar = [tituloMesActual, document.querySelector('.contenedor-totales'), listaGastosTabla];
    elementosAAnimar.forEach(el => {
        el.classList.remove('animacion-suave');
        void el.offsetWidth; // Truco visual para reiniciar la animación
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
            <td>${mov.concepto || 'Sin concepto'}</td>
            <td><span class="pildora">${mov.categoria || 'Otros'}</span></td>
            <td class="${claseColor}">${signo} ${parseFloat(mov.cantidad || 0).toFixed(2)} €</td>
            <td>
                <div style="display: flex; gap: 4px; justify-content: center;">
                    <button class="btn-editar btn-editar-main" data-indice="${indiceReal}">✏️</button>
                    <button class="btn-eliminar btn-eliminar-main" data-indice="${indiceReal}">✕</button>
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
            mostrarToast('🗑️ Movimiento eliminado');
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
        mostrarToast('✅ Movimiento actualizado correctamente');
    } else { 
        movimientos.push(datosMovimiento); 
        mostrarToast('✅ Movimiento añadido correctamente');
    }

    guardarGastosEnMemoria(movimientos);
    inputSelectorMes.value = datosMovimiento.fecha.substring(0, 7);
    renderizarMovimientos();
    resetearFormularioYModal();
});

document.getElementById('btn-exportar').addEventListener('click', () => {
    if(movimientos.length === 0) return alert('No hay movimientos que exportar.');
    let csv = '\uFEFFFecha,Tipo,Categoría,Concepto,Cantidad (€)\n';
    movimientos.forEach(m => {
        csv += `${formatoFechaES(m.fecha || obtenerFechaHoy())},${m.tipo || 'gasto'},"${m.categoria || ''}","${m.concepto || ''}",${m.cantidad || 0}\n`;
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.setAttribute('download', `TusGastos_${obtenerFechaHoy()}.csv`);
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
});

document.getElementById('btn-abrir-formulario').addEventListener('click', () => { 
    resetearFormularioYModal(); 
    abrirModal(contenedorFormulario); 
});
document.getElementById('btn-cerrar-formulario').addEventListener('click', resetearFormularioYModal);
document.getElementById('btn-cerrar-detalle').addEventListener('click', () => cerrarModal(modalDetalle));

contenedorFormulario.addEventListener('click', (e) => { if (e.target === contenedorFormulario) resetearFormularioYModal(); });
modalDetalle.addEventListener('click', (e) => { if (e.target === modalDetalle) cerrarModal(modalDetalle); });

inputFecha.value = obtenerFechaHoy(); 
renderizarMovimientos();