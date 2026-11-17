// Filas que se deslizan hacia la izquierda para mostrar sus acciones (historial de gastos,
// desglose y operaciones de inversión). Estructura de cada fila:
//
//   <div class="mov" data-indice="3">
//       <div class="mov-acciones"> <button class="mov-accion" data-accion="editar" data-indice="3"> … </div>
//       <button class="mov-fila"> … </button>
//   </div>
//
// Al deslizar, la fila se mueve y los botones de debajo aparecen poco a poco. Tocar la fila
// (sin deslizar) llama a alTocar; si estaba abierta, se cierra.

const ANCHO_ACCIONES = 152; // dos botones de 76 px

function moverFila(mov, desplazamiento, conTransicion) {
    const fila = mov.querySelector('.mov-fila');
    fila.style.transition = conTransicion ? '' : 'none';
    fila.style.transform = desplazamiento ? `translateX(${desplazamiento}px)` : '';
    // Los botones aparecen poco a poco según se desliza (0 = ocultos, 1 = del todo)
    mov.style.setProperty('--progreso', Math.min(1, -desplazamiento / ANCHO_ACCIONES).toFixed(3));
}

function abrirFila(mov) {
    mov.classList.add('abierto');
    mov.querySelectorAll('.mov-accion').forEach(b => b.removeAttribute('tabindex'));
    moverFila(mov, -ANCHO_ACCIONES, true);
}

function cerrarFila(mov) {
    mov.classList.remove('abierto');
    mov.querySelectorAll('.mov-accion').forEach(b => b.setAttribute('tabindex', '-1'));
    moverFila(mov, 0, true);
}

export function cerrarFilasAbiertas(excepto) {
    document.querySelectorAll('.mov.abierto').forEach(mov => { if (mov !== excepto) cerrarFila(mov); });
}

function conectarFila(mov, alTocar) {
    const fila = mov.querySelector('.mov-fila');
    let gesto = null; // { x, y, inicio, desplazamiento, horizontal, id }
    let ignorarClic = false;

    fila.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        gesto = { x: e.clientX, y: e.clientY, inicio: mov.classList.contains('abierto') ? -ANCHO_ACCIONES : 0, desplazamiento: 0, horizontal: null, id: e.pointerId };
    });
    fila.addEventListener('pointermove', e => {
        if (!gesto || e.pointerId !== gesto.id) return;
        const dx = e.clientX - gesto.x;
        const dy = e.clientY - gesto.y;
        if (gesto.horizontal === null) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            gesto.horizontal = Math.abs(dx) > Math.abs(dy);
            if (!gesto.horizontal) { gesto = null; return; } // es un scroll vertical
            cerrarFilasAbiertas(mov);
            try { fila.setPointerCapture(e.pointerId); } catch (error) { /* sin captura */ }
        }
        // Hacia la izquierda hasta el ancho de los botones (y un poco más, frenando); hacia la derecha, nada
        let x = gesto.inicio + dx;
        if (x < -ANCHO_ACCIONES) x = -ANCHO_ACCIONES + (x + ANCHO_ACCIONES) * 0.3;
        gesto.desplazamiento = Math.min(0, x);
        moverFila(mov, gesto.desplazamiento, false);
    });
    const terminar = () => {
        if (!gesto) return;
        if (gesto.horizontal) {
            ignorarClic = true; // el navegador manda un clic al soltar: no debe contar como toque
            setTimeout(() => { ignorarClic = false; }, 50);
            if (gesto.desplazamiento < -ANCHO_ACCIONES / 2.5) abrirFila(mov); else cerrarFila(mov);
        }
        gesto = null;
    };
    fila.addEventListener('pointerup', terminar);
    fila.addEventListener('pointercancel', terminar);

    fila.addEventListener('click', () => {
        if (ignorarClic) return;
        if (mov.classList.contains('abierto')) { cerrarFila(mov); return; }
        cerrarFilasAbiertas();
        alTocar(Number(mov.getAttribute('data-indice')));
    });
}

// alTocar(indice): tocar la fila · alAccion(accion, indice): pulsar uno de sus botones
export function conectarFilasDeslizables(contenedor, { alTocar, alAccion }) {
    contenedor.querySelectorAll('.mov').forEach(mov => conectarFila(mov, alTocar));
    contenedor.querySelectorAll('.mov-accion[data-accion]').forEach(boton => boton.addEventListener('click', () => {
        alAccion(boton.getAttribute('data-accion'), Number(boton.getAttribute('data-indice')));
    }));
}

// Tocar fuera de una fila abierta la cierra
document.addEventListener('pointerdown', e => { if (!e.target.closest('.mov.abierto')) cerrarFilasAbiertas(); });
