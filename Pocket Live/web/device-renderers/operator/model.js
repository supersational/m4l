/**
 * Operator domain model, parameter conversions, routing topologies,
 * envelope contour geometry, and waveform/harmonic calculations.
 * Pure functions only — no DOM or capture-asset dependencies.
 */

export const DEVICE_WIDTH = 844;
export const DEVICE_HEIGHT = 219;

export const OSCILLATORS = ['A', 'B', 'C', 'D'];
export const OSC_COLORS = {
  A: '#e8cf58', // yellow
  B: '#5ec7d4', // cyan
  C: '#7b86eb', // indigo/purple
  D: '#e5863d', // orange
};

export const PAGES = ['osc-a', 'osc-b', 'osc-c', 'osc-d', 'filter', 'lfo', 'pitch', 'global'];

export const PAGE_LABELS = {
  'osc-a': 'Oscillator A',
  'osc-b': 'Oscillator B',
  'osc-c': 'Oscillator C',
  'osc-d': 'Oscillator D',
  filter: 'Filter',
  lfo: 'LFO',
  pitch: 'Pitch',
  global: 'Global',
};

/**
 * All 11 Operator FM routing algorithms verified against native Global captures.
 * `nodes` gives relative grid coordinates in a 4x4 cell space (col 0..3, row 0..3).
 * `edges` gives modulation [from, to].
 * `carriers` are oscillators that output directly to audio out.
 */
export const ALGORITHMS = [
  {
    index: 0,
    name: 'Alg. 1',
    edges: [['D', 'C'], ['C', 'B'], ['B', 'A']],
    carriers: ['A'],
    grid: { D: [0, 0], C: [0, 1], B: [0, 2], A: [0, 3] },
  },
  {
    index: 1,
    name: 'Alg. 2',
    edges: [['D', 'B'], ['C', 'B'], ['B', 'A']],
    carriers: ['A'],
    grid: { C: [0, 0], D: [1, 0], B: [0.5, 1], A: [0.5, 2] },
  },
  {
    index: 2,
    name: 'Alg. 3',
    edges: [['C', 'B'], ['B', 'A'], ['D', 'A']],
    carriers: ['A'],
    grid: { C: [0, 0], B: [0, 1], D: [1, 1], A: [0.5, 2] },
  },
  {
    index: 3,
    name: 'Alg. 4',
    edges: [['D', 'B'], ['D', 'C'], ['B', 'A'], ['C', 'A']],
    carriers: ['A'],
    grid: { D: [0.5, 0], B: [0, 1], C: [1, 1], A: [0.5, 2] },
  },
  {
    index: 4,
    name: 'Alg. 5',
    edges: [['D', 'C'], ['C', 'A'], ['C', 'B']],
    carriers: ['A', 'B'],
    grid: { D: [0.5, 0], C: [0.5, 1], A: [0, 2], B: [1, 2] },
  },
  {
    index: 5,
    name: 'Alg. 6',
    edges: [['D', 'C'], ['C', 'B']],
    carriers: ['A', 'B'],
    grid: { D: [1, 0], C: [1, 1], A: [0, 2], B: [1, 2] },
  },
  {
    index: 6,
    name: 'Alg. 7',
    edges: [['B', 'A'], ['C', 'A'], ['D', 'A']],
    carriers: ['A'],
    grid: { B: [0, 0], C: [1, 0], D: [2, 0], A: [1, 1] },
  },
  {
    index: 7,
    name: 'Alg. 8',
    edges: [['B', 'A'], ['D', 'C']],
    carriers: ['A', 'C'],
    grid: { B: [0, 0], D: [1, 0], A: [0, 1], C: [1, 1] },
  },
  {
    index: 8,
    name: 'Alg. 9',
    edges: [['D', 'A'], ['D', 'B'], ['D', 'C']],
    carriers: ['A', 'B', 'C'],
    grid: { D: [1, 0], A: [0, 1], B: [1, 1], C: [2, 1] },
  },
  {
    index: 9,
    name: 'Alg. 10',
    edges: [['D', 'C']],
    carriers: ['A', 'B', 'C'],
    grid: { D: [2, 0], A: [0, 1], B: [1, 1], C: [2, 1] },
  },
  {
    index: 10,
    name: 'Alg. 11',
    edges: [],
    carriers: ['A', 'B', 'C', 'D'],
    grid: { A: [0, 0], B: [1, 0], C: [2, 0], D: [3, 0] },
  },
];

export const bound = (x, min, max) => Math.max(min, Math.min(max, x));

export function paramByName(device, name) {
  return device?.parameters?.find(p => p.name === name) ?? null;
}

export function paramVal(device, name, fallback = 0) {
  const p = paramByName(device, name);
  return p ? p.value : fallback;
}

// --- Physical conversions verified from capture-verified/ snapshots ---

export function rawToAttackMs(x) {
  if (x <= 0) return 0;
  return 0.1 * Math.exp(Math.log(200000) * bound(x, 0, 1));
}

export function rawToDecayReleaseMs(x) {
  if (x <= 0) return 0;
  return Math.exp(Math.log(60000) * bound(x, 0, 1));
}

export function formatMs(ms) {
  if (ms <= 0.005) return '0.00 ms';
  if (ms < 10) return ms.toFixed(2) + ' ms';
  if (ms < 100) return ms.toFixed(1) + ' ms';
  if (ms < 1000) return Math.round(ms) + ' ms';
  return (ms / 1000).toFixed(2) + ' s';
}

export function rawToFilterHz(x) {
  return 30 * Math.pow(18500 / 30, bound(x, 0, 1));
}

export function formatHz(hz) {
  if (hz >= 1000) return (hz / 1000).toFixed(hz >= 10000 ? 1 : 2) + ' kHz';
  if (hz >= 100) return Math.round(hz) + ' Hz';
  return hz.toFixed(1) + ' Hz';
}

export function rawToFixFreqHz(x) {
  return 10 * Math.pow(200, bound(x, 0, 1));
}

export function rawToLevelDb(x) {
  if (x <= 0) return -Infinity;
  return -40 * (1 - bound(x, 0, 1));
}

export function formatDb(db) {
  if (!Number.isFinite(db)) return '-inf dB';
  if (Math.abs(db) < 0.05) return '0.0 dB';
  return (Math.abs(db) < 10 ? db.toFixed(1) : Math.round(db)) + ' dB';
}

/**
 * Format a Live parameter's display string when interactively edited locally.
 * When unmodified from a captured snapshot, the snapshot's exact `display` is preserved.
 */
export function formatParameterDisplay(p, value = p.value) {
  if (p.quantized && p.items?.length) {
    const idx = bound(Math.round(value - p.min), 0, p.items.length - 1);
    return p.items[idx];
  }
  const n = p.name;
  if (/Attack$/.test(n)) return formatMs(rawToAttackMs(value));
  if (/(Decay|Release|Loop|Glide Time)$/.test(n)) return formatMs(rawToDecayReleaseMs(value));
  if (n === 'Filter Freq') return formatHz(rawToFilterHz(value));
  if (/Fix Freq$/.test(n)) return formatHz(rawToFixFreqHz(value));
  if (/Fix Freq Mul$/.test(n)) {
    const muls = ['0.0001', '0.001', '0.01', '0.1', '1', '10'];
    return muls[bound(Math.round(value), 0, muls.length - 1)];
  }
  if (n === 'LFO Rate') return value.toFixed(2);
  if (/(LFO Sync|Retrig)$/.test(n)) {
    const syncs = ['1/64', '1/48', '1/32', '1/24', '1/16', '1/12', '1/8', '1/6', '1/4', '1/3', '1/2', '3/4', '1', '1.5', '2'];
    return syncs[bound(Math.round(value), 0, syncs.length - 1)] ?? String(Math.round(value));
  }
  if (/^(Osc-[ABCD] Level|[ABCD]e (Init|Peak|Sustain)|Le (Init|Peak|Sustain|End))$/.test(n)) {
    return formatDb(rawToLevelDb(value));
  }
  if (n === 'Volume') {
    if (value <= 0) return '-inf dB';
    return Math.round(-30 * (1 - value)) + ' dB';
  }
  if (n === 'Filter Res') return Math.round(value * 100) + ' %';
  if (n === 'Tone' || n === 'LFO Amt' || /^Fe (Init|Peak|Sustain|End)$/.test(n)) {
    return Math.round(value * 100) + ' %';
  }
  if (n === 'Panorama') {
    if (Math.abs(value) < 0.02) return 'C';
    const pct = Math.round(Math.abs(value) * 50);
    return pct + (value < 0 ? 'L' : 'R');
  }
  if (/Coarse$/.test(n)) {
    return value === 0 ? '0.5' : String(Math.round(value));
  }
  if (/^(Transpose|PB Range|Pe (Init|Peak|Sustain|End))$/.test(n)) {
    const v = Math.round(value);
    return (v > 0 ? '+' : '') + v + ' st';
  }
  if (p.min === -1 && p.max === 1) return Math.round(value * 100) + ' %';
  if (p.max === 100 && (p.min === 0 || p.min === -100)) return Math.round(value) + ' %';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

// --- Envelope contour geometry ---

/**
 * Compute envelope contour geometry for osc-a..d, filter, lfo, or pitch.
 * Returns { points, segments, zeroY, isBipolar, enabled } in the given box.
 */
export function computeEnvelopeContour(device, page, box) {
  const prefixMap = {
    'osc-a': 'Ae',
    'osc-b': 'Be',
    'osc-c': 'Ce',
    'osc-d': 'De',
    filter: 'Fe',
    lfo: 'Le',
    pitch: 'Pe',
  };
  const pre = prefixMap[page];
  if (!pre) return null;

  const enabledMap = {
    'osc-a': 'Osc-A On',
    'osc-b': 'Osc-B On',
    'osc-c': 'Osc-C On',
    'osc-d': 'Osc-D On',
    filter: 'Filter On',
    lfo: 'LFO On',
    pitch: 'Pe On',
  };
  const enabled = paramVal(device, enabledMap[page], 1) >= 0.5;
  const isBipolar = page === 'pitch';

  const attackRaw = bound(paramVal(device, `${pre} Attack`, 0), 0, 1);
  const decayRaw = bound(paramVal(device, `${pre} Decay`, 0.5446), 0, 1);
  const releaseRaw = bound(paramVal(device, `${pre} Release`, 0.5446), 0, 1);

  let initN, peakN, sustainN, endN;
  if (isBipolar) {
    initN = bound(paramVal(device, 'Pe Init', 0) / 48, -1, 1);
    peakN = bound(paramVal(device, 'Pe Peak', 0) / 48, -1, 1);
    sustainN = bound(paramVal(device, 'Pe Sustain', 0) / 48, -1, 1);
    endN = bound(paramVal(device, 'Pe End', 0) / 48, -1, 1);
  } else {
    initN = bound(paramVal(device, `${pre} Init`, 0), 0, 1);
    peakN = bound(paramVal(device, `${pre} Peak`, 1), 0, 1);
    sustainN = bound(paramVal(device, `${pre} Sustain`, 0), 0, 1);
    endN = bound(paramVal(device, `${pre} End`, 0), 0, 1);
  }

  const aSlope = paramVal(device, `${pre} A Slope`, 0);
  const dSlope = paramVal(device, `${pre} D Slope`, 1);
  const rSlope = paramVal(device, `${pre} R Slope`, 1);

  const { x, y, width, height } = box;
  const padX = 10;
  const yTop = y + 6.5;
  const yBot = y + height - 11;
  const w = width - padX * 2;
  const h = yBot - yTop;

  const yOf = norm => {
    if (isBipolar) {
      const mid = yTop + h / 2;
      return mid - norm * (h / 2);
    }
    return yTop + (1 - norm) * h;
  };

  // Live maps raw [0..1] Attack, Decay, and Release linearly to ~1/3 of plot width
  const segScale = w * 0.33;
  const x0 = x + padX;
  const aPx = attackRaw * segScale;
  const dPx = decayRaw * segScale;
  const rPx = releaseRaw * segScale;

  let xPeak = x0 + aPx;
  let xDecayEnd = xPeak + dPx;
  let xSustainEnd = Math.max(xDecayEnd + w * 0.14, x0 + w * 0.67);
  let xEnd = xSustainEnd + rPx;
  if (xEnd > x0 + w) {
    const excess = xEnd - (x0 + w);
    xSustainEnd = Math.max(xDecayEnd + 6, xSustainEnd - excess);
    xEnd = Math.min(x0 + w, xSustainEnd + rPx);
  }

  const yInit = yOf(initN);
  const yPeak = yOf(peakN);
  const ySustain = yOf(sustainN);
  const yEnd = yOf(endN);

  const p0 = [x0, yInit];
  const p1 = [xPeak, yPeak];
  const p2 = [xDecayEnd, ySustain];
  const p3 = [xSustainEnd, ySustain];
  const p4 = [xEnd, yEnd];

  // Quadratic control point for curved segments based on slope [-1..1]
  const curveCtrl = (a, b, slope) => {
    const t = 0.5 - bound(slope, -1, 1) * 0.36;
    const cx = a[0] + (b[0] - a[0]) * t;
    const cy = a[1] + (b[1] - a[1]) * (1 - t);
    return [cx, cy];
  };

  const cA = curveCtrl(p0, p1, aSlope);
  const cD = curveCtrl(p1, p2, dSlope);
  const cR = curveCtrl(p3, p4, rSlope);

  const path = [
    `M ${p0[0].toFixed(1)} ${p0[1].toFixed(1)}`,
    `Q ${cA[0].toFixed(1)} ${cA[1].toFixed(1)} ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`,
    `Q ${cD[0].toFixed(1)} ${cD[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`,
    `L ${p3[0].toFixed(1)} ${p3[1].toFixed(1)}`,
    `Q ${cR[0].toFixed(1)} ${cR[1].toFixed(1)} ${p4[0].toFixed(1)} ${p4[1].toFixed(1)}`,
  ].join(' ');

  return {
    enabled,
    isBipolar,
    zeroY: isBipolar ? yTop + h / 2 : yBot,
    path,
    points: [p0, p1, p2, p4],
    slopes: [
      attackRaw > 0.001 && Math.abs(p1[1] - p0[1]) > 1 ? [(p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5] : null,
      decayRaw > 0.001 && Math.abs(p2[1] - p1[1]) > 1 ? [0.25 * p1[0] + 0.5 * cD[0] + 0.25 * p2[0], 0.25 * p1[1] + 0.5 * cD[1] + 0.25 * p2[1]] : null,
      releaseRaw > 0.001 && Math.abs(p4[1] - p3[1]) > 1 ? [0.25 * p3[0] + 0.5 * cR[0] + 0.25 * p4[0], 0.25 * p3[1] + 0.5 * cR[1] + 0.25 * p4[1]] : null,
    ].filter(Boolean),
  };
}

// --- Oscillator waveforms & harmonic spectrum ---

export const WAVE_SHORT_NAMES = {
  Sine: 'Sin',
  'Sine 4 Bit': 'Sin4',
  'Sine 8 Bit': 'Sin8',
  'Saw 3': 'Sw3',
  'Saw 4': 'Sw4',
  'Saw 6': 'Sw6',
  'Saw 8': 'Sw8',
  'Saw 16': 'Sw16',
  'Saw 32': 'Sw32',
  'Saw 64': 'Sw64',
  'Saw D': 'SwD',
  'Square 3': 'Sq3',
  'Square 4': 'Sq4',
  'Square 6': 'Sq6',
  'Square 8': 'Sq8',
  'Square 16': 'Sq16',
  'Square 32': 'Sq32',
  'Square 64': 'Sq64',
  'Square D': 'SqD',
  Triangle: 'Tri',
  'Noise Looped': 'NseL',
  'Noise White': 'NseW',
  User: 'User',
};

export function computeHarmonicSpectrum(waveName, count = 64) {
  const bars = new Array(count).fill(0);
  const logBar = amp => (amp <= 0 ? 0 : bound(1 + 0.38 * Math.log10(amp), 0.05, 1));
  if (waveName === 'Sine' || waveName === 'Sine 4 Bit' || waveName === 'Sine 8 Bit') {
    bars[0] = 1;
    if (waveName === 'Sine 4 Bit') {
      for (let i = 2; i < Math.min(count, 16); i += 2) bars[i] = logBar(0.08 / (i + 1));
    }
    return bars;
  }
  if (waveName === 'Saw D') {
    return bars.fill(1);
  }
  if (waveName.startsWith('Saw')) {
    const limit = Math.min(count, Number(waveName.split(' ')[1]) || count);
    for (let k = 1; k <= limit; k++) bars[k - 1] = logBar(1 / k);
    return bars;
  }
  if (waveName === 'Square D') {
    for (let k = 1; k <= count; k += 2) bars[k - 1] = 1;
    return bars;
  }
  if (waveName.startsWith('Square')) {
    const limit = Math.min(count, Number(waveName.split(' ')[1]) || count);
    for (let k = 1; k <= limit; k += 2) bars[k - 1] = logBar(1 / k);
    return bars;
  }
  if (waveName === 'Triangle') {
    for (let k = 1; k <= count; k += 2) bars[k - 1] = logBar(1 / (k * k));
    return bars;
  }
  if (waveName.startsWith('Noise')) {
    return bars;
  }
  bars[0] = 1;
  bars[1] = logBar(0.4);
  bars[2] = logBar(0.2);
  return bars;
}

export function computeWaveformPath(waveName, x, y, width, height) {
  const steps = 40;
  const pts = [];
  const midY = y + height / 2;
  const amp = height * 0.42;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let s = 0;
    if (waveName === 'Sine' || waveName === 'Sine 4 Bit' || waveName === 'Sine 8 Bit') {
      s = Math.sin(t * Math.PI * 2);
      if (waveName === 'Sine 4 Bit') s = Math.round(s * 7) / 7;
      if (waveName === 'Sine 8 Bit') s = Math.round(s * 31) / 31;
    } else if (waveName === 'Saw D') {
      s = 1 - 2 * t;
    } else if (waveName.startsWith('Saw')) {
      const n = Number(waveName.split(' ')[1]) || 16;
      for (let k = 1; k <= Math.min(n, 24); k++) s += (2 / Math.PI) * Math.sin(k * t * Math.PI * 2) / k;
    } else if (waveName === 'Square D') {
      s = t < 0.5 ? 1 : -1;
    } else if (waveName.startsWith('Square')) {
      const n = Number(waveName.split(' ')[1]) || 16;
      for (let k = 1; k <= Math.min(n, 24); k += 2) s += (4 / Math.PI) * Math.sin(k * t * Math.PI * 2) / k;
    } else if (waveName === 'Triangle') {
      s = 1 - 4 * Math.abs(Math.round(t - 0.25) - (t - 0.25));
    } else if (waveName.startsWith('Noise')) {
      s = Math.sin(i * 7.3) * Math.cos(i * 3.1);
    } else {
      s = Math.sin(t * Math.PI * 2) * 0.7 + Math.sin(t * Math.PI * 4) * 0.3;
    }
    const px = x + t * width;
    const py = midY - bound(s, -1.1, 1.1) * amp;
    pts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`);
  }
  return pts.join(' ');
}
