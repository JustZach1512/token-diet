# Última Luz

Asimétrico de terror en 3D para el navegador del móvil: **4 supervivientes contra 1 asesino**,
con IA en tres niveles (**Normal**, **Difícil** y **Pesadilla**). Puedes jugar en cualquiera de los
dos bandos; el resto de personajes los controla la IA.

Todo es procedural: modelos, texturas, mapa y sonido se generan en el propio navegador.
No hay imágenes ni audios externos.

## Jugar

- Abre `dist/ultima-luz.html` (un único archivo autocontenido) en el móvil o en el PC.
- Mejor en horizontal y con auriculares.

| Acción | Móvil | PC |
| --- | --- | --- |
| Moverse | joystick (mitad izquierda) | WASD / flechas (Shift: andar) |
| Mirar | arrastrar en la mitad derecha | ratón |
| Acción / Atacar | botón grande | E, Espacio, clic |
| Habilidad | botón redondo | Q |
| Agacharse / Interactuar | botón superior | C o F |

## Reglas

**Supervivientes:** reparad 5 de los 7 generadores, abrid una de las dos puertas y escapad antes de
que colapse la Entidad. Las pruebas de habilidad aparecen al reparar o curar: toca Acción cuando la
aguja cruce la zona clara (la naranja da bonificación). Tira palés para aturdir al asesino y sáltalos
para hacer bucles. Dos golpes te derriban; si te cuelgan, tus compañeros pueden rescatarte. Al tercer
gancho, la Entidad te reclama.

**Asesino (primera persona):** sigue los arañazos rojos y las manchas de sangre, golpea, recoge a los
derribados y cuélgalos. Puedes romper palés y patear generadores. Si una persecución se alarga ganas
*Sed de sangre* (más velocidad).

## Personajes

| Superviviente | Habilidad | Pasiva |
| --- | --- | --- |
| Marco · Atleta | Carrera: +60 % de velocidad 3 s | Corre un 4 % más rápido |
| Lucía · Médica | Botiquín: se cura o levanta a un aliado cercano | Cura un 50 % más rápido |
| Iris · Mecánica | Bengala: ciega y aturde al asesino 3 s | Repara un 20 % más rápido |
| Teo · Sigiloso | Sombra: casi invisible 7 s | Deja la mitad de arañazos |

| Asesino | Habilidad | Pasiva |
| --- | --- | --- |
| El Carnicero | Embestida: carga que golpea y revienta palés | Rompe y patea un 35 % más rápido |
| La Espectro | Velo: invisible y más rápida, sin radio de terror | Radio de terror de 24 m |
| El Trampero | Cepo: trampas ocultas (máx. 4) | Los arañazos duran el doble |

## Dificultad de la IA

- **Normal:** el asesino ve poco en la niebla, reacciona tarde y pierde el rastro; los supervivientes
  fallan pruebas y tiran palés a destiempo.
- **Difícil:** el asesino sigue arañazos, predice, patea generadores y vuelve al gancho; los
  supervivientes cooperan, rescatan y hacen bucles con los palés.
- **Pesadilla:** el asesino es más rápido, casi no reacciona tarde, rompe palés enseguida y la Entidad
  le revela tu posición cada ~30 s; los supervivientes casi nunca fallan y esquivan tus golpes.

## Gráficos

Three.js con iluminación lunar y sombras, niebla volumétrica, *bloom*, gradación de color, viñeta y
grano, hierba animada por viento, fuego y partículas, focos rojos del asesino, auras a través de las
paredes y escala de resolución automática. Calidad **Baja / Media / Alta** seleccionable.

## Desarrollo

```bash
npm install
npm run build   # genera dist/ultima-luz.html
npm run serve   # sirve index.html (carga src/ como módulos) en http://localhost:8080
```

Parámetros útiles en la URL para pruebas: `?start=1&role=killer&char=trampero&diff=pesadilla&quality=baja`
y `auto=1` (la IA controla también tu personaje).
