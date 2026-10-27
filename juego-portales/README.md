# Umbral · juego de portales

Juego en 3D para el navegador inspirado en Portal: cinco cámaras de pruebas de dificultad creciente y una Zona de pruebas libre.

Abre `index.html` en un navegador reciente (necesita WebGL 2 y conexión para cargar three.js desde jsDelivr).

## Controles

- WASD / flechas: moverse · ratón: mirar
- Clic izquierdo / derecho: portal azul / naranja
- E: coger o soltar un cubo, pulsar botones de pedestal · Espacio: saltar
- R: reiniciar la prueba · Esc: pausa · M: silenciar
- Zona de pruebas: C cubo nuevo, G gravedad baja, F cerrar portales

## Desarrollo

El código está en `src/` (`shell.html` y los módulos `*.js`, que se concatenan en orden).
Tras editar, regenera `index.html` con:

```bash
node build.mjs
```
