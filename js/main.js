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
const contenedorPersonal = document.getElementById('desglose-personal');
const contenedorHogar = document.getElementById('desglose-hogar');
const contenedorFormulario = document.getElementById('contenedor-formulario');
const tipoMovimiento = document.getElementById('tipo-movimiento');
const selectCategoria = document.getElementById('categoria');

let movimientos = cargarGastosDesdeMemoria();

inputSelectorMes.value = obtenerMesActual();

function actualizarTextoMes(valorMes) {
    const [anio, mes] = valorMes.split('-');
    const fechaTemp = new Date(anio, mes - 1, 1);
    const nombreMes = fechaTemp.toLocaleString('es-ES', { month: 'long' });
    // Muestra por ejemplo "septiembre 2026" sin el " de "
    tituloMesActual.textContent = `${nombreMes} ${anio}`;
}

function actualizarCategorias() {
    selectCategoria.innerHTML = ''; 
    const opciones = tipoMovimiento.value === 'gasto' 
        ? ['Comida', 'Transporte', 'Ocio', 'Hogar', 'Otros'] 
        : ['Nómina', 'Bizum Hogar'];

    opciones.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        selectCategoria.appendChild(option);
    });
}
tipoMovimiento.addEventListener('change', actualizarCategorias);
actualizarCategorias(); 

function renderizarDesgloses(mesSeleccionado) {
    // Desglose personal filtrado por mes
    contenedorPersonal.innerHTML = '';
    const desglosePers = calcularDesglosePersonal(movimientos, mesSeleccionado);
    for (const [categoria, monto] of Object.entries(desglosePers)) {
        contenedorPersonal.innerHTML += `
            <div class="categoria-item">
                <span class="categoria-nombre">${categoria}</span>
                <span class="categoria-monto monto-negativo">${monto.toFixed(2)} €</span>
            </div>`;
    }
    if(Object.keys(desglosePers).length === 0) contenedorPersonal.innerHTML = '<span class="categoria-nombre">Sin gastos este mes</span>';

    // Desglose hogar global (mantiene la info accesible)
    contenedorHogar.innerHTML = '';
    const desgloseHog = calcularDesgloseHogar(movimientos);
    for (const [concepto, monto] of Object.entries(desgloseHog)) {
        const claseColor = monto < 0 ? 'monto-positivo' : 'monto-negativo';
        const signo = monto < 0 ? '+' : '';
        contenedorHogar.innerHTML += `
            <div class="categoria-item">
                <span class="categoria-nombre">${concepto}</span>
                <span class="categoria-monto ${claseColor}">${signo}${Math.abs(monto).toFixed(2)} €</span>
            </div>`;
    }
    if(Object.keys(desgloseHog).length === 0) contenedorHogar.innerHTML = '<span class="categoria-nombre">Sin registros</span>';
}

function renderizarMovimientos() {
    listaGastosTabla.innerHTML = ''; 
    const mesSeleccionado = inputSelectorMes.value;
    
    actualizarTextoMes(mesSeleccionado);

    const movimientosFiltrados = filtrarMovimientosPorMes(movimientos, mesSeleccionado);

    movimientosFiltrados.forEach((mov) => {
        const indiceReal = movimientos.indexOf(mov);
        
        const esIngreso = mov.tipo === 'ingreso';
        const claseColor = esIngreso ? 'monto-positivo' : 'monto-negativo';
        const signo = esIngreso ? '+' : '-';

        const fechaSegura = mov.fecha || obtenerFechaHoy();
        const fechaCorta = fechaSegura.length >= 10 ? fechaSegura.substring(5).replace('-', '/') : fechaSegura;

        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${fechaCorta}</td>
            <td>${mov.concepto || 'Sin concepto'}</td>
            <td><span class="pildora">${mov.categoria || 'Otros'}</span></td>
            <td class="${claseColor}">${signo} ${parseFloat(mov.cantidad || 0).toFixed(2)} €</td>
            <td><button class="btn-eliminar" data-indice="${indiceReal}">✕</button></td>
        `;
        listaGastosTabla.appendChild(fila); 
    });

    document.querySelectorAll('.btn-eliminar').forEach(boton => {
        boton.addEventListener('click', function() {
            movimientos.splice(this.getAttribute('data-indice'), 1);
            guardarGastosEnMemoria(movimientos);
            renderizarMovimientos();
        });
    });

    displayGasto.textContent = calcularGastos(movimientos, mesSeleccionado).toFixed(2);
    displayIngreso.textContent = calcularIngresosNomina(movimientos, mesSeleccionado).toFixed(2);
    // El gasto hogar se muestra globalmente para no perder el balance acumulado
    displayHogar.textContent = calcularGastoHogar(movimientos).toFixed(2);
    renderizarDesgloses(mesSeleccionado);
}

inputSelectorMes.addEventListener('change', renderizarMovimientos);

formulario.addEventListener('submit', function(evento) {
    evento.preventDefault(); 
    const nuevoMovimiento = {
        tipo: tipoMovimiento.value, 
        concepto: document.getElementById('concepto').value,
        cantidad: parseFloat(document.getElementById('cantidad').value),
        fecha: inputFecha.value,
        categoria: selectCategoria.value
    };
    
    movimientos.push(nuevoMovimiento);
    guardarGastosEnMemoria(movimientos);
    
    inputSelectorMes.value = nuevoMovimiento.fecha.substring(0, 7);
    renderizarMovimientos();
    
    formulario.reset();
    inputFecha.value = obtenerFechaHoy(); 
    actualizarCategorias(); 
    contenedorFormulario.classList.add('oculto');
});

document.getElementById('btn-abrir-formulario').addEventListener('click', () => {
    contenedorFormulario.classList.remove('oculto');
});
document.getElementById('btn-cerrar-formulario').addEventListener('click', () => {
    contenedorFormulario.classList.add('oculto');
});
contenedorFormulario.addEventListener('click', (evento) => {
    if (evento.target === contenedorFormulario) {
        contenedorFormulario.classList.add('oculto');
    }
});

inputFecha.value = obtenerFechaHoy(); 
renderizarMovimientos();