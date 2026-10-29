// Reglas aprendidas para categorizar movimientos: "Mercadona" -> Comida, "Bizum de Juan" -> Bizum en Hogar...
// Se aprenden al guardar un movimiento y al importar el extracto del banco, y se usan para
// autocompletar el formulario y para categorizar solas las importaciones siguientes.
//
// regla = { patron: 'mercadona', tipo: 'gasto' | 'ingreso', categoria, apartado }

import { leerDato, guardarDato } from './datos.js?v=24';
import { escaparHTML } from './utils.js?v=24';

const ICONO_ELIMINAR = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

// Palabras que aparecen en los conceptos de los bancos y no dicen nada del comercio
const GENERICAS = new Set(('compra compras tarj tarjeta tarjet pago pagos recibo recib transferencia transf trf bizum de del la el los las lo ' +
    'a al en con por para y o sl sa slu sociedad cargo abono adeudo movil contactless apple google pay cajero retirada efectivo ' +
    'www com es net sepa domiciliacion domic domiciliado op operacion fecha ref referencia concepto enviado enviada recibido recibida ' +
    'mi tu su sus nuestro favor orden emitida inmediata periodica cuota comision visa mastercard debito credito tpv ' +
    'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre').split(' '));

let reglas = leerDato('reglas');
let apartadoNombre = () => ''; // para mostrar el nombre del apartado en la lista (lo da gastos.js)

export function obtenerReglas() {
    return reglas;
}

export function reemplazarReglas(lista) {
    reglas = Array.isArray(lista) ? lista : [];
    guardarDato('reglas', reglas);
    renderizarReglas();
}

// "COMPRA TARJ. 5402XXXX MERCADONA VALENCIA" -> ['mercadona', 'valencia']
export function palabrasClave(concepto) {
    return String(concepto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .split(/\s+/).filter(t => !/\d/.test(t)).join(' ') // fuera números de tarjeta, referencias...
        .replace(/[^a-zñ\s]/g, ' ').split(/\s+/)
        .filter(p => p.length >= 3 && !GENERICAS.has(p));
}

// La primera palabra significativa: suele ser el nombre del comercio o de la persona
export function patronDe(concepto) {
    return palabrasClave(concepto)[0] || '';
}

export function buscarRegla(concepto, tipo) {
    const palabras = new Set(palabrasClave(concepto));
    if (!palabras.size) return null;
    // La más reciente gana (las reglas nuevas se añaden al final)
    for (let i = reglas.length - 1; i >= 0; i--) {
        const regla = reglas[i];
        if (regla.tipo === tipo && palabras.has(regla.patron)) return regla;
    }
    return null;
}

export function aprenderRegla(concepto, tipo, categoria, apartado) {
    const patron = patronDe(concepto);
    if (!patron || !categoria) return;
    const existente = reglas.findIndex(r => r.patron === patron && r.tipo === tipo);
    if (existente >= 0) {
        const r = reglas[existente];
        if (r.categoria === categoria && (r.apartado || '') === (apartado || '')) return;
        reglas.splice(existente, 1);
    }
    reglas.push({ patron, tipo, categoria, apartado: apartado || '' });
    guardarDato('reglas', reglas);
    renderizarReglas();
}

// --- LISTA EN AJUSTES ---

export function renderizarReglas() {
    const contenedor = document.getElementById('lista-reglas');
    if (!contenedor) return;
    if (!reglas.length) {
        contenedor.innerHTML = '<p class="estado-vacio">Aún no hay reglas. Se crean solas cuando apuntas o importas movimientos.</p>';
        return;
    }
    contenedor.innerHTML = [...reglas].reverse().map(r => {
        const apartado = r.apartado ? apartadoNombre(r.apartado) : '';
        return `
            <div class="config-fila">
                <div class="config-texto">
                    <b>"${escaparHTML(r.patron)}" → ${escaparHTML(r.categoria)}${apartado ? ` · ${escaparHTML(apartado)}` : ''}</b>
                    <small>${r.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'}</small>
                </div>
                <div class="acciones-fila">
                    <button class="btn-eliminar" data-patron="${escaparHTML(r.patron)}" data-tipo="${r.tipo}" title="Olvidar esta regla">${ICONO_ELIMINAR}</button>
                </div>
            </div>`;
    }).join('');
    contenedor.querySelectorAll('[data-patron]').forEach(btn => btn.addEventListener('click', () => {
        reglas = reglas.filter(r => !(r.patron === btn.getAttribute('data-patron') && r.tipo === btn.getAttribute('data-tipo')));
        guardarDato('reglas', reglas);
        renderizarReglas();
    }));
}

export function iniciarReglas({ nombreApartado }) {
    apartadoNombre = nombreApartado;
    renderizarReglas();
}
