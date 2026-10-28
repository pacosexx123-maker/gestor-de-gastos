// --- FECHAS (siempre en hora local, no UTC) ---

export function obtenerFechaHoy() {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
}

export function obtenerMesActual() {
    return obtenerFechaHoy().substring(0, 7);
}

// "2026-10" + incremento de meses -> "2026-11"
export function sumarMeses(mes, incremento) {
    let [anio, numero] = mes.split('-').map(Number);
    numero += incremento;
    anio += Math.floor((numero - 1) / 12);
    numero = ((numero - 1) % 12 + 12) % 12 + 1;
    return `${anio}-${String(numero).padStart(2, '0')}`;
}

export function diasDelMes(mes) {
    const [anio, numero] = mes.split('-').map(Number);
    return new Date(anio, numero, 0).getDate();
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function nombreMesCorto(mes) {
    return MESES_CORTOS[Number(mes.split('-')[1]) - 1];
}

export function nombreMesLargo(mes) {
    const [anio, numero] = mes.split('-');
    return `${MESES_LARGOS[Number(numero) - 1]} ${anio}`;
}

export function formatoFechaES(fecha) {
    if (!fecha) return '';
    const [anio, mes, dia] = fecha.split('-');
    return `${dia}/${mes}/${anio}`;
}

// --- INVERSIONES ---

export function cargarInversionesDesdeMemoria() {
    try {
        const datos = JSON.parse(localStorage.getItem('inversiones') || '[]');
        return Array.isArray(datos) ? datos : [];
    } catch (error) {
        return [];
    }
}

export function guardarInversionesEnMemoria(listaInversiones) {
    localStorage.setItem('inversiones', JSON.stringify(listaInversiones));
}

export function esVenta(inv) {
    return inv.operacion === 'venta';
}

// Valor de los títulos al precio de la operación (sin comisiones)
export function calcularValorTitulos(inv) {
    return parseFloat(inv.cantidad || 0) * parseFloat(inv.precio || 0);
}

export function tieneDetalleTitulos(inv) {
    return parseFloat(inv.cantidad) > 0 && parseFloat(inv.precio) > 0;
}

// Compra: lo pagado (títulos × precio + comisión, o el importe si se añadió solo con lo pagado).
// Venta: lo recibido (títulos × precio − comisión, o el importe recibido).
export function calcularTotalInversion(inv) {
    if (!tieneDetalleTitulos(inv)) return parseFloat(inv.importe || 0);
    const comision = parseFloat(inv.comision || 0);
    return esVenta(inv) ? calcularValorTitulos(inv) - comision : calcularValorTitulos(inv) + comision;
}

// Clave de un activo: su ISIN si lo tiene; si no, su nombre
export function claveActivo(inv) {
    return inv.isin ? String(inv.isin).toUpperCase() : String(inv.nombre || 'Sin nombre').trim().toLowerCase();
}

// Posición de cada activo recorriendo sus operaciones por fecha (método del coste medio):
// - compra: suma títulos y coste
// - venta con títulos: resta títulos y la parte proporcional del coste; la diferencia con lo recibido es beneficio realizado
// - venta solo con importe: cierra toda la posición
// realizadoPorIndice (opcional): se rellena con el beneficio de cada venta, por su posición en la lista
export function calcularPosiciones(lista, realizadoPorIndice = null) {
    const posiciones = {};
    const ordenadas = lista.map((inv, indice) => ({ inv, indice }))
        .sort((a, b) => (a.inv.fecha || '').localeCompare(b.inv.fecha || '') || a.indice - b.indice);

    ordenadas.forEach(({ inv, indice }) => {
        const clave = claveActivo(inv);
        if (!posiciones[clave]) {
            posiciones[clave] = {
                clave, nombre: String(inv.nombre || 'Sin nombre').trim(), isin: inv.isin ? String(inv.isin) : '',
                tipo: inv.tipo || 'Otro', participaciones: 0, total: 0, realizado: 0, aportado: 0, ventas: 0
            };
        }
        const p = posiciones[clave];
        if (!esVenta(inv)) {
            p.nombre = String(inv.nombre || p.nombre).trim() || p.nombre;
            p.tipo = inv.tipo || p.tipo;
            if (inv.isin) p.isin = String(inv.isin);
            if (tieneDetalleTitulos(inv)) p.participaciones += parseFloat(inv.cantidad);
            p.total += calcularTotalInversion(inv);
            p.aportado += calcularTotalInversion(inv);
            return;
        }
        const recibido = calcularTotalInversion(inv);
        p.ventas += recibido;
        if (tieneDetalleTitulos(inv) && p.participaciones > 1e-9) {
            const vendidas = Math.min(parseFloat(inv.cantidad), p.participaciones);
            const costeVendido = p.total * (vendidas / p.participaciones);
            p.realizado += recibido - costeVendido;
            if (realizadoPorIndice) realizadoPorIndice[indice] = recibido - costeVendido;
            p.participaciones -= vendidas;
            p.total -= costeVendido;
            if (p.participaciones < 1e-9) { p.participaciones = 0; p.total = 0; }
        } else {
            p.realizado += recibido - p.total;
            if (realizadoPorIndice) realizadoPorIndice[indice] = recibido - p.total;
            p.participaciones = 0;
            p.total = 0;
        }
    });

    return Object.values(posiciones).map(p => ({ ...p, cerrada: p.total <= 0.005 && p.participaciones <= 1e-9 }));
}

// Activos con posición abierta, de mayor a menor importe invertido
export function calcularResumenPorActivo(lista) {
    return calcularPosiciones(lista).filter(p => !p.cerrada).sort((a, b) => b.total - a.total);
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

// --- FORMATO (español: 1.234,56) Y TEXTO SEGURO ---

// Número con punto de miles y coma decimal. Se hace a mano porque Intl en español
// no agrupa los números de 4 cifras (1234 en lugar de 1.234).
export function formatoNumero(numero, decimales = 2) {
    const valor = Number(numero) || 0;
    const [entero, decimal] = Math.abs(valor).toFixed(decimales).split('.');
    const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const negativo = valor < 0 && Number(Math.abs(valor).toFixed(decimales)) !== 0;
    return `${negativo ? '-' : ''}${conMiles}${decimal ? `,${decimal}` : ''}`;
}

export function formatoEuros(numero) {
    return `${formatoNumero(numero, 2)} €`;
}

export function formatoPorcentaje(numero, decimales = 1) {
    return `${formatoNumero(numero, decimales)}%`;
}

// Participaciones y precios: hasta maxDecimales, sin ceros sobrantes (1,224 · 24,5098)
export function formatoDecimalVariable(numero, maxDecimales) {
    const redondeado = parseFloat((Number(numero) || 0).toFixed(maxDecimales));
    const decimales = (String(redondeado).split('.')[1] || '').length;
    return formatoNumero(redondeado, decimales);
}

// Evita que un texto guardado (p. ej. de un archivo importado) se interprete como código
export function escaparHTML(texto) {
    return String(texto).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Número escrito por el usuario: admite coma decimal ("12,5")
export function leerImporte(texto) {
    return parseFloat(String(texto).replace(',', '.'));
}
