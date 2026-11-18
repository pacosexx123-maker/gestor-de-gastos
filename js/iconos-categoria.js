// Icono de cada categoría en el historial, para distinguirlas sin depender del color.
// Las categorías las crea cada persona: el icono se elige por las palabras del nombre y,
// si ninguna coincide, se muestra la inicial de la categoría.

const svg = contenido => `<svg viewBox="0 0 24 24">${contenido}</svg>`;

const ICONOS = {
    cafe: svg('<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>'),
    carrito: svg('<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>'),
    cubiertos: svg('<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>'),
    combustible: svg('<line x1="3" y1="22" x2="15" y2="22"/><line x1="4" y1="9" x2="14" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5"/>'),
    coche: svg('<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>'),
    avion: svg('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>'),
    casa: svg('<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
    rayo: svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
    gota: svg('<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>'),
    wifi: svg('<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>'),
    movil: svg('<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>'),
    maletin: svg('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'),
    devolver: svg('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>'),
    porcentaje: svg('<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'),
    tendencia: svg('<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'),
    tarjeta: svg('<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>'),
    documento: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'),
    escudo: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
    repetir: svg('<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'),
    corazon: svg('<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'),
    pulso: svg('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'),
    libro: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
    regalo: svg('<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>'),
    huella: svg('<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>'),
    camiseta: svg('<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>'),
    bolsa: svg('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>'),
    sonrisa: svg('<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>'),
    puntos: svg('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>')
};

// Se comprueban en orden, con el nombre en minúsculas y sin acentos
const REGLAS = [
    [/\b(cafe|desayuno)/, 'cafe'],
    [/\b(super|mercad|alimentacion|despensa)/, 'carrito'],
    [/\b(comida|restaurante|cena|almuerzo|menu|tapas|bar(es)?\b)/, 'cubiertos'],
    [/\b(gasolina|combustible|diesel|gasoil)/, 'combustible'],
    [/\b(transporte|coche|moto\b|taxi|uber|cabify|parking|aparcamiento|peaje|metro\b|autobus|bus\b|tren\b|renfe)/, 'coche'],
    [/\b(viaje|vacacion|vuelo|hotel)/, 'avion'],
    [/\b(hogar|casa\b|alquiler|hipoteca|comunidad|mueble)/, 'casa'],
    [/\b(luz\b|electric)/, 'rayo'],
    [/\b(agua\b)/, 'gota'],
    [/\b(internet|wifi|fibra)/, 'wifi'],
    [/\b(movil|telefono|bizum)/, 'movil'],
    [/\b(nomina|sueldo|salario|trabajo|paga\b)/, 'maletin'],
    [/\b(devolucion|reembolso)/, 'devolver'],
    [/\b(interes|dividendo)/, 'porcentaje'],
    [/\b(inversion|ahorro)/, 'tendencia'],
    [/\b(banco|comision|tarjeta|prestamo)/, 'tarjeta'],
    [/\b(impuesto|hacienda|irpf|ibi\b|multa)/, 'documento'],
    [/\b(seguro)/, 'escudo'],
    [/\b(suscripcion|netflix|spotify|streaming)/, 'repetir'],
    [/\b(salud|medic|farmacia|dentista|hospital)/, 'corazon'],
    [/\b(deporte|gimnasio|gym\b|fitness)/, 'pulso'],
    [/\b(educacion|formacion|curso|libro|universidad|colegio)/, 'libro'],
    [/\b(regalo)/, 'regalo'],
    [/\b(mascota|perro|gato|veterinari)/, 'huella'],
    [/\b(ropa|moda|zapat)/, 'camiseta'],
    [/\b(compra|tienda|amazon)/, 'bolsa'],
    [/\b(ocio|cine|fiesta|entretenimiento|juego)/, 'sonrisa'],
    [/\b(otro)/, 'puntos']
];

const normalizar = texto => String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function iconoCategoria(nombre) {
    const texto = normalizar(nombre);
    const regla = REGLAS.find(([patron]) => patron.test(texto));
    if (regla) return ICONOS[regla[1]];
    const inicial = String(nombre).match(/[\p{L}\p{N}]/u);
    return inicial ? `<b>${inicial[0].toUpperCase()}</b>` : ICONOS.puntos;
}
