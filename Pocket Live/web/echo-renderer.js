var EchoRenderer = (() => {
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

  // web/device-renderers/echo/index.js
  var index_exports = {};
  __export(index_exports, {
    clamp: () => clamp,
    format: () => format,
    render: () => render
  });

  // web/device-renderers/echo/parameters.js
  var clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  var delayMilliseconds = (value) => 1 + 2499 * clamp(value, 0, 1) ** 3.33;
  var modulationHertz = (value) => 0.01 * 4e3 ** clamp(value, 0, 1);
  var frequencyNormalized = (hertz) => clamp(Math.log(hertz / 0.01) / Math.log(4e3), 0, 1);
  var filterHertz = (value) => 20 * 1e3 ** clamp(value, 0, 1);
  var feedbackRatio = (value) => 1.5 * value;
  var offsetRatio = (value) => value - 0.5;
  var gateMilliseconds = (value) => 0.1 * 3e4 ** value;
  var duckMilliseconds = (value) => 20 * 75 ** value;
  var smoothingMilliseconds = (value) => 10 + 990 * value ** 3.33;
  var modRates = ["8", "6", "4", "3", "2", "1/1.", "1/1", "1/2.", "1/1T", "1/2", "1/4.", "1/2T", "1/4", "1/8.", "1/4T", "1/8", "1/8T", "1/16", "1/16T", "1/32", "1/32T", "1/64"];
  function noteDuration(label) {
    const factor = label.endsWith(".") ? 1.5 : label.endsWith("T") ? 2 / 3 : 1;
    const [numerator, denominator = "1"] = label.replace(/[.T]$/, "").split("/");
    return Number(numerator) / Number(denominator) * factor;
  }
  function channelNote(p, channel) {
    const mode = p[channel + " Sync Mode"].value;
    if (mode === 3) return p[channel + " 16th"].value / 16;
    return 2 ** p[channel + " Synced"].value * [1, 2 / 3, 1.5][mode];
  }
  function channelDepth(p, channel, tempo = 120) {
    const time2 = p[channel + " Sync"].value ? 240 * channelNote(p, channel) / clamp(tempo, 20, 999) : delayMilliseconds(p[channel + " Time"].value) / 1e3;
    return time2 * (1 + offsetRatio(p[channel + " Offset"].value));
  }

  // web/device-renderers/echo/state.js
  var concise = (number, digits = 1) => Number(number.toFixed(digits)).toString();
  function time(milliseconds) {
    if (milliseconds >= 1e3) return (milliseconds / 1e3).toFixed(2) + " s";
    return (milliseconds < 10 ? milliseconds.toFixed(2) : milliseconds < 100 ? milliseconds.toFixed(1) : Math.round(milliseconds)) + " ms";
  }
  function format(p) {
    const v = p.value, n = p.name;
    if (v === p.initial) return p.initialDisplay.trim();
    if (p.items.length) return p.items[Math.round(v - p.min)];
    if (n.endsWith("Synced")) return v === 0 ? "1" : "1/" + 2 ** -Math.round(v);
    if (n.endsWith("16th")) return String(Math.round(v));
    if (n.endsWith("Offset")) return concise((v - 0.5) * 100) + " %";
    if (n === "Mod Phase") return concise(v * 180) + "\xB0";
    if (["Input Gain", "Output"].includes(n)) return ((v - 0.5) * 48).toFixed(1) + " dB";
    if (n.endsWith("Thr")) return concise((v - 1) * 60) + " dB";
    if (n === "Gate Release") return time(gateMilliseconds(v));
    if (n === "Duck Release") return time(duckMilliseconds(v));
    if (n === "Repitch Smoothing Time") return time(smoothingMilliseconds(v));
    if (n === "L Time" || n === "R Time") return time(delayMilliseconds(v));
    if (n === "Mod Freq") {
      const hertz = modulationHertz(v);
      return (hertz < 10 ? hertz.toFixed(2) : hertz.toFixed(1)) + " Hz";
    }
    if (n.endsWith("Freq")) {
      const hertz = filterHertz(v);
      return hertz >= 1e3 ? (hertz / 1e3).toFixed(2) + " kHz" : hertz < 100 ? hertz.toFixed(1) + " Hz" : Math.round(hertz) + " Hz";
    }
    if (n === "Mod Rate") return modRates[Math.round(v)];
    if (n.endsWith("Res")) return v.toFixed(2);
    const multiplier = n === "Feedback" ? 150 : n === "Stereo Width" ? 200 : 100;
    return (v === 0 ? "0.0" : concise(v * multiplier)) + " %";
  }

  // web/device-renderers/echo/controls.js
  var C = { bg: "#363636", black: "#181818", ink: "var(--ink,#b5b5b5)", muted: "var(--muted,#858585)", cyan: "var(--cyan,#03c3d5)", orange: "var(--orange,#ffad56)", header: "#b0ddeb" };
  var esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  var text = (x, y, s, color = C.ink, size = 11.5, anchor = "start") => `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}">${esc(s)}</text>`;
  var rect = (x, y, w, h, fill, stroke = "none", sw = 1, rx = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  var line = (x, y, x2, y2, color = "#252525", w = 1) => `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}"/>`;
  var hit = (p, body, role = "slider", extra = "") => `<g data-param="${esc(p.name)}" role="${role}" tabindex="0" aria-label="${esc(p.name)}" ${role === "slider" ? `aria-valuemin="${p.min}" aria-valuemax="${p.max}" aria-valuenow="${p.value}" aria-valuetext="${esc(format(p))}"` : role === "button" ? `aria-pressed="${p.value > 0}"` : ""} ${extra}>${body}<title>${esc(p.name)}: ${esc(format(p))}</title></g>`;
  function read(p, x, y, w = 45, color = C.cyan, anchor = "start") {
    return hit(p, rect(anchor === "middle" ? x - w / 2 : x, y - 12, w, 17, "transparent") + text(x, y, format(p), color, 11.5, anchor));
  }
  function toggle(p, x, y, w, h, label, color = C.orange, selected = !!p.value) {
    return hit(p, rect(x, y, w, h, selected ? color : "#242424", "#161616", 1.2) + text(x + w / 2, y + h / 2 + 3.7, label, selected ? "#101010" : C.ink, 11.5, "middle"), "button");
  }
  function box(p, x, y, color = C.cyan) {
    return hit(p, rect(x, y, 9, 9, p.value ? color : "none", color, 1), "button");
  }
  function choice(p, x, y, w, h = 13) {
    return hit(p, rect(x, y, w, h, "#242424", "#161616", 1.2) + text(x + 2, y + h - 3, format(p)) + `<path d="M${x + w - 9} ${y + 4}h7l-3.5 5Z" fill="${C.ink}"/>`, "combobox");
  }
  function point(cx, cy, r, a) {
    return [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
  }
  function arc(cx, cy, r, a, b) {
    let p = point(cx, cy, r, a), q = point(cx, cy, r, b);
    return `M${p[0]} ${p[1]}A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${q[0]} ${q[1]}`;
  }
  function knob(p, x, y, label, display) {
    let f = (p.value - p.min) / (p.max - p.min), a = 120 + 300 * f, cx = x + 20, cy = y + 25;
    let hand = point(cx, cy, 12, a);
    return hit(p, rect(x - 10, y - 3, 60, 55, "transparent") + text(cx, y + 7, label, C.ink, 11.5, "middle") + `<path d="${arc(cx, cy, 13, 120, 420)}" fill="none" stroke="#171717" stroke-width="2.3"/><path d="${arc(cx, cy, 13, 120, Math.max(120.01, a))}" fill="none" stroke="${C.cyan}" stroke-width="2.3"/><path d="M${cx} ${cy}L${hand[0]} ${hand[1]}" stroke="#191919" stroke-width="2.5" stroke-linecap="round"/>` + text(cx, y + 48, display ?? format(p), C.ink, 11.5, "middle"));
  }

  // web/device-renderers/echo/model.js
  var tunnelGeometry = Object.freeze({ cx: 285.25, cy: 182.5, radius: 137.5, stroke: 1.6 });
  var waveformGeometry = Object.freeze({ left: 133.5, right: 436, middle: 65.5, amplitude: 32 });
  var projectDepth = (depth) => tunnelGeometry.radius / (1 + Math.max(0, depth));
  var repeatOpacity = (feedback, repeat) => Math.min(1, Math.max(0, feedback) ** (Math.max(0, repeat - 1) / 2));
  function unresolvedRepeat(depth) {
    return tunnelGeometry.radius - projectDepth(depth) < tunnelGeometry.stroke;
  }
  function tunnelSectors(p, tempo = 120) {
    const left = channelDepth(p, "L", tempo), right = channelDepth(p, "R", tempo);
    switch (p["Channel Mode"].value) {
      case 1: {
        const roundTrip = left + right;
        return [
          unresolvedRepeat(left) ? { start: 180, end: 270, offset: 0, step: left, collapsed: true } : { start: 180, end: 270, offset: left, step: roundTrip },
          { start: 270, end: 360, offset: roundTrip, step: roundTrip }
        ];
      }
      case 2:
        return [
          { start: 180, end: 225, offset: 0, step: right },
          { start: 180, end: 360, offset: 0, step: left },
          { start: 315, end: 360, offset: 0, step: right }
        ];
      default:
        return [
          { start: 180, end: 270, offset: 0, step: left },
          { start: 270, end: 360, offset: 0, step: right }
        ];
    }
  }
  function tunnelRings(p, tempo = 120) {
    const feedback = feedbackRatio(p.Feedback.value), rings = [];
    for (const sector of tunnelSectors(p, tempo)) {
      if (sector.collapsed) {
        rings.push({ ...sector, radius: tunnelGeometry.radius, opacity: 1, repeat: 0, dense: true });
        continue;
      }
      const spacing = Math.max(1e-6, sector.step);
      const lastVisibleDepth = tunnelGeometry.radius / 0.3 - 1;
      const opacityLimit = feedback > 0 && feedback < 1 ? Math.ceil(2 * Math.log(4e-3) / Math.log(feedback)) + 1 : feedback === 0 ? 1 : Infinity;
      const opacityStep = sector.opacityStep ?? 1;
      const count = Math.min(opacityLimit / opacityStep, Math.ceil((lastVisibleDepth - sector.offset) / spacing));
      for (let n = 0; n <= count; n++) {
        const depth = sector.offset + n * spacing, radius = projectDepth(depth);
        const opacity = repeatOpacity(feedback, n * opacityStep);
        if (radius < 0.3 || opacity < 4e-3) break;
        const dense = radius - projectDepth(depth + spacing) <= tunnelGeometry.stroke;
        rings.push({ ...sector, radius: radius + (dense ? tunnelGeometry.stroke / 2 : 0), opacity, repeat: n, dense });
        if (dense) break;
      }
    }
    return rings;
  }
  function denseCoverage(sector, feedback, radius) {
    if (radius <= 0) return feedback >= 1 ? 1 : 0;
    if (radius > sector.radius) return 0;
    const depth = tunnelGeometry.radius / radius - 1;
    if (sector.collapsed) return clamp(feedback ** (depth / (16 * sector.step)), 0, 1);
    const repeat = Math.max(0, (depth - sector.offset) / sector.step);
    const alpha = repeatOpacity(feedback, repeat * (sector.opacityStep ?? 1));
    if (alpha >= 1) return 1;
    if (alpha <= 0) return 0;
    const separation = radius - projectDepth(depth + sector.step);
    const overlapping = Math.max(1, tunnelGeometry.stroke / Math.max(1e-12, separation));
    return clamp(-Math.expm1(overlapping * Math.log1p(-alpha)), 0, 1);
  }
  function modulationCycles(p, tempo = 120) {
    const v = p["Mod Sync"].value ? frequencyNormalized(clamp(tempo, 20, 999) / (240 * noteDuration(modRates[Math.round(p["Mod Rate"].value)]))) : p["Mod Freq"].value;
    return 10 ** clamp(v, 0, 1);
  }
  function periodicWave(turns, type) {
    const t = (turns % 1 + 1) % 1;
    switch (type) {
      case 0:
        return Math.sin(t * 2 * Math.PI);
      case 1:
        return 2 / Math.PI * Math.asin(Math.sin(t * 2 * Math.PI));
      case 2:
        return 2 * ((t + 0.5) % 1) - 1;
      case 3:
        return 1 - 2 * ((t + 0.5) % 1);
      case 4:
        return t < 0.5 ? 1 : -1;
      default:
        throw new Error("Random is a held process, not a periodic wave.");
    }
  }
  function randomSample(index, seed = 6051) {
    let n = (Math.imul(index | 0, 73244475) ^ seed) >>> 0;
    n = Math.imul(n ^ n >>> 16, 73244475) >>> 0;
    n = Math.imul(n ^ n >>> 16, 73244475) >>> 0;
    return ((n ^ n >>> 16) >>> 0) / 4294967295 * 1.6 - 0.8;
  }
  function heldWave(index, phase = 0, seed = 6051) {
    const angle = phase * 2 * Math.PI;
    return clamp(randomSample(index, seed) * Math.cos(angle) + randomSample(index, seed ^ 2654435769) * Math.sin(angle), -1, 1);
  }

  // web/device-renderers/echo/pages.js
  function shell(p, page, full = false, active = true) {
    const w = full ? 560 : 504;
    let s = rect(1, 1, w - 2, 205, C.bg, "#686868", 2, 3);
    s += rect(2, 19.5, 130, 184.5, C.bg, "none", 1, 2) + rect(133.5, 19.5, 303, 184.5, C.black, "none", 1, 2);
    s += rect(2, 1, w - 4, 18.5, active ? C.header : "#627f88");
    s += hit(p["Device On"], `<circle cx="12" cy="10" r="6.7" fill="${p["Device On"].value ? C.orange : "#252525"}" stroke="#303030" stroke-width="1.2"/>`, "button") + text(23.5, 14, "Echo", "#0f1719", 11.5).replace("<text ", '<text font-weight="600" ');
    for (const [name, x, bw] of [["Echo", 192, 41], ["Modulation", 235, 75], ["Character", 312, 69]]) {
      s += page === name ? `<path d="M${x - 3} 19.5q3 0 3 -3v3h${bw}v-3q0 3 3 3Z" fill="${C.black}"/>` : "";
      s += `<g role="tab" tabindex="0" aria-label="${name}" aria-selected="${page === name}" data-page="${name}">` + rect(x, 3, bw, page === name ? 18 : 14.5, page === name ? C.black : C.bg, "none", 1, 2) + text(x + bw / 2, 14.5, name, C.ink, 11.5, "middle") + "</g>";
    }
    s += line(67.5, 22, 67.5, 42) + line(67.5, 57, 67.5, 142);
    const mid = p["Channel Mode"].value === 2;
    for (let i = 0; i < 2; i++) {
      const ch = i ? "R" : "L", x = i ? 82.5 : 12.5, pitch = p[ch + " Sync"].value ? p[ch + " Sync Mode"].value === 3 ? p[ch + " 16th"] : p[ch + " Synced"] : p[ch + " Time"];
      s += knob(pitch, x, 24, i ? mid ? "Side" : "Right" : mid ? "Mid" : "Left");
      s += toggle(p[ch + " Sync"], i ? 77.5 : 7.5, 88, 50, 12.5, p[ch + " Sync"].value ? "Sync" : "Time", p[ch + " Sync"].value ? C.orange : C.cyan, true);
      s += choice(p[ch + " Sync Mode"], i ? 77.5 : 7.5, 105.5, 50);
      s += hit(p[ch + " Offset"], rect(i ? 77.5 : 7.5, 122.5, 50, 13, "#242424", "#171717", 1.2) + text(i ? 102.5 : 32.5, 133, format(p[ch + " Offset"]), C.ink, 11.5, "middle") + `<path d="M${i ? 126.5 : 56.5} 124l-7 5 7 5Z" fill="${Math.abs(p[ch + " Offset"].value - 0.5) > 1e-6 ? C.cyan : "#202020"}"/>`);
    }
    s += toggle(p.Link, 57.5, 44.5, 20, 10.5, "") + `<path d="M66 47.5h-3v3h3m3-3h3v3h-3m-4.5-1.5h6" stroke="${p.Link.value ? "#111" : C.ink}" stroke-width="1" fill="none" pointer-events="none"/>`;
    s += knob(p["Input Gain"], 12.5, 152, "Input") + knob(p.Feedback, 82.5, 152, "Feedback");
    s += line(48, 166.5, 57, 166.5) + line(77, 183.5, 86, 183.5);
    s += toggle(p["Clip Dry"], 60, 160, 15, 13, "D") + toggle(p["FB Invert"], 60, 177, 15, 13, "\xD8");
    s += line(437.5, 20, 437.5, 204, "#4a4a4a");
    s += knob(p["Reverb Level"], 451.5, 23, "Reverb") + choice(p["Reverb Loc"], 443, 89, 57.5, 13);
    s += text(443, 115.5, "Decay") + hit(p["Reverb Decay"], rect(443, 119.5, 57.5, 13, "#242424", "#171717", 1.2) + rect(444, 120.5, 55.5 * p["Reverb Decay"].value, 11, "var(--slider,#00778a)") + text(472, 130, format(p["Reverb Decay"]), C.ink, 11.5, "middle"));
    for (const [i, name] of ["Stereo", "Ping Pong", "Mid/Side"].entries()) s += `<g role="button" tabindex="0" aria-label="${name}" aria-pressed="${p["Channel Mode"].value === i}" data-choice="Channel Mode" data-value="${i}">` + rect(443, 151.5 + i * 17.3, 57.5, 13, p["Channel Mode"].value === i ? C.orange : "#242424", "#171717", 1.2) + text(471.75, 162 + i * 17.3, name, p["Channel Mode"].value === i ? "#111" : C.ink, 11.5, "middle") + "</g>";
    if (full) s += `<g aria-hidden="true" data-echo-decorative-header><circle cx="515" cy="10" r="6.5" fill="#222"/><path d="M512 10l2-3h3l-1-1m1 4l-2 3h-3l1 1" stroke="#bbb" fill="none"/><circle cx="532" cy="10" r="6.5" fill="#222"/><path d="M529 7h6v6h-6ZM531 7v2h3" stroke="#bbb" fill="none"/><circle cx="549" cy="10" r="6.5" fill="#222"/><path d="M545 10h1m2 0h1m2 0h1" stroke="#bbb" stroke-width="1.5"/></g>` + knob(p["Stereo Width"], 510, 23, "Stereo") + knob(p.Output, 510, 86.5, "Output") + knob(p["Dry Wet"], 510, 151, "Dry/Wet");
    return s;
  }
  var drawingInstance = 0;
  function tunnel(p, tempo = 120) {
    const instance = ++drawingInstance;
    const { cx, cy, radius, stroke } = tunnelGeometry;
    const rings = tunnelRings(p, tempo), color = C.orange;
    let s = "";
    const fields = rings.filter((r) => r.dense), cuts = [...new Set(fields.flatMap((r) => [r.start, r.end]))].sort((a, b) => a - b);
    for (let band = 1; band < cuts.length; band++) {
      const start = cuts[band - 1], end = cuts[band], streams = fields.filter((r) => r.start <= start && r.end >= end);
      if (!streams.length) continue;
      const extent = Math.max(...streams.map((r) => r.radius)), id = `echo-core-${instance}-${band}`;
      const segments = Math.max(8, Math.ceil(extent * 2));
      const stops = Array.from({ length: segments + 1 }, (_, i) => {
        const fraction = i / segments, coverage = Math.max(...streams.map((r) => denseCoverage(r, p.Feedback.value * 1.5, fraction * extent)));
        return `<stop offset="${fraction}" stop-color="${color}" stop-opacity="${coverage}"/>`;
      }).join("");
      s += `<defs><radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${extent}">${stops}</radialGradient></defs>`;
      s += `<path d="M${cx} ${cy}L${cx + extent * Math.cos(start * Math.PI / 180)} ${cy + extent * Math.sin(start * Math.PI / 180)}${arc(cx, cy, extent, start, end).replace(/^M[^A]+/, "")}Z" fill="url(#${id})"/>`;
    }
    const radii = /* @__PURE__ */ new Map();
    for (const ring of rings.filter((r) => !r.dense)) {
      const key = ring.radius.toFixed(6);
      if (!radii.has(key)) radii.set(key, []);
      radii.get(key).push(ring);
    }
    for (const group of radii.values()) {
      const stops = [...new Set(group.flatMap((r) => [r.start, r.end]))].sort((a, b) => a - b);
      for (let i = 1; i < stops.length; i++) {
        const start = stops[i - 1], end = stops[i];
        const covering = group.filter((r) => r.start <= start && r.end >= end);
        if (!covering.length) continue;
        const opacity = Math.max(...covering.map((r) => r.opacity));
        s += `<path d="${arc(cx, cy, group[0].radius, start, end)}" fill="none" stroke="${color}" stroke-width="${stroke}" opacity="${opacity}"/>`;
      }
    }
    if (p["Channel Mode"].value === 1) s += `<path d="${arc(cx, cy, radius, 180, 360)}" stroke="${color}" stroke-width="${stroke}" fill="none"/>`;
    for (let n = 0; n < 10; n++) {
      const r = radius / (1 + n * 0.25), dot = 1.95 * 0.8 ** n;
      for (const angle of p["Channel Mode"].value === 2 ? [225, 315] : [270]) s += `<circle cx="${cx + r * Math.cos(angle * Math.PI / 180)}" cy="${cy + r * Math.sin(angle * Math.PI / 180)}" r="${dot}" fill="#fff"/>`;
    }
    return s;
  }
  function filterStrip(p, expanded) {
    let s = line(133.5, 182.5, 436.5, 182.5, "#3b3b3b", 1.2);
    s += `<g role="button" tabindex="0" aria-label="Expand filter" aria-pressed="${expanded}" data-action="filter"><path d="${expanded ? "M140 190h8l-4 6Z" : "M141 189l7 4-7 4Z"}" fill="${C.muted}"/></g>`;
    s += box(p["Filter On"], 156, 189) + text(169, 197.5, "Filter", C.muted) + text(200, 197.5, "HP", C.muted);
    s += read(p["HP Freq"], 218.5, 197.5, 47, p["Filter On"].value ? C.cyan : C.muted) + text(269, 197.5, "Res", C.muted) + read(p["HP Res"], 291.5, 197.5, 27, p["Filter On"].value ? C.cyan : C.muted);
    s += text(318.5, 197.5, "LP", C.muted) + read(p["LP Freq"], 335.5, 197.5, 48, p["Filter On"].value ? C.cyan : C.muted) + text(386.5, 197.5, "Res", C.muted) + read(p["LP Res"], 408.5, 197.5, 26, p["Filter On"].value ? C.cyan : C.muted);
    if (expanded) {
      s += rect(134, 122, 302, 60, "#1b1b1b");
      let pts = [];
      for (let x = 136; x < 435; x++) {
        let f = (x - 136) / 298, hp = p["HP Freq"].value, lp = p["LP Freq"].value, y = 134 + Math.max(0, hp - f) * 90 + Math.max(0, f - lp) * 90;
        pts.push(`${x},${Math.min(180, y)}`);
      }
      s += `<polyline points="${pts.join(" ")}" stroke="${p["Filter On"].value ? C.cyan : C.muted}" fill="none" stroke-width="1.3"/>`;
    }
    return s;
  }
  function waveformPath(type, phase, cycles) {
    const { left, right, middle, amplitude } = waveformGeometry, width = right - left;
    const period = width / cycles, points = [];
    const add = (x, value, move = false) => points.push(`${move ? "M" : "L"}${left + x} ${middle - amplitude * value}`);
    if (type === 5) {
      for (let cell = 0; cell < Math.ceil(cycles); cell++) {
        const value = heldWave(cell, phase);
        add(cell * period, value, cell === 0);
        add(Math.min(width, (cell + 1) * period), value);
      }
    } else if (type === 0) {
      for (let x = 0; x < width; x += 0.5) add(x, periodicWave(x / period + phase, type), x === 0);
      add(width, periodicWave(cycles + phase, type));
    } else {
      add(0, periodicWave(phase, type), true);
      const knots = type === 1 ? [0.25, 0.75] : type === 4 ? [0, 0.5] : [0.5];
      const breaks = [];
      for (let turn = -1; turn <= Math.ceil(cycles + phase); turn++) for (const knot of knots) {
        const x = (turn + knot - phase) * period;
        if (x > 0 && x < width) breaks.push(x);
      }
      for (const x of breaks.sort((a, b) => a - b)) {
        add(x, periodicWave(x / period + phase - 1e-9, type));
        if (type !== 1) add(x, periodicWave(x / period + phase + 1e-9, type));
      }
      add(width, periodicWave(cycles + phase - 1e-9, type));
    }
    return points.join(" ");
  }
  function modulation(p, tempo = 120) {
    const type = p["Mod Wave"].value, phase = p["Mod Phase"].value * 0.5;
    const cycles = modulationCycles(p, tempo);
    let s = [[phase, C.orange], [0, C.cyan]].map(([offset, color]) => `<path class="mod-wave" d="${waveformPath(type, offset, cycles)}" stroke="${color}" stroke-width="1.6" fill="none" stroke-linejoin="round"/>`).join("");
    for (let i = 0; i < 6; i++) {
      let x = 222 + i * 22, pts = [];
      for (let q = 0; q <= 15; q += 0.25) pts.push(`${q},${-3.5 * periodicWave(q / 15, Math.min(i, 4))}`);
      const symbols = [`M${pts.join(" L")}`, "M0 3.5L7.5 -3.5L15 3.5", "M0 3.5L15 -3.5V3.5", "M0 3.5V-3.5L15 3.5", "M0 3.5V-3.5H7.5V3.5H15V-3.5", "M0 3Q3 3 3 0V-2Q5 -6 5 -1V3Q7 5 9 1T15 -2"];
      s += `<g role="button" tabindex="0" aria-label="${["Sine", "Triangle", "Saw Up", "Saw Down", "Square", "Random"][i]}" data-choice="Mod Wave" data-value="${i}">` + rect(x - 2, 109, 20, 13, "transparent") + `<path transform="translate(${x} 115.2)" d="${symbols[i]}" stroke="${type === i ? C.orange : C.muted}" stroke-width="1.2" fill="none"/></g>`;
    }
    s += line(133.5, 130.5, 436.5, 130.5, "#3b3b3b", 1.2);
    s += box(p["Mod Sync"], 146, 143.5) + text(159.5, 151.5, "Sync", C.muted) + text(159.5, 170.5, p["Mod Sync"].value ? "Rate" : "Freq", C.muted) + read(p[p["Mod Sync"].value ? "Mod Rate" : "Mod Freq"], 198, 170.5, 48);
    s += text(159.5, 189, "Phase", C.muted) + read(p["Mod Phase"], 198, 189, 48);
    s += toggle(p["Mod 4x"], 270.5, 161, 16.5, 10.5, "\xD74");
    if (!p["Mod 4x"].value) s += rect(270.5, 161, 16.5, 10.5, "none", C.orange, 1) + text(278.75, 169.5, "\xD74", C.orange, 10, "middle");
    s += text(292, 151.5, "Mod", C.muted) + read(p["Dly < Mod"], 294, 170.5, 39, C.orange) + text(292, 189, "Delay", C.muted);
    s += text(332.5, 151.5, "Mod", C.muted) + read(p["Flt < Mod"], 334.5, 170.5, 42, C.orange) + text(332.5, 189, "Filter", C.muted);
    s += line(378.5, 140, 378.5, 195, "#3b3b3b") + text(389, 151.5, "Env", C.muted) + read(p["Env Mix"], 391, 170.5, 42) + text(389, 189, "Mix", C.muted);
    return s;
  }
  function character(p) {
    let s = line(285.5, 22, 285.5, 98, "#252525", 1.2) + line(285.5, 104, 285.5, 177, "#252525", 1.2) + line(134, 100.5, 436, 100.5, "#252525", 1.2);
    for (const [name, on, a, b, x, y, col, al, bl] of [
      ["Gate", "Gate On", "Gate Thr", "Gate Release", 139.5, 25.5, C.orange, "Threshold", "Release"],
      ["Ducking", "Duck On", "Duck Thr", "Duck Release", 292.5, 25.5, C.orange, "Threshold", "Release"],
      ["Noise", "Noise On", "Noise Amt", "Noise Mrph", 139.5, 107.5, C.cyan, "Amount", "Morph"],
      ["Wobble", "Wobble On", "Wobble Amt", "Wobble Mrph", 292.5, 107.5, C.cyan, "Amount", "Morph"]
    ]) {
      s += box(p[on], x, y, col) + hit(p[on], text(x + 13.5, y + 8.5, name, C.muted), "button");
      s += text(x + 13.5, y + 36, al, C.muted) + text(x + 71.5, y + 36, bl, C.muted);
      s += read(p[a], x + 15.5, y + 52, 55, p[on].value ? col : C.muted) + read(p[b], x + 73.5, y + 52, 60, p[on].value ? col : C.muted);
    }
    s += line(134, 182.5, 436, 182.5, "#3b3b3b", 1.2) + box(p.Repitch, 139.5, 189.5) + hit(p.Repitch, text(153, 198, "Repitch", C.muted), "button") + text(211, 198, "Smoothing Time", C.muted) + read(p["Repitch Smoothing Time"], 303, 198, 90, p.Repitch.value ? C.cyan : C.muted);
    return s;
  }
  function render(p, page, { full = false, tempo = 120, expanded = false, scale = 2, active = true, viewportWidth = full ? 560 : 504 } = {}) {
    let s = shell(p, page, full, active);
    if (page === "Echo") s += tunnel(p, tempo) + filterStrip(p, expanded);
    if (page === "Modulation") s += modulation(p, tempo);
    if (page === "Character") s += character(p);
    return `<svg xmlns="http://www.w3.org/2000/svg" class="face" aria-label="Echo ${page} device" width="${viewportWidth * scale}" height="${207 * scale}" viewBox="0 0 ${viewportWidth} 207"><defs><clipPath id="panel-clip"><rect x="133.5" y="19.5" width="303" height="184.5"/></clipPath></defs><g ${p["Device On"].value ? "" : 'style="--ink:#858585;--muted:#777;--cyan:#666;--orange:#858585;--slider:#555"'}>${s}</g></svg>`;
  }
  return __toCommonJS(index_exports);
})();
