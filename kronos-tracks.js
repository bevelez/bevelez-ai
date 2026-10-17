// Calibrated Beat-Warping & Per-Track Charts for DJ KRONOS (Flow Rap, Lyria INST 1, Lyria INST 2, and Custom Offline BPM Estimator)
export const KRONOS_BPM = 92.0;
export const KRONOS_BEAT_OFFSET = 0.007;
export const KRONOS_FIRST_BEAT_OFFSET = 0.007;
export const KRONOS_BEAT_SEC = 0.65217;
export const KRONOS_BAR_SEC = 2.6087;
export const KRONOS_LOOP_DURATION = 101.632;

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

export const KRONOS_BARS = [
  { barIndex: 0, section: 'INTRO', phase: 'stage', startTime: 0.0, punchTime: 3.6, endTime: 5.5, line: 'Check the gold watch swinging, ninety-four on the dial,', bannerText: '94 ON THE DIAL!' },
  { barIndex: 1, section: 'INTRO', phase: 'stage', startTime: 5.5, punchTime: 8.7, endTime: 10.5, line: "Step inside of my cypher, you ain't lasting a while.", bannerText: 'STEP IN THE CYPHER!' },
  { barIndex: 2, section: 'VERSE 1', phase: 'stage', startTime: 10.5, punchTime: 13.8, endTime: 15.5, line: 'Crown heavy on the decks, yeah I ration the time,', bannerText: 'CROWN HEAVY!' },
  { barIndex: 3, section: 'VERSE 1', phase: 'stage', startTime: 15.5, punchTime: 19.1, endTime: 21.0, line: 'Twenty-foot subwoofers make the concrete climb.', bannerText: '20-FOOT WOOFERS!' },
  { barIndex: 4, section: 'VERSE 1', phase: 'stage', startTime: 21.0, punchTime: 24.3, endTime: 26.5, line: 'Throw a punch, throw a kick, boy I read your stance,', bannerText: 'READ YOUR STANCE!' },
  { barIndex: 5, section: 'VERSE 1', phase: 'stage', startTime: 26.5, punchTime: 29.6, endTime: 31.5, line: 'When the brass horns blast, put your hands in a trance.', bannerText: 'BRASS HORNS BLAST!' },
  { barIndex: 6, section: 'HOOK', phase: 'unfold', startTime: 31.5, punchTime: 34.6, endTime: 36.5, line: 'Tick-tock! Step in the ring, you on borrowed time!', bannerText: 'BORROWED TIME!' },
  { barIndex: 7, section: 'HOOK', phase: 'unfold', startTime: 36.5, punchTime: 39.8, endTime: 42.0, line: 'Every snare drum hit is a heavyweight crime!', bannerText: 'HEAVYWEIGHT CRIME!' },
  { barIndex: 8, section: 'HOOK', phase: 'unfold', startTime: 42.0, punchTime: 45.2, endTime: 47.0, line: 'Speakerbox knockout, feel the pavement shake!', bannerText: 'SPEAKERBOX KNOCKOUT!' },
  { barIndex: 9, section: 'HOOK', phase: 'unfold', startTime: 47.0, punchTime: 50.4, endTime: 52.8, line: 'How many more rounds can the challenger take?', bannerText: 'PAVEMENT SHAKE!' },
  { barIndex: 10, section: 'BRIDGE', phase: 'ring', startTime: 52.8, punchTime: 58.0, endTime: 63.0, line: '[Instrumental Break \u2014 DJ Kronos Leaps Into the Cypher Pit!]', bannerText: 'KRONOS IN THE PIT!' },
  { barIndex: 11, section: 'VERSE 2', phase: 'ring', startTime: 63.0, punchTime: 66.2, endTime: 68.2, line: 'Enough behind the booth, watch me hop in the pit,', bannerText: 'DOWN IN THE PIT!' },
  { barIndex: 12, section: 'VERSE 2', phase: 'ring', startTime: 68.2, punchTime: 71.3, endTime: 73.5, line: 'Chrome mic in my left, right hand heavy split.', bannerText: 'CHROME MIC!' },
  { barIndex: 13, section: 'VERSE 2', phase: 'ring', startTime: 73.5, punchTime: 76.8, endTime: 78.6, line: 'Weave left, duck low, catch the bass in your chest,', bannerText: 'BASS IN YOUR CHEST!' },
  { barIndex: 14, section: 'VERSE 2', phase: 'ring', startTime: 78.6, punchTime: 82.2, endTime: 84.0, line: 'Whole neighborhood screaming out Kronos the best!', bannerText: 'KRONOS THE BEST!' },
  { barIndex: 15, section: 'OUTRO', phase: 'ring', startTime: 84.0, punchTime: 87.6, endTime: 89.6, line: "Time's up challenger, hear the final bell ring,", bannerText: 'FINAL BELL RING!' },
  { barIndex: 16, section: 'OUTRO', phase: 'ring', startTime: 89.6, punchTime: 93.8, endTime: 95.2, line: 'Kronos in the circle, bow down to the King!', bannerText: 'BOW TO THE KING!' },
  { barIndex: 17, section: 'OUTRO', phase: 'ring', startTime: 95.2, punchTime: 98.5, endTime: 101.632, line: '[Outro \u2014 Final Bell & Brass Knockout Fanfare]', bannerText: 'KNOCKOUT FINISH!' }
];

// Dedicated instrumental charts for INST 1 & INST 2 (40.896s, 94 BPM, modulo-graded)
export const INST1_BARS = [
  { barIndex: 0, section: 'BRASS INTRO', phase: 'stage', startTime: 0.0, punchTime: 3.8, endTime: 5.11, line: '[Lyria 3.5 Instrumental 1 \u2014 Brass Fanfare & Boom-Bap Kick]', bannerText: 'BRASS FANFARE!' },
  { barIndex: 1, section: 'BRASS INTRO', phase: 'stage', startTime: 5.11, punchTime: 8.9, endTime: 10.22, line: '[Heavy Snare Pocket \u2014 Time Your Strikes to the Downbeat]', bannerText: 'SNARE POCKET!' },
  { barIndex: 2, section: 'CYPHER GROOVE', phase: 'stage', startTime: 10.22, punchTime: 14.0, endTime: 15.33, line: '[Subwoofer Bassline Rolling Through the Courtyard]', bannerText: 'SUBWOOFER ROLL!' },
  { barIndex: 3, section: 'CYPHER GROOVE', phase: 'stage', startTime: 15.33, punchTime: 19.1, endTime: 20.45, line: '[Double-Time Hi-Hats & Horn Stabs]', bannerText: 'HORN STABS!' },
  { barIndex: 4, section: 'HORN BREAK', phase: 'unfold', startTime: 20.45, punchTime: 24.2, endTime: 25.56, line: '[Speaker Wings Unfold \u2014 Syncopated Brass Breakdown]', bannerText: 'SPEAKER WINGS!' },
  { barIndex: 5, section: 'HORN BREAK', phase: 'unfold', startTime: 25.56, punchTime: 29.3, endTime: 30.67, line: '[808 Sub Drop & Crowd Clap Cadence]', bannerText: '808 SUB DROP!' },
  { barIndex: 6, section: 'BASS DROP', phase: 'ring', startTime: 30.67, punchTime: 34.4, endTime: 35.78, line: '[Full Sound-System Overdrive \u2014 Ring Showdown]', bannerText: 'OVERDRIVE!' },
  { barIndex: 7, section: 'OUTRO LOOP', phase: 'ring', startTime: 35.78, punchTime: 39.5, endTime: 40.896, line: '[Turnaround Brass Hit \u2014 Loop Point]', bannerText: 'TURNAROUND HIT!' }
];

export const INST2_BARS = [
  { barIndex: 0, section: 'VINYL INTRO', phase: 'stage', startTime: 0.0, punchTime: 3.8, endTime: 5.11, line: '[Lyria 3.5 Instrumental 2 \u2014 Turntable Scratch & Sub Drop]', bannerText: 'VINYL SCRATCH!' },
  { barIndex: 1, section: 'VINYL INTRO', phase: 'stage', startTime: 5.11, punchTime: 8.9, endTime: 10.22, line: '[Crisp Breakbeat Snare \u2014 Step Into the Cypher]', bannerText: 'BREAKBEAT SNARE!' },
  { barIndex: 2, section: 'BREAKBEAT', phase: 'stage', startTime: 10.22, punchTime: 14.0, endTime: 15.33, line: '[Chopped Sample Stabs & Low-End Pulse]', bannerText: 'SAMPLE STABS!' },
  { barIndex: 3, section: 'BREAKBEAT', phase: 'stage', startTime: 15.33, punchTime: 19.1, endTime: 20.45, line: '[Crossfader Cuts Over Heavy Kick Drum]', bannerText: 'CROSSFADER CUTS!' },
  { barIndex: 4, section: 'SYNTH BASS', phase: 'unfold', startTime: 20.45, punchTime: 24.2, endTime: 25.56, line: '[Resonant Synth Bass & Horn Counterpoint]', bannerText: 'SYNTH BASS!' },
  { barIndex: 5, section: 'SYNTH BASS', phase: 'unfold', startTime: 25.56, punchTime: 29.3, endTime: 30.67, line: '[Percussion Breakdown \u2014 Counter on the Beat]', bannerText: 'COUNTER BEAT!' },
  { barIndex: 6, section: 'FINALE', phase: 'ring', startTime: 30.67, punchTime: 34.4, endTime: 35.78, line: '[Maximum VU Meter Drive \u2014 Cypher Climax]', bannerText: 'MAX VU DRIVE!' },
  { barIndex: 7, section: 'OUTRO CUTS', phase: 'ring', startTime: 35.78, punchTime: 39.5, endTime: 40.896, line: '[Final Scratch Flurry \u2014 Loop Point]', bannerText: 'SCRATCH FLURRY!' }
];

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
    moduloOnly: false,
    beatTimes: KRONOS_BEAT_TIMES,
    bars: KRONOS_BARS
  },
  'inst-1': {
    id: 'inst-1',
    url: './assets/kronos-lyria-inst-1.mp3',
    label: 'LYRIA 3.5 BRASS INST 1',
    shortLabel: 'INST 1',
    bpm: 94.0,
    beatSec: 60.0 / 94.0,
    barSec: (60.0 / 94.0) * 8,
    firstBeatOffset: 0.02,
    loopDuration: 40.896,
    moduloOnly: true,
    beatTimes: null,
    bars: INST1_BARS
  },
  'inst-2': {
    id: 'inst-2',
    url: './assets/kronos-lyria-inst-2.mp3',
    label: 'LYRIA 3.5 SCRATCH INST 2',
    shortLabel: 'INST 2',
    bpm: 94.0,
    beatSec: 60.0 / 94.0,
    barSec: (60.0 / 94.0) * 8,
    firstBeatOffset: 0.02,
    loopDuration: 40.896,
    moduloOnly: true,
    beatTimes: null,
    bars: INST2_BARS
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
  const beatSec = 60.0 / bpm;
  const barSec = beatSec * 4.0;
  const totalBars = Math.max(1, Math.ceil(duration / barSec));
  const bars = [];
  for (let i = 0; i < totalBars; i++) {
    const startTime = i * barSec;
    const endTime = Math.min(duration, (i + 1) * barSec);
    bars.push({
      barIndex: i,
      section: 'CUSTOM TRACK',
      phase: i < totalBars * 0.35 ? 'stage' : (i < totalBars * 0.65 ? 'unfold' : 'ring'),
      startTime,
      punchTime: startTime + barSec * 0.75,
      endTime,
      line: `[${cleanName} \u2014 ${bpm} BPM Modulo Beat Grid]`,
      bannerText: `${cleanName}!`
    });
  }
  return {
    id: 'custom',
    url: null,
    label: `CUSTOM: ${cleanName}`,
    shortLabel: cleanName.slice(0, 10),
    bpm,
    beatSec,
    barSec,
    firstBeatOffset: offset,
    loopDuration: duration,
    moduloOnly: true,
    beatTimes: null,
    bars
  };
}
