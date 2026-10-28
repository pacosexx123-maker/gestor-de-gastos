// Generador de archivos Excel (.xlsx) sin librerías externas: todo se crea en el
// propio dispositivo, sin enviar datos a ningún sitio. Admite estilos, fórmulas,
// filtros, paneles fijos y gráficas (columnas, líneas y anillo).
//
// Uso:
//   const hoja = new Hoja('Total');
//   const fila = hoja.anadir([{ v: 'Título', estilo: 'titulo' }]);       // devuelve el número de fila
//   hoja.anadir([{ v: '2026-10-01', tipo: 'fecha' }, { v: 12.5, tipo: 'dinero' }, { f: 'SUM(B2:B9)', v: 100, tipo: 'dinero', estilo: 'total' }]);
//   hoja.graficos.push({ tipo: 'columnas', titulo, ancla: { col, fila, ancho, alto }, categorias: { rango, valores }, series: [{ nombre, rango, valores, color }] });
//   crearLibroExcel([hoja, ...]);
//
// Celda: { v, f?, tipo: 'texto'|'fecha'|'dinero'|'dineroSigno'|'numero'|'porcentaje'|'porcentajeSigno',
//          estilo?: 'cabecera'|'titulo'|'nota'|'negrita'|'total'|'kpiEtiqueta'|'kpiValor', derecha? }
// Los porcentajes se pasan como fracción (0,25 = 25 %).

export const MIME_EXCEL = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Paleta de las gráficas (la misma de la app, validada para daltonismo)
export const COLORES_GRAFICO = ['2A78D6', 'EB6834', '1BAF7A', 'EDA100', 'E87BA4', '008300', '6250D6', 'E34948'];
export const COLOR_OTROS = '98A2B3';

const NOMBRES_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// "2026-10" -> "Octubre 2026"
export function nombreHojaMes(mesAnio) {
    const [anio, mes] = mesAnio.split('-');
    return `${NOMBRES_MESES[Number(mes) - 1]} ${anio}`;
}

// Agrupa elementos con campo "fecha" (AAAA-MM-DD) por mes, en orden cronológico
export function agruparPorMes(lista) {
    const grupos = {};
    lista.forEach(elemento => {
        const mes = (elemento.fecha || '').substring(0, 7);
        const clave = /^\d{4}-\d{2}$/.test(mes) ? mes : 'sin-fecha';
        if (!grupos[clave]) grupos[clave] = [];
        grupos[clave].push(elemento);
    });
    return Object.keys(grupos).sort().map(clave => ({
        mes: clave,
        nombre: clave === 'sin-fecha' ? 'Sin fecha' : nombreHojaMes(clave),
        elementos: grupos[clave]
    }));
}

export function ordenarPorFecha(lista) {
    return [...lista].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
}

function escaparXML(texto) {
    return String(texto)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 0 -> "A", 25 -> "Z", 26 -> "AA"
export function letraColumna(indice) {
    let letra = '';
    indice++;
    while (indice > 0) {
        const resto = (indice - 1) % 26;
        letra = String.fromCharCode(65 + resto) + letra;
        indice = Math.floor((indice - 1) / 26);
    }
    return letra;
}

// Referencia de celda: (1, 5) -> "B5"  (columna desde 0, fila desde 1)
export function ref(columna, fila) {
    return `${letraColumna(columna)}${fila}`;
}

// Excel guarda las fechas como días desde el 30/12/1899
function fechaAExcel(fechaStr) {
    const [anio, mes, dia] = fechaStr.split('-').map(Number);
    return (Date.UTC(anio, mes - 1, dia) - Date.UTC(1899, 11, 30)) / 86400000;
}

export class Hoja {
    constructor(nombre) {
        this.nombre = nombre;
        this.filas = [];       // filas[i] = lista de celdas de la fila i + 1
        this.anchos = [];      // ancho de cada columna
        this.graficos = [];
        this.congelarFilas = 0;
        this.filtro = null;    // p. ej. 'A3:G40'
        this.combinadas = [];  // p. ej. ['A1:F1']
    }

    anadir(celdas = []) {
        this.filas.push(celdas);
        return this.filas.length;
    }

    get filaActual() {
        return this.filas.length;
    }
}

// --- ESTILOS ---

const FORMATOS = {
    164: 'dd/mm/yyyy',
    165: '#,##0.00 "€"',
    166: '#,##0.00 "€";[Red]-#,##0.00 "€"',
    167: '0.0%',
    168: '+0.0%;[Red]-0.0%'
};

// [formato, fuente, relleno, borde, alineación ('derecha' o 'izquierda'; por defecto la del tipo de dato)]
const XF = [
    [0, 0, 0, 0],        // 0 texto
    [0, 1, 2, 1],        // 1 cabecera
    [164, 0, 0, 0],      // 2 fecha
    [165, 0, 0, 0],      // 3 dinero
    [0, 0, 0, 0],        // 4 número
    [165, 2, 0, 0],      // 5 dinero negrita
    [0, 2, 0, 0],        // 6 texto negrita
    [0, 3, 0, 0],        // 7 título
    [0, 4, 0, 0],        // 8 nota
    [167, 0, 0, 0],      // 9 porcentaje
    [166, 0, 0, 0],      // 10 dinero con signo (rojo si es negativo)
    [168, 0, 0, 0],      // 11 porcentaje con signo
    [0, 4, 3, 0, 'izquierda'],  // 12 cifra clave: etiqueta
    [165, 5, 3, 0, 'izquierda'],// 13 cifra clave: dinero
    [165, 2, 0, 2],      // 14 total: dinero
    [0, 2, 0, 2],        // 15 total: texto
    [167, 5, 3, 0, 'izquierda'],// 16 cifra clave: porcentaje
    [166, 5, 3, 0, 'izquierda'],// 17 cifra clave: dinero con signo
    [0, 1, 2, 1, 'derecha'],    // 18 cabecera alineada a la derecha (columnas numéricas)
    [166, 2, 0, 2],      // 19 total: dinero con signo
    [168, 5, 3, 0, 'izquierda'],// 20 cifra clave: porcentaje con signo
    [167, 2, 0, 2],      // 21 total: porcentaje
    [168, 2, 0, 2],      // 22 total: porcentaje con signo
    [0, 6, 0, 0],        // 23 subtítulo de sección
    [0, 2, 0, 2],        // 24 total: número
    [2, 0, 0, 0],        // 25 número con 2 decimales
    [164, 2, 0, 2],      // 26 total: fecha
    [0, 5, 3, 0, 'izquierda']   // 27 cifra clave: número
];

function estiloDe(celda) {
    const tipo = celda.tipo || 'texto';
    switch (celda.estilo) {
        case 'cabecera': return celda.derecha ? 18 : 1;
        case 'titulo': return 7;
        case 'nota': return 8;
        case 'seccion': return 23;
        case 'kpiEtiqueta': return 12;
        case 'kpiValor': return { porcentaje: 16, porcentajeSigno: 20, dineroSigno: 17, numero: 27 }[tipo] || 13;
        case 'total': return { dinero: 14, dineroSigno: 19, porcentaje: 21, porcentajeSigno: 22, numero: 24 }[tipo] || 15;
        case 'negrita': return tipo === 'dinero' ? 5 : 6;
        default: return { fecha: 2, dinero: 3, dineroSigno: 10, numero: 4, porcentaje: 9, porcentajeSigno: 11, decimal: 25 }[tipo] || 0;
    }
}

const ESTILOS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<numFmts count="${Object.keys(FORMATOS).length}">` +
        Object.entries(FORMATOS).map(([id, codigo]) => `<numFmt numFmtId="${id}" formatCode="${escaparXML(codigo)}"/>`).join('') +
    '</numFmts>' +
    '<fonts count="7">' +
        '<font><sz val="11"/><color rgb="FF101828"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="11"/><color rgb="FF101828"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="18"/><color rgb="FF101828"/><name val="Calibri"/></font>' +
        '<font><sz val="10"/><color rgb="FF667085"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="16"/><color rgb="FF101828"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="13"/><color rgb="FF344054"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="4">' +
        '<fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FF101828"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F4F7"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="3">' +
        '<border><left/><right/><top/><bottom/><diagonal/></border>' +
        '<border><left/><right/><top/><bottom style="thin"><color rgb="FF101828"/></bottom><diagonal/></border>' +
        '<border><left/><right/><top style="thin"><color rgb="FF98A2B3"/></top><bottom/><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${XF.length}">` +
        XF.map(([formato, fuente, relleno, borde, alineacion]) =>
            `<xf numFmtId="${formato}" fontId="${fuente}" fillId="${relleno}" borderId="${borde}" xfId="0"` +
            `${formato ? ' applyNumberFormat="1"' : ''}${fuente ? ' applyFont="1"' : ''}${relleno ? ' applyFill="1"' : ''}${borde ? ' applyBorder="1"' : ''}` +
            (alineacion === 'derecha' ? ' applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'
                : alineacion === 'izquierda' ? ' applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>'
                : ' applyAlignment="1"><alignment vertical="center"/></xf>')
        ).join('') +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

// --- CELDAS Y HOJAS ---

function celdaXML(celda, referencia) {
    if (!celda) return '';
    const estilo = estiloDe(celda);
    const { v, f, tipo = 'texto' } = celda;
    const sinValor = v === '' || v === null || v === undefined;

    if (f) {
        const esNumero = typeof v === 'number' && isFinite(v);
        const cache = sinValor ? '' : esNumero ? `<v>${v}</v>` : `<v>${escaparXML(v)}</v>`;
        return `<c r="${referencia}" s="${estilo}"${!sinValor && !esNumero ? ' t="str"' : ''}><f>${escaparXML(f)}</f>${cache}</c>`;
    }
    if (sinValor) return estilo ? `<c r="${referencia}" s="${estilo}"/>` : '';
    if (tipo === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `<c r="${referencia}" s="${estilo}"><v>${fechaAExcel(v)}</v></c>`;
    if (tipo !== 'texto' && isFinite(parseFloat(v)) && typeof v !== 'boolean') return `<c r="${referencia}" s="${estilo}"><v>${parseFloat(v)}</v></c>`;
    return `<c r="${referencia}" t="inlineStr" s="${estilo}"><is><t xml:space="preserve">${escaparXML(v)}</t></is></c>`;
}

function hojaXML(hoja, tieneDibujo) {
    const anchos = hoja.anchos.map((ancho, i) => ancho ? `<col min="${i + 1}" max="${i + 1}" width="${ancho}" customWidth="1"/>` : '').join('');
    const filas = hoja.filas.map((celdas, f) => {
        const contenido = (celdas || []).map((celda, c) => celdaXML(celda, ref(c, f + 1))).join('');
        return contenido ? `<row r="${f + 1}">${contenido}</row>` : '';
    }).join('');
    const panel = hoja.congelarFilas
        ? `<pane ySplit="${hoja.congelarFilas}" topLeftCell="A${hoja.congelarFilas + 1}" activePane="bottomLeft" state="frozen"/>`
        : '';

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
        `<sheetViews><sheetView workbookViewId="0" showGridLines="0">${panel}</sheetView></sheetViews>` +
        '<sheetFormatPr defaultRowHeight="16"/>' +
        (anchos ? `<cols>${anchos}</cols>` : '') +
        `<sheetData>${filas}</sheetData>` +
        (hoja.filtro ? `<autoFilter ref="${hoja.filtro}"/>` : '') +
        (hoja.combinadas.length ? `<mergeCells count="${hoja.combinadas.length}">${hoja.combinadas.map(r => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>` : '') +
        '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
        '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
        (tieneDibujo ? '<drawing r:id="rId1"/>' : '') +
        '</worksheet>';
}

// --- GRÁFICAS (DrawingML) ---

const NS_GRAFICO = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function textoGrafico(texto, tamano = 1200, negrita = true) {
    return `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${tamano}" b="${negrita ? 1 : 0}"/></a:pPr>` +
        `<a:r><a:rPr lang="es-ES" sz="${tamano}" b="${negrita ? 1 : 0}"><a:solidFill><a:srgbClr val="101828"/></a:solidFill></a:rPr><a:t>${escaparXML(texto)}</a:t></a:r></a:p></c:rich></c:tx>`;
}

function referenciaHoja(nombreHoja, rango) {
    const absoluto = rango.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2');
    return `'${nombreHoja.replace(/'/g, "''")}'!${absoluto}`;
}

function categoriasXML(nombreHoja, categorias) {
    return `<c:cat><c:strRef><c:f>${escaparXML(referenciaHoja(nombreHoja, categorias.rango))}</c:f><c:strCache><c:ptCount val="${categorias.valores.length}"/>` +
        categorias.valores.map((v, i) => `<c:pt idx="${i}"><c:v>${escaparXML(v)}</c:v></c:pt>`).join('') +
        '</c:strCache></c:strRef></c:cat>';
}

function valoresXML(nombreHoja, serie) {
    return `<c:val><c:numRef><c:f>${escaparXML(referenciaHoja(nombreHoja, serie.rango))}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${serie.valores.length}"/>` +
        serie.valores.map((v, i) => (isFinite(v) && v !== null ? `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>` : '')).join('') +
        '</c:numCache></c:numRef></c:val>';
}

const relleno = color => `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`;

function ejesXML(formato, desdeCero) {
    return '<c:catAx><c:axId val="1001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>' +
        '<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>' +
        `<c:spPr><a:ln w="9525">${relleno('D0D5DD')}</a:ln></c:spPr>` +
        '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="667085"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-ES"/></a:p></c:txPr>' +
        '<c:crossAx val="1002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>' +
        `<c:valAx><c:axId val="1002"/><c:scaling><c:orientation val="minMax"/>${desdeCero ? '<c:min val="0"/>' : ''}</c:scaling><c:delete val="0"/><c:axPos val="l"/>` +
        `<c:majorGridlines><c:spPr><a:ln w="6350">${relleno('EAECF0')}</a:ln></c:spPr></c:majorGridlines>` +
        `<c:numFmt formatCode="${escaparXML(formato)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>` +
        '<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>' +
        '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="667085"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-ES"/></a:p></c:txPr>' +
        '<c:crossAx val="1001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>';
}

function graficoXML(grafico, nombreHoja) {
    const formato = grafico.formato || '#,##0 "€"';
    // Sin valores negativos, el eje empieza en 0 (si no, Excel lo recorta y exagera las diferencias)
    const desdeCero = grafico.series.every(serie => serie.valores.every(v => !(v < 0)));
    let trazado;

    if (grafico.tipo === 'anillo') {
        const serie = grafico.series[0];
        const colores = serie.colores || serie.valores.map((_, i) => COLORES_GRAFICO[i % COLORES_GRAFICO.length]);
        trazado = '<c:doughnutChart><c:varyColors val="1"/>' +
            `<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${escaparXML(serie.nombre)}</c:v></c:tx>` +
            colores.map((color, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr>${relleno(color)}<a:ln w="19050">${relleno('FFFFFF')}</a:ln></c:spPr></c:dPt>`).join('') +
            '<c:dLbls><c:numFmt formatCode="0%" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>' +
            '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-ES"/></a:p></c:txPr>' +
            '<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="0"/></c:dLbls>' +
            categoriasXML(nombreHoja, grafico.categorias) + valoresXML(nombreHoja, serie) + '</c:ser>' +
            '<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>';
    } else if (grafico.tipo === 'lineas') {
        trazado = '<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>' +
            grafico.series.map((serie, i) =>
                `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${escaparXML(serie.nombre)}</c:v></c:tx>` +
                `<c:spPr><a:ln w="28575" cap="rnd">${relleno(serie.color)}${serie.discontinua ? '<a:prstDash val="dash"/>' : ''}<a:round/></a:ln></c:spPr>` +
                (serie.puntos ? `<c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr>${relleno(serie.color)}<a:ln w="9525">${relleno('FFFFFF')}</a:ln></c:spPr></c:marker>` : '<c:marker><c:symbol val="none"/></c:marker>') +
                categoriasXML(nombreHoja, grafico.categorias) + valoresXML(nombreHoja, serie) + '<c:smooth val="0"/></c:ser>'
            ).join('') +
            '<c:marker val="1"/><c:axId val="1001"/><c:axId val="1002"/></c:lineChart>' + ejesXML(formato, desdeCero);
    } else {
        trazado = `<c:barChart><c:barDir val="${grafico.horizontal ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>` +
            grafico.series.map((serie, i) =>
                `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${escaparXML(serie.nombre)}</c:v></c:tx>` +
                `<c:spPr>${relleno(serie.color)}</c:spPr><c:invertIfNegative val="0"/>` +
                (serie.colorNegativo ? serie.valores.map((v, j) => v < 0 ? `<c:dPt><c:idx val="${j}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr>${relleno(serie.colorNegativo)}</c:spPr></c:dPt>` : '').join('') : '') +
                categoriasXML(nombreHoja, grafico.categorias) + valoresXML(nombreHoja, serie) + '</c:ser>'
            ).join('') +
            `<c:gapWidth val="${grafico.series.length > 1 ? 60 : 80}"/>${grafico.series.length > 1 ? '<c:overlap val="-5"/>' : ''}<c:axId val="1001"/><c:axId val="1002"/></c:barChart>` +
            ejesXML(formato, desdeCero).replace(grafico.horizontal ? '<c:axPos val="b"/>' : '@@', '<c:axPos val="l"/>').replace(grafico.horizontal ? '<c:axPos val="l"/><c:majorGridlines>' : '@@', '<c:axPos val="b"/><c:majorGridlines>');
    }

    const leyenda = grafico.sinLeyenda ? '' : `<c:legend><c:legendPos val="${grafico.tipo === 'anillo' ? 'r' : 'b'}"/><c:overlay val="0"/>` +
        '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="344054"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-ES"/></a:p></c:txPr></c:legend>';

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<c:chartSpace ${NS_GRAFICO}><c:roundedCorners val="0"/>` +
        `<c:chart><c:title>${textoGrafico(grafico.titulo)}<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` +
        `<c:plotArea><c:layout/>${trazado}</c:plotArea>${leyenda}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
        `<c:spPr>${relleno('FFFFFF')}<a:ln w="9525">${relleno('EAECF0')}</a:ln></c:spPr>` +
        '</c:chartSpace>';
}

function dibujoXML(graficos, primerGrafico) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
        graficos.map((g, i) => {
            const { col, fila, ancho, alto } = g.ancla; // fila desde 1, col desde 0
            return '<xdr:twoCellAnchor editAs="oneCell">' +
                `<xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fila - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
                `<xdr:to><xdr:col>${col + ancho}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fila - 1 + alto}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
                `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Gráfico ${primerGrafico + i}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
                '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>' +
                '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">' +
                `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i + 1}"/>` +
                '</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';
        }).join('') +
        '</xdr:wsDr>';
}

// --- LIBRO ---

// Excel no admite ciertos caracteres en los nombres de hoja, ni más de 31 caracteres
function nombreHojaValido(nombre, usados) {
    const base = String(nombre).replace(/[:\\/?*\[\]]/g, ' ').trim().substring(0, 31) || 'Hoja';
    let candidato = base;
    let contador = 2;
    while (usados.has(candidato.toLowerCase())) {
        const sufijo = ` (${contador++})`;
        candidato = base.substring(0, 31 - sufijo.length) + sufijo;
    }
    usados.add(candidato.toLowerCase());
    return candidato;
}

const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CABECERA_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';

export function crearLibroExcel(hojas) {
    const usados = new Set();
    hojas.forEach(h => { h.nombre = nombreHojaValido(h.nombre, usados); });

    const archivos = [];
    const tipos = [];
    let numeroGrafico = 1;
    let numeroDibujo = 1;
    const filtros = [];

    hojas.forEach((hoja, i) => {
        const conGraficos = hoja.graficos.length > 0;
        archivos.push({ ruta: `xl/worksheets/sheet${i + 1}.xml`, contenido: hojaXML(hoja, conGraficos) });
        tipos.push(`<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
        if (hoja.filtro) filtros.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escaparXML(referenciaHoja(hoja.nombre, hoja.filtro))}</definedName>`);
        if (!conGraficos) return;

        const dibujo = numeroDibujo++;
        archivos.push({ ruta: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`, contenido: `${CABECERA_RELS}<Relationship Id="rId1" Type="${RELS}/drawing" Target="../drawings/drawing${dibujo}.xml"/></Relationships>` });
        archivos.push({ ruta: `xl/drawings/drawing${dibujo}.xml`, contenido: dibujoXML(hoja.graficos, numeroGrafico) });
        tipos.push(`<Override PartName="/xl/drawings/drawing${dibujo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
        const relaciones = hoja.graficos.map((grafico, j) => {
            const numero = numeroGrafico++;
            archivos.push({ ruta: `xl/charts/chart${numero}.xml`, contenido: graficoXML(grafico, hoja.nombre) });
            tipos.push(`<Override PartName="/xl/charts/chart${numero}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
            return `<Relationship Id="rId${j + 1}" Type="${RELS}/chart" Target="../charts/chart${numero}.xml"/>`;
        }).join('');
        archivos.push({ ruta: `xl/drawings/_rels/drawing${dibujo}.xml.rels`, contenido: `${CABECERA_RELS}${relaciones}</Relationships>` });
    });

    archivos.unshift(
        {
            ruta: '[Content_Types].xml',
            contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
                '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
                '<Default Extension="xml" ContentType="application/xml"/>' +
                '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
                '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
                tipos.join('') + '</Types>'
        },
        { ruta: '_rels/.rels', contenido: `${CABECERA_RELS}<Relationship Id="rId1" Type="${RELS}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
        {
            ruta: 'xl/workbook.xml',
            contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${RELS}">` +
                '<bookViews><workbookView activeTab="0"/></bookViews>' +
                '<sheets>' + hojas.map((h, i) => `<sheet name="${escaparXML(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>' +
                (filtros.length ? `<definedNames>${filtros.join('')}</definedNames>` : '') +
                '<calcPr calcId="191029" fullCalcOnLoad="1"/>' +
                '</workbook>'
        },
        {
            ruta: 'xl/_rels/workbook.xml.rels',
            contenido: CABECERA_RELS +
                hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${RELS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
                `<Relationship Id="rId${hojas.length + 1}" Type="${RELS}/styles" Target="styles.xml"/></Relationships>`
        },
        { ruta: 'xl/styles.xml', contenido: ESTILOS_XML }
    );

    return crearZip(archivos);
}

// --- ZIP (sin compresión) ---
const TABLA_CRC = (() => {
    const tabla = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        tabla[n] = c >>> 0;
    }
    return tabla;
})();

function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = TABLA_CRC[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function crearZip(archivos) {
    const codificador = new TextEncoder();
    const partes = [];
    const directorio = [];
    let desplazamiento = 0;

    archivos.forEach(({ ruta, contenido }) => {
        const nombre = codificador.encode(ruta);
        const datos = codificador.encode(contenido);
        const crc = crc32(datos);

        const cabecera = new DataView(new ArrayBuffer(30));
        cabecera.setUint32(0, 0x04034b50, true);  // firma
        cabecera.setUint16(4, 20, true);          // versión
        cabecera.setUint16(6, 0x0800, true);      // nombres en UTF-8
        cabecera.setUint16(8, 0, true);           // sin compresión
        cabecera.setUint32(14, crc, true);
        cabecera.setUint32(18, datos.length, true);
        cabecera.setUint32(22, datos.length, true);
        cabecera.setUint16(26, nombre.length, true);
        partes.push(new Uint8Array(cabecera.buffer), nombre, datos);

        const entrada = new DataView(new ArrayBuffer(46));
        entrada.setUint32(0, 0x02014b50, true);
        entrada.setUint16(4, 20, true);
        entrada.setUint16(6, 20, true);
        entrada.setUint16(8, 0x0800, true);
        entrada.setUint16(10, 0, true);
        entrada.setUint32(16, crc, true);
        entrada.setUint32(20, datos.length, true);
        entrada.setUint32(24, datos.length, true);
        entrada.setUint16(28, nombre.length, true);
        entrada.setUint32(42, desplazamiento, true);
        directorio.push(new Uint8Array(entrada.buffer), nombre);

        desplazamiento += 30 + nombre.length + datos.length;
    });

    const tamanoDirectorio = directorio.reduce((total, parte) => total + parte.length, 0);
    const final = new DataView(new ArrayBuffer(22));
    final.setUint32(0, 0x06054b50, true);
    final.setUint16(8, archivos.length, true);
    final.setUint16(10, archivos.length, true);
    final.setUint32(12, tamanoDirectorio, true);
    final.setUint32(16, desplazamiento, true);

    const todo = [...partes, ...directorio, new Uint8Array(final.buffer)];
    const resultado = new Uint8Array(todo.reduce((total, parte) => total + parte.length, 0));
    let posicion = 0;
    todo.forEach(parte => { resultado.set(parte, posicion); posicion += parte.length; });
    return resultado;
}

// Para guardar el archivo en el registro de "Archivos" (localStorage solo admite texto)
export function bytesABase64(bytes) {
    let binario = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binario);
}

export function base64ABytes(base64) {
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return bytes;
}

// --- LECTURA DE ARCHIVOS EXCEL (.xlsx) ---
// Devuelve las filas de la primera hoja como listas de valores (texto o número)

async function descomprimir(datos, metodo) {
    if (metodo === 0) return datos;
    if (metodo !== 8) throw new Error('Formato de compresión no soportado');
    const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
}

async function leerZip(bytes) {
    const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let fin = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
        if (vista.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    }
    if (fin < 0) throw new Error('El archivo no es un Excel válido');

    const total = vista.getUint16(fin + 10, true);
    let posicion = vista.getUint32(fin + 16, true);
    const decodificador = new TextDecoder();
    const archivos = {};

    for (let n = 0; n < total; n++) {
        const metodo = vista.getUint16(posicion + 10, true);
        const tamanoComprimido = vista.getUint32(posicion + 20, true);
        const largoNombre = vista.getUint16(posicion + 28, true);
        const largoExtra = vista.getUint16(posicion + 30, true);
        const largoComentario = vista.getUint16(posicion + 32, true);
        const inicioLocal = vista.getUint32(posicion + 42, true);
        const nombre = decodificador.decode(bytes.subarray(posicion + 46, posicion + 46 + largoNombre));

        const inicioDatos = inicioLocal + 30 + vista.getUint16(inicioLocal + 26, true) + vista.getUint16(inicioLocal + 28, true);
        archivos[nombre] = { metodo, datos: bytes.subarray(inicioDatos, inicioDatos + tamanoComprimido) };
        posicion += 46 + largoNombre + largoExtra + largoComentario;
    }

    return async ruta => {
        const archivo = archivos[ruta];
        if (!archivo) return null;
        return decodificador.decode(await descomprimir(archivo.datos, archivo.metodo));
    };
}

function elementos(nodo, etiqueta) {
    return Array.from(nodo.getElementsByTagNameNS('*', etiqueta));
}

function textoDe(nodo) {
    return elementos(nodo, 't').map(t => t.textContent).join('');
}

function indiceColumna(referencia) {
    const letras = (referencia.match(/^[A-Z]+/) || ['A'])[0];
    return letras.split('').reduce((total, letra) => total * 26 + letra.charCodeAt(0) - 64, 0) - 1;
}

export async function leerPrimeraHojaExcel(bytes) {
    const leer = await leerZip(bytes);
    const analizador = new DOMParser();
    const xml = texto => analizador.parseFromString(texto, 'application/xml');

    const libro = xml(await leer('xl/workbook.xml') || '');
    const primeraHoja = elementos(libro, 'sheet')[0];
    if (!primeraHoja) throw new Error('El archivo no tiene hojas');

    // Ruta real de la primera hoja según las relaciones del libro
    let rutaHoja = 'xl/worksheets/sheet1.xml';
    const idRelacion = primeraHoja.getAttribute('r:id') || primeraHoja.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const relaciones = await leer('xl/_rels/workbook.xml.rels');
    if (relaciones && idRelacion) {
        const relacion = elementos(xml(relaciones), 'Relationship').find(r => r.getAttribute('Id') === idRelacion);
        if (relacion) {
            const destino = relacion.getAttribute('Target');
            rutaHoja = destino.startsWith('/') ? destino.substring(1) : `xl/${destino}`;
        }
    }

    const textosCompartidos = [];
    const compartidos = await leer('xl/sharedStrings.xml');
    if (compartidos) elementos(xml(compartidos), 'si').forEach(si => textosCompartidos.push(textoDe(si)));

    const hoja = xml(await leer(rutaHoja) || '');
    return elementos(hoja, 'row').map(fila => {
        const valores = [];
        elementos(fila, 'c').forEach(celda => {
            const tipo = celda.getAttribute('t');
            const nodoValor = elementos(celda, 'v')[0];
            const valor = nodoValor ? nodoValor.textContent : '';
            let resultado;
            if (tipo === 's') resultado = textosCompartidos[Number(valor)] !== undefined ? textosCompartidos[Number(valor)] : '';
            else if (tipo === 'inlineStr') resultado = textoDe(celda);
            else if (tipo === 'str' || tipo === 'e' || tipo === 'b') resultado = valor;
            else resultado = valor === '' ? '' : Number(valor);
            const referencia = celda.getAttribute('r');
            valores[referencia ? indiceColumna(referencia) : valores.length] = resultado;
        });
        return Array.from(valores, v => (v === undefined || v === null) ? '' : v);
    });
}

// Número de serie de Excel (días desde 30/12/1899) -> "AAAA-MM-DD"
export function excelAFecha(numero) {
    const fecha = new Date(Date.UTC(1899, 11, 30) + Math.round(numero) * 86400000);
    return fecha.toISOString().substring(0, 10);
}
