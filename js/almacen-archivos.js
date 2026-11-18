// Contenido de los archivos del historial de Archivos, guardado en IndexedDB (la base de datos del
// navegador, con mucho más espacio que localStorage). Sigue estando solo en este dispositivo.

const BASE = 'gestor-gastos-archivos';
const ALMACEN = 'archivos';

let conexion = null;

function abrir() {
    if (!conexion) {
        conexion = new Promise((resolver, rechazar) => {
            const peticion = indexedDB.open(BASE, 1);
            peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN);
            peticion.onsuccess = () => {
                const db = peticion.result;
                db.onclose = () => { conexion = null; };
                resolver(db);
            };
            peticion.onerror = () => rechazar(peticion.error);
        });
    }
    return conexion;
}

// Algunos móviles cortan la conexión con la app en segundo plano: si falla, se reintenta con una nueva
async function operar(modo, accion) {
    for (let intento = 1; ; intento++) {
        try {
            const db = await abrir();
            return await new Promise((resolver, rechazar) => {
                const transaccion = db.transaction(ALMACEN, modo);
                const peticion = accion(transaccion.objectStore(ALMACEN));
                transaccion.oncomplete = () => resolver(peticion.result);
                transaccion.onerror = () => rechazar(transaccion.error);
                transaccion.onabort = () => rechazar(transaccion.error || new Error('Operación cancelada'));
            });
        } catch (error) {
            conexion = null;
            if (intento === 2) throw error;
        }
    }
}

export function guardarArchivo(id, bytes) {
    return operar('readwrite', almacen => almacen.put(bytes.slice().buffer, String(id)));
}

// Devuelve los bytes del archivo, o null si no está
export async function leerArchivo(id) {
    const contenido = await operar('readonly', almacen => almacen.get(String(id)));
    return contenido ? new Uint8Array(contenido) : null;
}

export function borrarArchivo(id) {
    return operar('readwrite', almacen => almacen.delete(String(id)));
}

export function borrarTodosLosArchivos() {
    return operar('readwrite', almacen => almacen.clear());
}
