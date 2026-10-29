// Gráficos de "Distribución por activo": tarta (anillo) y barras.
// Cada elemento: { nombre, total, porcentaje, color } — el color lo asigna quien llama
// según la entidad (no según su posición), para que no cambie al variar los importes.

import { formatoEuros as euros, formatoPorcentaje } from './utils.js?v=24';

export const MAXIMO_SERIES = 7; // a partir de aquí se agrupan en "Otros"

function formatoEuros(numero) {
    return euros(numero);
}

// Más de MAXIMO_SERIES elementos: los más pequeños se agrupan en "Otros"
export function agruparOtros(elementos) {
    if (elementos.length <= MAXIMO_SERIES + 1) return elementos;
    const principales = elementos.slice(0, MAXIMO_SERIES);
    const resto = elementos.slice(MAXIMO_SERIES);
    return [...principales, {
        nombre: `Otros (${resto.length})`,
        total: resto.reduce((suma, e) => suma + e.total, 0),
        porcentaje: resto.reduce((suma, e) => suma + e.porcentaje, 0),
        color: 'var(--serie-otros)'
    }];
}

function leyenda(elementos, escaparHTML) {
    return `<ul class="leyenda-grafico">${elementos.map((e, i) => `
        <li data-i="${i}" tabindex="0">
            <span class="leyenda-muestra" style="background: ${e.color}"></span>
            <span class="leyenda-nombre">${escaparHTML(e.nombre)}</span>
            <span class="leyenda-valor">${formatoEuros(e.total)}</span>
            <span class="leyenda-porcentaje">${formatoPorcentaje(e.porcentaje)}</span>
        </li>`).join('')}</ul>`;
}

function puntoEnCirculo(radio, angulo) {
    return [100 + radio * Math.sin(angulo), 100 - radio * Math.cos(angulo)];
}

function sectorAnillo(inicio, fin, exterior, interior) {
    const grande = fin - inicio > Math.PI ? 1 : 0;
    const [x1, y1] = puntoEnCirculo(exterior, inicio);
    const [x2, y2] = puntoEnCirculo(exterior, fin);
    const [x3, y3] = puntoEnCirculo(interior, fin);
    const [x4, y4] = puntoEnCirculo(interior, inicio);
    return `M${x1} ${y1} A${exterior} ${exterior} 0 ${grande} 1 ${x2} ${y2} L${x3} ${y3} A${interior} ${interior} 0 ${grande} 0 ${x4} ${y4}Z`;
}

export function dibujarTarta(elementos, total, escaparHTML, nombres = ['activo', 'activos']) {
    const exterior = 92, interior = 60;
    let angulo = 0;
    const sectores = elementos.map((e, i) => {
        const fraccion = total > 0 ? e.total / total : 0;
        if (fraccion >= 0.9999) {
            return `<path data-i="${i}" class="sector" fill="${e.color}" fill-rule="evenodd" d="M100 ${100 - exterior}a${exterior} ${exterior} 0 1 1 0 ${2 * exterior}a${exterior} ${exterior} 0 1 1 0 ${-2 * exterior}ZM100 ${100 - interior}a${interior} ${interior} 0 1 0 0 ${2 * interior}a${interior} ${interior} 0 1 0 0 ${-2 * interior}Z"/>`;
        }
        const inicio = angulo;
        angulo += fraccion * 2 * Math.PI;
        return `<path data-i="${i}" class="sector" fill="${e.color}" d="${sectorAnillo(inicio, angulo, exterior, interior)}"/>`;
    }).join('');

    return `
        <div class="grafico grafico-tarta">
            <div class="tarta-figura">
                <svg viewBox="0 0 200 200" role="img" aria-label="Gráfico de tarta de la distribución por activo">${sectores}</svg>
                <div class="tarta-centro" aria-live="polite">
                    <small class="grafico-etiqueta">Total</small>
                    <b class="grafico-valor">${formatoEuros(total)}</b>
                    <small class="grafico-detalle">${elementos.length} ${elementos.length === 1 ? nombres[0] : nombres[1]}</small>
                </div>
            </div>
            ${leyenda(elementos, escaparHTML)}
        </div>`;
}

export function dibujarBarras(elementos, total, escaparHTML) {
    const maximo = Math.max(...elementos.map(e => e.total), 0);
    const columnas = elementos.map((e, i) => `
        <div class="barra-columna" data-i="${i}">
            <span class="barra-porcentaje">${formatoPorcentaje(e.porcentaje, 0)}</span>
            <span class="barra-relleno" style="height: ${maximo > 0 ? Math.max(2, (e.total / maximo) * 100) : 0}%; background: ${e.color}"></span>
        </div>`).join('');

    return `
        <div class="grafico grafico-barras">
            <div class="grafico-info" aria-live="polite">
                <small class="grafico-etiqueta">Total</small>
                <b class="grafico-valor">${formatoEuros(total)}</b>
                <small class="grafico-detalle">${elementos.length} ${elementos.length === 1 ? 'activo' : 'activos'}</small>
            </div>
            <div class="barras-area" role="img" aria-label="Gráfico de barras de la distribución por activo">${columnas}</div>
            ${leyenda(elementos, escaparHTML)}
        </div>`;
}

// Al pasar el ratón o tocar un sector, barra o elemento de la leyenda, se resalta y se muestran sus datos
export function conectarInteraccion(contenedor, elementos) {
    const grafico = contenedor.querySelector('.grafico');
    if (!grafico) return;
    const etiqueta = grafico.querySelector('.grafico-etiqueta');
    const valor = grafico.querySelector('.grafico-valor');
    const detalle = grafico.querySelector('.grafico-detalle');
    const textoInicial = [etiqueta.textContent, valor.textContent, detalle.textContent];
    let fijado = null;

    const resaltar = indice => {
        grafico.querySelectorAll('[data-i]').forEach(nodo => {
            nodo.classList.toggle('atenuado', indice !== null && Number(nodo.getAttribute('data-i')) !== indice);
            nodo.classList.toggle('resaltado', Number(nodo.getAttribute('data-i')) === indice);
        });
        if (indice === null) {
            [etiqueta.textContent, valor.textContent, detalle.textContent] = textoInicial;
        } else {
            const e = elementos[indice];
            etiqueta.textContent = e.nombre;
            valor.textContent = formatoEuros(e.total);
            detalle.textContent = `${formatoPorcentaje(e.porcentaje)} del total`;
        }
    };

    grafico.querySelectorAll('[data-i]').forEach(nodo => {
        const indice = Number(nodo.getAttribute('data-i'));
        nodo.addEventListener('mouseenter', () => { if (fijado === null) resaltar(indice); });
        nodo.addEventListener('focus', () => resaltar(indice));
        nodo.addEventListener('click', () => {
            fijado = fijado === indice ? null : indice;
            resaltar(fijado);
        });
    });
    grafico.addEventListener('mouseleave', () => { if (fijado === null) resaltar(null); });
}

// --- EVOLUCIÓN MENSUAL (ingresos y gastos, columnas agrupadas por mes) ---
// meses: [{ mes, etiqueta, ingresos, gastos }]

export function dibujarEvolucionMensual(meses) {
    const maximo = Math.max(...meses.map(m => Math.max(m.ingresos, m.gastos)), 0);
    const conGasto = meses.filter(m => m.gastos > 0);
    const media = conGasto.length ? conGasto.reduce((s, m) => s + m.gastos, 0) / conGasto.length : 0;
    const alto = valor => (maximo > 0 ? Math.max(valor > 0 ? 2 : 0, (valor / maximo) * 100) : 0);
    return `
        <div class="grafico grafico-evolucion">
            <div class="grafico-info" aria-live="polite">
                <small class="grafico-etiqueta">Media de gasto (meses con gastos)</small>
                <b class="grafico-valor">${formatoEuros(media)}</b>
                <small class="grafico-detalle">Toca un mes para ver sus datos</small>
            </div>
            <div class="evolucion-area" role="img" aria-label="Ingresos y gastos de los últimos 12 meses">
                ${meses.map((m, i) => `
                    <div class="evolucion-mes" data-i="${i}">
                        <div class="evolucion-columnas">
                            <span class="evolucion-barra serie-ingresos" style="height: ${alto(m.ingresos)}%"></span>
                            <span class="evolucion-barra serie-gastos" style="height: ${alto(m.gastos)}%"></span>
                        </div>
                        <small>${m.etiqueta}</small>
                    </div>`).join('')}
            </div>
            <ul class="leyenda-grafico leyenda-horizontal">
                <li><span class="leyenda-muestra serie-ingresos"></span><span class="leyenda-nombre">Ingresos</span></li>
                <li><span class="leyenda-muestra serie-gastos"></span><span class="leyenda-nombre">Gastos</span></li>
            </ul>
        </div>`;
}

export function conectarEvolucion(contenedor, meses) {
    const grafico = contenedor.querySelector('.grafico');
    if (!grafico) return;
    const etiqueta = grafico.querySelector('.grafico-etiqueta');
    const valor = grafico.querySelector('.grafico-valor');
    const detalle = grafico.querySelector('.grafico-detalle');
    const inicial = [etiqueta.textContent, valor.textContent, detalle.textContent];
    let fijado = null;

    const resaltar = indice => {
        grafico.querySelectorAll('.evolucion-mes').forEach(nodo => {
            nodo.classList.toggle('atenuado', indice !== null && Number(nodo.getAttribute('data-i')) !== indice);
        });
        if (indice === null) { [etiqueta.textContent, valor.textContent, detalle.textContent] = inicial; return; }
        const m = meses[indice];
        const ahorro = m.ingresos - m.gastos;
        etiqueta.textContent = `${m.etiqueta} ${m.mes.substring(0, 4)}`;
        valor.textContent = `Gastos ${formatoEuros(m.gastos)}`;
        detalle.textContent = `Ingresos ${formatoEuros(m.ingresos)} · ${ahorro >= 0 ? 'Ahorro' : 'Déficit'} ${formatoEuros(Math.abs(ahorro))}`;
    };

    grafico.querySelectorAll('.evolucion-mes').forEach(nodo => {
        const indice = Number(nodo.getAttribute('data-i'));
        nodo.addEventListener('mouseenter', () => { if (fijado === null) resaltar(indice); });
        nodo.addEventListener('click', () => { fijado = fijado === indice ? null : indice; resaltar(fijado); });
    });
    grafico.addEventListener('mouseleave', () => { if (fijado === null) resaltar(null); });
}

// --- EVOLUCIÓN DE LA CARTERA (líneas: lo aportado y lo que vale) ---
// puntos: [{ fecha, invertido, valor|null }] ordenados por fecha

export function dibujarLineas(puntos) {
    const ancho = 600, alto = 220, margen = { arriba: 12, abajo: 26, izquierda: 8, derecha: 8 };
    const valores = puntos.flatMap(p => [p.invertido, p.valor]).filter(v => v !== null && v !== undefined);
    const maximo = Math.max(...valores, 1) * 1.08;
    const tiempos = puntos.map(p => new Date(p.fecha).getTime());
    const t0 = Math.min(...tiempos), t1 = Math.max(...tiempos);
    const x = t => margen.izquierda + (t1 > t0 ? ((t - t0) / (t1 - t0)) : 0.5) * (ancho - margen.izquierda - margen.derecha);
    const y = v => margen.arriba + (1 - v / maximo) * (alto - margen.arriba - margen.abajo);
    const linea = clave => puntos.filter(p => p[clave] !== null && p[clave] !== undefined)
        .map((p, i) => `${i ? 'L' : 'M'}${x(new Date(p.fecha).getTime()).toFixed(1)} ${y(p[clave]).toFixed(1)}`).join(' ');
    // Lo aportado es escalonado: solo cambia el día de cada aportación
    const escalon = puntos.map((p, i) => {
        const px = x(new Date(p.fecha).getTime()).toFixed(1), py = y(p.invertido).toFixed(1);
        if (i === 0) return `M${px} ${py}`;
        return `H${px} V${py}`;
    }).join(' ');
    const puntosValor = puntos.filter(p => p.valor !== null && p.valor !== undefined);
    const formatoMes = f => { const [a, m] = f.split('-'); return `${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(m) - 1]} ${a.substring(2)}`; };

    return `
        <div class="grafico grafico-lineas">
            <div class="grafico-info" aria-live="polite">
                <small class="grafico-etiqueta">Hoy</small>
                <b class="grafico-valor">${formatoEuros(puntos[puntos.length - 1].valor !== null && puntos[puntos.length - 1].valor !== undefined ? puntos[puntos.length - 1].valor : puntos[puntos.length - 1].invertido)}</b>
                <small class="grafico-detalle">Aportado ${formatoEuros(puntos[puntos.length - 1].invertido)}</small>
            </div>
            <svg class="lineas-svg" viewBox="0 0 ${ancho} ${alto}" preserveAspectRatio="none" role="img" aria-label="Evolución de lo aportado y del valor de la cartera">
                <line class="lineas-base" x1="${margen.izquierda}" x2="${ancho - margen.derecha}" y1="${alto - margen.abajo}" y2="${alto - margen.abajo}"/>
                <path class="linea-aportado" d="${escalon}"/>
                ${puntosValor.length > 1 ? `<path class="linea-valor" d="${linea('valor')}"/>` : ''}
                ${puntosValor.map(p => `<circle class="punto-valor" cx="${x(new Date(p.fecha).getTime()).toFixed(1)}" cy="${y(p.valor).toFixed(1)}" r="4"/>`).join('')}
            </svg>
            <div class="lineas-ejes"><small>${formatoMes(puntos[0].fecha)}</small><small>${formatoMes(puntos[puntos.length - 1].fecha)}</small></div>
            <ul class="leyenda-grafico leyenda-horizontal">
                <li><span class="leyenda-muestra serie-aportado"></span><span class="leyenda-nombre">Aportado</span></li>
                <li><span class="leyenda-muestra serie-valor"></span><span class="leyenda-nombre">Valor</span></li>
            </ul>
        </div>`;
}
