var OperatorRenderer = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // web/device-renderers/operator/index.js
  var index_exports = {};
  __export(index_exports, {
    DEVICE_HEIGHT: () => DEVICE_HEIGHT,
    DEVICE_WIDTH: () => DEVICE_WIDTH,
    PAGES: () => PAGES,
    bound: () => bound,
    renderDevice: () => renderDevice
  });

  // web/device-renderers/operator/model.js
  var DEVICE_WIDTH = 844;
  var DEVICE_HEIGHT = 219;
  var OSCILLATORS = ["A", "B", "C", "D"];
  var OSC_COLORS = {
    A: "#e8cf58",
    // yellow
    B: "#5ec7d4",
    // cyan
    C: "#7b86eb",
    // indigo/purple
    D: "#e5863d"
    // orange
  };
  var PAGES = ["osc-a", "osc-b", "osc-c", "osc-d", "filter", "lfo", "pitch", "global"];
  var ALGORITHMS = [
    {
      index: 0,
      name: "Alg. 1",
      edges: [["D", "C"], ["C", "B"], ["B", "A"]],
      carriers: ["A"],
      grid: { D: [0, 0], C: [0, 1], B: [0, 2], A: [0, 3] }
    },
    {
      index: 1,
      name: "Alg. 2",
      edges: [["D", "B"], ["C", "B"], ["B", "A"]],
      carriers: ["A"],
      grid: { C: [0, 0], D: [1, 0], B: [0.5, 1], A: [0.5, 2] }
    },
    {
      index: 2,
      name: "Alg. 3",
      edges: [["C", "B"], ["B", "A"], ["D", "A"]],
      carriers: ["A"],
      grid: { C: [0, 0], B: [0, 1], D: [1, 1], A: [0.5, 2] }
    },
    {
      index: 3,
      name: "Alg. 4",
      edges: [["D", "B"], ["D", "C"], ["B", "A"], ["C", "A"]],
      carriers: ["A"],
      grid: { D: [0.5, 0], B: [0, 1], C: [1, 1], A: [0.5, 2] }
    },
    {
      index: 4,
      name: "Alg. 5",
      edges: [["D", "C"], ["C", "A"], ["C", "B"]],
      carriers: ["A", "B"],
      grid: { D: [0.5, 0], C: [0.5, 1], A: [0, 2], B: [1, 2] }
    },
    {
      index: 5,
      name: "Alg. 6",
      edges: [["D", "C"], ["C", "B"]],
      carriers: ["A", "B"],
      grid: { D: [1, 0], C: [1, 1], A: [0, 2], B: [1, 2] }
    },
    {
      index: 6,
      name: "Alg. 7",
      edges: [["B", "A"], ["C", "A"], ["D", "A"]],
      carriers: ["A"],
      grid: { B: [0, 0], C: [1, 0], D: [2, 0], A: [1, 1] }
    },
    {
      index: 7,
      name: "Alg. 8",
      edges: [["B", "A"], ["D", "C"]],
      carriers: ["A", "C"],
      grid: { B: [0, 0], D: [1, 0], A: [0, 1], C: [1, 1] }
    },
    {
      index: 8,
      name: "Alg. 9",
      edges: [["D", "A"], ["D", "B"], ["D", "C"]],
      carriers: ["A", "B", "C"],
      grid: { D: [1, 0], A: [0, 1], B: [1, 1], C: [2, 1] }
    },
    {
      index: 9,
      name: "Alg. 10",
      edges: [["D", "C"]],
      carriers: ["A", "B", "C"],
      grid: { D: [2, 0], A: [0, 1], B: [1, 1], C: [2, 1] }
    },
    {
      index: 10,
      name: "Alg. 11",
      edges: [],
      carriers: ["A", "B", "C", "D"],
      grid: { A: [0, 0], B: [1, 0], C: [2, 0], D: [3, 0] }
    }
  ];
  var bound = (x, min, max) => Math.max(min, Math.min(max, x));
  function paramByName(device, name) {
    return device?.parameters?.find((p) => p.name === name) ?? null;
  }
  function paramVal(device, name, fallback = 0) {
    const p = paramByName(device, name);
    return p ? p.value : fallback;
  }
  function rawToAttackMs(x) {
    if (x <= 0) return 0;
    return 0.1 * Math.exp(Math.log(2e5) * bound(x, 0, 1));
  }
  function rawToDecayReleaseMs(x) {
    if (x <= 0) return 0;
    return Math.exp(Math.log(6e4) * bound(x, 0, 1));
  }
  function formatMs(ms) {
    if (ms <= 5e-3) return "0.00 ms";
    if (ms < 10) return ms.toFixed(2) + " ms";
    if (ms < 100) return ms.toFixed(1) + " ms";
    if (ms < 1e3) return Math.round(ms) + " ms";
    return (ms / 1e3).toFixed(2) + " s";
  }
  function rawToFilterHz(x) {
    return 30 * Math.pow(18500 / 30, bound(x, 0, 1));
  }
  function formatHz(hz) {
    if (hz >= 1e3) return (hz / 1e3).toFixed(hz >= 1e4 ? 1 : 2) + " kHz";
    if (hz >= 100) return Math.round(hz) + " Hz";
    return hz.toFixed(1) + " Hz";
  }
  function rawToFixFreqHz(x) {
    return 10 * Math.pow(200, bound(x, 0, 1));
  }
  function rawToLevelDb(x) {
    if (x <= 0) return -Infinity;
    return -40 * (1 - bound(x, 0, 1));
  }
  function formatDb(db) {
    if (!Number.isFinite(db)) return "-inf dB";
    if (Math.abs(db) < 0.05) return "0.0 dB";
    return (Math.abs(db) < 10 ? db.toFixed(1) : Math.round(db)) + " dB";
  }
  function formatParameterDisplay(p, value = p.value) {
    if (p.quantized && p.items?.length) {
      const idx = bound(Math.round(value - p.min), 0, p.items.length - 1);
      return p.items[idx];
    }
    const n = p.name;
    if (/Attack$/.test(n)) return formatMs(rawToAttackMs(value));
    if (/(Decay|Release|Loop|Glide Time)$/.test(n)) return formatMs(rawToDecayReleaseMs(value));
    if (n === "Filter Freq") return formatHz(rawToFilterHz(value));
    if (/Fix Freq$/.test(n)) return formatHz(rawToFixFreqHz(value));
    if (/Fix Freq Mul$/.test(n)) {
      const muls = ["0.0001", "0.001", "0.01", "0.1", "1", "10"];
      return muls[bound(Math.round(value), 0, muls.length - 1)];
    }
    if (n === "LFO Rate") return value.toFixed(2);
    if (/(LFO Sync|Retrig)$/.test(n)) {
      const syncs = ["1/64", "1/48", "1/32", "1/24", "1/16", "1/12", "1/8", "1/6", "1/4", "1/3", "1/2", "3/4", "1", "1.5", "2"];
      return syncs[bound(Math.round(value), 0, syncs.length - 1)] ?? String(Math.round(value));
    }
    if (/^(Osc-[ABCD] Level|[ABCD]e (Init|Peak|Sustain)|Le (Init|Peak|Sustain|End))$/.test(n)) {
      return formatDb(rawToLevelDb(value));
    }
    if (n === "Volume") {
      if (value <= 0) return "-inf dB";
      return Math.round(-30 * (1 - value)) + " dB";
    }
    if (n === "Filter Res") return Math.round(value * 100) + " %";
    if (n === "Tone" || n === "LFO Amt" || /^Fe (Init|Peak|Sustain|End)$/.test(n)) {
      return Math.round(value * 100) + " %";
    }
    if (n === "Panorama") {
      if (Math.abs(value) < 0.02) return "C";
      const pct = Math.round(Math.abs(value) * 50);
      return pct + (value < 0 ? "L" : "R");
    }
    if (/Coarse$/.test(n)) {
      return value === 0 ? "0.5" : String(Math.round(value));
    }
    if (/^(Transpose|PB Range|Pe (Init|Peak|Sustain|End))$/.test(n)) {
      const v = Math.round(value);
      return (v > 0 ? "+" : "") + v + " st";
    }
    if (p.min === -1 && p.max === 1) return Math.round(value * 100) + " %";
    if (p.max === 100 && (p.min === 0 || p.min === -100)) return Math.round(value) + " %";
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  function computeEnvelopeContour(device, page, box) {
    const prefixMap = {
      "osc-a": "Ae",
      "osc-b": "Be",
      "osc-c": "Ce",
      "osc-d": "De",
      filter: "Fe",
      lfo: "Le",
      pitch: "Pe"
    };
    const pre = prefixMap[page];
    if (!pre) return null;
    const enabledMap = {
      "osc-a": "Osc-A On",
      "osc-b": "Osc-B On",
      "osc-c": "Osc-C On",
      "osc-d": "Osc-D On",
      filter: "Filter On",
      lfo: "LFO On",
      pitch: "Pe On"
    };
    const enabled = paramVal(device, enabledMap[page], 1) >= 0.5;
    const isBipolar = page === "pitch";
    const attackRaw = bound(paramVal(device, `${pre} Attack`, 0), 0, 1);
    const decayRaw = bound(paramVal(device, `${pre} Decay`, 0.5446), 0, 1);
    const releaseRaw = bound(paramVal(device, `${pre} Release`, 0.5446), 0, 1);
    let initN, peakN, sustainN, endN;
    if (isBipolar) {
      initN = bound(paramVal(device, "Pe Init", 0) / 48, -1, 1);
      peakN = bound(paramVal(device, "Pe Peak", 0) / 48, -1, 1);
      sustainN = bound(paramVal(device, "Pe Sustain", 0) / 48, -1, 1);
      endN = bound(paramVal(device, "Pe End", 0) / 48, -1, 1);
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
    const yOf = (norm) => {
      if (isBipolar) {
        const mid = yTop + h / 2;
        return mid - norm * (h / 2);
      }
      return yTop + (1 - norm) * h;
    };
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
      `Q ${cR[0].toFixed(1)} ${cR[1].toFixed(1)} ${p4[0].toFixed(1)} ${p4[1].toFixed(1)}`
    ].join(" ");
    return {
      enabled,
      isBipolar,
      zeroY: isBipolar ? yTop + h / 2 : yBot,
      path,
      points: [p0, p1, p2, p4],
      slopes: [
        attackRaw > 1e-3 && Math.abs(p1[1] - p0[1]) > 1 ? [(p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5] : null,
        decayRaw > 1e-3 && Math.abs(p2[1] - p1[1]) > 1 ? [0.25 * p1[0] + 0.5 * cD[0] + 0.25 * p2[0], 0.25 * p1[1] + 0.5 * cD[1] + 0.25 * p2[1]] : null,
        releaseRaw > 1e-3 && Math.abs(p4[1] - p3[1]) > 1 ? [0.25 * p3[0] + 0.5 * cR[0] + 0.25 * p4[0], 0.25 * p3[1] + 0.5 * cR[1] + 0.25 * p4[1]] : null
      ].filter(Boolean)
    };
  }
  var WAVE_SHORT_NAMES = {
    Sine: "Sin",
    "Sine 4 Bit": "Sin4",
    "Sine 8 Bit": "Sin8",
    "Saw 3": "Sw3",
    "Saw 4": "Sw4",
    "Saw 6": "Sw6",
    "Saw 8": "Sw8",
    "Saw 16": "Sw16",
    "Saw 32": "Sw32",
    "Saw 64": "Sw64",
    "Saw D": "SwD",
    "Square 3": "Sq3",
    "Square 4": "Sq4",
    "Square 6": "Sq6",
    "Square 8": "Sq8",
    "Square 16": "Sq16",
    "Square 32": "Sq32",
    "Square 64": "Sq64",
    "Square D": "SqD",
    Triangle: "Tri",
    "Noise Looped": "NseL",
    "Noise White": "NseW",
    User: "User"
  };
  function computeHarmonicSpectrum(waveName, count = 64) {
    const bars = new Array(count).fill(0);
    const logBar = (amp) => amp <= 0 ? 0 : bound(1 + 0.38 * Math.log10(amp), 0.05, 1);
    if (waveName === "Sine" || waveName === "Sine 4 Bit" || waveName === "Sine 8 Bit") {
      bars[0] = 1;
      if (waveName === "Sine 4 Bit") {
        for (let i = 2; i < Math.min(count, 16); i += 2) bars[i] = logBar(0.08 / (i + 1));
      }
      return bars;
    }
    if (waveName === "Saw D") {
      return bars.fill(1);
    }
    if (waveName.startsWith("Saw")) {
      const limit = Math.min(count, Number(waveName.split(" ")[1]) || count);
      for (let k = 1; k <= limit; k++) bars[k - 1] = logBar(1 / k);
      return bars;
    }
    if (waveName === "Square D") {
      for (let k = 1; k <= count; k += 2) bars[k - 1] = 1;
      return bars;
    }
    if (waveName.startsWith("Square")) {
      const limit = Math.min(count, Number(waveName.split(" ")[1]) || count);
      for (let k = 1; k <= limit; k += 2) bars[k - 1] = logBar(1 / k);
      return bars;
    }
    if (waveName === "Triangle") {
      for (let k = 1; k <= count; k += 2) bars[k - 1] = logBar(1 / (k * k));
      return bars;
    }
    if (waveName.startsWith("Noise")) {
      return bars;
    }
    bars[0] = 1;
    bars[1] = logBar(0.4);
    bars[2] = logBar(0.2);
    return bars;
  }
  function computeWaveformPath(waveName, x, y, width, height) {
    const steps = 40;
    const pts = [];
    const midY = y + height / 2;
    const amp = height * 0.42;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      let s = 0;
      if (waveName === "Sine" || waveName === "Sine 4 Bit" || waveName === "Sine 8 Bit") {
        s = Math.sin(t * Math.PI * 2);
        if (waveName === "Sine 4 Bit") s = Math.round(s * 7) / 7;
        if (waveName === "Sine 8 Bit") s = Math.round(s * 31) / 31;
      } else if (waveName === "Saw D") {
        s = 1 - 2 * t;
      } else if (waveName.startsWith("Saw")) {
        const n = Number(waveName.split(" ")[1]) || 16;
        for (let k = 1; k <= Math.min(n, 24); k++) s += 2 / Math.PI * Math.sin(k * t * Math.PI * 2) / k;
      } else if (waveName === "Square D") {
        s = t < 0.5 ? 1 : -1;
      } else if (waveName.startsWith("Square")) {
        const n = Number(waveName.split(" ")[1]) || 16;
        for (let k = 1; k <= Math.min(n, 24); k += 2) s += 4 / Math.PI * Math.sin(k * t * Math.PI * 2) / k;
      } else if (waveName === "Triangle") {
        s = 1 - 4 * Math.abs(Math.round(t - 0.25) - (t - 0.25));
      } else if (waveName.startsWith("Noise")) {
        s = Math.sin(i * 7.3) * Math.cos(i * 3.1);
      } else {
        s = Math.sin(t * Math.PI * 2) * 0.7 + Math.sin(t * Math.PI * 4) * 0.3;
      }
      const px = x + t * width;
      const py = midY - bound(s, -1.1, 1.1) * amp;
      pts.push(`${i === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`);
    }
    return pts.join(" ");
  }

  // web/device-renderers/operator/index.js
  var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
  function disp(p) {
    if (!p) return "\u2014";
    return p.display ?? formatParameterDisplay(p, p.value);
  }
  function dial(device, paramName, cx, cy, label, { r = 11, color = "#5ec7d4", dim = false, shortValue = null } = {}) {
    const p = paramByName(device, paramName);
    if (!p) {
      return `<g class="op-unbound" opacity="0.5">
      <text x="${cx}" y="${cy - 15}" text-anchor="middle" class="op-lbl">${esc(label)}</text>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#555" stroke-width="2" stroke-dasharray="2 2"/>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="op-val-dim">N/A</text>
    </g>`;
    }
    const frac = p.max > p.min ? bound((p.value - p.min) / (p.max - p.min), 0, 1) : 0;
    const startDeg = -135;
    const endDeg = startDeg + 270 * frac;
    const polar = (deg) => {
      const rad = (deg - 90) * Math.PI / 180;
      return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
    };
    const arc = (a0, a1) => {
      if (Math.abs(a1 - a0) < 0.5) return "";
      const [x0, y0] = polar(a0);
      const [x1, y1] = polar(a1);
      const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
      return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    };
    const [hx, hy] = polar(endDeg);
    const hx0 = cx + (hx - cx) * 0.25;
    const hy0 = cy + (hy - cy) * 0.25;
    const activeColor = !p.enabled || dim ? "#6b6f76" : color;
    const valText = shortValue ?? disp(p);
    return `<g data-param="${esc(p.name)}" role="slider" tabindex="0"
      aria-label="${esc(p.name)}" aria-valuemin="${p.min}" aria-valuemax="${p.max}"
      aria-valuenow="${p.value}" aria-valuetext="${esc(valText)}"
      aria-disabled="${!p.enabled}">
    <rect x="${cx - 20}" y="${cy - 22}" width="40" height="42" fill="transparent"/>
    <text x="${cx}" y="${cy - 14}" text-anchor="middle" class="op-lbl">${esc(label)}</text>
    <path d="${arc(-135, 135)}" fill="none" stroke="#18191c" stroke-width="2.5" stroke-linecap="round"/>
    <path d="${arc(-135, endDeg)}" fill="none" stroke="${activeColor}" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="${hx0.toFixed(1)}" y1="${hy0.toFixed(1)}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}"
      stroke="${activeColor}" stroke-width="1.8" stroke-linecap="round"/>
    <text x="${cx + 4}" y="${cy + 14}" text-anchor="middle" class="op-val">${esc(valText)}</text>
  </g>`;
  }
  function readoutSlider(device, paramName, x, y, label, { color = "#5ec7d4", align = "start" } = {}) {
    const p = paramByName(device, paramName);
    if (!p) {
      return `<g class="op-unbound" opacity="0.55">
      <text x="${x}" y="${y}" text-anchor="${align}" class="op-sub-lbl">${esc(label)}</text>
      <text x="${x}" y="${y + 10}" text-anchor="${align}" class="op-ax-tag">AX-only</text>
    </g>`;
    }
    const activeColor = p.enabled ? color : "#70747a";
    return `<g data-param="${esc(p.name)}" role="slider" tabindex="0"
      aria-label="${esc(p.name)}" aria-valuemin="${p.min}" aria-valuemax="${p.max}"
      aria-valuenow="${p.value}" aria-valuetext="${esc(disp(p))}"
      aria-disabled="${!p.enabled}">
    <rect x="${align === "end" ? x - 44 : x - 2}" y="${y - 9}" width="46" height="22" fill="transparent"/>
    <text x="${x}" y="${y}" text-anchor="${align}" class="op-sub-lbl">${esc(label)}</text>
    <text x="${x}" y="${y + 10}" text-anchor="${align}" fill="${activeColor}" class="op-sub-val">${esc(disp(p))}</text>
  </g>`;
  }
  function toggleBox(device, paramName, x, y, w, h, { color = "#5ec7d4", text = "", title = "" } = {}) {
    const p = paramByName(device, paramName);
    if (!p) {
      return `<g opacity="0.5">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="#1e2024" stroke="#555" stroke-dasharray="2 1"/>
      ${text ? `<text x="${x + w / 2}" y="${y + h / 2 + 3}" text-anchor="middle" class="op-mini">${esc(text)}</text>` : ""}
    </g>`;
    }
    const on = p.value >= 0.5;
    const fill = on ? p.enabled ? color : "#777" : "#23252a";
    const stroke = on ? fill : "#50545c";
    const textFill = on ? "#141518" : "#a8adb8";
    return `<g data-param="${esc(p.name)}" role="button" tabindex="0"
      aria-label="${esc(title || p.name)}" aria-pressed="${on}" aria-disabled="${!p.enabled}">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
    ${text ? `<text x="${x + w / 2}" y="${y + h / 2 + 3}" text-anchor="middle" fill="${textFill}" class="op-mini-bold">${esc(text)}</text>` : ""}
  </g>`;
  }
  function combobox(device, paramName, x, y, w, h, { color = "#e59a46", shortMap = null } = {}) {
    const p = paramByName(device, paramName);
    if (!p) {
      return `<g opacity="0.55">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="#1e2024" stroke="#555" stroke-dasharray="2 1"/>
      <text x="${x + 4}" y="${y + h - 3}" class="op-ax-tag">AX-only</text>
    </g>`;
    }
    const raw = disp(p);
    const label = shortMap?.[raw] ?? raw;
    return `<g data-param="${esc(p.name)}" role="combobox" tabindex="0" aria-label="${esc(p.name)}">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="#23262b" stroke="#474b54" stroke-width="0.8"/>
    <text x="${x + 4}" y="${y + h - 3}" fill="${p.enabled ? color : "#70747a"}" class="op-combo-val">${esc(label)}</text>
    <path d="M ${x + w - 8} ${y + h / 2 - 1.5} L ${x + w - 4} ${y + h / 2 - 1.5} L ${x + w - 6} ${y + h / 2 + 2} Z" fill="#9ea4b0"/>
  </g>`;
  }
  function algorithmIcon(alg, x, y, w, h, selected = false) {
    const cols = Math.max(...Object.values(alg.grid).map(([c]) => c)) + 1;
    const rows = Math.max(...Object.values(alg.grid).map(([, r]) => r)) + 1;
    const cellW = Math.min(6.5, (w - 4) / Math.max(cols, 1));
    const cellH = Math.min(6.5, (h - 4) / Math.max(rows, 1));
    const boxSz = Math.min(cellW - 1.8, cellH - 1.8, 4.6);
    const offX = x + (w - cols * cellW) / 2 + cellW / 2;
    const offY = y + (h - rows * cellH) / 2 + cellH / 2;
    const pos = (letter) => {
      const [c, r] = alg.grid[letter];
      return [offX + c * cellW, offY + r * cellH];
    };
    const lines = alg.edges.map(([from, to]) => {
      const [x1, y1] = pos(from);
      const [x2, y2] = pos(to);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
      stroke="${selected ? "#cfd4de" : "#5e636e"}" stroke-width="1"/>`;
    }).join("");
    const carrierLines = selected ? alg.carriers.map((c) => {
      const [cx, cy] = pos(c);
      return `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${(cy + boxSz * 0.95).toFixed(1)}"
      stroke="${OSC_COLORS[c]}" stroke-width="1"/>`;
    }).join("") : "";
    const boxes = OSCILLATORS.map((letter) => {
      const [bx, by] = pos(letter);
      const col = OSC_COLORS[letter];
      return `<rect x="${(bx - boxSz / 2).toFixed(1)}" y="${(by - boxSz / 2).toFixed(1)}"
      width="${boxSz.toFixed(1)}" height="${boxSz.toFixed(1)}"
      fill="${selected ? col : "#181a1e"}" stroke="${col}" stroke-width="1"/>`;
    }).join("");
    return lines + carrierLines + boxes;
  }
  function renderTitleBar(device) {
    const devOn = paramByName(device, "Device On");
    const on = devOn ? devOn.value >= 0.5 : true;
    return `<g class="op-titlebar">
    <rect x="0" y="0" width="242" height="18" rx="3" fill="#3a3d45"/>
    <rect x="594" y="0" width="250" height="18" rx="3" fill="#3a3d45"/>
    <g data-param="Device On" role="button" tabindex="0" aria-label="Device On" aria-pressed="${on}">
      <circle cx="11" cy="9" r="5" fill="${on ? "#f0a23b" : "#25272c"}" stroke="#1c1e22" stroke-width="1"/>
    </g>
    <text x="31" y="12.5" class="op-title">${esc(device.name || "Operator")}</text>
    <text x="${DEVICE_WIDTH - 10}" y="12" text-anchor="end" class="op-badge-dim">POCKET / LIVE</text>
  </g>`;
  }
  function renderOscillatorColumn(device, activePage) {
    const order = ["D", "C", "B", "A"];
    return order.map((letter, idx) => {
      const y = 20 + idx * 49;
      const pageKey = "osc-" + letter.toLowerCase();
      const selected = activePage === pageKey;
      const isOn = paramVal(device, `Osc-${letter} On`, 1) >= 0.5;
      const isFixed = paramVal(device, `${letter} Fix On `, 0) >= 0.5;
      const col = OSC_COLORS[letter];
      const bg = selected ? "#444750" : "#32353c";
      const col1 = isFixed ? dial(device, `${letter} Fix Freq`, 25, y + 25, "Freq", { color: "#5ec7d4", dim: !isOn }) : dial(device, `${letter} Coarse`, 25, y + 25, "Coarse", { color: "#5ec7d4", dim: !isOn });
      const col2 = isFixed ? dial(device, `${letter} Fix Freq Mul`, 76, y + 25, "Multi", { color: "#5ec7d4", dim: !isOn }) : dial(device, `${letter} Fine`, 76, y + 25, "Fine", { color: "#5ec7d4", dim: !isOn });
      return `<g>
      <rect x="2" y="${y}" width="238" height="47" rx="2" fill="${bg}" stroke="${selected ? "#696e7a" : "#24262b"}" stroke-width="1"/>
      ${col1}
      ${col2}
      <text x="124" y="${y + 11}" text-anchor="middle" class="op-lbl">Fixed</text>
      ${toggleBox(device, `${letter} Fix On `, 119, y + 18, 10, 10, { color: "#5ec7d4" })}
      ${dial(device, `Osc-${letter} Level`, 166, y + 25, "Level", { color: "#5ec7d4", dim: !isOn })}
      <g data-page="${pageKey}" role="tab" tabindex="0" aria-label="Select Oscillator ${letter}" aria-selected="${selected}">
        <rect x="210" y="${y + 14}" width="22" height="19" rx="2" fill="${selected ? col : "#202227"}" stroke="${isOn ? col : "#565a63"}" stroke-width="1.3"/>
        <text x="221" y="${y + 27}" text-anchor="middle" fill="${selected ? "#141518" : isOn ? col : "#70747a"}" class="op-osc-badge">${letter}</text>
      </g>
      ${toggleBox(device, `Osc-${letter} On`, 216, y + 36, 10, 6, { color: col, title: `Osc-${letter} On` })}
    </g>`;
    }).join("");
  }
  function renderEnvelopeGraph(device, page, box) {
    const env = computeEnvelopeContour(device, page, box);
    if (!env) return "";
    const stroke = env.enabled ? "#5ec7d4" : "#7a7e87";
    const corners = `
    <path d="M ${box.x + 4} ${box.y + 10} V ${box.y + 4} H ${box.x + 10}" fill="none" stroke="${stroke}" stroke-width="1"/>
    <path d="M ${box.x + box.width - 10} ${box.y + 4} H ${box.x + box.width - 4} V ${box.y + 10}" fill="none" stroke="${stroke}" stroke-width="1"/>
    <path d="M ${box.x + 4} ${box.y + box.height - 10} V ${box.y + box.height - 4} H ${box.x + 10}" fill="none" stroke="${stroke}" stroke-width="1"/>
    <path d="M ${box.x + box.width - 10} ${box.y + box.height - 4} H ${box.x + box.width - 4} V ${box.y + box.height - 10}" fill="none" stroke="${stroke}" stroke-width="1"/>
  `;
    const zeroLine = env.isBipolar ? `<line x1="${box.x + 6}" y1="${env.zeroY.toFixed(1)}" x2="${box.x + box.width - 6}" y2="${env.zeroY.toFixed(1)}" stroke="#2e3138" stroke-width="1" stroke-dasharray="2 2"/>` : "";
    const pts = env.points.map(
      ([px, py]) => `<rect x="${(px - 2.3).toFixed(1)}" y="${(py - 2.3).toFixed(1)}" width="4.6" height="4.6" fill="#141518" stroke="${env.enabled ? "#e5863d" : "#7a7e87"}" stroke-width="1.1"/>`
    ).join("");
    const slopes = env.slopes.map(
      ([sx, sy]) => `<polygon points="${sx.toFixed(1)},${(sy - 2.6).toFixed(1)} ${(sx + 2.6).toFixed(1)},${sy.toFixed(1)} ${sx.toFixed(1)},${(sy + 2.6).toFixed(1)} ${(sx - 2.6).toFixed(1)},${sy.toFixed(1)}" fill="#141518" stroke="${env.enabled ? "#d45a5a" : "#7a7e87"}" stroke-width="1"/>`
    ).join("");
    return `<g data-graph="envelope">
    <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="2" fill="#141518" stroke="#2c2f36"/>
    ${corners}
    ${zeroLine}
    <path d="${env.path}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>
    ${pts}
    ${slopes}
  </g>`;
  }
  function renderWaveGraph(device, letter, box) {
    const waveParam = paramByName(device, `Osc-${letter} Wave`);
    const waveName = waveParam ? disp(waveParam) : "Sine";
    const totalSlots = 64;
    const bars = computeHarmonicSpectrum(waveName, totalSlots);
    const plotW = box.width - 34;
    const plotH = box.height - 10;
    const slotStep = plotW / totalSlots;
    const barW = Math.max(2.2, slotStep * 0.58);
    const baseY = box.y + box.height - 5;
    const barsSvg = bars.map((amp, i) => {
      const cx = box.x + 6 + i * slotStep + slotStep * 0.5;
      const gridLine = `<line x1="${cx.toFixed(1)}" y1="${(box.y + 4).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${baseY.toFixed(1)}" stroke="#2c2f36" stroke-width="0.8"/>`;
      if (amp <= 0.01) return gridLine;
      const bh = Math.max(2, amp * plotH);
      const by = baseY - bh;
      return `${gridLine}<rect x="${(cx - barW / 2).toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="#8b909a"/>`;
    }).join("");
    const buttons = [16, 32, 64].map((n, idx) => {
      const by = box.y + 24 + idx * 16;
      const active = n === 16;
      return `<g aria-hidden="true">
      <rect x="${box.x + box.width - 24}" y="${by}" width="18" height="13" rx="1.5" fill="${active ? "#8b909a" : "#25272d"}" stroke="#454952" stroke-width="0.8"/>
      <text x="${box.x + box.width - 15}" y="${by + 9.5}" text-anchor="middle" fill="${active ? "#141518" : "#b4b8c2"}" class="op-mini-bold">${n}</text>
    </g>`;
    }).join("");
    return `<g data-graph="waveform">
    <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="2" fill="#141518" stroke="#2c2f36"/>
    ${barsSvg}
    ${buttons}
  </g>`;
  }
  function renderCenterColumn(device, view) {
    const page = PAGES.includes(view.page) ? view.page : null;
    const cx = 244, cy = 2, cw = 348, ch = 213;
    const graphBox = { x: cx + 4, y: cy + 3, width: cw - 8, height: 87 };
    if (!page) {
      return `<g>
      <rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="2" fill="#23252a" stroke="#d75b50" stroke-width="1.2"/>
      <text x="${cx + cw / 2}" y="${cy + ch / 2}" text-anchor="middle" fill="#e5863d" class="op-title">Unsupported page: ${esc(view.page)}</text>
    </g>`;
    }
    let body = "";
    if (page.startsWith("osc-")) {
      const letter = page.at(-1).toUpperCase();
      const pre = letter + "e";
      const isWave = view.subpage === "wave";
      const waveName = disp(paramByName(device, `Osc-${letter} Wave`) || { display: "Sine" });
      const wavePath = computeWaveformPath(waveName, cx + 278, cy + 121, 52, 22);
      body = `
      ${isWave ? renderWaveGraph(device, letter, graphBox) : renderEnvelopeGraph(device, page, graphBox)}
      <g data-page="${page}:env" role="tab" tabindex="0" aria-selected="${!isWave}">
        <rect x="${cx + 6}" y="${cy + 95}" width="11" height="10" fill="${!isWave ? "#5ec7d4" : "#23252a"}" stroke="#5ec7d4"/>
        <text x="${cx + 21}" y="${cy + 103}" class="op-pane-title">Envelope</text>
      </g>
      <line x1="${cx + 6}" y1="${cy + 107}" x2="${cx + 204}" y2="${cy + 107}" stroke="#444852"/>
      ${readoutSlider(device, `${pre} Attack`, cx + 8, cy + 120, "Attack")}
      ${readoutSlider(device, `${pre} Decay`, cx + 62, cy + 120, "Decay")}
      ${readoutSlider(device, `${pre} Release`, cx + 114, cy + 120, "Release")}
      ${readoutSlider(device, `${pre} R < Vel`, cx + 162, cy + 120, "Time<Vel")}
      ${readoutSlider(device, `${pre} Init`, cx + 8, cy + 152, "Initial")}
      ${readoutSlider(device, `${pre} Peak`, cx + 62, cy + 152, "Peak")}
      ${readoutSlider(device, `${pre} Sustain`, cx + 114, cy + 152, "Sustain")}
      ${readoutSlider(device, `Osc-${letter} Lev < Vel`, cx + 162, cy + 152, "Vel")}
      <text x="${cx + 8}" y="${cy + 184}" class="op-sub-lbl">Loop</text>
      ${combobox(device, `${pre} Mode`, cx + 8, cy + 187, 50, 14, { color: "#5ec7d4" })}
      ${readoutSlider(device, `Osc-${letter} Lev < Key`, cx + 162, cy + 184, "Key")}

      <g data-page="${page}:wave" role="tab" tabindex="0" aria-selected="${isWave}">
        <rect x="${cx + 212}" y="${cy + 95}" width="11" height="10" fill="${isWave ? "#5ec7d4" : "#23252a"}" stroke="#5ec7d4"/>
        <text x="${cx + 227}" y="${cy + 103}" class="op-pane-title">Oscillator</text>
      </g>
      <line x1="${cx + 212}" y1="${cy + 107}" x2="${cx + cw - 6}" y2="${cy + 107}" stroke="#444852"/>
      <text x="${cx + 214}" y="${cy + 120}" class="op-sub-lbl">Wave</text>
      ${combobox(device, `Osc-${letter} Wave`, cx + 214, cy + 123, 58, 14, { shortMap: WAVE_SHORT_NAMES })}
      <path d="${wavePath}" fill="none" stroke="#5ec7d4" stroke-width="1.6"/>
      ${readoutSlider(device, `Osc-${letter} Feedb`, cx + 214, cy + 152, "Feedback", { color: "#e59a46" })}
      <text x="${cx + 278}" y="${cy + 152}" class="op-sub-lbl">Repeat</text>
      <text x="${cx + 278}" y="${cy + 162}" class="op-ax-tag">AX-only</text>
      ${toggleBox(device, `Osc-${letter} Retrig`, cx + 214, cy + 188, 11, 11, { color: "#e59a46", text: "R" })}
      ${readoutSlider(device, `Osc-${letter} Phase`, cx + 230, cy + 184, "Phase", { color: "#e59a46" })}
      ${readoutSlider(device, `${letter} Freq<Vel`, cx + 278, cy + 184, "Osc<Vel", { color: "#e59a46" })}
      ${toggleBox(device, `${letter} Quantize`, cx + 325, cy + 188, 11, 11, { color: "#e59a46", text: "Q" })}
    `;
    } else if (page === "filter") {
      body = `
      ${renderEnvelopeGraph(device, "filter", graphBox)}
      <rect x="${cx + 6}" y="${cy + 95}" width="11" height="10" fill="#5ec7d4" stroke="#5ec7d4"/>
      <text x="${cx + 21}" y="${cy + 103}" class="op-pane-title">Envelope</text>
      <line x1="${cx + 6}" y1="${cy + 107}" x2="${cx + 204}" y2="${cy + 107}" stroke="#444852"/>
      ${readoutSlider(device, "Fe Attack", cx + 8, cy + 120, "Attack")}
      ${readoutSlider(device, "Fe Decay", cx + 62, cy + 120, "Decay")}
      ${readoutSlider(device, "Fe Release", cx + 114, cy + 120, "Release")}
      ${readoutSlider(device, "Fe R < Vel", cx + 162, cy + 120, "Time<Vel")}
      ${readoutSlider(device, "Fe Init", cx + 8, cy + 152, "Initial")}
      ${readoutSlider(device, "Fe Peak", cx + 62, cy + 152, "Peak")}
      ${readoutSlider(device, "Fe Sustain", cx + 114, cy + 152, "Sustain")}
      ${readoutSlider(device, "Fe Amount", cx + 162, cy + 152, "Envelope")}
      <text x="${cx + 8}" y="${cy + 184}" class="op-sub-lbl">Loop</text>
      ${combobox(device, "Fe Mode", cx + 8, cy + 187, 50, 14, { color: "#5ec7d4" })}
      ${readoutSlider(device, "Fe End", cx + 114, cy + 184, "End")}

      <rect x="${cx + 212}" y="${cy + 95}" width="11" height="10" fill="#23252a" stroke="#5ec7d4"/>
      <text x="${cx + 227}" y="${cy + 103}" class="op-pane-title">Filter</text>
      <line x1="${cx + 212}" y1="${cy + 107}" x2="${cx + cw - 6}" y2="${cy + 107}" stroke="#444852"/>
      <text x="${cx + 278}" y="${cy + 120}" class="op-sub-lbl">Shaper</text>
      ${combobox(device, "Shaper Type", cx + 278, cy + 123, 58, 14)}
      ${readoutSlider(device, "Filt < Vel", cx + 214, cy + 152, "Freq<Vel", { color: "#e59a46" })}
      ${readoutSlider(device, "Shaper Drive", cx + 278, cy + 152, "Shp.Drive", { color: "#e59a46" })}
      ${readoutSlider(device, "Filt < Key", cx + 214, cy + 184, "Freq<Key", { color: "#e59a46" })}
      ${readoutSlider(device, "Shaper Mix", cx + 278, cy + 184, "Dry/Wet", { color: "#e59a46" })}
    `;
    } else if (page === "lfo") {
      body = `
      ${renderEnvelopeGraph(device, "lfo", graphBox)}
      <text x="${cx + 8}" y="${cy + 103}" class="op-pane-title">Envelope</text>
      <line x1="${cx + 6}" y1="${cy + 107}" x2="${cx + 204}" y2="${cy + 107}" stroke="#444852"/>
      ${readoutSlider(device, "Le Attack", cx + 8, cy + 120, "Attack")}
      ${readoutSlider(device, "Le Decay", cx + 62, cy + 120, "Decay")}
      ${readoutSlider(device, "Le Release", cx + 114, cy + 120, "Release")}
      ${readoutSlider(device, "Le R < Vel", cx + 162, cy + 120, "Time<Vel")}
      ${readoutSlider(device, "Le Init", cx + 8, cy + 152, "Initial")}
      ${readoutSlider(device, "Le Peak", cx + 62, cy + 152, "Peak")}
      ${readoutSlider(device, "Le Sustain", cx + 114, cy + 152, "Sustain")}
      <text x="${cx + 8}" y="${cy + 184}" class="op-sub-lbl">Loop</text>
      ${combobox(device, "Le Mode", cx + 8, cy + 187, 50, 14, { color: "#5ec7d4" })}
      ${readoutSlider(device, "Le End", cx + 114, cy + 184, "End")}

      <text x="${cx + 214}" y="${cy + 103}" class="op-pane-title">LFO</text>
      <line x1="${cx + 212}" y1="${cy + 107}" x2="${cx + cw - 6}" y2="${cy + 107}" stroke="#444852"/>
      ${readoutSlider(device, "LFO Amt A", cx + 214, cy + 120, "Dest. A", { color: "#e59a46" })}
      ${["A", "B", "C", "D", "FIL"].map((t, i) => `
        <rect x="${cx + 266 + i * 15}" y="${cy + 121}" width="13" height="11" rx="1.5" fill="#1e2025" stroke="#50545c" stroke-dasharray="1.5 1"/>
        <text x="${cx + 272.5 + i * 15}" y="${cy + 129}" text-anchor="middle" fill="#868b96" class="op-mini">${t}</text>
      `).join("")}
      ${readoutSlider(device, "LFO Amt B", cx + 278, cy + 152, "Dest. B", { color: "#e59a46" })}
      ${combobox(device, "LFO Dst B", cx + 214, cy + 153, 58, 14)}
      ${readoutSlider(device, "LFO R < K", cx + 214, cy + 184, "Rate<Key", { color: "#e59a46" })}
      ${readoutSlider(device, "LFO < Vel", cx + 278, cy + 184, "Amt<Vel", { color: "#e59a46" })}
    `;
    } else if (page === "pitch") {
      body = `
      ${renderEnvelopeGraph(device, "pitch", graphBox)}
      <text x="${cx + 8}" y="${cy + 103}" class="op-pane-title">Envelope</text>
      <line x1="${cx + 6}" y1="${cy + 107}" x2="${cx + 204}" y2="${cy + 107}" stroke="#444852"/>
      ${readoutSlider(device, "Pe Attack", cx + 8, cy + 120, "Attack")}
      ${readoutSlider(device, "Pe Decay", cx + 62, cy + 120, "Decay")}
      ${readoutSlider(device, "Pe Release", cx + 114, cy + 120, "Release")}
      ${readoutSlider(device, "Pe R < Vel", cx + 162, cy + 120, "Time<Vel")}
      ${readoutSlider(device, "Pe Init", cx + 8, cy + 152, "Initial")}
      ${readoutSlider(device, "Pe Peak", cx + 62, cy + 152, "Peak")}
      ${readoutSlider(device, "Pe Sustain", cx + 114, cy + 152, "Sustain")}
      <text x="${cx + 8}" y="${cy + 184}" class="op-sub-lbl">Loop</text>
      ${combobox(device, "Pe Mode", cx + 8, cy + 187, 50, 14, { color: "#5ec7d4" })}
      ${readoutSlider(device, "Pe End", cx + 114, cy + 184, "End")}

      <text x="${cx + 214}" y="${cy + 103}" class="op-pane-title">Aux</text>
      <line x1="${cx + 212}" y1="${cy + 107}" x2="${cx + cw - 6}" y2="${cy + 107}" stroke="#444852"/>
      ${readoutSlider(device, "Pe Amt A", cx + 214, cy + 120, "Dest. A", { color: "#e59a46" })}
      ${["A", "B", "C", "D", "LFO"].map((t, i) => `
        <rect x="${cx + 266 + i * 15}" y="${cy + 121}" width="13" height="11" rx="1.5" fill="#1e2025" stroke="#50545c" stroke-dasharray="1.5 1"/>
        <text x="${cx + 272.5 + i * 15}" y="${cy + 129}" text-anchor="middle" fill="#868b96" class="op-mini">${t}</text>
      `).join("")}
      ${readoutSlider(device, "Pe Amt B", cx + 278, cy + 152, "Dest. B", { color: "#e59a46" })}
      ${combobox(device, "Pe Dst B", cx + 214, cy + 153, 58, 14)}
      <text x="${cx + 214}" y="${cy + 184}" class="op-sub-lbl">Glide</text>
      ${toggleBox(device, "Glide On", cx + 214, cy + 188, 11, 11, { color: "#e59a46", text: "G" })}
      ${readoutSlider(device, "Glide Time", cx + 278, cy + 184, "Time", { color: "#e59a46" })}
    `;
    } else if (page === "global") {
      const algIdx = bound(Math.round(paramVal(device, "Algorithm", 0)), 0, 10);
      const algButtons = ALGORITHMS.map((alg, i) => {
        const ax2 = cx + 6 + i * 30.5;
        const ay = cy + 6;
        return `<g data-choice="Algorithm" data-value="${i}" role="button" tabindex="0"
          aria-label="Algorithm ${i + 1}" aria-pressed="${algIdx === i}">
        <rect x="${ax2.toFixed(1)}" y="${ay}" width="29" height="32" rx="2" fill="${algIdx === i ? "#2a2d34" : "transparent"}"/>
        ${algorithmIcon(alg, ax2 + 1, ay + 2, 27, 28, algIdx === i)}
      </g>`;
      }).join("");
      const ax = {};
      const rows = [
        ["Velocity", ax.velDstA ?? "In Live", ax.velAmtA ?? "\u2014", ax.velDstB ?? "In Live", ax.velAmtB ?? "\u2014", null, null],
        ["Key", ax.keyDstA ?? "In Live", ax.keyAmtA ?? "\u2014", "Time", null, "Time < Key", null],
        ["Aftertouch", ax.atDstA ?? "In Live", ax.atAmtA ?? "\u2014", ax.atDstB ?? "In Live", ax.atAmtB ?? "\u2014", null, null],
        ["Pitch Bend", ax.pbDstA ?? "In Live", ax.pbAmtA ?? "\u2014", "Pitch", null, "PB Range", null],
        ["Mod Wheel", ax.mwDstA ?? "In Live", ax.mwAmtA ?? "\u2014", ax.mwDstB ?? "In Live", ax.mwAmtB ?? "\u2014", null, null]
      ];
      const matrixSvg = rows.map(([label, dA, aA, dB, aB, paramB], r) => {
        const ry = cy + 72 + r * 19;
        const bCell = paramB ? `<text x="${cx + 210}" y="${ry}" class="op-sub-val" fill="#e59a46">${esc(dB)}</text>
           <g data-param="${esc(paramB)}" role="slider" tabindex="0" aria-label="${esc(paramB)}">
             <rect x="${cx + 275}" y="${ry - 9}" width="46" height="13" fill="transparent"/>
             <text x="${cx + 280}" y="${ry}" class="op-sub-val" fill="#e59a46">${esc(disp(paramByName(device, paramB)))}</text>
           </g>` : `<text x="${cx + 210}" y="${ry}" class="op-ax-tag">${esc(dB)}</text>
           <text x="${cx + 280}" y="${ry}" class="op-ax-tag">${esc(aB)}</text>`;
        return `<text x="${cx + 8}" y="${ry}" class="op-sub-lbl">${label}</text>
        <text x="${cx + 88}" y="${ry}" class="op-ax-tag">${esc(dA)}</text>
        <text x="${cx + 158}" y="${ry}" class="op-ax-tag">${esc(aA)}</text>
        ${bCell}`;
      }).join("");
      body = `
      <rect x="${cx + 4}" y="${cy + 3}" width="${cw - 8}" height="38" rx="2" fill="#141518" stroke="#2c2f36"/>
      ${algButtons}
      <text x="${cx + 88}" y="${cy + 56}" class="op-sub-lbl">Conn. A</text>
      <text x="${cx + 158}" y="${cy + 56}" class="op-sub-lbl">Amt. A</text>
      <text x="${cx + 210}" y="${cy + 56}" class="op-sub-lbl">Conn. B</text>
      <text x="${cx + 280}" y="${cy + 56}" class="op-sub-lbl">Amt. B</text>
      <line x1="${cx + 6}" y1="${cy + 46}" x2="${cx + cw - 6}" y2="${cy + 46}" stroke="#444852"/>
      ${matrixSvg}
      <line x1="${cx + 6}" y1="${cy + 162}" x2="${cx + cw - 6}" y2="${cy + 162}" stroke="#444852"/>
      <text x="${cx + 8}" y="${cy + 178}" class="op-sub-lbl">Voices</text>
      <text x="${cx + 8}" y="${cy + 190}" class="op-ax-tag">${esc(ax.voices ?? "In Live")}</text>
      <text x="${cx + 52}" y="${cy + 178}" class="op-sub-lbl">Rtg</text>
      <text x="${cx + 52}" y="${cy + 190}" class="op-ax-tag">${ax.rtg !== void 0 ? ax.rtg ? "On" : "Off" : "AX"}</text>
      <text x="${cx + 84}" y="${cy + 178}" class="op-sub-lbl">Interpol.</text>
      <text x="${cx + 84}" y="${cy + 190}" class="op-ax-tag">${ax.interpol !== void 0 ? ax.interpol ? "On" : "Off" : "AX"}</text>
      <text x="${cx + 136}" y="${cy + 178}" class="op-sub-lbl">Antialias</text>
      <text x="${cx + 136}" y="${cy + 190}" class="op-ax-tag">${ax.antialias !== void 0 ? ax.antialias ? "On" : "Off" : "AX"}</text>
      ${readoutSlider(device, "Panorama", cx + 190, cy + 178, "Pan", { color: "#e59a46" })}
      ${readoutSlider(device, "Pan < Key", cx + 235, cy + 178, "Pan<Key", { color: "#e59a46" })}
      ${readoutSlider(device, "Pan < Rnd", cx + 290, cy + 178, "Pan<Rnd", { color: "#e59a46" })}
    `;
    }
    return `<g>
    <rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="2" fill="#23252a" stroke="#181a1e" stroke-width="1"/>
    ${body}
  </g>`;
  }
  function renderRightColumn(device, activePage) {
    const rx = 596, rw = 246;
    const lfoOn = paramVal(device, "LFO On", 0) >= 0.5;
    const lfoRange = Math.round(paramVal(device, "LFO Range", 0));
    const lfoRateParam = lfoRange === 2 ? "LFO Sync" : "LFO Rate";
    const filtOn = paramVal(device, "Filter On", 1) >= 0.5;
    const filtType = Math.round(paramVal(device, "Filter Type", 0));
    const circuitParam = filtType >= 2 ? "Filter Circuit - BP/NO/Morph" : "Filter Circuit - LP/HP";
    const peOn = paramVal(device, "Pe On", 0) >= 0.5;
    const algIdx = bound(Math.round(paramVal(device, "Algorithm", 0)), 0, 10);
    const cardBg = (p) => activePage === p ? "#444750" : "#32353c";
    return `<g>
    <!-- LFO Card -->
    <rect x="${rx}" y="20" width="${rw}" height="47" rx="2" fill="${cardBg("lfo")}" stroke="${activePage === "lfo" ? "#696e7a" : "#24262b"}"/>
    <g data-page="lfo" role="tab" tabindex="0" aria-label="Select LFO page" aria-selected="${activePage === "lfo"}">
      <rect x="${rx + 22}" y="21" width="70" height="18" fill="transparent"/>
      <text x="${rx + 24}" y="34" class="op-card-title">LFO</text>
    </g>
    ${toggleBox(device, "LFO On", rx + 8, 25, 11, 11, { color: "#5ec7d4" })}
    ${combobox(device, "LFO Type", rx + 8, 42, 42, 13, { color: "#d0d4de" })}
    ${combobox(device, "LFO Range", rx + 53, 42, 22, 13, { color: "#d0d4de", shortMap: { Low: "L", High: "H", Sync: "S" } })}
    ${toggleBox(device, "LFO Retrigger", rx + 78, 42, 12, 13, { color: "#e59a46", text: "R" })}
    ${dial(device, lfoRateParam, rx + 136, 45, "Rate", { color: "#5ec7d4", dim: !lfoOn })}
    ${dial(device, "LFO Amt", rx + 206, 45, "Amount", { color: "#5ec7d4", dim: !lfoOn })}

    <!-- Filter Card -->
    <rect x="${rx}" y="69" width="${rw}" height="47" rx="2" fill="${cardBg("filter")}" stroke="${activePage === "filter" ? "#696e7a" : "#24262b"}"/>
    <g data-page="filter" role="tab" tabindex="0" aria-label="Select Filter page" aria-selected="${activePage === "filter"}">
      <rect x="${rx + 22}" y="70" width="30" height="18" fill="transparent"/>
      <text x="${rx + 24}" y="83" class="op-card-title">Filter</text>
    </g>
    ${toggleBox(device, "Filter On", rx + 8, 74, 11, 11, { color: "#5ec7d4" })}
    ${combobox(device, "Filter Type", rx + 52, 73, 40, 13, { color: "#d0d4de", shortMap: { Lowpass: "LP", Highpass: "HP", Bandpass: "BP", Notch: "NO", Morph: "MR" } })}
    <g data-choice="Filter Slope" data-value="0" role="button" tabindex="0" aria-label="12 dB slope" aria-pressed="${paramVal(device, "Filter Slope", 1) < 0.5}">
      <rect x="${rx + 8}" y="91" width="18" height="13" rx="1.5" fill="${paramVal(device, "Filter Slope", 1) < 0.5 ? "#e59a46" : "#23252a"}"/>
      <text x="${rx + 17}" y="100.5" text-anchor="middle" fill="${paramVal(device, "Filter Slope", 1) < 0.5 ? "#141518" : "#b4b8c2"}" class="op-mini-bold">12</text>
    </g>
    <g data-choice="Filter Slope" data-value="1" role="button" tabindex="0" aria-label="24 dB slope" aria-pressed="${paramVal(device, "Filter Slope", 1) >= 0.5}">
      <rect x="${rx + 27}" y="91" width="18" height="13" rx="1.5" fill="${paramVal(device, "Filter Slope", 1) >= 0.5 ? "#e59a46" : "#23252a"}"/>
      <text x="${rx + 36}" y="100.5" text-anchor="middle" fill="${paramVal(device, "Filter Slope", 1) >= 0.5 ? "#141518" : "#b4b8c2"}" class="op-mini-bold">24</text>
    </g>
    ${combobox(device, circuitParam, rx + 50, 91, 42, 13, { color: "#d0d4de" })}
    ${dial(device, "Filter Freq", rx + 136, 94, "Freq", { color: "#5ec7d4", dim: !filtOn })}
    ${dial(device, "Filter Res", rx + 206, 94, "Res", { color: "#5ec7d4", dim: !filtOn })}

    <!-- Pitch Env Card -->
    <rect x="${rx}" y="118" width="${rw}" height="47" rx="2" fill="${cardBg("pitch")}" stroke="${activePage === "pitch" ? "#696e7a" : "#24262b"}"/>
    <g data-page="pitch" role="tab" tabindex="0" aria-label="Select Pitch page" aria-selected="${activePage === "pitch"}">
      <rect x="${rx + 4}" y="120" width="38" height="20" fill="transparent"/>
      <path d="M ${rx + 8} 131 H ${rx + 20} L ${rx + 26} 131" fill="none" stroke="#8b909a" stroke-width="1.2"/>
      <line x1="${rx + 8}" y1="127" x2="${rx + 8}" y2="135" stroke="#8b909a" stroke-width="1"/>
    </g>
    ${toggleBox(device, "Pe On", rx + 8, 142, 11, 11, { color: "#5ec7d4" })}
    ${dial(device, "Pe Amount", rx + 64, 143, "Pitch Env", { color: "#5ec7d4", dim: !peOn })}
    ${dial(device, "Spread", rx + 136, 143, "Spread", { color: "#5ec7d4" })}
    ${dial(device, "Transpose", rx + 206, 143, "Transpose", { color: "#5ec7d4" })}

    <!-- Global Card -->
    <rect x="${rx}" y="167" width="${rw}" height="48" rx="2" fill="${cardBg("global")}" stroke="${activePage === "global" ? "#696e7a" : "#24262b"}"/>
    <g data-page="global" role="tab" tabindex="0" aria-label="Select Global page" aria-selected="${activePage === "global"}">
      <rect x="${rx + 4}" y="170" width="34" height="42" fill="transparent"/>
      ${algorithmIcon(ALGORITHMS[algIdx], rx + 8, 174, 24, 34, true)}
    </g>
    ${dial(device, "Time", rx + 64, 193, "Time", { color: "#5ec7d4" })}
    ${dial(device, "Tone", rx + 136, 193, "Tone", { color: "#5ec7d4" })}
    ${dial(device, "Volume", rx + 206, 193, "Volume", { color: "#5ec7d4" })}
  </g>`;
  }
  function renderDevice(parameters, view = {}) {
    const activePage = view.page || "osc-a";
    return `<svg viewBox="0 0 ${DEVICE_WIDTH} ${DEVICE_HEIGHT}" width="100%" height="100%" role="group" aria-label="Operator device panel">
    <rect x="0" y="0" width="${DEVICE_WIDTH}" height="${DEVICE_HEIGHT}" rx="3" fill="#2a2c32"/>
    ${renderTitleBar(parameters)}
    ${renderOscillatorColumn(parameters, activePage)}
    ${renderCenterColumn(parameters, view)}
    ${renderRightColumn(parameters, activePage)}
  </svg>`;
  }
  return __toCommonJS(index_exports);
})();
