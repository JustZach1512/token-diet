# Noche sin fin

Asimétrico de terror en 2D para móvil: **4 supervivientes contra 1 asesino**, vista
cenital, oscuridad con línea de vista y una IA con tres modos: **Normal**, **Difícil**
y **Pesadilla**. Puedes jugar en cualquiera de los dos bandos; el resto de personajes
los controla la máquina.

Hecho con HTML5 Canvas y JavaScript sin dependencias ni archivos de audio (todo el
sonido se sintetiza con WebAudio).

## Jugar

- Abre `index.html` en el navegador del móvil o del ordenador. Funciona también
  desde `file://`.
- Para pasarlo al móvil como un único archivo: `node build.mjs` genera
  `dist/noche-sin-fin.html` con todo incrustado.
- Se juega mejor en horizontal. En móvil: joystick flotante a la izquierda y botones
  a la derecha. Con teclado: WASD/flechas, Mayús para caminar, Espacio (acción),
  E (habilidad), J (atacar), Esc (pausa).

## Reglas

**Supervivientes**: reparad 5 de los 7 generadores, abrid una de las dos puertas y
escapad antes de que termine el colapso. Dos golpes te derriban; el asesino te carga
y te cuelga en un gancho. Un aliado puede rescatarte; a la tercera vez en el gancho
mueres. Si quedas solo, aparece una trampilla.

- Pruebas de habilidad al reparar o curar (zona dorada = bonificación; fallo = ruido).
- Palés que aturden al asesino y ventanas para saltar.
- Correr deja marcas rojas que el asesino ve; caminar (joystick a medias) no.

**Asesino**: golpea, recoge, cuelga, rompe palés y patea generadores. Ves las marcas
de los supervivientes, la sangre de los heridos y avisos de ruido.

## Personajes

| Superviviente | Habilidad | Pasiva |
|---|---|---|
| Lucía Ferrer, médica | **Botiquín**: se cura al instante | Cura y levanta un 60 % más rápido |
| Marco Ibarra, mecánico | **Sobrecarga**: repara ×3 durante 8 s | Repara un 10 % más rápido |
| Sara Núñez, atleta | **Esprint**: +60 % de velocidad 3 s | Salta un 25 % más rápido |
| Diego Varela, ladrón | **Sombra**: invisible e irrastreable 5 s | Deja la mitad de marcas |
| Elena Sosa, fotógrafa | **Destello**: ciega 3 s y libera a quien cargue | Ve un 15 % más lejos |

| Asesino | Habilidad |
|---|---|
| El Carnicero | **Embestida**: carga que derriba de un golpe; chocar le aturde |
| El Espectro | **Velo**: invisible, sin radio de terror y más rápido; golpe espectral al revelarse |
| La Cazadora | **Hacha**: proyectil a distancia que hiere |
| La Bruja | **Runa**: trampas que atrapan y revelan; teletransporte a la runa activada |

## Modos de la IA

Cada modo es un perfil de parámetros en `js/data.js`:

| | Normal | Difícil | Pesadilla |
|---|---|---|---|
| Asesino: reflejos | 0,6 s | 0,3 s | 0,15 s |
| Asesino: visión / campo de visión | 7 m · 170° | 8,5 m · 250° | 10 m · 360° |
| Asesino: puntería y predicción | errático, sin predicción | preciso, predice algo | casi perfecto, se adelanta |
| Asesino: rastreo de marcas | a veces, con retraso | casi siempre | siempre, al instante |
| Asesino: tácticas | deambula | patrulla generadores, patea, respeta palés | acampa ganchos, persigue al rescatado, revela por ruido |
| Supervivientes IA | lentos, gastan palés, rescates impulsivos | se reparten, buenos en persecución | casi perfectos |
| Entorno | visión normal | menos visión | visión mínima, parpadeos, pruebas al revés, colapso corto |

En partidas simuladas IA contra IA (16 por modo, en dos tandas), con el asesino del
modo elegido contra aliados competentes, murieron de media unos 0,1 supervivientes
de 4 en Normal, 1,6 en Difícil y 2,7 en Pesadilla. Entre tandas hay bastante
variación (±0,7).

## Estructura

```
index.html        pantallas, HUD y controles
css/style.css     estilos
js/data.js        constantes, personajes y perfiles de dificultad
js/map.js         generación procedural, línea de vista y rutas A*
js/entities.js    supervivientes, asesino y habilidades
js/ai.js          IA de supervivientes y asesino
js/game.js        reglas de la partida
js/render.js      dibujo en canvas, oscuridad y auras
js/audio.js       sonido sintetizado
js/input.js       joystick táctil, botones y teclado
js/ui.js          menús, HUD y bucle principal
build.mjs         empaqueta todo en un solo HTML
```
