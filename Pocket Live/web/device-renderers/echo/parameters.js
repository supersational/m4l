// Physical parameter conversions. No formatted readout is used as geometry input.
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const delayMilliseconds = value => 1 + 2499 * clamp(value, 0, 1) ** 3.33;
export const modulationHertz = value => 0.01 * 4000 ** clamp(value, 0, 1);
export const frequencyNormalized = hertz => clamp(Math.log(hertz / 0.01) / Math.log(4000), 0, 1);
export const filterHertz = value => 20 * 1000 ** clamp(value, 0, 1);
export const feedbackRatio = value => 1.5 * value;
export const offsetRatio = value => value - 0.5;
export const gateMilliseconds = value => 0.1 * 30000 ** value;
export const duckMilliseconds = value => 20 * 75 ** value;
export const smoothingMilliseconds = value => 10 + 990 * value ** 3.33;

// Ordered musical durations; triplet = straight * 2/3, dotted = straight * 3/2.
export const modRates = ['8','6','4','3','2','1/1.','1/1','1/2.','1/1T','1/2','1/4.','1/2T','1/4','1/8.','1/4T','1/8','1/8T','1/16','1/16T','1/32','1/32T','1/64'];
export function noteDuration(label) {
  const factor = label.endsWith('.') ? 1.5 : label.endsWith('T') ? 2/3 : 1;
  const [numerator, denominator = '1'] = label.replace(/[.T]$/, '').split('/');
  return Number(numerator) / Number(denominator) * factor;
}
export function channelNote(p, channel) {
  const mode = p[channel + ' Sync Mode'].value;
  if (mode === 3) return p[channel + ' 16th'].value / 16;
  return 2 ** p[channel + ' Synced'].value * [1, 2/3, 1.5][mode];
}
export function channelDepth(p, channel, tempo = 120) {
  const time = p[channel + ' Sync'].value
    ? 240 * channelNote(p, channel) / clamp(tempo, 20, 999)
    : delayMilliseconds(p[channel + ' Time'].value) / 1000;
  return time * (1 + offsetRatio(p[channel + ' Offset'].value));
}
