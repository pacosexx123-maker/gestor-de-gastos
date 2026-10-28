// Almacén de los datos de la app en el navegador (localStorage).
// Cada dato tiene un valor por defecto; si lo guardado no es válido, se usa el de por defecto.

const CLAVES = {
    movimientos: 'gastos',
    categorias: 'categorias',
    apartados: 'apartados',
    presupuestos: 'presupuestos',
    recurrentes: 'recurrentes',
    cuentas: 'cuentas',
    objetivos: 'objetivos',
    historicoValor: 'historicoValor'
};

const POR_DEFECTO = {
    movimientos: [],
    categorias: { gasto: ['Comida', 'Transporte', 'Ocio', 'Compras', 'Salud', 'Otros'], ingreso: ['Nómina', 'Bizum', 'Otros'] },
    // Un apartado es un gasto aparte (como "Hogar"): no se suma al gasto personal y tiene su propia tarjeta
    apartados: [{ id: 'hogar', nombre: 'Hogar', acumulado: true }],
    presupuestos: {},
    recurrentes: [],
    cuentas: [],
    objetivos: [],
    historicoValor: []
};

function copia(valor) {
    return JSON.parse(JSON.stringify(valor));
}

export function leerDato(nombre) {
    const defecto = POR_DEFECTO[nombre];
    try {
        const texto = localStorage.getItem(CLAVES[nombre]);
        if (texto === null) return copia(defecto);
        const valor = JSON.parse(texto);
        const mismoTipo = Array.isArray(defecto) ? Array.isArray(valor) : (valor && typeof valor === 'object' && !Array.isArray(valor));
        return mismoTipo ? valor : copia(defecto);
    } catch (error) {
        return copia(defecto);
    }
}

export function guardarDato(nombre, valor) {
    localStorage.setItem(CLAVES[nombre], JSON.stringify(valor));
}

export function nuevoId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Claves de localStorage de todos los datos (para "Borrar todo")
export const CLAVES_ALMACEN = Object.values(CLAVES);
