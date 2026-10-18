// Calibrated Beat-Warping & SongCrafter Per-Track Charts for DJ KRONOS
// Flow Rap: 92.00 BPM, 156 transient-snapped beats, 39 4-beat bars across 101.632s
// INST 1: 100.0 BPM (measured via 200 Hz onset-envelope autocorrelation on 48 kHz PCM, lag=120 frames, offset=0.45s, 40.896s)
// INST 2: 125.0 BPM (measured via 200 Hz onset-envelope autocorrelation on 48 kHz PCM, lag=96 frames, offset=0.37s, 40.896s)

export const KRONOS_BPM = 92.0;
export const KRONOS_BEAT_OFFSET = 0.007;
export const KRONOS_FIRST_BEAT_OFFSET = 0.007;
export const KRONOS_BEAT_SEC = 0.65217;
export const KRONOS_BAR_SEC = 2.6087;
export const KRONOS_LOOP_DURATION = 101.632;
export const KRONOS_FULL_DURATION = 101.632;
export const KRONOS_TOTAL_BARS = 39;
export const KRONOS_TOTAL_BEATS = 156;

// 156 transient-snapped beat timestamps from the Flow track audio onset analysis (92.00 BPM)
export const KRONOS_BEAT_TIMES = [
  0.015, 0.67, 1.318, 1.95, 2.626, 3.262, 3.927, 4.58, 5.216, 5.883, 6.522, 7.188, 7.843, 8.482, 9.144, 9.791,
  10.443, 11.087, 11.742, 12.397, 13.052, 13.705, 14.351, 15.006, 15.651, 16.304, 16.952, 17.624, 18.269, 18.929, 19.568, 20.232,
  20.869, 21.527, 22.17, 22.822, 23.487, 24.137, 24.793, 25.438, 26.086, 26.739, 27.399, 28.059, 28.703, 29.364, 29.996, 30.663,
  31.313, 31.961, 32.605, 33.263, 33.92, 34.568, 35.225, 35.876, 36.524, 37.174, 37.822, 38.494, 39.138, 39.798, 40.45, 41.093,
  41.754, 42.397, 43.047, 43.7, 44.357, 45.006, 45.659, 46.311, 46.959, 47.608, 48.256, 48.929, 49.573, 50.233, 50.866, 51.533,
  52.181, 52.844, 53.492, 54.145, 54.788, 55.452, 56.093, 56.753, 57.394, 58.052, 58.691, 59.357, 60.006, 60.652, 61.313, 61.964,
  62.617, 63.279, 63.917, 64.568, 65.226, 65.876, 66.533, 67.181, 67.829, 68.478, 69.126, 69.791, 70.45, 71.103, 71.754, 72.397,
  73.038, 73.712, 74.355, 75.013, 75.658, 76.314, 76.968, 77.615, 78.255, 78.913, 79.561, 80.219, 80.88, 81.531, 82.174, 82.832,
  83.485, 84.126, 84.786, 85.438, 86.096, 86.742, 87.399, 88.05, 88.689, 89.348, 89.996, 90.668, 91.313, 91.973, 92.619, 93.263,
  93.92, 94.584, 95.223, 95.881, 96.526, 97.181, 97.829, 98.494, 99.124, 99.788, 100.431, 101.086
];

export const LIGHTING_PALETTES = {
  magenta: {
    name: 'magenta',
    primaryHex: '#ff2a85',
    secondaryHex: '#7a00ff',
    accentHex: '#ff85c0',
    rimHex: '#ff2a85'
  },
  cyan: {
    name: 'cyan',
    primaryHex: '#00e5ff',
    secondaryHex: '#0051ff',
    accentHex: '#80f4ff',
    rimHex: '#00e5ff'
  },
  gold: {
    name: 'gold',
    primaryHex: '#ffe042',
    secondaryHex: '#ff7b00',
    accentHex: '#fff3a8',
    rimHex: '#ffe042'
  },
  crimson: {
    name: 'crimson',
    primaryHex: '#ff1e38',
    secondaryHex: '#8f0018',
    accentHex: '#ff6b7d',
    rimHex: '#ff1e38'
  }
};

export const KRONOS_ENEMY_ARCHETYPES = {
  hook_brawler: {
    id: 'hook_brawler',
    label: 'Cypher Hook Brawler',
    pattern: 'quick_hook',
    targetBeatInBar: [1.0], // 0-indexed beat 1.0 = musical beat 2
    targetMusicalBeats: [2.0],
    windupBeats: 1.0,
    counterSubdivision: 0.5,
    baseDamage: 12,
    hp: 130
  },
  double_tap_striker: {
    id: 'double_tap_striker',
    label: 'Enforcer Double-Tap Striker',
    pattern: 'double_tap',
    targetBeatInBar: [1.0, 1.5], // 0-indexed 1.0 & 1.5 = musical beat 2 & 2-and (2.5)
    targetMusicalBeats: [2.0, 2.5],
    windupBeats: 1.0,
    followupSubdivision: 0.5,
    counterSubdivision: 0.5,
    baseDamage: [10, 14],
    hp: 145
  },
  heavy_charger: {
    id: 'heavy_charger',
    label: 'Heavy Sub-Bass Charger',
    pattern: 'charge',
    windupStartBeatInBar: 2.0, // Winds up on beat 3 (0-indexed 2.0) of bar k
    targetBeatInBar: [0.0], // Lands on beat 1 (0-indexed 0.0) of bar k+1
    targetMusicalBeats: [1.0],
    windupBeats: 2.0,
    counterSubdivision: 0.5,
    baseDamage: 22,
    hp: 165
  }
};

/**
 * Returns the transient-snapped timestamp for any quarter-note or eighth-note beat float
 * using `beatTimes` when available (interpolating midpoint for `.5` subdivisions).
 */
function getSnappedBeatTime(beatFloat, beatTimes = KRONOS_BEAT_TIMES, beatSec = KRONOS_BEAT_SEC, firstBeatOffset = KRONOS_FIRST_BEAT_OFFSET) {
  if (!Array.isArray(beatTimes) || beatTimes.length === 0) {
    return Number((firstBeatOffset + beatFloat * beatSec).toFixed(4));
  }
  const lowIdx = Math.max(0, Math.min(beatTimes.length - 1, Math.floor(beatFloat)));
  const frac = beatFloat - Math.floor(beatFloat);
  const t0 = beatTimes[lowIdx];
  if (Math.abs(frac) < 1e-6) {
    return Number(t0.toFixed(4));
  }
  const t1 = (lowIdx + 1 < beatTimes.length) ? beatTimes[lowIdx + 1] : (t0 + beatSec);
  return Number((t0 + frac * (t1 - t0)).toFixed(4));
}

/**
 * Builds the eighth-note (0.5 beat) and quarter-note (1.0 beat) sub-beat grid
 * across a track duration. Uses transient-snapped `beatTimes` when provided.
 */
function buildSubBeatGrid(totalBeats, beatSec, firstBeatOffset, fullDuration, beatTimes = null) {
  const totalEighths = totalBeats * 2;
  const grid = [];
  const quarterNotes = [];
  const eighthNotes = [];
  const halfBeatOffbeats = [];

  for (let idx = 0; idx < totalEighths; idx++) {
    const beatFloat = idx * 0.5;
    const rawTime = beatTimes
      ? getSnappedBeatTime(beatFloat, beatTimes, beatSec, firstBeatOffset)
      : (firstBeatOffset + beatFloat * beatSec);
    if (rawTime > fullDuration + 1e-6) {
      break;
    }
    const time = Number(rawTime.toFixed(4));
    const barIndex = Math.floor(beatFloat / 4);
    const beatInBar = Number((beatFloat - barIndex * 4).toFixed(2));
    const isQuarter = (idx % 2) === 0;
    const subdivision = isQuarter ? 1.0 : 0.5;
    const entry = {
      index: idx,
      time,
      beat: beatFloat,
      barIndex,
      bar: barIndex + 1,
      beatInBar,
      beatNumber: Number((beatInBar + 1.0).toFixed(2)),
      subdivision,
      noteType: isQuarter ? 'quarter' : 'eighth',
      isDownbeat: beatInBar === 0,
      valueOf() {
        return this.time;
      }
    };
    grid.push(entry);
    eighthNotes.push(time);
    if (isQuarter) {
      quarterNotes.push(time);
    } else {
      halfBeatOffbeats.push(time);
    }
  }

  Object.defineProperties(grid, {
    quarterNotes: { value: quarterNotes, enumerable: false },
    eighthNotes: { value: eighthNotes, enumerable: false },
    halfBeats: { value: halfBeatOffbeats, enumerable: false },
    times: { value: eighthNotes, enumerable: false },
    beatSec: { value: Number(beatSec.toFixed(6)), enumerable: false },
    firstBeatOffset: { value: firstBeatOffset, enumerable: false }
  });

  return grid;
}

// 6 structured sections across the 39 bars / 156 transient-snapped beats (101.632s at 92.00 BPM)
export const FLOW_SECTIONS = [
  {
    id: 'intro',
    name: 'INTRO',
    startBar: 1,
    endBar: 4,
    startBarIndex: 0,
    endBarIndex: 3,
    firstBeatIndex: 0,
    lastBeatIndex: 15,
    firstBeatTime: KRONOS_BEAT_TIMES[0], // 0.015s
    lastBeatTime: KRONOS_BEAT_TIMES[15], // 9.791s
    startTime: 0.0,
    endTime: 10.5,
    phase: 'stage',
    wave: 1,
    bossPhase: null,
    feverSurge: false,
    feverGainMultiplier: 1.0,
    lightingPalette: 'cyan',
    description: 'Warm-up / Hook-archetype Bruisers spawn on Bar 1 downbeat (beats 0-15, 0.0s-10.5s).',
    spawnQueue: [
      {
        id: 'spawn_intro_b1',
        bar: 1,
        barIndex: 0,
        beatIndex: 0,
        beatInBar: 0.0,
        time: KRONOS_BEAT_TIMES[0], // 0.015s
        enemyArchetype: 'hook_brawler',
        count: 2,
        hp: 120,
        role: 'warmup_bruiser'
      }
    ]
  },
  {
    id: 'verse_1',
    name: 'VERSE 1',
    startBar: 5,
    endBar: 12,
    startBarIndex: 4,
    endBarIndex: 11,
    firstBeatIndex: 16,
    lastBeatIndex: 47,
    firstBeatTime: KRONOS_BEAT_TIMES[16], // 10.443s
    lastBeatTime: KRONOS_BEAT_TIMES[47], // 30.663s
    startTime: 10.5,
    endTime: 31.5,
    phase: 'stage',
    wave: 1,
    bossPhase: null,
    feverSurge: false,
    feverGainMultiplier: 1.0,
    lightingPalette: 'magenta',
    description: 'Wave 1 Bruisers (hook on beat 2, double-tap on beat 2-and / 2.5, beats 16-47, 10.5s-31.5s).',
    spawnQueue: [
      {
        id: 'spawn_v1_b5',
        bar: 5,
        barIndex: 4,
        beatIndex: 16,
        beatInBar: 0.0,
        time: KRONOS_BEAT_TIMES[16], // 10.443s
        enemyArchetype: 'hook_brawler',
        count: 2,
        hp: 130,
        role: 'wave1_bruiser'
      },
      {
        id: 'spawn_v1_b9',
        bar: 9,
        barIndex: 8,
        beatIndex: 32,
        beatInBar: 0.0,
        time: KRONOS_BEAT_TIMES[32], // 20.869s
        enemyArchetype: 'double_tap_striker',
        count: 1,
        hp: 140,
        role: 'wave1_striker'
      }
    ]
  },
  {
    id: 'hook_1',
    name: 'HOOK 1',
    startBar: 13,
    endBar: 20,
    startBarIndex: 12,
    endBarIndex: 19,
    firstBeatIndex: 48,
    lastBeatIndex: 79,
    firstBeatTime: KRONOS_BEAT_TIMES[48], // 31.313s
    lastBeatTime: KRONOS_BEAT_TIMES[79], // 51.533s
    startTime: 31.5,
    endTime: 52.8,
    phase: 'unfold',
    wave: 2,
    bossPhase: null,
    feverSurge: false,
    feverGainMultiplier: 1.15,
    lightingPalette: 'gold',
    description: 'Wave 2 Enforcers + Heavy Chargers (charge wind-up on beat 3, landing on beat 1 of next bar, beats 48-79, 31.5s-52.8s).',
    spawnQueue: [
      {
        id: 'spawn_h1_b13',
        bar: 13,
        barIndex: 12,
        beatIndex: 48,
        beatInBar: 0.0,
        time: KRONOS_BEAT_TIMES[48], // 31.313s
        enemyArchetype: 'double_tap_striker',
        count: 2,
        hp: 150,
        role: 'wave2_enforcer'
      },
      {
        id: 'spawn_h1_b15',
        bar: 15,
        barIndex: 14,
        beatIndex: 56,
        beatInBar: 0.0,
        time: KRONOS_BEAT_TIMES[56], // 36.524s
        enemyArchetype: 'heavy_charger',
        count: 1,
        hp: 165,
        role: 'wave2_charger'
      }
    ]
  },
  {
    id: 'breakdown',
    name: 'BREAKDOWN',
    startBar: 21,
    endBar: 24,
    startBarIndex: 20,
    endBarIndex: 23,
    firstBeatIndex: 80,
    lastBeatIndex: 95,
    firstBeatTime: KRONOS_BEAT_TIMES[80], // 52.181s
    lastBeatTime: KRONOS_BEAT_TIMES[95], // 61.964s
    startTime: 52.8,
    endTime: 63.0,
    phase: 'unfold',
    wave: 2,
    bossPhase: null,
    feverSurge: true,
    feverGainMultiplier: 1.75,
    lightingPalette: 'magenta',
    description: 'Mid-song cypher breakdown with rapid double-tap syncs + Fever meter surge (beats 80-95, 52.8s-63.0s).',
    spawnQueue: [
      {
        id: 'spawn_bd_b21',
        bar: 21,
        barIndex: 20,
        beatIndex: 80,
        beatInBar: 0.0,
        time: KRONOS_BEAT_TIMES[80], // 52.181s
        enemyArchetype: 'double_tap_striker',
        count: 2,
        hp: 145,
        role: 'breakdown_striker'
      },
      {
        id: 'spawn_bd_b23',
        bar: 23,
        barIndex: 22,
        beatIndex: 88,
        beatInBar: 0.0,
        time: KRONOS_BEAT_TIMES[88], // 57.394s
        enemyArchetype: 'heavy_charger',
        count: 1,
        hp: 160,
        role: 'breakdown_charger'
      }
    ]
  },
  {
    id: 'verse_2',
    name: 'VERSE 2',
    startBar: 25,
    endBar: 32,
    startBarIndex: 24,
    endBarIndex: 31,
    firstBeatIndex: 96,
    lastBeatIndex: 127,
    firstBeatTime: KRONOS_BEAT_TIMES[96], // 62.617s
    lastBeatTime: KRONOS_BEAT_TIMES[127], // 82.832s
    startTime: 63.0,
    endTime: 84.0,
    phase: 'ring',
    wave: 3,
    bossPhase: 1,
    feverSurge: false,
    feverGainMultiplier: 1.25,
    lightingPalette: 'cyan',
    description: 'DJ Kronos Boss Phase 1 (enters ring on Bar 25 downbeat with scratch_combo 3-hit syncs and Enforcer flankers, beats 96-127, 63.0s-84.0s).',
    spawnQueue: [
      {
        id: 'spawn_v2_b25_boss',
        bar: 25,
        barIndex: 24,
        beatIndex: 96,
        beatInBar: 0.0,
        time: KRONOS_BEAT_TIMES[96], // 62.617s
        enemyArchetype: 'boss_kronos',
        count: 1,
        hp: 100,
        role: 'boss_phase_1'
      },
      {
        id: 'spawn_v2_b25_flanker',
        bar: 25,
        barIndex: 24,
        beatIndex: 96,
        beatInBar: 0.0,
        time: KRONOS_BEAT_TIMES[96], // 62.617s
        enemyArchetype: 'double_tap_striker',
        count: 1,
        hp: 150,
        role: 'enforcer_flanker'
      },
      {
        id: 'spawn_v2_b29_flanker',
        bar: 29,
        barIndex: 28,
        beatIndex: 112,
        beatInBar: 0.0,
        time: KRONOS_BEAT_TIMES[112], // 73.038s
        enemyArchetype: 'hook_brawler',
        count: 1,
        hp: 150,
        role: 'enforcer_flanker'
      }
    ]
  },
  {
    id: 'outro',
    name: 'OUTRO',
    startBar: 33,
    endBar: 39,
    startBarIndex: 32,
    endBarIndex: 38,
    firstBeatIndex: 128,
    lastBeatIndex: 155,
    firstBeatTime: KRONOS_BEAT_TIMES[128], // 83.485s
    lastBeatTime: KRONOS_BEAT_TIMES[155], // 101.086s
    startTime: 84.0,
    endTime: 101.632,
    phase: 'ring',
    wave: 3,
    bossPhase: 2,
    feverSurge: true,
    feverGainMultiplier: 1.5,
    lightingPalette: 'crimson',
    description: 'DJ Kronos Boss Phase 2 (Subwoofer bass_drop + scratch_combo + Final Bar 39 Finisher Mini-Sequence final_bar_finisher on beats 152-155, 84.0s-101.632s).',
    spawnQueue: [
      {
        id: 'spawn_outro_b33_boss',
        bar: 33,
        barIndex: 32,
        beatIndex: 128,
        beatInBar: 0.0,
        time: KRONOS_BEAT_TIMES[128], // 83.485s
        enemyArchetype: 'boss_kronos',
        count: 1,
        hp: 100,
        role: 'boss_phase_2'
      },
      {
        id: 'spawn_outro_b35_charger',
        bar: 35,
        barIndex: 34,
        beatIndex: 136,
        beatInBar: 0.0,
        time: KRONOS_BEAT_TIMES[136], // 88.689s
        enemyArchetype: 'heavy_charger',
        count: 1,
        hp: 165,
        role: 'royal_guard_charger'
      }
    ]
  }
];

const FLOW_LYRIC_LINES = [
  // INTRO (Bars 1-4, beats 0-15, 0.0s-10.5s)
  { line: 'Check the gold watch swinging, ninety-two on the dial,', bannerText: '92 ON THE DIAL!' },
  { line: 'Warm the knuckles on the snare, lock your feet to the floor,', bannerText: 'LOCK TO THE FLOOR!' },
  { line: "Step inside of my cypher, you ain't lasting a while.", bannerText: 'STEP IN THE CYPHER!' },
  { line: 'First wave stepping through the smoke at the courtyard door!', bannerText: 'VANGUARD INBOUND!' },
  // VERSE 1 (Bars 5-12, beats 16-47, 10.5s-31.5s)
  { line: 'Crown heavy on the decks, yeah I ration the time,', bannerText: 'CROWN HEAVY!' },
  { line: 'Watch the hook on the two, weave left through the lane,', bannerText: 'HOOK ON BEAT TWO!' },
  { line: 'Twenty-foot subwoofers make the concrete climb.', bannerText: '20-FOOT WOOFERS!' },
  { line: 'Double-tap on the two-and rattling your frame!', bannerText: 'DOUBLE-TAP TWO-AND!' },
  { line: 'Throw a punch, throw a kick, boy I read your stance,', bannerText: 'READ YOUR STANCE!' },
  { line: 'Every strike warped tight to the boom-bap pocket,', bannerText: 'BOOM-BAP POCKET!' },
  { line: 'When the brass horns blast, put your hands in a trance.', bannerText: 'BRASS HORNS BLAST!' },
  { line: 'Verse one wrapping up—now the horn wings blow!', bannerText: 'HORN WINGS UNFOLD!' },
  // HOOK 1 (Bars 13-20, beats 48-79, 31.5s-52.8s)
  { line: 'Tick-tock! Step in the ring, you on borrowed time!', bannerText: 'BORROWED TIME!' },
  { line: 'Heavy charger winding up on the three—downbeat crime!', bannerText: 'CHARGER ON THE ONE!' },
  { line: 'Every snare drum hit is a heavyweight crime!', bannerText: 'HEAVYWEIGHT CRIME!' },
  { line: 'Shoulder check on the downbeat, shatter the line!', bannerText: 'DOWNBEAT CHARGE!' },
  { line: 'Speakerbox knockout, feel the pavement shake!', bannerText: 'SPEAKERBOX KNOCKOUT!' },
  { line: 'Enforcers double-tapping every breath that you take!', bannerText: 'ENFORCER DOUBLE-TAP!' },
  { line: 'How many more rounds can the challenger take?', bannerText: 'PAVEMENT SHAKE!' },
  { line: 'Gold strobes blazing while the barricades break!', bannerText: 'GOLD STROBE SURGE!' },
  // BREAKDOWN (Bars 21-24, beats 80-95, 52.8s-63.0s)
  { line: '[Instrumental Break — Cypher Breakdown & Fever Surge!]', bannerText: 'CYPHER BREAKDOWN!' },
  { line: 'Cut the bass, let the hi-hats sizzle in the pit,', bannerText: 'FEVER SURGE ×1.75!' },
  { line: 'Pop the Fever meter gold, let the chain catch fire,', bannerText: 'FEVER OVERDRIVE!' },
  { line: '[Turntable Backspin — DJ Kronos Leaps Into the Cypher Pit!]', bannerText: 'KRONOS IN THE PIT!' },
  // VERSE 2 (Bars 25-32, beats 96-127, 63.0s-84.0s)
  { line: 'Enough behind the booth, watch me hop in the pit,', bannerText: 'DOWN IN THE PIT!' },
  { line: 'Scratch combo one-two-three on the quarter-note grid,', bannerText: 'SCRATCH COMBO 1-2-3!' },
  { line: 'Chrome mic in my left, right hand heavy split.', bannerText: 'CHROME MIC!' },
  { line: 'Weave the third slash clean to pop the counter lid!', bannerText: 'COUNTER SLASH THREE!' },
  { line: 'Weave left, duck low, catch the bass in your chest,', bannerText: 'BASS IN YOUR CHEST!' },
  { line: 'Flankers pressing from the ropes, put your guard to the test.', bannerText: 'FLANKERS ON THE ROPES!' },
  { line: 'Whole neighborhood screaming out Kronos the best!', bannerText: 'KRONOS THE BEST!' },
  { line: 'Subwoofer banks charging for the final test!', bannerText: 'SUBWOOFERS CHARGING!' },
  // OUTRO (Bars 33-39, beats 128-155, 84.0s-101.632s)
  { line: "Time's up challenger, hear the final bell ring,", bannerText: 'FINAL BELL RING!' },
  { line: 'Subwoofer bass drop shaking the king!', bannerText: 'SUBWOOFER BASS DROP!' },
  { line: 'Kronos in the circle, bow down to the King!', bannerText: 'BOW TO THE KING!' },
  { line: 'Crimson shockwaves rolling every fourth bar down,', bannerText: 'CRIMSON SHOCKWAVE!' },
  { line: 'One last bass drop—brace for the blast!', bannerText: 'FINAL BASS DROP!' },
  { line: 'Penultimate clash, make the combo last!', bannerText: 'PENULTIMATE CLASH!' },
  { line: '[Outro — Bar 39 Beat-Drop Finisher: Jab · Cross · Uppercut · Speakerbox Slam!]', bannerText: 'KNOCKOUT FINISH!' }
];

function getFlowSectionForBarIndex(barIndex) {
  for (let i = 0; i < FLOW_SECTIONS.length; i++) {
    const s = FLOW_SECTIONS[i];
    if (barIndex >= s.startBarIndex && barIndex <= s.endBarIndex) {
      return s;
    }
  }
  return FLOW_SECTIONS[FLOW_SECTIONS.length - 1];
}

function getBarStartAndEndTimes(barIndex) {
  const startBeatIdx = barIndex * 4;
  const nextBarBeatIdx = (barIndex + 1) * 4;
  const startTime = barIndex === 0 ? 0.0 : KRONOS_BEAT_TIMES[startBeatIdx];
  const endTime = barIndex === KRONOS_TOTAL_BARS - 1
    ? KRONOS_FULL_DURATION
    : KRONOS_BEAT_TIMES[nextBarBeatIdx];
  return { startTime, endTime };
}

function buildFlowLightingCues() {
  const cues = [];
  for (let barIndex = 0; barIndex < KRONOS_TOTAL_BARS; barIndex++) {
    const sec = getFlowSectionForBarIndex(barIndex);
    const { startTime, endTime } = getBarStartAndEndTimes(barIndex);

    let paletteKey = sec.lightingPalette;
    let intensity = 0.72;
    let strobe = false;
    let strobeHz = 0;
    let bloom = 0.42;
    let spotlightMode = 'cypher_pulse';

    if (sec.id === 'intro') {
      paletteKey = (barIndex % 2 === 0) ? 'cyan' : 'magenta';
      intensity = 0.65 + barIndex * 0.03;
      bloom = 0.38;
      spotlightMode = 'warmup_sweep';
    } else if (sec.id === 'verse_1') {
      paletteKey = (barIndex % 3 === 0) ? 'cyan' : 'magenta';
      intensity = 0.80;
      bloom = 0.48;
      spotlightMode = 'cypher_pulse';
    } else if (sec.id === 'hook_1') {
      paletteKey = (barIndex % 2 === 0) ? 'gold' : 'magenta';
      intensity = 0.92;
      strobe = (barIndex % 2 === 1);
      strobeHz = strobe ? 3.07 : 0;
      bloom = 0.62;
      spotlightMode = 'wing_unfold_flood';
    } else if (sec.id === 'breakdown') {
      paletteKey = (barIndex % 2 === 0) ? 'magenta' : 'gold';
      intensity = 1.0;
      strobe = true;
      strobeHz = 6.13;
      bloom = 0.74;
      spotlightMode = 'fever_strobe';
    } else if (sec.id === 'verse_2') {
      paletteKey = (barIndex % 3 === 0) ? 'crimson' : 'cyan';
      intensity = 0.95;
      strobe = (barIndex % 4 === 3);
      strobeHz = strobe ? 3.07 : 0;
      bloom = 0.66;
      spotlightMode = 'boss_ring_lock';
    } else if (sec.id === 'outro') {
      const isFinisherBar = barIndex === KRONOS_TOTAL_BARS - 1;
      const isBassDropBar = ((barIndex - sec.startBarIndex) % 4) === 0;
      paletteKey = isFinisherBar ? 'gold' : (isBassDropBar ? 'crimson' : ((barIndex % 2 === 0) ? 'crimson' : 'gold'));
      intensity = isFinisherBar ? 1.25 : 1.05;
      strobe = isFinisherBar || isBassDropBar;
      strobeHz = isFinisherBar ? 6.13 : (isBassDropBar ? 3.07 : 0);
      bloom = isFinisherBar ? 0.88 : 0.76;
      spotlightMode = isFinisherBar ? 'finisher_supernova' : 'subwoofer_overdrive';
    }

    const paletteObj = LIGHTING_PALETTES[paletteKey] || LIGHTING_PALETTES.magenta;
    cues.push({
      barIndex,
      bar: barIndex + 1,
      section: sec.name,
      startTime,
      endTime,
      palette: paletteKey,
      primaryHex: paletteObj.primaryHex,
      secondaryHex: paletteObj.secondaryHex,
      accentHex: paletteObj.accentHex,
      intensity: Number(intensity.toFixed(2)),
      strobe,
      strobeHz,
      bloom: Number(bloom.toFixed(2)),
      spotlightMode
    });
  }
  return cues;
}

export const FLOW_LIGHTING_CUES = buildFlowLightingCues();

function buildFlowMovesetSyncMarkers() {
  const markers = [];
  let seq = 1;

  const beatTime = (barIdx, beatInBar) =>
    getSnappedBeatTime(barIdx * 4.0 + beatInBar, KRONOS_BEAT_TIMES, KRONOS_BEAT_SEC, KRONOS_FIRST_BEAT_OFFSET);

  const addMarker = ({
    barIndex,
    beatInBar,
    enemyArchetype,
    pattern,
    windupBeats = 1.0,
    counterSubdivision = 0.5,
    windupStartBarIndex = barIndex,
    windupStartBeatInBar = Math.max(0, beatInBar - windupBeats),
    step = 1,
    totalSteps = 1,
    label = ''
  }) => {
    const sec = getFlowSectionForBarIndex(barIndex);
    const globalBeatFloat = barIndex * 4.0 + beatInBar;
    const time = beatTime(barIndex, beatInBar);
    const windupStartTime = getSnappedBeatTime(
      Math.max(0, globalBeatFloat - windupBeats),
      KRONOS_BEAT_TIMES,
      KRONOS_BEAT_SEC,
      KRONOS_FIRST_BEAT_OFFSET
    );
    markers.push({
      id: `sync_${String(seq++).padStart(3, '0')}_b${barIndex + 1}_${pattern}`,
      barIndex,
      bar: barIndex + 1,
      section: sec.name,
      beatIndex: Math.floor(globalBeatFloat),
      beatInBar: Number(beatInBar.toFixed(2)),
      beatNumber: Number((beatInBar + 1.0).toFixed(2)),
      time,
      windupStartTime,
      windupStartBarIndex,
      windupStartBeatInBar: Number(windupStartBeatInBar.toFixed(2)),
      enemyArchetype,
      pattern,
      windupBeats,
      counterSubdivision,
      step,
      totalSteps,
      label: label || `${enemyArchetype}:${pattern}`
    });
  };

  for (let barIndex = 0; barIndex < KRONOS_TOTAL_BARS; barIndex++) {
    // 1. INTRO (Bars 1-4, barIndex 0..3): Hook-archetype Bruisers quick_hook on beat 2 (beatInBar: 1.0)
    if (barIndex >= 0 && barIndex <= 3) {
      addMarker({
        barIndex,
        beatInBar: 1.0,
        enemyArchetype: 'hook_brawler',
        pattern: 'quick_hook',
        windupBeats: 1.0,
        counterSubdivision: 0.5,
        label: 'Warm-up Hook on Beat 2'
      });
      continue;
    }

    // 2. VERSE 1 (Bars 5-12, barIndex 4..11): Wave 1 Bruisers (quick_hook on beat 2, double_tap on beat 2 & 2-and)
    if (barIndex >= 4 && barIndex <= 11) {
      if ((barIndex % 2) === 0) {
        addMarker({
          barIndex,
          beatInBar: 1.0,
          enemyArchetype: 'hook_brawler',
          pattern: 'quick_hook',
          windupBeats: 1.0,
          counterSubdivision: 0.5,
          label: 'Wave 1 Hook on Beat 2'
        });
      } else {
        addMarker({
          barIndex,
          beatInBar: 1.0,
          enemyArchetype: 'double_tap_striker',
          pattern: 'double_tap',
          windupBeats: 1.0,
          counterSubdivision: 0.5,
          step: 1,
          totalSteps: 2,
          label: 'Double-Tap [1/2] on Beat 2'
        });
        addMarker({
          barIndex,
          beatInBar: 1.5,
          enemyArchetype: 'double_tap_striker',
          pattern: 'double_tap',
          windupBeats: 0.5,
          counterSubdivision: 0.5,
          step: 2,
          totalSteps: 2,
          label: 'Double-Tap [2/2] on Beat 2-and'
        });
      }
      continue;
    }

    // 3. HOOK 1 (Bars 13-20, barIndex 12..19): Wave 2 Enforcers + Heavy Chargers
    // Heavy Charger winds up on beat 3 (beatInBar: 2.0) of bar k and lands on beat 1 (beatInBar: 0.0) of bar k+1
    if (barIndex >= 12 && barIndex <= 19) {
      if ((barIndex % 2) === 1) {
        addMarker({
          barIndex,
          beatInBar: 0.0,
          enemyArchetype: 'heavy_charger',
          pattern: 'charge',
          windupBeats: 2.0,
          counterSubdivision: 0.5,
          windupStartBarIndex: barIndex - 1,
          windupStartBeatInBar: 2.0,
          label: 'Heavy Charger Impact on Downbeat 1 (from prior Bar Beat 3)'
        });
      }
      if ((barIndex % 2) === 0) {
        addMarker({
          barIndex,
          beatInBar: 1.0,
          enemyArchetype: 'double_tap_striker',
          pattern: 'double_tap',
          windupBeats: 1.0,
          counterSubdivision: 0.5,
          step: 1,
          totalSteps: 2,
          label: 'Enforcer Double-Tap [1/2] on Beat 2'
        });
        addMarker({
          barIndex,
          beatInBar: 1.5,
          enemyArchetype: 'double_tap_striker',
          pattern: 'double_tap',
          windupBeats: 0.5,
          counterSubdivision: 0.5,
          step: 2,
          totalSteps: 2,
          label: 'Enforcer Double-Tap [2/2] on Beat 2-and'
        });
      } else {
        addMarker({
          barIndex,
          beatInBar: 1.0,
          enemyArchetype: 'hook_brawler',
          pattern: 'quick_hook',
          windupBeats: 1.0,
          counterSubdivision: 0.5,
          label: 'Enforcer Hook on Beat 2'
        });
      }
      continue;
    }

    // 4. BREAKDOWN (Bars 21-24, barIndex 20..23): Rapid double-tap syncs + Heavy Charger + Fever surge
    if (barIndex >= 20 && barIndex <= 23) {
      if (barIndex === 21 || barIndex === 23) {
        addMarker({
          barIndex,
          beatInBar: 0.0,
          enemyArchetype: 'heavy_charger',
          pattern: 'charge',
          windupBeats: 2.0,
          counterSubdivision: 0.5,
          windupStartBarIndex: barIndex - 1,
          windupStartBeatInBar: 2.0,
          label: 'Breakdown Heavy Charge on Downbeat 1'
        });
      }
      addMarker({
        barIndex,
        beatInBar: 1.0,
        enemyArchetype: 'double_tap_striker',
        pattern: 'double_tap',
        windupBeats: 1.0,
        counterSubdivision: 0.5,
        step: 1,
        totalSteps: 2,
        label: 'Breakdown Double-Tap [1/2] on Beat 2'
      });
      addMarker({
        barIndex,
        beatInBar: 1.5,
        enemyArchetype: 'double_tap_striker',
        pattern: 'double_tap',
        windupBeats: 0.5,
        counterSubdivision: 0.5,
        step: 2,
        totalSteps: 2,
        label: 'Breakdown Double-Tap [2/2] on Beat 2-and'
      });
      continue;
    }

    // 5. VERSE 2 (Bars 25-32, barIndex 24..31): DJ Kronos Boss Phase 1 (scratch_combo 3-hit syncs + Enforcer flankers)
    if (barIndex >= 24 && barIndex <= 31) {
      const relBar = barIndex - 24;
      if ((relBar % 2) === 0) {
        for (let hitIdx = 0; hitIdx < 3; hitIdx++) {
          addMarker({
            barIndex,
            beatInBar: hitIdx * 1.0,
            enemyArchetype: 'boss_kronos',
            pattern: 'scratch_combo',
            windupBeats: 1.0,
            counterSubdivision: 0.5,
            step: hitIdx + 1,
            totalSteps: 3,
            label: `DJ Kronos Scratch Combo [${hitIdx + 1}/3] on Beat ${hitIdx + 1}`
          });
        }
      } else if ((relBar % 4) === 1) {
        addMarker({
          barIndex,
          beatInBar: 1.0,
          enemyArchetype: 'double_tap_striker',
          pattern: 'double_tap',
          windupBeats: 1.0,
          counterSubdivision: 0.5,
          step: 1,
          totalSteps: 2,
          label: 'Flanker Double-Tap [1/2] on Beat 2'
        });
        addMarker({
          barIndex,
          beatInBar: 1.5,
          enemyArchetype: 'double_tap_striker',
          pattern: 'double_tap',
          windupBeats: 0.5,
          counterSubdivision: 0.5,
          step: 2,
          totalSteps: 2,
          label: 'Flanker Double-Tap [2/2] on Beat 2-and'
        });
      } else {
        addMarker({
          barIndex,
          beatInBar: 1.0,
          enemyArchetype: 'hook_brawler',
          pattern: 'quick_hook',
          windupBeats: 1.0,
          counterSubdivision: 0.5,
          label: 'Flanker Hook on Beat 2'
        });
      }
      continue;
    }

    // 6. OUTRO (Bars 33-38, barIndex 32..37): DJ Kronos Boss Phase 2 (Subwoofer bass_drop + scratch_combo + heavy_charger)
    if (barIndex >= 32 && barIndex <= 37) {
      const outroRel = barIndex - 32;
      if ((outroRel % 4) === 0) {
        addMarker({
          barIndex,
          beatInBar: 3.0,
          enemyArchetype: 'boss_kronos',
          pattern: 'bass_drop',
          windupBeats: 1.0,
          counterSubdivision: 0.5,
          windupStartBarIndex: barIndex,
          windupStartBeatInBar: 2.0,
          label: 'DJ Kronos Subwoofer Bass Drop on Beat 4'
        });
      } else if ((outroRel % 2) === 1) {
        for (let hitIdx = 0; hitIdx < 3; hitIdx++) {
          addMarker({
            barIndex,
            beatInBar: hitIdx * 1.0,
            enemyArchetype: 'boss_kronos',
            pattern: 'scratch_combo',
            windupBeats: 1.0,
            counterSubdivision: 0.5,
            step: hitIdx + 1,
            totalSteps: 3,
            label: `DJ Kronos Phase 2 Scratch Combo [${hitIdx + 1}/3]`
          });
        }
      } else {
        addMarker({
          barIndex,
          beatInBar: 0.0,
          enemyArchetype: 'heavy_charger',
          pattern: 'charge',
          windupBeats: 2.0,
          counterSubdivision: 0.5,
          windupStartBarIndex: barIndex - 1,
          windupStartBeatInBar: 2.0,
          label: 'Outro Heavy Charger on Downbeat 1'
        });
      }
      continue;
    }

    // Final Bar 39 (barIndex 38, beats 152-155): 4-beat Finisher Mini-Sequence (final_bar_finisher)
    if (barIndex === 38) {
      const finisherActions = ['jab', 'cross', 'uppercut-launch', 'speakerbox-slam'];
      for (let b = 0; b < 4; b++) {
        addMarker({
          barIndex: 38,
          beatInBar: b * 1.0,
          enemyArchetype: 'boss_kronos',
          pattern: 'final_bar_finisher',
          windupBeats: 0.5,
          counterSubdivision: 0.5,
          step: b + 1,
          totalSteps: 4,
          label: `Final Bar 39 Finisher Beat ${b + 1}: ${finisherActions[b]}`
        });
      }
    }
  }

  return markers;
}

export const FLOW_MOVESET_SYNC_MARKERS = buildFlowMovesetSyncMarkers();

// Final Bar 39 (barIndex 38, beats 152-155: 99.124s-101.632s) 4-beat beat-drop finisher sequence
export const FLOW_FINISHER_SEQUENCE = {
  id: 'final_bar_finisher',
  name: 'Final Bar 39 Beat-Drop Finisher Mini-Sequence',
  bar: 39,
  barIndex: 38,
  startTime: KRONOS_BEAT_TIMES[152], // 99.124s
  endTime: KRONOS_FULL_DURATION, // 101.632s
  replacesSRankInstakill: true,
  steps: [
    {
      step: 1,
      beat: 1,
      beatIndex: 152,
      beatInBar: 0.0,
      action: 'jab',
      clip: 'jab',
      time: KRONOS_BEAT_TIMES[152], // 99.124s
      label: 'BEAT 1: JAB',
      damageMult: 1.25
    },
    {
      step: 2,
      beat: 2,
      beatIndex: 153,
      beatInBar: 1.0,
      action: 'cross',
      clip: 'cross',
      time: KRONOS_BEAT_TIMES[153], // 99.788s
      label: 'BEAT 2: CROSS',
      damageMult: 1.5
    },
    {
      step: 3,
      beat: 3,
      beatIndex: 154,
      beatInBar: 2.0,
      action: 'uppercut-launch',
      clip: 'uppercut',
      time: KRONOS_BEAT_TIMES[154], // 100.431s
      label: 'BEAT 3: UPPERCUT-LAUNCH',
      damageMult: 2.0
    },
    {
      step: 4,
      beat: 4,
      beatIndex: 155,
      beatInBar: 3.0,
      action: 'speakerbox-slam',
      clip: 'kick',
      time: KRONOS_BEAT_TIMES[155], // 101.086s
      label: 'BEAT 4: SPEAKERBOX-SLAM',
      damageMult: 3.0,
      isKnockoutBlow: true
    }
  ]
};

export const FLOW_FEVER_CONFIG = {
  maxMeter: 100,
  gainOnPerfect: 14,
  gainOnGood: 8,
  gainOnCounter: 22,
  lossOnMiss: 10,
  lossOnDamage: 18,
  decayPerSec: 3.0,
  durationSec: Number((KRONOS_BAR_SEC * 4).toFixed(2)), // 10.43s (4 bars at 92 BPM)
  damageMultiplier: 1.5,
  breakdownSurgeMultiplier: 1.75
};

function buildFlowBars() {
  const bars = [];
  for (let barIndex = 0; barIndex < KRONOS_TOTAL_BARS; barIndex++) {
    const sec = getFlowSectionForBarIndex(barIndex);
    const { startTime, endTime } = getBarStartAndEndTimes(barIndex);
    const punchTime = KRONOS_BEAT_TIMES[barIndex * 4 + 2];
    const lyricEntry = FLOW_LYRIC_LINES[barIndex] || {
      line: `[Bar ${barIndex + 1} — ${sec.name}]`,
      bannerText: `${sec.name}!`
    };
    const lightingCue = FLOW_LIGHTING_CUES[barIndex];
    const barMarkers = FLOW_MOVESET_SYNC_MARKERS.filter((m) => m.barIndex === barIndex);

    bars.push({
      barIndex,
      bar: barIndex + 1,
      firstBeatIndex: barIndex * 4,
      lastBeatIndex: barIndex * 4 + 3,
      section: sec.name,
      sectionId: sec.id,
      phase: sec.phase,
      wave: sec.wave,
      bossPhase: sec.bossPhase,
      startTime,
      punchTime,
      endTime,
      line: lyricEntry.line,
      bannerText: lyricEntry.bannerText,
      lightingCue,
      movesetSyncMarkers: barMarkers,
      movesetSync: barMarkers
    });
  }
  return bars;
}

export const KRONOS_BARS = buildFlowBars();

export const FLOW_BPM_SECTIONS = [
  {
    startTime: 0.0,
    endTime: KRONOS_FULL_DURATION,
    bpm: KRONOS_BPM,
    beatSec: KRONOS_BEAT_SEC,
    firstBeatOffset: KRONOS_FIRST_BEAT_OFFSET
  }
];

export const FLOW_SUB_BEAT_GRID = buildSubBeatGrid(
  KRONOS_TOTAL_BEATS,
  KRONOS_BEAT_SEC,
  KRONOS_FIRST_BEAT_OFFSET,
  KRONOS_FULL_DURATION,
  KRONOS_BEAT_TIMES
);

// Dedicated instrumental charts for INST 1 (100.0 BPM, offset 0.45s, 67 complete beats <= 40.896s)
// and INST 2 (125.0 BPM, offset 0.37s, 84 complete beats <= 40.896s)
export const INST1_BARS = [
  { barIndex: 0, section: 'BRASS INTRO', phase: 'stage', startTime: 0.0, punchTime: 3.6, endTime: 4.8, line: '[Lyria 3.5 Instrumental 1 \u2014 Brass Fanfare & Boom-Bap Kick]', bannerText: 'BRASS FANFARE!', partial: false },
  { barIndex: 1, section: 'BRASS INTRO', phase: 'stage', startTime: 4.8, punchTime: 8.4, endTime: 9.6, line: '[Heavy Snare Pocket \u2014 Time Your Strikes to the Downbeat]', bannerText: 'SNARE POCKET!', partial: false },
  { barIndex: 2, section: 'CYPHER GROOVE', phase: 'stage', startTime: 9.6, punchTime: 13.2, endTime: 14.4, line: '[Subwoofer Bassline Rolling Through the Courtyard]', bannerText: 'SUBWOOFER ROLL!', partial: false },
  { barIndex: 3, section: 'CYPHER GROOVE', phase: 'stage', startTime: 14.4, punchTime: 18.0, endTime: 19.2, line: '[Double-Time Hi-Hats & Horn Stabs]', bannerText: 'HORN STABS!', partial: false },
  { barIndex: 4, section: 'HORN BREAK', phase: 'unfold', startTime: 19.2, punchTime: 22.8, endTime: 24.0, line: '[Speaker Wings Unfold \u2014 Syncopated Brass Breakdown]', bannerText: 'SPEAKER WINGS!', partial: false },
  { barIndex: 5, section: 'HORN BREAK', phase: 'unfold', startTime: 24.0, punchTime: 27.6, endTime: 28.8, line: '[808 Sub Drop & Crowd Clap Cadence]', bannerText: '808 SUB DROP!', partial: false },
  { barIndex: 6, section: 'BASS DROP', phase: 'ring', startTime: 28.8, punchTime: 32.4, endTime: 33.6, line: '[Full Sound-System Overdrive \u2014 Ring Showdown]', bannerText: 'OVERDRIVE!', partial: false },
  { barIndex: 7, section: 'OUTRO LOOP', phase: 'ring', startTime: 33.6, punchTime: 38.4, endTime: 40.896, line: '[Turnaround Brass Hit \u2014 Loop Point]', bannerText: 'TURNAROUND HIT!', partial: true, beatsInBar: 3 }
];

export const INST2_BARS = [
  { barIndex: 0, section: 'VINYL INTRO', phase: 'stage', startTime: 0.0, punchTime: 3.84, endTime: 5.12, line: '[Lyria 3.5 Instrumental 2 \u2014 Turntable Scratch & Sub Drop]', bannerText: 'VINYL SCRATCH!', partial: false },
  { barIndex: 1, section: 'VINYL INTRO', phase: 'stage', startTime: 5.12, punchTime: 8.96, endTime: 10.24, line: '[Crisp Breakbeat Snare \u2014 Step Into the Cypher]', bannerText: 'BREAKBEAT SNARE!', partial: false },
  { barIndex: 2, section: 'BREAKBEAT', phase: 'stage', startTime: 10.24, punchTime: 14.08, endTime: 15.36, line: '[Chopped Sample Stabs & Low-End Pulse]', bannerText: 'SAMPLE STABS!', partial: false },
  { barIndex: 3, section: 'BREAKBEAT', phase: 'stage', startTime: 15.36, punchTime: 19.2, endTime: 20.48, line: '[Crossfader Cuts Over Heavy Kick Drum]', bannerText: 'CROSSFADER CUTS!', partial: false },
  { barIndex: 4, section: 'SYNTH BASS', phase: 'unfold', startTime: 20.48, punchTime: 24.32, endTime: 25.6, line: '[Resonant Synth Bass & Horn Counterpoint]', bannerText: 'SYNTH BASS!', partial: false },
  { barIndex: 5, section: 'SYNTH BASS', phase: 'unfold', startTime: 25.6, punchTime: 29.44, endTime: 30.72, line: '[Percussion Breakdown \u2014 Counter on the Beat]', bannerText: 'COUNTER BEAT!', partial: false },
  { barIndex: 6, section: 'FINALE', phase: 'ring', startTime: 30.72, punchTime: 34.56, endTime: 35.84, line: '[Maximum VU Meter Drive \u2014 Cypher Climax]', bannerText: 'MAX VU DRIVE!', partial: false },
  { barIndex: 7, section: 'OUTRO CUTS', phase: 'ring', startTime: 35.84, punchTime: 39.68, endTime: 40.896, line: '[Final Scratch Flurry \u2014 Loop Point]', bannerText: 'SCRATCH FLURRY!', partial: true, beatsInBar: 3 }
];

function buildBoundedInstrumentalAssets({ bpm, beatSec, firstBeatOffset, fullDuration, phraseBars }) {
  // Drop any beat whose end (start + beatSec) exceeds fullDuration so no beat or sub-beat is scheduled past EOF
  const beatTimes = [];
  for (let i = 0; ; i++) {
    const start = Number((firstBeatOffset + i * beatSec).toFixed(3));
    const end = Number((start + beatSec).toFixed(3));
    if (end > fullDuration + 1e-6) break;
    beatTimes.push(start);
  }
  const totalBeats = beatTimes.length;
  const totalBars = Math.ceil(totalBeats / 4);
  const subBeatGrid = buildSubBeatGrid(totalBeats, beatSec, firstBeatOffset, fullDuration, beatTimes);

  const sections = phraseBars.map((b, idx) => ({
    id: b.section.toLowerCase().replace(/\s+/g, '_'),
    name: b.section,
    phase: b.phase,
    startBar: idx * 2 + 1,
    endBar: Math.min(totalBars, (idx + 1) * 2),
    startBarIndex: idx * 2,
    endBarIndex: Math.min(totalBars - 1, idx * 2 + 1),
    startTime: b.startTime,
    endTime: Math.min(fullDuration, b.endTime),
    partial: Boolean(b.partial)
  }));

  const lightingCues = [];
  const movesetSyncMarkers = [];
  for (let barIndex = 0; barIndex < totalBars; barIndex++) {
    const firstBeatIndex = barIndex * 4;
    const remainingBeats = totalBeats - firstBeatIndex;
    const beatsInBar = Math.min(4, remainingBeats);
    const isPartialBar = beatsInBar < 4 || barIndex === totalBars - 1;
    const barStart = barIndex === 0 ? 0.0 : beatTimes[firstBeatIndex];
    const nextBarFirstBeat = (barIndex + 1) * 4;
    const rawBarEnd = nextBarFirstBeat < totalBeats
      ? beatTimes[nextBarFirstBeat]
      : Number((beatTimes[totalBeats - 1] + beatSec).toFixed(3));
    const barEnd = Math.min(fullDuration, rawBarEnd);

    const paletteKey = barIndex < 6 ? 'cyan' : (barIndex < 12 ? 'magenta' : 'gold');
    const paletteObj = LIGHTING_PALETTES[paletteKey] || LIGHTING_PALETTES.magenta;
    lightingCues.push({
      barIndex,
      bar: barIndex + 1,
      section: barIndex < 6 ? 'INTRO' : (barIndex < 12 ? 'GROOVE' : 'FINALE'),
      sectionId: barIndex < 6 ? 'intro' : (barIndex < 12 ? 'groove' : 'finale'),
      startTime: barStart,
      endTime: barEnd,
      beatsInBar,
      partial: isPartialBar,
      palette: paletteKey,
      primaryHex: paletteObj.primaryHex,
      secondaryHex: paletteObj.secondaryHex,
      accentHex: paletteObj.accentHex,
      intensity: barIndex < 6 ? 0.72 : (barIndex < 12 ? 0.88 : 1.05),
      strobe: barIndex >= 12,
      strobeHz: barIndex >= 12 ? 3.07 : 0,
      bloom: barIndex < 6 ? 0.42 : (barIndex < 12 ? 0.58 : 0.76),
      spotlightMode: barIndex < 6 ? 'warmup_sweep' : (barIndex < 12 ? 'cypher_pulse' : 'subwoofer_overdrive')
    });

    // Schedule 1 sync marker on Beat 2 (beatInBar: 1.0) if that beat exists and its window stays <= fullDuration
    if (beatsInBar >= 2) {
      const targetBeatIdx = firstBeatIndex + 1;
      const strikeTime = beatTimes[targetBeatIdx];
      const windupStartTime = beatTimes[firstBeatIndex];
      const counterWindowStart = Number(((windupStartTime + strikeTime) * 0.5).toFixed(3));
      const counterWindowEnd = Number(Math.min(fullDuration, strikeTime + 0.065).toFixed(3));
      if (strikeTime <= fullDuration && counterWindowEnd <= fullDuration) {
        movesetSyncMarkers.push({
          id: `sync_bar${barIndex + 1}_beat2_quick_hook_1`,
          bar: barIndex + 1,
          barIndex,
          beat: 2.0,
          beatInBar: 1.0,
          beatIndex: targetBeatIdx,
          time: strikeTime,
          section: barIndex < 6 ? 'INTRO' : (barIndex < 12 ? 'GROOVE' : 'FINALE'),
          sectionId: barIndex < 6 ? 'intro' : (barIndex < 12 ? 'groove' : 'finale'),
          phase: barIndex < 6 ? 'stage' : (barIndex < 12 ? 'unfold' : 'ring'),
          wave: barIndex < 6 ? 1 : (barIndex < 12 ? 2 : 3),
          bossPhase: barIndex < 12 ? 0 : 1,
          enemyArchetype: 'hook_brawler',
          pattern: 'quick_hook',
          action: 'hook',
          clip: 'hook',
          windupBeats: 1.0,
          windupStartTime,
          counterSubdivision: 0.5,
          counterWindowStart,
          counterWindowEnd,
          step: 1,
          totalSteps: 1,
          damageMult: 1.0,
          feverGainBonus: 22,
          partial: isPartialBar,
          label: `Bar ${barIndex + 1} Hook on Beat 2`
        });
      }
    }
  }

  // Anchor 4-beat finisher sequence to the last complete 4-beat bar before fullDuration
  const finisherBarIndex = Math.max(0, Math.floor((totalBeats - 4) / 4));
  const finisherFirstBeat = finisherBarIndex * 4;
  const finisherSequence = {
    id: 'final_bar_finisher',
    name: `Bar ${finisherBarIndex + 1} Beat-Drop Finisher Mini-Sequence`,
    bar: finisherBarIndex + 1,
    barIndex: finisherBarIndex,
    startTime: beatTimes[finisherFirstBeat],
    endTime: Math.min(fullDuration, Number((beatTimes[finisherFirstBeat + 3] + beatSec).toFixed(3))),
    replacesSRankInstakill: true,
    steps: [
      { step: 1, beat: 1, beatIndex: finisherFirstBeat, beatInBar: 0.0, action: 'jab', clip: 'jab', time: beatTimes[finisherFirstBeat], label: 'BEAT 1: JAB', damageMult: 1.25 },
      { step: 2, beat: 2, beatIndex: finisherFirstBeat + 1, beatInBar: 1.0, action: 'cross', clip: 'cross', time: beatTimes[finisherFirstBeat + 1], label: 'BEAT 2: CROSS', damageMult: 1.5 },
      { step: 3, beat: 3, beatIndex: finisherFirstBeat + 2, beatInBar: 2.0, action: 'uppercut-launch', clip: 'uppercut', time: beatTimes[finisherFirstBeat + 2], label: 'BEAT 3: UPPERCUT-LAUNCH', damageMult: 2.0 },
      { step: 4, beat: 4, beatIndex: finisherFirstBeat + 3, beatInBar: 3.0, action: 'speakerbox-slam', clip: 'kick', time: beatTimes[finisherFirstBeat + 3], label: 'BEAT 4: SPEAKERBOX-SLAM', damageMult: 3.0, isKnockoutBlow: true }
    ]
  };

  return {
    bpm,
    beatTimes,
    totalBeats,
    totalBars,
    subBeatGrid,
    sections,
    lightingCues,
    movesetSyncMarkers,
    finisherSequence
  };
}

const INST1_ASSETS = buildBoundedInstrumentalAssets({
  bpm: 100.0,
  beatSec: 0.6,
  firstBeatOffset: 0.45,
  fullDuration: 40.896,
  phraseBars: INST1_BARS
});

const INST2_ASSETS = buildBoundedInstrumentalAssets({
  bpm: 125.0,
  beatSec: 0.48,
  firstBeatOffset: 0.37,
  fullDuration: 40.896,
  phraseBars: INST2_BARS
});

export const KRONOS_TRACK_CHARTS = {
  'flow': {
    id: 'flow',
    url: './assets/kronos-flow.mp3',
    label: 'LYRIA 3.5 BOSS TRACK',
    shortLabel: 'RAP',
    bpm: KRONOS_BPM,
    beatSec: KRONOS_BEAT_SEC,
    barSec: KRONOS_BAR_SEC,
    firstBeatOffset: KRONOS_FIRST_BEAT_OFFSET,
    loopDuration: KRONOS_LOOP_DURATION,
    fullDuration: KRONOS_FULL_DURATION,
    totalBars: KRONOS_TOTAL_BARS,
    totalBeats: KRONOS_TOTAL_BEATS,
    moduloOnly: false,
    beatTimes: KRONOS_BEAT_TIMES,
    bars: KRONOS_BARS,
    bpmSections: FLOW_BPM_SECTIONS,
    subBeatGrid: FLOW_SUB_BEAT_GRID,
    sections: FLOW_SECTIONS,
    movesetSyncMarkers: FLOW_MOVESET_SYNC_MARKERS,
    movesetSync: FLOW_MOVESET_SYNC_MARKERS,
    lightingCues: FLOW_LIGHTING_CUES,
    finisherSequence: FLOW_FINISHER_SEQUENCE,
    feverConfig: FLOW_FEVER_CONFIG,
    enemyArchetypes: KRONOS_ENEMY_ARCHETYPES
  },
  'inst-1': {
    id: 'inst-1',
    url: './assets/kronos-lyria-inst-1.mp3',
    label: 'LYRIA 3.5 BRASS INST 1',
    shortLabel: 'INST 1',
    bpm: 100.0,
    beatSec: 0.6,
    barSec: 2.4,
    firstBeatOffset: 0.45,
    loopDuration: 40.896,
    fullDuration: 40.896,
    totalBars: INST1_ASSETS.totalBars,
    totalBeats: INST1_ASSETS.totalBeats,
    moduloOnly: true,
    beatTimes: INST1_ASSETS.beatTimes,
    bars: INST1_BARS,
    bpmSections: [{ startTime: 0.0, endTime: 40.896, bpm: 100.0, beatSec: 0.6, firstBeatOffset: 0.45 }],
    subBeatGrid: INST1_ASSETS.subBeatGrid,
    sections: INST1_ASSETS.sections,
    movesetSyncMarkers: INST1_ASSETS.movesetSyncMarkers,
    movesetSync: INST1_ASSETS.movesetSyncMarkers,
    lightingCues: INST1_ASSETS.lightingCues,
    finisherSequence: INST1_ASSETS.finisherSequence,
    feverConfig: FLOW_FEVER_CONFIG
  },
  'inst-2': {
    id: 'inst-2',
    url: './assets/kronos-lyria-inst-2.mp3',
    label: 'LYRIA 3.5 SCRATCH INST 2',
    shortLabel: 'INST 2',
    bpm: 125.0,
    beatSec: 0.48,
    barSec: 1.92,
    firstBeatOffset: 0.37,
    loopDuration: 40.896,
    fullDuration: 40.896,
    totalBars: INST2_ASSETS.totalBars,
    totalBeats: INST2_ASSETS.totalBeats,
    moduloOnly: true,
    beatTimes: INST2_ASSETS.beatTimes,
    bars: INST2_BARS,
    bpmSections: [{ startTime: 0.0, endTime: 40.896, bpm: 125.0, beatSec: 0.48, firstBeatOffset: 0.37 }],
    subBeatGrid: INST2_ASSETS.subBeatGrid,
    sections: INST2_ASSETS.sections,
    movesetSyncMarkers: INST2_ASSETS.movesetSyncMarkers,
    movesetSync: INST2_ASSETS.movesetSyncMarkers,
    lightingCues: INST2_ASSETS.lightingCues,
    finisherSequence: INST2_ASSETS.finisherSequence,
    feverConfig: FLOW_FEVER_CONFIG
  }
};

/**
 * Offline onset-envelope autocorrelation BPM and phase estimator for user-loaded audio files.
 * Computes half-wave rectified energy flux at ~200 Hz envelope rate and searches 72-160 BPM.
 */
export function estimateBpmFromAudioBuffer(audioBuffer) {
  if (!audioBuffer || typeof audioBuffer.getChannelData !== 'function') {
    return { bpm: 92.0, offset: 0.0, duration: 60.0 };
  }
  const sampleRate = audioBuffer.sampleRate || 44100;
  const ch0 = audioBuffer.getChannelData(0);
  const duration = audioBuffer.duration || (ch0.length / sampleRate);
  const envRate = 200; // 5 ms hop
  const hop = Math.max(1, Math.floor(sampleRate / envRate));
  const maxSeconds = Math.min(duration, 45.0);
  const numFrames = Math.floor((maxSeconds * sampleRate) / hop);
  if (numFrames < envRate * 2) {
    return { bpm: 92.0, offset: 0.0, duration };
  }

  const onset = new Float32Array(numFrames);
  let prevEnergy = 0;
  for (let i = 0; i < numFrames; i++) {
    const start = i * hop;
    let sum = 0;
    for (let j = 0; j < hop; j++) {
      const s = ch0[start + j] || 0;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / hop);
    const diff = rms - prevEnergy;
    onset[i] = diff > 0 ? diff : 0;
    prevEnergy = rms;
  }

  let bestLag = Math.round((60.0 / 92.0) * envRate);
  let bestScore = -1;
  const minLag = Math.round((60.0 / 156.0) * envRate);
  const maxLag = Math.round((60.0 / 74.0) * envRate);

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < numFrames - lag; i++) {
      corr += onset[i] * onset[i + lag];
    }
    // Slight perceptual prior centered near hip-hop/brawler tempo (90-115 BPM)
    const bpmCand = (60.0 * envRate) / lag;
    const weight = 1.0 - 0.12 * Math.min(1.0, Math.abs(bpmCand - 96.0) / 60.0);
    const weighted = corr * weight;
    if (weighted > bestScore) {
      bestScore = weighted;
      bestLag = lag;
    }
  }

  const rawBpm = (60.0 * envRate) / bestLag;
  const bpm = Math.round(rawBpm * 2) / 2;

  // Estimate first beat phase offset within [0, beatSec)
  let bestPhaseBin = 0;
  let bestPhaseSum = -1;
  for (let p = 0; p < bestLag; p++) {
    let sum = 0;
    for (let idx = p; idx < numFrames; idx += bestLag) {
      sum += onset[idx];
    }
    if (sum > bestPhaseSum) {
      bestPhaseSum = sum;
      bestPhaseBin = p;
    }
  }
  const offset = bestPhaseBin / envRate;
  return { bpm, offset, duration };
}

export function buildCustomTrackChart(fileName, bpm = 92.0, offset = 0.0, duration = 60.0) {
  const cleanName = String(fileName || 'CUSTOM TRACK').replace(/\.[^/.]+$/, '').slice(0, 24).toUpperCase();
  const safeBpm = Math.max(40.0, Math.min(240.0, Number(bpm) || 92.0));
  const safeOffset = Math.max(0.0, Number(offset) || 0.0);
  const safeDuration = Math.max(4.0, Number(duration) || 60.0);
  const beatSec = 60.0 / safeBpm;
  const barSec = beatSec * 4.0;
  const totalBars = Math.max(1, Math.ceil(safeDuration / barSec));
  const totalBeats = totalBars * 4;

  const sectionNames = ['INTRO', 'VERSE 1', 'HOOK 1', 'BREAKDOWN', 'VERSE 2', 'OUTRO'];
  const sectionRatios = [
    [0.0, 0.10, 1, null, 'cyan'],
    [0.10, 0.31, 1, null, 'magenta'],
    [0.31, 0.52, 2, null, 'gold'],
    [0.52, 0.62, 2, null, 'magenta'],
    [0.62, 0.82, 3, 1, 'cyan'],
    [0.82, 1.0, 3, 2, 'crimson']
  ];

  const sections = sectionNames.map((name, idx) => {
    const [r0, r1, wave, bossPhase, palette] = sectionRatios[idx];
    const startBarIndex = Math.min(totalBars - 1, Math.floor(r0 * totalBars));
    const endBarIndex = Math.max(startBarIndex, Math.min(totalBars - 1, Math.ceil(r1 * totalBars) - 1));
    const startTime = Number((startBarIndex * barSec).toFixed(2));
    const endTime = Number(Math.min(safeDuration, (endBarIndex + 1) * barSec).toFixed(2));
    const archetype = idx === 0 ? 'hook_brawler' : (idx <= 3 ? 'double_tap_striker' : 'boss_kronos');
    return {
      id: name.toLowerCase().replace(/\s+/g, '_'),
      name,
      startBar: startBarIndex + 1,
      endBar: endBarIndex + 1,
      startBarIndex,
      endBarIndex,
      firstBeatIndex: startBarIndex * 4,
      lastBeatIndex: endBarIndex * 4 + 3,
      startTime,
      endTime,
      phase: wave === 1 ? 'stage' : (wave === 2 ? 'unfold' : 'ring'),
      wave,
      bossPhase,
      feverSurge: name === 'BREAKDOWN' || name === 'OUTRO',
      feverGainMultiplier: name === 'BREAKDOWN' ? 1.75 : 1.0,
      lightingPalette: palette,
      spawnQueue: [
        {
          id: `custom_spawn_${idx + 1}`,
          bar: startBarIndex + 1,
          barIndex: startBarIndex,
          beatInBar: 0.0,
          time: Number((safeOffset + startBarIndex * barSec).toFixed(4)),
          enemyArchetype: archetype,
          count: wave === 3 ? 1 : 2,
          hp: 130
        }
      ]
    };
  });

  const lightingCues = [];
  const movesetSyncMarkers = [];
  const bars = [];
  const paletteKeys = ['cyan', 'magenta', 'gold', 'crimson'];

  for (let i = 0; i < totalBars; i++) {
    const startTime = Number((i * barSec).toFixed(2));
    const endTime = Number(Math.min(safeDuration, (i + 1) * barSec).toFixed(2));
    const sec = sections.find((s) => i >= s.startBarIndex && i <= s.endBarIndex) || sections[sections.length - 1];
    const paletteKey = paletteKeys[i % paletteKeys.length];
    const paletteObj = LIGHTING_PALETTES[paletteKey];
    const cue = {
      barIndex: i,
      bar: i + 1,
      section: sec.name,
      startTime,
      endTime,
      palette: paletteKey,
      primaryHex: paletteObj.primaryHex,
      secondaryHex: paletteObj.secondaryHex,
      accentHex: paletteObj.accentHex,
      intensity: 0.85,
      strobe: (i % 4) === 3,
      strobeHz: (i % 4) === 3 ? 3.07 : 0,
      bloom: 0.55,
      spotlightMode: 'custom_cypher'
    };
    lightingCues.push(cue);

    const archetypeKey = (i % 3 === 0)
      ? 'hook_brawler'
      : ((i % 3 === 1) ? 'double_tap_striker' : 'heavy_charger');
    const patternKey = archetypeKey === 'hook_brawler'
      ? 'quick_hook'
      : (archetypeKey === 'double_tap_striker' ? 'double_tap' : 'charge');
    const beatInBar = archetypeKey === 'heavy_charger' ? 0.0 : 1.0;
    const marker = {
      id: `custom_sync_b${i + 1}_${patternKey}`,
      barIndex: i,
      bar: i + 1,
      section: sec.name,
      beatInBar,
      beatNumber: beatInBar + 1.0,
      time: Number((safeOffset + (i * 4.0 + beatInBar) * beatSec).toFixed(4)),
      enemyArchetype: archetypeKey,
      pattern: patternKey,
      windupBeats: archetypeKey === 'heavy_charger' ? 2.0 : 1.0,
      counterSubdivision: 0.5
    };
    movesetSyncMarkers.push(marker);

    bars.push({
      barIndex: i,
      bar: i + 1,
      section: sec.name,
      phase: i < totalBars * 0.35 ? 'stage' : (i < totalBars * 0.65 ? 'unfold' : 'ring'),
      wave: sec.wave,
      bossPhase: sec.bossPhase,
      startTime,
      punchTime: Number((startTime + barSec * 0.75).toFixed(2)),
      endTime,
      line: `[${cleanName} \u2014 ${safeBpm} BPM Modulo Beat Grid]`,
      bannerText: `${cleanName}!`,
      lightingCue: cue,
      movesetSyncMarkers: [marker],
      movesetSync: [marker]
    });
  }

  const lastBarStart = Number(((totalBars - 1) * barSec).toFixed(2));
  const finisherSequence = {
    id: 'final_bar_finisher',
    name: 'Final Bar Finisher Mini-Sequence',
    bar: totalBars,
    barIndex: totalBars - 1,
    startTime: lastBarStart,
    endTime: safeDuration,
    replacesSRankInstakill: true,
    steps: [
      { step: 1, beat: 1, beatInBar: 0.0, action: 'jab', clip: 'jab', time: Number((lastBarStart).toFixed(4)) },
      { step: 2, beat: 2, beatInBar: 1.0, action: 'cross', clip: 'cross', time: Number((lastBarStart + beatSec).toFixed(4)) },
      { step: 3, beat: 3, beatInBar: 2.0, action: 'uppercut-launch', clip: 'uppercut', time: Number((lastBarStart + beatSec * 2).toFixed(4)) },
      { step: 4, beat: 4, beatInBar: 3.0, action: 'speakerbox-slam', clip: 'kick', time: Number((lastBarStart + beatSec * 3).toFixed(4)), isKnockoutBlow: true }
    ]
  };

  return {
    id: 'custom',
    url: null,
    label: `CUSTOM: ${cleanName}`,
    shortLabel: cleanName.slice(0, 10),
    bpm: safeBpm,
    beatSec: Number(beatSec.toFixed(6)),
    barSec: Number(barSec.toFixed(6)),
    firstBeatOffset: safeOffset,
    loopDuration: safeDuration,
    fullDuration: safeDuration,
    totalBars,
    totalBeats,
    moduloOnly: true,
    beatTimes: null,
    bars,
    bpmSections: [
      {
        startTime: 0.0,
        endTime: safeDuration,
        bpm: safeBpm,
        beatSec: Number(beatSec.toFixed(6)),
        firstBeatOffset: safeOffset
      }
    ],
    subBeatGrid: buildSubBeatGrid(totalBeats, beatSec, safeOffset, safeDuration),
    sections,
    movesetSyncMarkers,
    movesetSync: movesetSyncMarkers,
    lightingCues,
    finisherSequence,
    feverConfig: FLOW_FEVER_CONFIG
  };
}

/**
 * Returns the structured musical section descriptor active at `songTime`.
 */
export function getSectionAtTime(chart, songTime) {
  const activeChart = (chart && Array.isArray(chart.sections)) ? chart : KRONOS_TRACK_CHARTS.flow;
  if (songTime === null || songTime === undefined || Number.isNaN(Number(songTime))) {
    return null;
  }
  const sections = activeChart.sections || FLOW_SECTIONS;
  if (!sections.length) return null;

  const duration = activeChart.fullDuration || activeChart.loopDuration || KRONOS_FULL_DURATION;
  const clampedTime = Math.max(0.0, Math.min(duration, Number(songTime)));

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const isLast = i === sections.length - 1;
    if (clampedTime >= sec.startTime && (clampedTime < sec.endTime || (isLast && clampedTime <= sec.endTime))) {
      return sec;
    }
  }
  return sections[sections.length - 1];
}

/**
 * Returns all enemy movesetSyncMarkers whose impact `time` falls within `[t0, t1]` inclusive.
 */
export function getMovesetMarkersInWindow(chart, t0, t1) {
  const activeChart = (chart && Array.isArray(chart.movesetSyncMarkers)) ? chart : KRONOS_TRACK_CHARTS.flow;
  const markers = activeChart.movesetSyncMarkers || FLOW_MOVESET_SYNC_MARKERS;
  const start = Math.min(Number(t0) || 0, Number(t1) || 0);
  const end = Math.max(Number(t0) || 0, Number(t1) || 0);
  return markers.filter((m) => m && typeof m.time === 'number' && m.time >= start && m.time <= end);
}

/**
 * Returns the per-bar lighting cue active at `songTime`.
 */
export function getLightingCueAtTime(chart, songTime) {
  const activeChart = (chart && Array.isArray(chart.lightingCues)) ? chart : KRONOS_TRACK_CHARTS.flow;
  if (songTime === null || songTime === undefined || Number.isNaN(Number(songTime))) {
    return null;
  }
  const cues = activeChart.lightingCues || FLOW_LIGHTING_CUES;
  if (!cues.length) return null;

  const duration = activeChart.fullDuration || activeChart.loopDuration || KRONOS_FULL_DURATION;
  const clampedTime = Math.max(0.0, Math.min(duration, Number(songTime)));

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const isLast = i === cues.length - 1;
    if (clampedTime >= cue.startTime && (clampedTime < cue.endTime || (isLast && clampedTime <= cue.endTime))) {
      return cue;
    }
  }
  return cues[cues.length - 1];
}

/**
 * Computes end-of-run results summary reporting Just-Timing %, Full Combo status,
 * letter rank (S / A / B / C / D), total judged presses, and score breakdown.
 */
export function computeRunResultsSummary({
  perfectHits = 0,
  onBeatHits = 0,
  missedPresses = 0,
  confirmedHits,
  maxCombo = 0,
  damageTaken = 0,
  feverActivations = 0
} = {}) {
  const pHits = Math.max(0, Math.round(Number(perfectHits) || 0));
  const gHits = Math.max(0, Math.round(Number(onBeatHits) || 0));
  const mPresses = Math.max(0, Math.round(Number(missedPresses) || 0));
  const cHits = confirmedHits !== undefined
    ? Math.max(0, Math.round(Number(confirmedHits) || 0))
    : (pHits + gHits);
  const peakCombo = Math.max(0, Math.round(Number(maxCombo) || 0));
  const dmgTaken = Math.max(0, Number(damageTaken) || 0);
  const fevers = Math.max(0, Math.round(Number(feverActivations) || 0));

  const onBeatTotal = Math.max(pHits + gHits, cHits);
  const totalJudged = onBeatTotal + mPresses;

  const justTimingPct = totalJudged > 0
    ? Number(((pHits / totalJudged) * 100.0).toFixed(1))
    : 0.0;
  const onBeatPct = totalJudged > 0
    ? Number(((onBeatTotal / totalJudged) * 100.0).toFixed(1))
    : 0.0;

  const comboUnbroken = peakCombo > 0 ? peakCombo >= onBeatTotal : true;
  const fullCombo = Boolean(totalJudged > 0 && mPresses === 0 && dmgTaken <= 0 && comboUnbroken);

  const perfectScore = pHits * 300;
  const onBeatScore = Math.max(0, onBeatTotal - pHits) * 150;
  const comboBonus = peakCombo * 75;
  const feverBonus = fevers * 500;
  const fullComboBonus = fullCombo ? 2500 : 0;
  const noDamageBonus = (totalJudged > 0 && dmgTaken <= 0) ? 1500 : 0;
  const damagePenalty = Math.round(dmgTaken * 25);
  const totalScore = Math.max(
    0,
    perfectScore + onBeatScore + comboBonus + feverBonus + fullComboBonus + noDamageBonus - damagePenalty
  );

  let rank = 'D';
  if (totalJudged > 0) {
    if (justTimingPct >= 75.0 && (fullCombo || dmgTaken <= 25)) {
      rank = 'S';
    } else if (justTimingPct >= 55.0 || (justTimingPct >= 48.0 && fullCombo)) {
      rank = 'A';
    } else if (justTimingPct >= 35.0 || onBeatPct >= 70.0) {
      rank = 'B';
    } else if (justTimingPct >= 15.0 || onBeatPct >= 40.0) {
      rank = 'C';
    }
  }

  return {
    justTimingPct,
    fullCombo,
    rank,
    totalJudged,
    scoreBreakdown: {
      perfectHits: pHits,
      onBeatHits: gHits,
      confirmedHits: cHits,
      missedPresses: mPresses,
      maxCombo: peakCombo,
      damageTaken: dmgTaken,
      feverActivations: fevers,
      justTimingPct,
      onBeatPct,
      perfectScore,
      onBeatScore,
      comboBonus,
      feverBonus,
      fullComboBonus,
      noDamageBonus,
      damagePenalty,
      totalScore,
      rankLabel: `${rank}-RANK`
    }
  };
}
