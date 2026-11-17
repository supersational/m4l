import {channelDepth, feedbackRatio, frequencyNormalized, modRates, noteDuration, clamp} from './parameters.js';

export const tunnelGeometry = Object.freeze({cx:285.25, cy:182.5, radius:137.5, stroke:1.6});
export const waveformGeometry = Object.freeze({left:133.5, right:436, middle:65.5, amplitude:32});
export const projectDepth = depth => tunnelGeometry.radius / (1 + Math.max(0, depth));
export const repeatOpacity = (feedback, repeat) => Math.min(1, Math.max(0, feedback) ** (Math.max(0, repeat - 1) / 2));

function unresolvedRepeat(depth) {
  return tunnelGeometry.radius - projectDepth(depth) < tunnelGeometry.stroke;
}
export function tunnelSectors(p, tempo = 120) {
  const left = channelDepth(p, 'L', tempo), right = channelDepth(p, 'R', tempo);
  switch (p['Channel Mode'].value) {
    case 1: {
      const roundTrip = left + right;
      // Only the first left impact can merge with the outer reference arch.
      // Swapping the native 10/80 ms capture disproves a symmetric fallback.
      // Its collapsed envelope decays over 16 local delay intervals; this
      // empirical scale fits both the independent 5.51 ms and 10 ms captures.
      return [unresolvedRepeat(left)
        ? {start:180,end:270,offset:0,step:left,collapsed:true}
        : {start:180,end:270,offset:left,step:roundTrip},
        {start:270,end:360,offset:roundTrip,step:roundTrip}];
    }
    case 2:
      // Full mid arches plus the two side sectors. The drawer unions coincident
      // segments, so a shared radius is never painted twice.
      return [
        {start:180, end:225, offset:0, step:right},
        {start:180, end:360, offset:0, step:left},
        {start:315, end:360, offset:0, step:right},
      ];
    default:
      return [
        {start:180, end:270, offset:0, step:left},
        {start:270, end:360, offset:0, step:right},
      ];
  }
}

// Stop by visibility, not sample ID or a fixed number of captured shapes.
export function tunnelRings(p, tempo = 120) {
  const feedback = feedbackRatio(p.Feedback.value), rings = [];
  for (const sector of tunnelSectors(p, tempo)) {
    if (sector.collapsed) {
      rings.push({...sector,radius:tunnelGeometry.radius,opacity:1,repeat:0,dense:true});
      continue;
    }
    const spacing = Math.max(1e-6, sector.step);
    const lastVisibleDepth = tunnelGeometry.radius / 0.3 - 1;
    const opacityLimit = feedback > 0 && feedback < 1
      ? Math.ceil(2 * Math.log(0.004) / Math.log(feedback)) + 1
      : feedback === 0 ? 1 : Infinity;
    // Every resolved contour consumes at least one stroke of radial space.
    // The first unresolved band becomes an analytic coverage field: no fixed
    // repeat cap, even at very short delay and feedback infinitesimally below 1.
    const opacityStep = sector.opacityStep ?? 1;
    const count = Math.min(opacityLimit / opacityStep, Math.ceil((lastVisibleDepth - sector.offset) / spacing));
    for (let n = 0; n <= count; n++) {
      const depth = sector.offset + n * spacing, radius = projectDepth(depth);
      const opacity = repeatOpacity(feedback, n * opacityStep);
      if (radius < 0.3 || opacity < 0.004) break;
      const dense = radius - projectDepth(depth + spacing) <= tunnelGeometry.stroke;
      rings.push({...sector, radius:radius + (dense ? tunnelGeometry.stroke / 2 : 0), opacity, repeat:n, dense});
      if (dense) break;
    }
  }
  return rings;
}

// Continuous alpha-over coverage of unresolved rings. At a radial position r,
// invert the projection to obtain the repeat index, then integrate the number
// of strokes covering that pixel. expm1/log1p keep tiny opacities well behaved.
export function denseCoverage(sector, feedback, radius) {
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

export function modulationCycles(p, tempo = 120) {
  // A shared frequency display scale explains free rates and the native
  // whole/sixteenth-note captures at both 90 and 120 BPM.
  const v = p['Mod Sync'].value
    ? frequencyNormalized(clamp(tempo, 20, 999) / (240 * noteDuration(modRates[Math.round(p['Mod Rate'].value)])))
    : p['Mod Freq'].value;
  return 10 ** clamp(v, 0, 1);
}
export function periodicWave(turns, type) {
  const t = ((turns % 1) + 1) % 1;
  switch (type) {
    case 0: return Math.sin(t * 2 * Math.PI);
    case 1: return 2 / Math.PI * Math.asin(Math.sin(t * 2 * Math.PI));
    case 2: return 2 * ((t + 0.5) % 1) - 1;
    case 3: return 1 - 2 * ((t + 0.5) % 1);
    case 4: return t < 0.5 ? 1 : -1;
    default: throw new Error('Random is a held process, not a periodic wave.');
  }
}
// A portable counter-based random process: redraws never change the realization.
// Its seed is a presentation choice, not an inferred Ableton seed.
export function randomSample(index, seed = 0x17a3) {
  let n = (Math.imul(index | 0, 0x45d9f3b) ^ seed) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff * 1.6 - 0.8;
}
export function heldWave(index, phase = 0, seed = 0x17a3) {
  // Native phase 0 shares the cyan sequence; phase 180 inverts it, while
  // phase 90 provides a quadrature sequence on the same hold clock.
  // Exact native sample heights/seed remain unknown; do not copy the captures.
  const angle=phase*2*Math.PI;
  return clamp(randomSample(index,seed)*Math.cos(angle)
    +randomSample(index,seed^0x9e3779b9)*Math.sin(angle),-1,1);
}
