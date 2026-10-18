// radio.js — Outrun Radio station list for the Night Drive homepage.
//
// A station is either procedural (played by the Web Audio engine in audio.js) or a file.
// Pattern strings are one character per 16th-note step, 16 per bar:
//   drums:  x = hit, o = soft hit, . = rest        hats: x = closed, o = soft closed, O = open
// The arrangement string has one letter per bar of the loop:
//   A = groove (arp pattern A)   a = groove with arp pattern B and the lead phrase
//   B = breakdown (no kick/snare, pad opens up)   R = rise (four-on-the-floor, snare roll, riser)
// Lead phrases are [bar, step, midi, lengthInSteps]; keep them on chord tones, 7ths and 9ths.
//
// To add a real track (e.g. a Lyria 3.5 render), drop the file in assets/ and add:
//   { type: 'file', name: 'LYRIA SESSION', src: './assets/lyria-cyberpunk.mp3' }

export const STATIONS = [
  {
    type: 'synth',
    name: 'MIDNIGHT CRUISE',
    bpm: 100,
    swing: 0.06,
    // i – VI – III – VII in D minor: Dm9, Bbmaj9, Fmaj7(add9), Cadd9
    chords: [
      [62, 65, 69, 72, 76],
      [58, 62, 65, 69, 72],
      [65, 69, 72, 76, 79],
      [60, 64, 67, 74, 76]
    ],
    bassRoots: [38, 34, 41, 36],
    bassPattern: 'x.o.x.ox.o.x.o.x',
    bassHop: '..x...x...x...x.',
    arpA: [0, 2, 4, 2, 1, 3, 4, 3, 0, 2, 4, 2, 1, 4, 3, 2],
    arpB: [4, null, 2, 4, null, 3, 4, null, 2, null, 4, 3, null, 4, 2, null],
    arpOctaveShimmer: true,
    kick: 'x...x...x...x..o',
    snare: '....x.......x...',
    hats: 'xoxoxoxoxoxoxoxO',
    hatLevel: 0.95,
    lead: [
      [4, 0, 81, 6], [4, 6, 79, 4], [4, 10, 77, 6],
      [5, 0, 74, 8], [5, 8, 77, 8],
      [6, 0, 76, 6], [6, 6, 79, 6], [6, 12, 81, 4],
      [7, 0, 79, 10], [7, 10, 76, 6],
      [12, 0, 86, 16], [13, 0, 84, 12], [13, 12, 81, 4]
    ],
    pad: { lo: 520, hi: 1900, level: 0.05 },
    pluck: { wave: 'sawtooth', level: 0.075, delaySend: 0.5 },
    bass: { wave: 'sawtooth', cutoff: 760, drive: 1.9 },
    arrangement: 'AAAAaaaaAAAABBRR'
  },
  {
    type: 'synth',
    name: 'NEON COAST',
    bpm: 92,
    swing: 0.0,
    // vi – IV – ii – iii in C: Am9, Fmaj9, Dm9, Em7
    chords: [
      [57, 60, 64, 67, 71],
      [53, 57, 60, 64, 67],
      [50, 53, 57, 60, 64],
      [52, 55, 59, 62, 67]
    ],
    bassRoots: [33, 29, 38, 28],
    bassPattern: 'xoooxoooxoooxooo',
    bassHop: '..x...x...x...x.',
    arpA: [0, null, 2, 4, null, 3, 1, null, 4, null, 2, 0, null, 3, 4, null],
    arpB: [4, null, 2, null, 3, 4, null, 1, 4, null, 0, 2, null, 4, 3, null],
    arpOctaveShimmer: true,
    kick: 'x.......x.x.....',
    snare: '....x.......x...',
    hats: 'oxoxoxoxoxoxoxoO',
    hatLevel: 0.8,
    lead: [
      [4, 0, 76, 8], [4, 8, 79, 7],
      [5, 0, 81, 10], [5, 10, 79, 6],
      [6, 0, 77, 8], [6, 8, 76, 8],
      [7, 0, 74, 6], [7, 6, 71, 10]
    ],
    pad: { lo: 480, hi: 1500, level: 0.05 },
    pluck: { wave: 'sawtooth', level: 0.07, delaySend: 0.45 },
    bass: { wave: 'sawtooth', cutoff: 560, drive: 1.7 },
    arrangement: 'AAAAaaaaAAAAaaBR'
  },
  {
    type: 'synth',
    name: 'SUNSET INTERSTATE',
    bpm: 84,
    swing: 0.1,
    // I – iii – vi – IV in C: Cmaj9, Em7, Am9, Fmaj9 — slow, wide, half-time
    chords: [
      [60, 64, 67, 71, 74],
      [52, 55, 59, 62, 67],
      [57, 60, 64, 67, 71],
      [53, 57, 60, 64, 67]
    ],
    bassRoots: [36, 40, 33, 29],
    bassPattern: 'x.......o...x...',
    bassHop: '......x.......x.',
    arpA: [0, null, null, 2, null, null, 4, null, null, 3, null, null, 1, null, 4, null],
    arpB: [4, null, null, 2, null, 3, null, null, 4, null, null, 1, null, 2, null, null],
    arpOctaveShimmer: false,
    kick: 'x...........x...',
    snare: '........x.......',
    hats: 'o.x.o.x.o.x.o.xO',
    hatLevel: 0.6,
    lead: [
      [4, 0, 79, 12], [4, 12, 81, 4],
      [5, 0, 83, 16],
      [6, 0, 81, 8], [6, 8, 79, 8],
      [7, 0, 76, 16],
      [12, 0, 84, 16], [13, 0, 83, 16]
    ],
    pad: { lo: 400, hi: 1300, level: 0.056 },
    pluck: { wave: 'triangle', level: 0.085, delaySend: 0.6 },
    bass: { wave: 'triangle', cutoff: 420, drive: 1.3 },
    arrangement: 'AAAAaaaaAAAABBAR'
  },
  {
    type: 'synth',
    name: 'CHROME HORIZON',
    bpm: 108,
    swing: 0.0,
    // i – VI – III – VII in E minor: Em9, Cmaj7, G6, Dadd9 — punchier, octave bass
    chords: [
      [64, 67, 71, 74, 78],
      [60, 64, 67, 71, 74],
      [55, 59, 62, 64, 67],
      [62, 66, 69, 74, 76]
    ],
    bassRoots: [40, 36, 31, 38],
    bassPattern: 'xoxoxoxoxoxoxoxo',
    bassHop: '.x.x.x.x.x.x.x.x',
    arpA: [0, 4, 2, 4, 1, 4, 3, 4, 0, 4, 2, 4, 1, 4, 3, 4],
    arpB: [4, 2, 4, 3, 4, 1, 4, 2, 4, 0, 4, 2, 4, 3, 4, 1],
    arpOctaveShimmer: true,
    kick: 'x...x...x...x...',
    snare: '....x.......x..o',
    hats: 'xOxOxOxOxOxOxOxO',
    hatLevel: 0.85,
    lead: [
      [4, 0, 83, 4], [4, 4, 86, 4], [4, 8, 83, 8],
      [5, 0, 84, 6], [5, 6, 83, 2], [5, 8, 81, 8],
      [6, 0, 79, 8], [6, 8, 83, 8],
      [7, 0, 81, 12], [7, 12, 78, 4]
    ],
    pad: { lo: 600, hi: 2200, level: 0.046 },
    pluck: { wave: 'square', level: 0.062, delaySend: 0.4 },
    bass: { wave: 'sawtooth', cutoff: 900, drive: 2.2 },
    arrangement: 'AAAAaaaaAAAAaaRR'
  }
];

export const DEFAULT_STATION = 0;
