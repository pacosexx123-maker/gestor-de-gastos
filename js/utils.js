export function obtenerFechaHoy() {
    const hoy = new Date();
    return hoy.toISOString().split('T')[0];
}

export function obtenerMesActual() {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    return `${anio}-${mes}`;
}

export function cargarGastosDesdeMemoria() {
    const datosGuardados = localStorage.getItem('gastos');
    return datosGuardados ? JSON.parse(datosGuardados) : [];
}

export function guardarGastosEnMemoria(listaGastos) {
    localStorage.setItem('gastos', JSON.stringify(listaGastos));
}

export function filtrarMovimientosPorMes(lista, mesAnio) {
    return lista.filter(mov => {
        const fechaMov = mov.fecha || '';
        return fechaMov.startsWith(mesAnio);
    });
}

// Gastos personales (filtrados por mes)
export function calcularGastos(lista, mesAnio) {
    const listaFiltrada = filtrarMovimientosPorMes(lista, mesAnio);
    return listaFiltrada
        .filter(mov => (mov.tipo === 'gasto' || !mov.tipo) && mov.categoria !== 'Hogar') 
        .reduce((acumulado, mov) => acumulado + parseFloat(mov.cantidad || 0), 0);
}

// Nómina (filtrada por mes)
export function calcularIngresosNomina(lista, mesAnio) {
    const listaFiltrada = filtrarMovimientosPorMes(lista, mesAnio);
    return listaFiltrada
        .filter(mov => mov.tipo === 'ingreso' && mov.categoria === 'Nómina')
        .reduce((acumulado, mov) => acumulado + parseFloat(mov.cantidad || 0), 0);
}

// Gasto Hogar (GLOBAL / PERSISTENTE - No se borra al cambiar de mes)
export function calcularGastoHogar(lista) {
    let gastos = 0;
    let bizum = 0;
    
    lista.forEach(mov => {
        if (mov.tipo === 'gasto' && mov.categoria === 'Hogar') gastos += parseFloat(mov.cantidad || 0);
        if (mov.tipo === 'ingreso' && mov.categoria === 'Bizum Hogar') bizum += parseFloat(mov.cantidad || 0);
    });
    return gastos - bizum;
}

// Desglose personal (filtrado por mes)
export function calcularDesglosePersonal(lista, mesAnio) {
    const listaFiltrada = filtrarMovimientosPorMes(lista, mesAnio);
    const totales = {};
    listaFiltrada.forEach(mov => {
        if ((mov.tipo === 'gasto' || !mov.tipo) && mov.categoria !== 'Hogar') {
            if (!totales[mov.categoria]) totales[mov.categoria] = 0;
            totales[mov.categoria] += parseFloat(mov.cantidad || 0);
        }
    });
    return totales;
}

// Desglose Hogar (GLOBAL / PERSISTENTE)
export function calcularDesgloseHogar(lista) {
    let gastoHogar = 0;
    let bizumHogar = 0;

    lista.forEach(mov => {
        if (mov.tipo === 'gasto' && mov.categoria === 'Hogar') gastoHogar += parseFloat(mov.cantidad || 0);
        if (mov.tipo === 'ingreso' && mov.categoria === 'Bizum Hogar') bizumHogar += parseFloat(mov.cantidad || 0);
    });

    const desglose = {};
    if (gastoHogar > 0) desglose['Gastos acumulados'] = gastoHogar;
    if (bizumHogar > 0) desglose['Devoluciones (Bizum)'] = -bizumHogar; 
    
    return desglose;
}