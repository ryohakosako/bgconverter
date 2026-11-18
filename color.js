"use strict";

const color = (() => {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const luma = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
  const neutral = { temperature: 0, brightness: 0, contrast: 0, saturation: 0, shadow: [0, 0, 0] };

  function statistics(data) {
    let weight = 0, light = 0, squared = 0, warmth = 0, chroma = 0;
    const shadows = [0, 0, 0];
    let shadowWeight = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, alpha] = [data[i], data[i + 1], data[i + 2], data[i + 3] / 255];
      if (!alpha) continue;
      const y = luma(r, g, b);
      const dark = alpha * (1 - y / 255) ** 3;
      weight += alpha;
      light += alpha * y;
      squared += alpha * y * y;
      warmth += alpha * (r - b);
      chroma += alpha * (Math.max(r, g, b) - Math.min(r, g, b));
      shadowWeight += dark;
      shadows[0] += dark * (r - y);
      shadows[1] += dark * (g - y);
      shadows[2] += dark * (b - y);
    }
    const mean = light / (weight || 1);
    return {
      weight, mean, deviation: Math.sqrt(Math.max(0, squared / (weight || 1) - mean ** 2)),
      warmth: warmth / (weight || 1), chroma: chroma / (weight || 1),
      shadow: shadows.map(value => value / (shadowWeight || 1))
    };
  }

  function match(subject, background) {
    return {
      temperature: clamp((background.warmth - subject.warmth) * .19, -24, 24),
      brightness: clamp((background.mean - subject.mean) * .28, -30, 30),
      contrast: clamp((background.deviation - subject.deviation) * .006, -.23, .23),
      saturation: clamp((background.chroma - subject.chroma) * .004, -.22, .18),
      shadow: background.shadow.map((value, channel) => clamp((value - subject.shadow[channel]) * .24, -13, 13))
    };
  }

  function transform(source, target, settings, strength) {
    const { temperature, brightness, contrast, saturation, shadow, highlights = 0, shadows = 0 } = settings;
    const contrastShift = Math.max(-.9, contrast * strength);
    const lightShift = (brightness * strength) - contrastShift * 128;
    const highlightShift = highlights * strength;
    const shadowShift = shadows * strength;
    const tempShift = temperature * strength;
    const saturationShift = saturation * strength;
    const [shadowR, shadowG, shadowB] = shadow.map(value => value * strength);
    if (!strength || !(temperature || brightness || contrast || saturation || highlightShift || shadowShift || shadowR || shadowG || shadowB)) {
      target.set(source);
      return;
    }
    for (let i = 0; i < source.length; i += 4) {
      const alpha = source[i + 3];
      target[i + 3] = alpha;
      if (!alpha) continue;
      const r = source[i], g = source[i + 1], b = source[i + 2];
      const y = luma(r, g, b);
      const dark = Math.max(0, 1 - y / 190) ** 2;
      // Suppress chroma shifts in strongly colored pixels and near the tonal endpoints.
      const chromaProtection = 1 - .4 * (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      const tonalRoom = Math.min(1, y / 48, (255 - y) / 48);
      const warmth = tempShift * chromaProtection * tonalRoom;
      const bright = Math.max(0, (y - 105) / 150);
      const tone = contrastShift * y + lightShift + highlightShift * bright * bright + shadowShift * dark;
      const saturationAmount = Math.max(-1, saturationShift * chromaProtection);
      target[i] = r + tone + (r - y) * saturationAmount + warmth + dark * shadowR;
      target[i + 1] = g + tone + (g - y) * saturationAmount - warmth * .17 + dark * shadowG;
      target[i + 2] = b + tone + (b - y) * saturationAmount - warmth + dark * shadowB;
    }
  }

  return { clamp, luma, statistics, match, transform, neutral };
})();
