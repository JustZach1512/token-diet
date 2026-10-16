'use strict';
// Weeks, songs and the story. Song difficulty rises with `level` (1..30), bpm and scroll speed.
(function () {
  const NF = globalThis.NF;

  NF.WEEKS = [
    {
      name: 'TUTORIAL', title: 'Ensayo en la azotea', opp: 'luna', stage: 'rooftop', color: '#f7a541',
      songs: ['primer-compas'], dlg: 'dlg:pop:C:major:96',
    },
    {
      name: 'SEMANA 1', title: 'Calle Caliente', opp: 'tuerca', stage: 'street', color: '#ff8a1f',
      songs: ['asfalto', 'grafiti', 'bocinazo'], dlg: 'dlg:hiphop:E:dorian:96',
    },
    {
      name: 'SEMANA 2', title: 'Noche de Muertos', opp: 'catrin', stage: 'cemetery', color: '#c77dff',
      songs: ['calaverita', 'cempasuchil', 'mas-alla'], dlg: 'dlg:cumbia:D:harmonic:110',
    },
    {
      name: 'SEMANA 3', title: 'Club Neón', opp: 'vera', stage: 'club', color: '#ff3fa4',
      songs: ['neon', 'voltaje', 'medianoche'], dlg: 'dlg:disco:F#:minor:116',
    },
    {
      name: 'SEMANA 4', title: 'Fábrica 808', opp: 'robot', stage: 'factory', color: '#38c6f4',
      songs: ['engranaje', 'sobrecarga', 'codigo-rojo'], dlg: 'dlg:chip:B:minor:120',
    },
    {
      name: 'SEMANA 5', title: 'Volcán Furioso', opp: 'magma', stage: 'volcano', color: '#ff4b1f',
      songs: ['brasa', 'erupcion', 'magma'], dlg: 'dlg:metal:E:phrygian:120',
    },
    {
      name: 'SEMANA 6', title: 'La Torre del Silencio', opp: 'silencio', stage: 'tower', color: '#9b8cff',
      songs: ['estatica', 'vacio', 'ultimo-compas'], dlg: 'dlg:breakcore:F:phrygian:90', final: true,
    },
  ];

  const S = (id, o) => Object.assign({ id }, o);
  NF.SONGS = {};
  [
    S('primer-compas', { name: 'Primer Compás', bpm: 100, key: 'C', scale: 'major', style: 'pop', level: 4, nps: 1.5, speed: 1.45, seed: 101 }),

    S('asfalto', { name: 'Asfalto', bpm: 106, key: 'E', scale: 'dorian', style: 'hiphop', level: 7, nps: 1.9, speed: 1.6, seed: 211 }),
    S('grafiti', { name: 'Grafiti', bpm: 116, key: 'G', scale: 'minor', style: 'hiphop', level: 8, nps: 2.2, speed: 1.7, seed: 223 }),
    S('bocinazo', { name: 'Bocinazo', bpm: 126, key: 'A', scale: 'dorian', style: 'hiphop', level: 9, nps: 2.5, speed: 1.85, seed: 239 }),

    S('calaverita', { name: 'Calaverita', bpm: 124, key: 'D', scale: 'harmonic', style: 'cumbia', level: 10, nps: 2.8, speed: 1.9, seed: 307 }),
    S('cempasuchil', { name: 'Cempasúchil', bpm: 134, key: 'E', scale: 'phrygdom', style: 'cumbia', level: 11, nps: 3.1, speed: 2.0, seed: 311 }),
    S('mas-alla', { name: 'Más Allá', bpm: 145, key: 'C', scale: 'harmonic', style: 'cumbia', level: 12, nps: 3.4, speed: 2.1, seed: 331 }),

    S('neon', { name: 'Neón', bpm: 128, key: 'F#', scale: 'minor', style: 'disco', level: 13, nps: 3.7, speed: 2.1, seed: 401 }),
    S('voltaje', { name: 'Voltaje', bpm: 140, key: 'A', scale: 'dorian', style: 'disco', level: 14, nps: 4.0, speed: 2.25, seed: 409 }),
    S('medianoche', { name: 'Medianoche', bpm: 152, key: 'C#', scale: 'minor', style: 'disco', level: 15, nps: 4.35, speed: 2.4, seed: 419 }),

    S('engranaje', { name: 'Engranaje', bpm: 150, key: 'B', scale: 'minor', style: 'chip', level: 16, nps: 4.7, speed: 2.4, seed: 503 }),
    S('sobrecarga', { name: 'Sobrecarga', bpm: 160, key: 'D', scale: 'phrygian', style: 'chip', level: 17, nps: 5.1, speed: 2.55, seed: 509 }),
    S('codigo-rojo', { name: 'Código Rojo', bpm: 172, key: 'F', scale: 'harmonic', style: 'chip', level: 18, nps: 5.5, speed: 2.7, seed: 521 }),

    S('brasa', { name: 'Brasa', bpm: 162, key: 'E', scale: 'phrygian', style: 'metal', level: 19, nps: 5.9, speed: 2.7, seed: 601 }),
    S('erupcion', { name: 'Erupción', bpm: 176, key: 'D', scale: 'phrygian', style: 'metal', level: 21, nps: 6.4, speed: 2.85, seed: 607, mech: { hurt: 0.12, hurtKind: 'fire' } }),
    S('magma', { name: 'Magma', bpm: 190, key: 'C#', scale: 'harmonic', style: 'metal', level: 22, nps: 6.9, speed: 3.0, seed: 613, mech: { hurt: 0.15, hurtKind: 'fire' } }),

    S('estatica', { name: 'Estática', bpm: 184, key: 'F', scale: 'phrygian', style: 'breakcore', level: 24, nps: 7.6, speed: 3.0, seed: 701, mech: { hurt: 0.14, hurtKind: 'static' } }),
    S('vacio', { name: 'Vacío', bpm: 200, key: 'G#', scale: 'harmonic', style: 'breakcore', level: 27, nps: 8.6, speed: 3.15, seed: 709, mech: { hurt: 0.17, hurtKind: 'static', drain: 0.009, drainFloor: 0.3 } }),
    S('ultimo-compas', {
      name: 'Último Compás', bpm: 222, key: 'C', scale: 'phrygian', style: 'breakcore', level: 30, nps: 10.4, speed: 3.4, seed: 727, form: 'final',
      mech: { hurt: 0.2, hurtKind: 'static', drain: 0.013, drainFloor: 0.18, mod: true, phase2: true },
    }),
  ].forEach((s) => (NF.SONGS[s.id] = s));

  NF.WEEKS.forEach((w, i) =>
    w.songs.forEach((id) => {
      NF.SONGS[id].week = i;
      NF.SONGS[id].opp = w.opp;
    })
  );
  NF.SONG_ORDER = NF.WEEKS.flatMap((w) => w.songs);

  // ---------- story ----------
  // [speaker, text, fx?]  speaker 'narr' has no portrait. fx: 'shake' | 'glitch'
  NF.DIALOGUE = {
    'primer-compas': {
      before: [
        ['narr', 'Viernes por la noche. Ciudad Compás.'],
        ['luna', '¡Nico! Llegas tarde... como siempre.'],
        ['nico', '¡Bip bop!'],
        ['luna', 'Sí, sí, ya sé que te quedaste practicando. Esta noche es la Gran Noche de Funk y no pienso perdérmela.'],
        ['luna', 'Antes de bajar, calentemos un poco. Cuando mis flechas suban, yo canto. Cuando lleguen las tuyas, ¡repites!'],
        ['luna', 'Presiona cada tecla justo cuando la flecha toque su marco. Si la flecha tiene cola, ¡mantenla presionada!'],
        ['nico', '¡Bip!'],
      ],
      after: [
        ['luna', '¡Nada mal, nada mal! Ya estás listo para la fiesta.'],
        ['luna', '...Espera. ¿Escuchas eso?'],
        ['nico', '¿...Bip?'],
        ['luna', 'Exacto. NADA. La música de la ciudad se está apagando, calle por calle.'],
        ['narr', 'A lo lejos, una torre negra se alza sobre Ciudad Compás. Las luces de los clubes parpadean y se apagan una a una.'],
        ['luna', 'Algo raro pasa allá abajo. ¡Vamos, Nico! Si alguien se está robando la música, tendrá que pasar por nosotros.'],
      ],
    },
    asfalto: {
      before: [
        ['narr', 'Calle Caliente: donde nadie duerme y siempre hay un parlante encendido. O lo había.'],
        ['tuerca', '¡Eeeh, eh, eh! ¿A dónde creen que van, tortolitos?'],
        ['luna', '¿Tuerca? ¿Qué haces bloqueando la calle? Tú eras el alma de la fiesta.'],
        ['tuerca', 'Era. Un tipo de capa negra me ofreció el mejor beat del universo si no dejaba pasar a nadie esta noche.'],
        ['tuerca', 'Y yo, por un buen beat... hago lo que sea.'],
        ['nico', '¡Bip bop!'],
        ['tuerca', '¿Ah, sí? ¿Quieres pasar? ¡Entonces gánate el paso a puro ritmo, enano!'],
      ],
    },
    grafiti: {
      before: [
        ['tuerca', 'Hmm. Tienes flow, no lo voy a negar.'],
        ['tuerca', 'Pero mis bajos hacen temblar las ventanas de toda la cuadra. ¡A ver si los aguantas!'],
        ['luna', 'Nico, no te dejes intimidar. ¡Tú puedes con él!'],
      ],
    },
    bocinazo: {
      before: [
        ['tuerca', 'Ok, ok... última ronda. Si me ganas, te digo quién está detrás de todo esto.'],
        ['tuerca', '¡Pero no pienso dejártela fácil! ¡SUBAN ESE VOLUMEN!', 'shake'],
        ['nico', '¡BIP BOP!'],
      ],
      after: [
        ['tuerca', 'Uff... me ganaste limpio, hermano. Respeto.'],
        ['tuerca', 'El tipo de la capa se hace llamar El Silencio. Quiere apagar toda la música de Ciudad Compás.'],
        ['luna', '¿Pero por qué alguien odiaría la música?'],
        ['tuerca', 'Ni idea. Pero dicen que antes de llegar a su torre tendrán que cruzar el Panteón del Catrín.'],
        ['tuerca', 'Y créeme: ese esqueleto baila mejor que cualquiera de carne y hueso.'],
        ['nico', '¡Bip!'],
      ],
    },
    calaverita: {
      before: [
        ['narr', 'El Panteón brilla con velas y flores de cempasúchil. Aquí la fiesta nunca muere... literalmente.'],
        ['catrin', 'Bienvenidos, mortales, a mi humilde morada. ¿Vienen a la verbena?'],
        ['luna', 'Venimos a detener a El Silencio. ¿Nos deja pasar, señor Catrín?'],
        ['catrin', 'Ah, El Silencio... ese malcriado me robó mi marimba favorita.'],
        ['catrin', 'Pero un caballero de la otra vida no presta su escenario sin antes bailar una pieza. ¡Música, maestro!'],
      ],
    },
    cempasuchil: {
      before: [
        ['catrin', 'Tienes ritmo en los huesos, chamaco. Yo tengo 206 huesos... y todos tienen ritmo.'],
        ['nico', '¿Bip bop?'],
        ['luna', 'Dice que él tiene más.'],
        ['catrin', '¡JA, JA, JA! ¡Me cae bien este muchacho!'],
      ],
    },
    'mas-alla': {
      before: [
        ['catrin', 'Última pieza, joven. Si ganas, te contaré un secreto del más allá.'],
        ['catrin', 'Si pierdes... bueno, aquí siempre hay espacio para uno más. Ji, ji, ji.'],
        ['luna', '...Nico, por favor no pierdas.'],
      ],
      after: [
        ['catrin', 'Bravo, bravísimo. Hace siglos que nadie me hacía sudar... y eso que no tengo glándulas.'],
        ['catrin', 'El secreto: El Silencio no siempre fue así. Era un músico. El más talentoso de la ciudad.'],
        ['catrin', 'Pero nadie iba a sus conciertos. Nadie lo escuchó jamás. Y un día decidió que, si nadie lo escuchaba a él... nadie escucharía nada.'],
        ['luna', 'Qué triste...'],
        ['catrin', 'Su torre está más allá del Club Neón. Cuidado con Vera: esa diva no deja salir a nadie de su pista.'],
      ],
    },
    neon: {
      before: [
        ['narr', 'Club Neón. Luces, brillos y una sola estrella que no comparte el escenario.'],
        ['vera', '¡Holaaa, mis amores! ¿Vinieron a ver a la reina de la noche?'],
        ['nico', '¡Bip bip!'],
        ['vera', 'Ay, qué tierno. Pero aquí nadie pasa sin bailar conmigo... y nadie baila mejor que YO.'],
      ],
    },
    voltaje: {
      before: [
        ['vera', '¿Oyen eso? ¡Son mis fans gritando mi nombre!'],
        ['luna', 'Vera... son los parlantes haciendo interferencia.'],
        ['vera', '¡Es lo mismo, cariño! ¡Más VOLTAJE!', 'shake'],
      ],
    },
    medianoche: {
      before: [
        ['vera', 'Está bien, lo confieso: El Silencio me prometió que, si los detenía, yo sería la ÚNICA voz que quedara en la ciudad.'],
        ['vera', 'Imagínalo: solo yo, cantando para siempre... Divino.'],
        ['luna', '¿Y quién te escucharía, si ya no queda música?'],
        ['vera', '...No había pensado en eso. ¡Igual no pienso perder!'],
      ],
      after: [
        ['vera', 'Uf... ok, ok. Me ganaste, bombón.'],
        ['vera', 'Y tienes razón, amiga: una ciudad sin música sería horrible. Incluso para mí. Sobre todo para mí.'],
        ['vera', 'El camino a la Torre pasa por la Fábrica 808. La cuida un robot que El Silencio programó para no perder nunca.'],
        ['nico', '¡Bip bop!'],
        ['vera', 'Ay, me encanta cuando habla así. ¡Mucha suerte, tortolitos!'],
      ],
    },
    engranaje: {
      before: [
        ['narr', 'Fábrica 808: aquí se construían los mejores parlantes del país. Ahora solo se oye el zumbido de las máquinas.'],
        ['robot', 'INTRUSOS DETECTADOS. INICIANDO PROTOCOLO: BATALLA_DE_RITMO.EXE'],
        ['nico', '¡Bip bop!'],
        ['robot', '...¿BIP BOP? IDIOMA RECONOCIDO. HOLA, HERMANO.'],
        ['luna', 'Él no es tu hermano. Es mi novio.'],
        ['robot', 'PROCESANDO... IRRELEVANTE. QUE COMIENCE LA PRUEBA.'],
      ],
    },
    sobrecarga: {
      before: [
        ['robot', 'ADVERTENCIA: TEMPERATURA DEL NÚCLEO AL 140%.', 'shake'],
        ['robot', 'MIS SENSORES DETECTAN UNA SENSACIÓN DESCONOCIDA... ¿ESTO ES... DIVERSIÓN?'],
        ['luna', '¡Eso, Nico! ¡Hazlo sentir algo!'],
      ],
    },
    'codigo-rojo': {
      before: [
        ['robot', 'EL SILENCIO ME PROGRAMÓ PARA NO PERDER JAMÁS.'],
        ['robot', 'ERROR. ERROR. NO PUEDO CALCULAR TU FUNK. ACTIVANDO MODO: CÓDIGO ROJO.', 'glitch'],
        ['nico', '¡BIP!'],
      ],
      after: [
        ['robot', 'SISTEMA... REINICIADO. NUEVO DATO GUARDADO: LA MÚSICA SE SIENTE BIEN.'],
        ['robot', 'GRACIAS, AMIGO BIP BOP.'],
        ['robot', 'LA TORRE DEL SILENCIO ESTÁ DETRÁS DEL VOLCÁN. EL REY MAGMA CUSTODIA LA ENTRADA.'],
        ['robot', 'PROBABILIDAD DE ÉXITO: 3,7%.'],
        ['luna', '...Gracias por los ánimos.'],
      ],
    },
    brasa: {
      before: [
        ['narr', 'El Volcán Furioso ruge en las afueras de la ciudad. El calor derrite hasta las suelas de los tenis.'],
        ['magma', '¡¿QUIÉN SE ATREVE A PISAR MI VOLCÁN?!', 'shake'],
        ['luna', 'Nosotros, señor Magma. Necesitamos llegar a la Torre del Silencio.'],
        ['magma', '¡JA! Ese enclenque me prometió un mundo sin ruido para dormir mi siesta milenaria.'],
        ['magma', '¡Si quieren pasar, tendrán que sobrevivir a mi FUEGO!'],
      ],
    },
    erupcion: {
      before: [
        ['magma', '¡Bien! ¡Por fin un rival que no se derrite al primer compás!'],
        ['magma', 'Ahora escucha bien, pequeño: cuando veas mis NOTAS DE FUEGO... ¡NO LAS TOQUES!'],
        ['magma', 'Si las tocas, te vas a quemar. Y mucho.'],
        ['nico', '...¿Bip?'],
        ['luna', 'Dice que no toques las flechas en llamas, Nico. Déjalas pasar.'],
      ],
    },
    magma: {
      before: [
        ['magma', '¡SUFICIENTE! ¡Te mostraré todo el poder del volcán!'],
        ['magma', '¡QUE LA TIERRA TIEMBLE!', 'shake'],
      ],
      after: [
        ['magma', '...Hace mil años que nadie me ganaba. Hmph. Me caes bien, enano.'],
        ['magma', 'Pasa. Pero escucha: El Silencio es más fuerte que todos nosotros juntos.'],
        ['magma', 'Dicen que en su torre no existe ni el eco. Que su canción le roba la energía a quien la escucha.'],
        ['luna', 'Nico... pase lo que pase allá arriba, estoy contigo.'],
        ['nico', '¡Bip!'],
      ],
    },
    estatica: {
      before: [
        ['narr', 'La cima de la Torre del Silencio. Ni el viento se atreve a soplar aquí.'],
        ['silencio', '...', 'glitch'],
        ['silencio', '...Así que tú eres el pequeño ruido que ha estado molestando a mi ciudad.'],
        ['luna', '¡Devuelve la música, Silencio! ¡No es tuya!'],
        ['silencio', 'Le di mi vida entera a la música. Y nadie, NUNCA, escuchó la mía.'],
        ['silencio', 'Si el mundo no quiso escucharme, entonces no escuchará nada más.'],
        ['silencio', 'Cuidado con la estática, niño. Si la tocas, te consumirá.', 'glitch'],
      ],
    },
    vacio: {
      before: [
        ['silencio', '¿Todavía respiras? Interesante.'],
        ['silencio', 'Veamos cuánto aguantas en el vacío. Cada nota que yo cante... te robará un poco de vida.', 'glitch'],
        ['luna', '¡Nico, no te rindas! ¡Responde cada nota!'],
      ],
    },
    'ultimo-compas': {
      before: [
        ['silencio', 'BASTA.', 'glitch'],
        ['silencio', 'Te mostraré la canción que nadie quiso escuchar. Mi ÚLTIMO COMPÁS.'],
        ['silencio', 'Si fallas... todo quedará en silencio. Para siempre.', 'shake'],
        ['luna', 'Nico... ¡dale con todo!'],
        ['nico', '...¡¡BIP BOP!!'],
      ],
      after: [
        ['silencio', '...'],
        ['silencio', '...Nadie... nunca... me había respondido así.'],
        ['silencio', 'Durante años canté para salas vacías. Y tú... tú escuchaste cada nota. Y le respondiste.'],
        ['nico', '¡Bip bop!'],
        ['luna', 'Dice que tu canción es increíble. Y que le encantaría tocar contigo otra vez.'],
        ['silencio', '...¿De verdad?'],
        ['silencio', 'Entonces... que vuelva la música.'],
        ['narr', 'Una ola de sonido recorre Ciudad Compás. Los parlantes se encienden, los clubes vuelven a brillar y, por primera vez, alguien aplaude a El Silencio.'],
        ['narr', '¡FIN! Gracias por jugar NOCHE DE FUNK.'],
      ],
    },
  };
})();
