var EQ8Renderer = (() => {
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

  // web/device-renderers/eq8/index.js
  var index_exports = {};
  __export(index_exports, {
    bandResponse: () => bandResponse,
    channelFor: () => channelFor,
    clamp: () => clamp,
    coefficients: () => coefficients,
    formatParameter: () => formatParameter,
    frequencyToRaw: () => frequencyToRaw,
    frequencyToX: () => frequencyToX,
    gainToY: () => gainToY,
    getBands: () => getBands,
    graph: () => graph,
    handleX: () => handleX,
    handleY: () => handleY,
    rawToFrequency: () => rawToFrequency,
    rawToQ: () => rawToQ,
    renderDevice: () => renderDevice,
    responseAt: () => responseAt,
    sectionDb: () => sectionDb,
    xToFrequency: () => xToFrequency,
    yToGain: () => yToGain
  });

  // web/device-renderers/eq8/model.js
  var graph = Object.freeze({ x: 57.5, y: 19.5, width: 408, height: 146, zero: 92.25 });
  var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  var rawToFrequency = (v) => 10 * Math.pow(2200, clamp(v, 0, 1));
  var frequencyToRaw = (f) => clamp(Math.log(Math.max(10, f) / 10) / Math.log(2200), 0, 1);
  var rawToQ = (v) => 0.1 * Math.pow(180, clamp(v, 0, 1));
  var frequencyToX = (f) => graph.x + graph.width * Math.log(Math.max(1e-8, f) / 10) / Math.log(2200);
  var xToFrequency = (x) => 10 * Math.pow(2200, (x - graph.x) / graph.width);
  var gainToY = (db) => graph.zero - db * (graph.height / 30);
  var yToGain = (y) => (graph.zero - y) / (graph.height / 30);
  var handleX = (raw) => graph.x + 7 + (graph.width - 14) * clamp(raw, 0, 1);
  function handleY(band) {
    let gain = band.gain;
    if ([0, 1, 4, 6, 7].includes(band.type)) gain = (band.rawQ - 0.5) * 30;
    return graph.zero - clamp(gain, -15, 15) * (graph.height - 14) / 30;
  }
  var value = (p, n, f = 0) => Number(p[n]?.value ?? f);
  var channelFor = (view) => ["R", "S"].includes(view?.editChannel) ? "B" : "A";
  function getBands(parameters, view = {}) {
    const channel = channelFor(view);
    return Array.from({ length: 8 }, (_, i) => {
      const index = i + 1, prefix = index + " ", suffix = " " + channel;
      const rawFrequency = value(parameters, prefix + "Frequency" + suffix, 0.5), rawQ = value(parameters, prefix + "Q" + suffix, 0.3766662);
      return { index, channel, on: !!value(parameters, prefix + "Filter On" + suffix), type: Math.round(value(parameters, prefix + "Filter Type" + suffix, 3)), frequency: rawToFrequency(rawFrequency), gain: value(parameters, prefix + "Gain" + suffix), q: rawToQ(rawQ), rawFrequency, rawQ };
    });
  }
  function formatParameter(p) {
    if (!p) return "";
    if (p.display != null && (p.initial === void 0 || Math.abs(p.value - p.initial) < 1e-8)) return p.display;
    const v = Number(p.value);
    if (p.items?.length) return p.items[Math.round(v)] ?? String(v);
    if (p.name.includes("Frequency")) {
      const f = rawToFrequency(v);
      return f >= 1e3 ? (f / 1e3).toFixed(f >= 1e4 ? 1 : 2) + " kHz" : (f < 100 ? f.toFixed(1) : Math.round(f)) + " Hz";
    }
    if (/\bQ [AB]$/.test(p.name)) return rawToQ(v).toFixed(2);
    if (p.name === "Scale") return Math.round(v * 100) + " %";
    if (p.name === "Output" || p.name.includes("Gain")) return v.toFixed(1) + " dB";
    return String(v);
  }
  function coefficients(type, frequency, gain, q, sampleRate = 44100) {
    const w = 2 * Math.PI * clamp(frequency, 0.01, sampleRate * 0.49999) / sampleRate, c = Math.cos(w), s = Math.sin(w), A = Math.pow(10, gain / 40), alpha = s / (2 * Math.max(0.01, q)), root = 2 * Math.sqrt(A) * alpha;
    if (type === 3) return [1 + alpha * A, -2 * c, 1 - alpha * A, 1 + alpha / A, -2 * c, 1 - alpha / A];
    if (type === 4) return [1, -2 * c, 1, 1 + alpha, -2 * c, 1 - alpha];
    if (type <= 1) return [(1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + alpha, -2 * c, 1 - alpha];
    if (type >= 6) return [(1 - c) / 2, 1 - c, (1 - c) / 2, 1 + alpha, -2 * c, 1 - alpha];
    if (type === 2) return [A * (A + 1 - (A - 1) * c + root), 2 * A * (A - 1 - (A + 1) * c), A * (A + 1 - (A - 1) * c - root), A + 1 + (A - 1) * c + root, -2 * (A - 1 + (A + 1) * c), A + 1 + (A - 1) * c - root];
    return [A * (A + 1 + (A - 1) * c + root), -2 * A * (A - 1 + (A + 1) * c), A * (A + 1 + (A - 1) * c - root), A + 1 - (A - 1) * c + root, 2 * (A - 1 - (A + 1) * c), A + 1 - (A - 1) * c - root];
  }
  function sectionDb(f, coeff, sampleRate = 44100) {
    const [b0, b1, b2, a0, a1, a2] = coeff, w = 2 * Math.PI * clamp(f, 1e-3, sampleRate * 0.499999) / sampleRate, c = Math.cos(w), s = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const n = (b0 + b1 * c + b2 * c2) ** 2 + (b1 * s + b2 * s2) ** 2, d = (a0 + a1 * c + a2 * c2) ** 2 + (a1 * s + a2 * s2) ** 2;
    return 10 * Math.log10(Math.max(1e-24, n) / Math.max(1e-24, d));
  }
  function bandResponse(f, band, parameters = {}, view = {}) {
    if (!band.on) return 0;
    const fs = view.sampleRateHz ?? view.sampleRate ?? 44100, scale = value(parameters, "Scale", 1), gain = band.gain * scale;
    let q = band.q;
    if (band.type === 3 && value(parameters, "Adaptive Q", 1)) q *= 1 + Math.pow(Math.abs(gain) / 12, 2.4);
    if (band.type === 2 || band.type === 5) q = 0.70710678 * Math.exp(2 * (band.rawQ - 0.45)) * Math.pow(10, (Math.abs(gain) - 12) / 60);
    const coeff = coefficients(band.type, band.frequency, gain, q, fs);
    if (band.type === 0 || band.type === 7) {
      const damping = 0.494 + 1.35 * band.rawQ;
      return [0.50979558, 0.60134489, 0.89997622, 2.56291545].reduce((db, poleQ) => db + sectionDb(f, coefficients(band.type, band.frequency, 0, poleQ * damping, fs), fs), 0);
    }
    return sectionDb(f, coeff, fs);
  }
  function responseAt(f, bands, parameters = {}, view = {}) {
    return bands.reduce((sum, b) => sum + bandResponse(f, b, parameters, view), 0);
  }

  // web/device-renderers/eq8/svg.js
  var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // web/device-renderers/eq8/device.js
  var W = 535;
  var H = 207;
  var BAND_HANDLE = "#ffb451";
  var pget = (p, n) => p?.[n];
  var fmt = (p) => formatParameter(p);
  var attr = (s) => esc(s);
  var line = (x1, y1, x2, y2, color = "#454545", width = 0.8) => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
  var text = (x, y, s, size = 11, color = "#b9b9b9", anchor = "start", weight = 400) => `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}">${esc(s)}</text>`;
  var rect = (x, y, w, h, fill, stroke = "none", rx = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`;
  var control = (p, role, content, extra = "") => p ? `<g data-param="${attr(p.name)}" tabindex="${p.enabled === false ? -1 : 0}" role="${role}" aria-label="${attr(p.name)}" aria-disabled="${p.enabled === false}" ${role === "slider" ? `aria-valuemin="${p.min}" aria-valuemax="${p.max}" aria-valuenow="${p.value}" aria-valuetext="${attr(fmt(p))}"` : ""} ${extra}>${content}</g>` : content;
  function knob(p, cx, cy, r, label, display, color = "#35b8d1", size = 11, labelY = cy - r - 8, valueY = cy + r + 11, dimPointer = false) {
    if (!p) return "";
    const frac = Math.max(0, Math.min(1, (p.value - p.min) / (p.max - p.min))), bipolar = /\bGain\b/.test(p.name);
    const amount = bipolar ? Math.max(-1, Math.min(1, Number(p.value) / Math.max(Math.abs(p.min), Math.abs(p.max)))) : frac;
    const startAngle = bipolar ? 0 : -135, angle = (bipolar ? amount * 135 : -135 + 270 * frac) * Math.PI / 180;
    const startX = cx + Math.sin(startAngle * Math.PI / 180) * r, startY = cy - Math.cos(startAngle * Math.PI / 180) * r;
    const x1 = cx + Math.sin(-135 * Math.PI / 180) * r, y1 = cy - Math.cos(-135 * Math.PI / 180) * r;
    const x2 = cx + Math.sin(135 * Math.PI / 180) * r, y2 = cy - Math.cos(135 * Math.PI / 180) * r;
    const endX = cx + Math.sin(angle) * r, endY = cy - Math.cos(angle) * r;
    const arc = `M${x1} ${y1} A${r} ${r} 0 1 1 ${x2} ${y2}`;
    const marker = `M${cx + Math.sin(angle) * (r - 2)} ${cy - Math.cos(angle) * (r - 2)}L${cx + Math.sin(angle) * (r - 6)} ${cy - Math.cos(angle) * (r - 6)}`;
    const progress = bipolar ? Math.abs(amount) * 135 : frac * 270, sweep = bipolar ? amount >= 0 ? 1 : 0 : 1;
    const activeArc = progress > 0.1 ? `<path d="M${startX} ${startY} A${r} ${r} 0 ${progress > 180 ? 1 : 0} ${sweep} ${endX} ${endY}" fill="none" stroke="${color}" stroke-width="2.8"/>` : "";
    const inner = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#363636" stroke="#111" stroke-width="1.4"/><path d="${arc}" fill="none" stroke="#090a0a" stroke-width="2.8"/>${activeArc}<path d="${marker}" stroke="${dimPointer ? "#777" : "#101010"}" stroke-width="2.3" stroke-linecap="round"/>`;
    return control(p, "slider", `${text(cx, labelY, label, size, "#c2c2c2", "middle", 500)}${inner}${text(cx, valueY, display, 10.5, "#d1d1d1", "middle")}`);
  }
  function filterGlyph(type, x, y, color = "#c5c5c5") {
    const paths = [
      "M0 10H6L11 0H30",
      "M0 10C8 10 9 0 16 0H30",
      "M0 10H7L12 2H30",
      "M0 5H7L12 1H18L23 5H30 M7 5L12 9H18L23 5",
      "M0 5H8L12 9H18L22 5H30 M8 5L12 1H18L22 5",
      "M0 2H18L23 10H30",
      "M0 0H14C21 0 22 10 30 10",
      "M0 0H19L24 10H30"
    ];
    return `<g transform="translate(${x} ${y}) scale(.6 1)"><path d="${paths[type] || paths[3]}" fill="none" stroke="${color}" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }
  function curvePath(bands, parameters, view) {
    const xs = /* @__PURE__ */ new Set();
    for (let i = 0; i <= 480; i++) xs.add((graph.x + graph.width * i / 480).toFixed(4));
    for (const b of bands) {
      const step = 0.45 / Math.max(0.4, b.q);
      for (let k = -16; k <= 16; k++) {
        const f = b.frequency * Math.pow(2, k * step), x = frequencyToX(f);
        if (x >= graph.x && x <= graph.x + graph.width) xs.add(x.toFixed(4));
      }
      const cx = frequencyToX(b.frequency);
      if (cx >= graph.x && cx <= graph.x + graph.width) xs.add(cx.toFixed(4));
    }
    return [...xs].map(Number).sort((a, b) => a - b).map((x, i) => {
      const db = responseAt(xToFrequency(x), bands, parameters, view);
      return `${i ? "L" : "M"}${x.toFixed(2)} ${gainToY(db).toFixed(2)}`;
    }).join("");
  }
  function grid() {
    let s = "";
    const labels = [100, 1e3, 1e4];
    for (let decade = 10; decade <= 1e4; decade *= 10) {
      for (let multiple = 1; multiple <= 9; multiple++) {
        const f = decade * multiple;
        if (f < 10 || f > 22e3) continue;
        const x = frequencyToX(f), major = multiple === 1;
        s += line(x, graph.y, x, graph.y + graph.height, major ? "#4b4b4b" : "#333", major ? 0.85 : 0.6);
        if (labels.includes(f)) s += text(x, graph.y + graph.height - 3, f >= 1e3 ? f / 1e3 + "k" : String(f), 11, "#858585", "middle", 500);
      }
    }
    for (const db of [-12, -6, 0, 6, 12]) {
      const y = gainToY(db);
      s += line(graph.x + 24.5, y, graph.x + graph.width, y, db === 0 ? "#545454" : "#343434", db === 0 ? 1 : 0.75);
      s += text(graph.x + 7, y + 3, String(db), 10, "#777", "start");
    }
    return s;
  }
  function infoKnob(parameters, selected, channel, name, cx, cy, r, label, labelY, valueY, type, inactive = false, bypassed = false) {
    let p = pget(parameters, `${selected} ${name} ${channel}`);
    const gainDisabled = name === "Gain" && [0, 1, 4, 6, 7].includes(type);
    if (gainDisabled) p = { ...p, enabled: false };
    const dim = inactive || gainDisabled || bypassed;
    return knob(p, cx, cy, r, label, fmt(p), dim ? "#777" : "#32b8d0", 11, labelY, valueY, dim);
  }
  function valueBox(p, label, x, y) {
    if (!p) return "";
    return control(p, "slider", `${text(x, y, label, 10.5, "#c7c7c7", "start", 600)}${rect(x, y + 3, 49, 13, "#167c8b", "#111", 1)}${text(x + 24.5, y + 13, fmt(p), 10, "#d1d1d1", "middle", 500)}`);
  }
  function renderDevice(parameters, view = {}) {
    if (!parameters || !view) return null;
    const bands = getBands(parameters, view) || [];
    const otherChannel = { L: "R", R: "L", M: "S", S: "M" }[view.editChannel ?? "L"] ?? "R";
    const inactiveView = { ...view, editChannel: otherChannel };
    const inactiveBands = getBands(parameters, inactiveView) || [];
    const selected = Number(view.selectedBand ?? 1);
    const active = bands.find((b) => Number(b.index) === selected) || bands[0] || {};
    const channel = active.channel ?? "A";
    const disabled = Number(pget(parameters, "Device On")?.value ?? 1) === 0;
    const mode = view.mode ?? "Stereo";
    const parts = [];
    const pixelScale = Number(view.scale) || 1;
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${(Number(view.logicalWidth) || W) * pixelScale}" height="${(Number(view.logicalHeight) || H) * pixelScale}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif" role="group" aria-label="EQ Eight device"${disabled ? ' style="filter:saturate(.08)"' : ""}>`);
    parts.push(`<defs><linearGradient id="head" x2="0" y2="1"><stop stop-color="#4a4a4a"/><stop offset="1" stop-color="#3e3e3e"/></linearGradient><clipPath id="plotClip"><rect x="${graph.x}" y="${graph.y}" width="${graph.width}" height="${graph.height}"/></clipPath></defs>`);
    parts.push(rect(0, 0, W, H, "#383838"));
    parts.push(rect(0, 0, W, 19.5, "url(#head)"));
    parts.push(control(pget(parameters, "Device On"), "button", `<g aria-hidden="true"><circle cx="11.5" cy="10" r="6.4" fill="${disabled ? "#222222" : "#ffad58"}" stroke="#111" stroke-width="1.4"/></g>`, 'aria-pressed="' + !disabled + '"'));
    parts.push(`<g aria-hidden="true"><circle cx="28.5" cy="10" r="6.4" fill="#242424" stroke="#171717"/><path d="M25.1 10.7 28.5 7.3l3.4 3.4M28.5 7.5v5.1M25.5 13h6" fill="none" stroke="#aaa" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round"/></g>`);
    parts.push(text(40, 14, "EQ Eight", 12.2, "#c8c8c8", "start", 600));
    for (const cx of [481.5, 498.5, 515.5]) parts.push(`<g aria-hidden="true"><circle cx="${cx}" cy="10" r="7" fill="#292929" stroke="#171717"/></g>`);
    parts.push(`<g aria-hidden="true" fill="none" stroke="#b8b8b8" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"><path d="M479.2 7.3a3.55 3.55 0 0 1 5.3.4l.9 1.1m-.1-3v3h-3M483.8 12.7a3.55 3.55 0 0 1-5.3-.4l-.9-1.1m.1 3v-3h3"/></g>`);
    parts.push(`<g aria-hidden="true" fill="#b8b8b8" stroke="#b8b8b8" stroke-width=".55" stroke-linejoin="round"><path d="M495.3 6.8h6l2 2v5.3h-8z"/><path d="M496.5 7.4h1.3v2h-1.3z" fill="#292929" stroke="#292929"/><path d="M496.6 11.1h5.4v2h-5.4z" fill="#292929" stroke="#292929"/></g>`);
    parts.push(`<g aria-hidden="true" fill="#b8b8b8"><circle cx="513" cy="10" r=".85"/><circle cx="515.5" cy="10" r=".85"/><circle cx="518" cy="10" r=".85"/></g>`);
    parts.push(rect(0, 19.5, 57.5, 187, "#353535"));
    parts.push(infoKnob(parameters, selected, channel, "Frequency", 29.5, 49, 12.5, "Freq", 31, 70, active.type, !active.on, disabled));
    parts.push(infoKnob(parameters, selected, channel, "Gain", 29.5, 113, 13.2, "Gain", 91, 137, active.type, !active.on, disabled));
    parts.push(infoKnob(parameters, selected, channel, "Q", 29.5, 177, 13.2, "Q", 158, 198, active.type, !active.on, disabled));
    parts.push(rect(graph.x, graph.y, graph.width, graph.height, "#171717"));
    parts.push(grid());
    const activeColor = ["R", "S"].includes(view.editChannel) ? "#f5aa50" : "#32b8d0";
    const inactiveD = mode === "Stereo" ? "" : curvePath(inactiveBands, parameters, inactiveView);
    const d = curvePath(bands, parameters, view);
    parts.push(`<g clip-path="url(#plotClip)"><path d="${inactiveD}" fill="none" stroke="#8f8f8f" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${disabled ? "#8f8f8f" : activeColor}" stroke-width="1.65" stroke-linejoin="round" stroke-linecap="round"/>`);
    if (!disabled) for (const b of bands) {
      if (!b.on) continue;
      const x = handleX(b.rawFrequency), y = handleY(b);
      const chosen = Number(b.index) === selected;
      parts.push(`<g data-focus-key="handle-${b.index}" data-band-handle="${b.index}" tabindex="${b.on ? 0 : -1}" role="slider" aria-label="Band ${b.index} frequency and ${[2, 3, 5].includes(b.type) ? "gain" : "Q"}" aria-valuemin="10" aria-valuemax="22000" aria-valuenow="${b.frequency}" aria-valuetext="${fmt(pget(parameters, `${b.index} Frequency ${b.channel}`))}, ${fmt(pget(parameters, `${b.index} ${[2, 3, 5].includes(b.type) ? "Gain" : "Q"} ${b.channel}`))}"><circle cx="${x}" cy="${y}" r="${chosen ? 6.7 : 6.2}" fill="${chosen ? BAND_HANDLE : "#171717"}" stroke="${BAND_HANDLE}" stroke-width="1.2"/><text x="${x}" y="${y + 3}" text-anchor="middle" fill="${chosen ? "#3b3026" : BAND_HANDLE}" font-size="8" font-weight="700">${b.index}</text></g>`);
    }
    parts.push("</g>");
    const bandY = 167, bandH = 37.5, cell = 50.7, bandX = 58.5;
    for (const b of bands) {
      const idx = Number(b.index), x = bandX + (idx - 1) * cell, selectedBand = idx === selected, typeP = pget(parameters, `${idx} Filter Type ${b.channel}`), onP = pget(parameters, `${idx} Filter On ${b.channel}`);
      parts.push(rect(x, bandY, cell - 2, bandH, selectedBand ? "#393939" : "#303030", selectedBand ? "#545454" : "#292929", 1));
      if (typeP) {
        parts.push(`<g data-param="${attr(typeP.name)}" tabindex="${typeP.enabled === false ? -1 : 0}" role="combobox" aria-label="${attr(typeP.name)}" aria-valuetext="${fmt(typeP)}">${rect(x + 4, bandY + 3, cell - 11, 13, "#252525", "#1c1c1c", 1)}${filterGlyph(Number(typeP.value), x + 8, bandY + 5, "#c5c5c5")}<path d="M${x + cell - 12} ${bandY + 8}l4 4 4-4z" fill="#aaa"/></g>`);
      }
      if (onP) {
        const isOn = Number(onP.value) > 0, onColor = ["R", "S"].includes(view.editChannel) ? "#f5aa50" : "#27b7c9";
        parts.push(control(onP, "button", `${rect(x + 11, bandY + 22, 11.4, 10.3, isOn ? onColor : "#171819", isOn ? onColor : "#090909", 0.6)}`, 'aria-pressed="' + isOn + '"'));
      }
      parts.push(`<g data-focus-key="band-${idx}" data-band-select="${idx}" tabindex="0" role="button" aria-label="Select band ${idx}" aria-pressed="${selectedBand}">${text(x + 31, bandY + 31, idx, 11, selectedBand ? "#f0f0f0" : "#b5b5b5", "middle", selectedBand ? 600 : 400)}<rect x="${x + 22}" y="${bandY + 18}" width="26" height="17" fill="transparent"/></g>`);
    }
    const rx = 471;
    parts.push(rect(471, 19.5, 62.5, 187, "#303030"));
    parts.push(rect(472, 25, 18, 14, "#181919", "#171717", 1));
    parts.push(`<g aria-hidden="true" fill="#bdbdbd"><path d="M476 33v-2.3a5.5 5.5 0 0 1 11 0V33h-1.6v-2.2a3.9 3.9 0 0 0-7.8 0V33z"/><path d="M476 31.2h2.1v4.2H477a1 1 0 0 1-1-1zM484.9 31.2h2.1v3.2a1 1 0 0 1-1 1h-1.1z"/></g>`);
    parts.push(rect(499, 25, 21, 14, "#181919", "#171717", 1));
    parts.push(`<g aria-hidden="true" fill="#bdbdbd"><path d="M502.8 34.8v-3.2h1.7v3.2zM505.8 34.8v-6.1h1.7v6.1zM508.8 34.8v-4.3h1.7v4.3zM511.8 34.8v-5.4h1.7v5.4zM514.8 34.8v-3.5h1.7v3.5zM517.8 34.8v-2.4h1.7v2.4z"/></g>`);
    parts.push(text(rx, 53, "Mode", 11, "#c7c7c7", "start", 600));
    parts.push(`<g data-focus-key="view-mode" data-view-mode="${attr(mode)}" tabindex="0" role="button" aria-label="Mode ${attr(mode)}" aria-haspopup="listbox">${rect(rx, 57, 49, 14, "#1a1b1b", "#111", 1)}${text(rx + 3, 68, mode, 11, "#d0d0d0", "start", 500)}<path d="M${rx + 42} 62l4 5 4-5" fill="#aaa"/></g>`);
    parts.push(text(rx, 84, "Edit", 11, "#c7c7c7", "start", 600));
    parts.push(`<g data-focus-key="view-channel" data-view-channel="${attr(view.editChannel ?? "L")}" tabindex="0" role="button" aria-label="Edit channel ${attr(view.editChannel ?? "L")}" aria-pressed="true">${rect(rx, 88, 49, 14, "#171818", "#121212", 1)}${text(rx + 24.5, 99, view.editChannel ?? "L", 11, "#b9b9b9", "middle", 500)}</g>`);
    parts.push(text(rx, 116, "Adapt. Q", 11, "#c7c7c7", "start", 600));
    const adapt = pget(parameters, "Adaptive Q");
    if (adapt) {
      const on = adapt.value > 0, fill = disabled ? "#777" : on ? "#ffac59" : "#4b4b4b", stroke = disabled ? "#666" : on ? "#ffd091" : "#343434", labelColor = disabled ? "#fff" : "#292929";
      parts.push(control(adapt, "button", `${rect(rx, 120, 49, 13, fill, stroke, 1)}${text(rx + 24.5, 130, on ? "On" : "Off", 10, labelColor, "middle", 600)}`, 'aria-pressed="' + on + '"'));
    }
    const scale = pget(parameters, "Scale");
    parts.push(valueBox(scale, "Scale", rx, 144));
    const output = pget(parameters, "Output");
    parts.push(valueBox(output, "Output", rx, 177));
    parts.push("</svg>");
    return parts.join("");
  }
  return __toCommonJS(index_exports);
})();
