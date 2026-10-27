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

// Gastos personales (filtrados por mes exacto)
export function calcularGastos(lista, mesAnio) {
    const listaFiltrada = filtrarMovimientosPorMes(lista, mesAnio);
    return listaFiltrada
        .filter(mov => (mov.tipo === 'gasto' || !mov.tipo) && mov.categoria !== 'Hogar') 
        .reduce((acumulado, mov) => acumulado + parseFloat(mov.cantidad || 0), 0);
}

// Nómina (filtrada por mes exacto)
export function calcularIngresosNomina(lista, mesAnio) {
    const listaFiltrada = filtrarMovimientosPorMes(lista, mesAnio);
    return listaFiltrada
        .filter(mov => mov.tipo === 'ingreso' && mov.categoria === 'Nómina')
        .reduce((acumulado, mov) => acumulado + parseFloat(mov.cantidad || 0), 0);
}

// Gasto Hogar (Acumulado HASTA el mes seleccionado inclusive)
export function calcularGastoHogar(lista, mesAnio) {
    let gastos = 0;
    let bizum = 0;
    lista.forEach(mov => {
        const mesMovimiento = (mov.fecha || '').substring(0, 7);
        if (mesMovimiento <= mesAnio) {
            if (mov.tipo === 'gasto' && mov.categoria === 'Hogar') gastos += parseFloat(mov.cantidad || 0);
            if (mov.tipo === 'ingreso' && mov.categoria === 'Bizum Hogar') bizum += parseFloat(mov.cantidad || 0);
        }
    });
    return gastos - bizum;
}

// Desglose personal (filtrado por mes exacto)
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

// Desglose Hogar (Acumulado HASTA el mes seleccionado inclusive)
export function calcularDesgloseHogar(lista, mesAnio) {
    let gastoHogar = 0;
    let bizumHogar = 0;
    lista.forEach(mov => {
        const mesMovimiento = (mov.fecha || '').substring(0, 7);
        if (mesMovimiento <= mesAnio) {
            if (mov.tipo === 'gasto' && mov.categoria === 'Hogar') gastoHogar += parseFloat(mov.cantidad || 0);
            if (mov.tipo === 'ingreso' && mov.categoria === 'Bizum Hogar') bizumHogar += parseFloat(mov.cantidad || 0);
        }
    });

    const desglose = {};
    if (gastoHogar > 0) desglose['Gastos acumulados'] = gastoHogar;
    if (bizumHogar > 0) desglose['Devoluciones (Bizum)'] = -bizumHogar; 
    return desglose;
}

// --- INVERSIONES ---
export function cargarInversionesDesdeMemoria() {
    const datosGuardados = localStorage.getItem('inversiones');
    return datosGuardados ? JSON.parse(datosGuardados) : [];
}

export function guardarInversionesEnMemoria(listaInversiones) {
    localStorage.setItem('inversiones', JSON.stringify(listaInversiones));
}

export function calcularTotalInversion(inv) {
    return parseFloat(inv.cantidad || 0) * parseFloat(inv.precio || 0);
}

// Clave de un activo: su ISIN si lo tiene; si no, su nombre
export function claveActivo(inv) {
    return inv.isin ? String(inv.isin).toUpperCase() : String(inv.nombre || 'Sin nombre').trim().toLowerCase();
}

// Agrupa las aportaciones por activo (ISIN o nombre), ordenado de mayor a menor importe
export function calcularResumenPorActivo(lista) {
    const activos = {};
    lista.forEach(inv => {
        const clave = claveActivo(inv);
        if (!activos[clave]) activos[clave] = { clave, nombre: String(inv.nombre || 'Sin nombre').trim(), isin: inv.isin ? String(inv.isin) : '', tipo: inv.tipo || 'Otro', participaciones: 0, total: 0 };
        activos[clave].participaciones += parseFloat(inv.cantidad || 0);
        activos[clave].total += calcularTotalInversion(inv);
    });
    return Object.values(activos).sort((a, b) => b.total - a.total);
}

export function descargarArchivo(blob, nombreArchivo) {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.setAttribute('download', nombreArchivo);
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
}
