# Neon Dash 3D

Juego de ritmo y saltos estilo *Geometry Dash*, en 3D, para el navegador del móvil (también funciona con teclado y ratón).
Es un único `index.html`: ábrelo en el navegador (necesita internet la primera vez para cargar three.js desde jsDelivr).

## Cómo se juega

- **Cubo**: toca para saltar; mantén pulsado para saltar seguido.
- **Nave**: mantén para subir y suelta para bajar.
- **Bola**: toca para invertir la gravedad.
- **OVNI**: cada toque es un impulso hacia arriba.
- **Onda**: mantén para subir en diagonal y suelta para bajar.
- **Aros**: toca *en el aire* mientras pasas por ellos. Las **plataformas** te lanzan solas.
- **Portales**: cambian el modo, la gravedad o la velocidad (flechas: 0,5× · 1× · 2× · 3× · 4×).
- **Modo práctica** (diamante del menú de pausa): pon puntos de control y reaparece en ellos.
- Teclado: Espacio / ↑ / W para saltar, P o Esc para pausar, R para reiniciar.

## Niveles

| # | Nivel | Dificultad | Novedad |
|---|-------|-----------|---------|
| 1 | Primer Pulso | Fácil | Cubo y nave |
| 2 | Ritmo de Vuelta | Fácil | Plataformas y aros |
| 3 | Espectro Polar | Normal | Gravedad invertida, nave con pinchos |
| 4 | Tierra Seca | Normal | Sierras, velocidad 2× |
| 5 | Base Naranja | Difícil | Bola |
| 6 | No Me Sueltes | Difícil | Túneles de nave, bola con gravedad |
| 7 | Saltarín | Muy difícil | OVNI |
| 8 | Reloj de Arena | Muy difícil | Velocidad 3×, mezcla de modos |
| 9 | Onda Cero | Locura | Onda |
| 10 | Núcleo Demonio | Demonio | Todo junto, túneles estrechos a 3× |

Cada nivel tiene 3 monedas secretas y su propia música generada en tiempo real.

## Estructura

- `src/core.js`: física determinista (paso fijo de 1/240 s), constructor de niveles, patrones y datos de los 10 niveles.
- `src/audio.js`: secuenciador de música procedural y efectos de sonido (Web Audio).
- `src/game.js`: render con three.js (shaders neón, bloom, partículas), jugador, cámara, interfaz y controles.
- `src/style.css`, `src/index.template.html`: interfaz.
- `tools/build.mjs`: genera `index.html` juntando todo.
- `tools/verify.mjs`: un solver que juega cada nivel con la misma física y comprueba que se puede completar.

```bash
node tools/build.mjs                       # regenera index.html
node tools/verify.mjs --k=8 --phases=2     # todos los niveles con ventanas de tiempo de ~33 ms
node tools/verify.mjs 3 --k=4 --coins      # nivel 3 y cada una de sus monedas
```
