// Gráficos de "Distribución por activo": tarta (anillo) y barras.
// Cada elemento: { nombre, total, porcentaje, color } — el color lo asigna quien llama
// según la entidad (no según su posición), para que no cambie al variar los importes.

export const MAXIMO_SERIES = 7; // a partir de aquí se agrupan en "Otros"

function formatoEuros(numero) {
    return `${numero.toFixed(2)} €`;
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
            <span class="leyenda-porcentaje">${e.porcentaje.toFixed(1)}%</span>
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

export function dibujarTarta(elementos, total, escaparHTML) {
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
                    <small class="grafico-detalle">${elementos.length} ${elementos.length === 1 ? 'activo' : 'activos'}</small>
                </div>
            </div>
            ${leyenda(elementos, escaparHTML)}
        </div>`;
}

export function dibujarBarras(elementos, total, escaparHTML) {
    const maximo = Math.max(...elementos.map(e => e.total), 0);
    const columnas = elementos.map((e, i) => `
        <div class="barra-columna" data-i="${i}">
            <span class="barra-porcentaje">${e.porcentaje.toFixed(0)}%</span>
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
            detalle.textContent = `${e.porcentaje.toFixed(1)}% del total`;
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
