// Generador de archivos Excel (.xlsx) sin librerías externas: todo se crea en el
// propio dispositivo, sin enviar datos a ningún sitio.
//
// Uso: crearLibroExcel([{ nombre, columnas: [{ titulo, ancho }], filas: [[celda, ...], ...] }])
// Cada celda es { v: valor, tipo: 'texto' | 'fecha' | 'dinero' | 'numero', negrita: bool }

const ESTILOS = { texto: 0, cabecera: 1, fecha: 2, dinero: 3, numero: 4, dineroNegrita: 5, textoNegrita: 6 };

export const MIME_EXCEL = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

function letraColumna(indice) {
    let letra = '';
    indice++;
    while (indice > 0) {
        const resto = (indice - 1) % 26;
        letra = String.fromCharCode(65 + resto) + letra;
        indice = Math.floor((indice - 1) / 26);
    }
    return letra;
}

// Excel guarda las fechas como días desde el 30/12/1899
function fechaAExcel(fechaStr) {
    const [anio, mes, dia] = fechaStr.split('-').map(Number);
    return (Date.UTC(anio, mes - 1, dia) - Date.UTC(1899, 11, 30)) / 86400000;
}

function celdaXML(celda, referencia) {
    if (celda === null || celda === undefined || celda.v === '' || celda.v === null || celda.v === undefined) {
        return '';
    }
    const { v, tipo = 'texto', negrita = false } = celda;

    if (tipo === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return `<c r="${referencia}" s="${ESTILOS.fecha}"><v>${fechaAExcel(v)}</v></c>`;
    }
    if ((tipo === 'dinero' || tipo === 'numero') && isFinite(parseFloat(v))) {
        const estilo = tipo === 'dinero' ? (negrita ? ESTILOS.dineroNegrita : ESTILOS.dinero) : ESTILOS.numero;
        return `<c r="${referencia}" s="${estilo}"><v>${parseFloat(v)}</v></c>`;
    }
    const estilo = negrita ? ESTILOS.textoNegrita : ESTILOS.texto;
    return `<c r="${referencia}" t="inlineStr" s="${estilo}"><is><t xml:space="preserve">${escaparXML(v)}</t></is></c>`;
}

function hojaXML({ columnas, filas }) {
    const anchos = columnas.map((col, i) => `<col min="${i + 1}" max="${i + 1}" width="${col.ancho || 14}" customWidth="1"/>`).join('');

    const cabecera = '<row r="1">' + columnas.map((col, i) =>
        `<c r="${letraColumna(i)}1" t="inlineStr" s="${ESTILOS.cabecera}"><is><t>${escaparXML(col.titulo)}</t></is></c>`
    ).join('') + '</row>';

    const cuerpo = filas.map((fila, f) => {
        const numeroFila = f + 2;
        return `<row r="${numeroFila}">` + fila.map((celda, c) => celdaXML(celda, `${letraColumna(c)}${numeroFila}`)).join('') + '</row>';
    }).join('');

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
        `<cols>${anchos}</cols>` +
        `<sheetData>${cabecera}${cuerpo}</sheetData>` +
        '</worksheet>';
}

const ESTILOS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="2">' +
        '<numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>' +
        '<numFmt numFmtId="165" formatCode="#,##0.00 &quot;€&quot;"/>' +
    '</numFmts>' +
    '<fonts count="3">' +
        '<font><sz val="11"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
        '<fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FF101828"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="7">' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +                                // texto
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +    // cabecera
        '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +        // fecha
        '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +        // dinero
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +                                // número
        '<xf numFmtId="165" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' + // dinero negrita
        '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                  // texto negrita
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

// Excel no admite ciertos caracteres en los nombres de hoja, ni más de 31 caracteres
function nombreHojaValido(nombre, usados) {
    let base = String(nombre).replace(/[:\\/?*\[\]]/g, ' ').trim().substring(0, 31) || 'Hoja';
    let candidato = base;
    let contador = 2;
    while (usados.has(candidato.toLowerCase())) {
        const sufijo = ` (${contador++})`;
        candidato = base.substring(0, 31 - sufijo.length) + sufijo;
    }
    usados.add(candidato.toLowerCase());
    return candidato;
}

export function crearLibroExcel(hojas) {
    const usados = new Set();
    const nombres = hojas.map(h => nombreHojaValido(h.nombre, usados));

    const archivos = [
        {
            ruta: '[Content_Types].xml',
            contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
                '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
                '<Default Extension="xml" ContentType="application/xml"/>' +
                '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
                '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
                hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
                '</Types>'
        },
        {
            ruta: '_rels/.rels',
            contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
                '</Relationships>'
        },
        {
            ruta: 'xl/workbook.xml',
            contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
                '<sheets>' + nombres.map((nombre, i) => `<sheet name="${escaparXML(nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>' +
                '</workbook>'
        },
        {
            ruta: 'xl/_rels/workbook.xml.rels',
            contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
                `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
                '</Relationships>'
        },
        { ruta: 'xl/styles.xml', contenido: ESTILOS_XML },
        ...hojas.map((hoja, i) => ({ ruta: `xl/worksheets/sheet${i + 1}.xml`, contenido: hojaXML(hoja) }))
    ];

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
            if (tipo === 's') resultado = textosCompartidos[Number(valor)] ?? '';
            else if (tipo === 'inlineStr') resultado = textoDe(celda);
            else if (tipo === 'str' || tipo === 'e' || tipo === 'b') resultado = valor;
            else resultado = valor === '' ? '' : Number(valor);
            const referencia = celda.getAttribute('r');
            valores[referencia ? indiceColumna(referencia) : valores.length] = resultado;
        });
        return Array.from(valores, v => v ?? '');
    });
}

// Número de serie de Excel (días desde 30/12/1899) -> "AAAA-MM-DD"
export function excelAFecha(numero) {
    const fecha = new Date(Date.UTC(1899, 11, 30) + Math.round(numero) * 86400000);
    return fecha.toISOString().substring(0, 10);
}
