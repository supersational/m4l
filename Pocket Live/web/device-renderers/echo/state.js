import {clamp, delayMilliseconds, modulationHertz, filterHertz, gateMilliseconds, duckMilliseconds, smoothingMilliseconds, modRates} from './parameters.js';
export {clamp, modRates};

const concise = (number, digits = 1) => Number(number.toFixed(digits)).toString();
function time(milliseconds) {
  if (milliseconds >= 1000) return (milliseconds / 1000).toFixed(2) + ' s';
  return (milliseconds < 10 ? milliseconds.toFixed(2) : milliseconds < 100
    ? milliseconds.toFixed(1) : Math.round(milliseconds)) + ' ms';
}
export function format(p) {
  const v = p.value, n = p.name;
  if (v === p.initial) return p.initialDisplay.trim();
  if (p.items.length) return p.items[Math.round(v - p.min)];
  if (n.endsWith('Synced')) return v === 0 ? '1' : '1/' + 2 ** -Math.round(v);
  if (n.endsWith('16th')) return String(Math.round(v));
  if (n.endsWith('Offset')) return concise((v - 0.5) * 100) + ' %';
  if (n === 'Mod Phase') return concise(v * 180) + '°';
  if (['Input Gain','Output'].includes(n)) return ((v - 0.5) * 48).toFixed(1) + ' dB';
  if (n.endsWith('Thr')) return concise((v - 1) * 60) + ' dB';
  if (n === 'Gate Release') return time(gateMilliseconds(v));
  if (n === 'Duck Release') return time(duckMilliseconds(v));
  if (n === 'Repitch Smoothing Time') return time(smoothingMilliseconds(v));
  if (n === 'L Time' || n === 'R Time') return time(delayMilliseconds(v));
  if (n === 'Mod Freq') {
    const hertz = modulationHertz(v);
    return (hertz < 10 ? hertz.toFixed(2) : hertz.toFixed(1)) + ' Hz';
  }
  if (n.endsWith('Freq')) {
    const hertz = filterHertz(v);
    return hertz >= 1000 ? (hertz / 1000).toFixed(2) + ' kHz'
      : hertz < 100 ? hertz.toFixed(1) + ' Hz' : Math.round(hertz) + ' Hz';
  }
  if (n === 'Mod Rate') return modRates[Math.round(v)];
  if (n.endsWith('Res')) return v.toFixed(2);
  const multiplier = n === 'Feedback' ? 150 : n === 'Stereo Width' ? 200 : 100;
  return (v === 0 ? '0.0' : concise(v * multiplier)) + ' %';
}
