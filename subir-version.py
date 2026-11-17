"""Sube la versión de la app (el ?v=N de index.html y de los archivos de js/).

El service worker guarda en el móvil los estilos y el código, y solo descarga uno nuevo
cuando cambia su dirección. Por eso, después de cualquier cambio en la app hay que subir
este número en todos los archivos a la vez. Este script lo hace solo.

Uso (desde la carpeta de la app):  python subir-version.py
El icono (icono.png?v=N) lleva su propio número y no se toca: súbelo a mano si cambias la imagen.
"""
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent
INDEX = RAIZ / 'index.html'
ARCHIVOS = [INDEX, *sorted((RAIZ / 'js').glob('*.js'))]


def leer(archivo):
    # Se lee y se escribe en bytes para respetar los saltos de línea que tenga cada archivo
    return archivo.read_bytes().decode('utf-8')


def main():
    encontrada = re.search(r'css/style\.css\?v=(\d+)', leer(INDEX))
    if not encontrada:
        sys.exit('No encuentro la versión en index.html (css/style.css?v=N).')
    actual = int(encontrada.group(1))
    nueva = actual + 1
    patron = re.compile(rf'\?v={actual}(?!\d)')

    cambiados = 0
    for archivo in ARCHIVOS:
        texto = leer(archivo)
        nuevo, veces = patron.subn(f'?v={nueva}', texto)
        if veces:
            archivo.write_bytes(nuevo.encode('utf-8'))
            cambiados += 1

    # Aviso si algún archivo tenía otra versión (se habría quedado sin actualizar)
    desfasados = []
    for archivo in ARCHIVOS:
        otras = {int(v) for v in re.findall(r'(?<!icono\.png)\?v=(\d+)', leer(archivo))} - {nueva}
        if otras:
            desfasados.append(f'  {archivo.relative_to(RAIZ)}: ?v={", ".join(map(str, sorted(otras)))}')

    print(f'Versión {actual} -> {nueva} en {cambiados} archivos.')
    if desfasados:
        print('Ojo, estos archivos tienen otra versión y no se han cambiado:')
        print('\n'.join(desfasados))
        sys.exit(1)


if __name__ == '__main__':
    main()
