// The transfer is choreographed inside the blob's composition window.
export const COMPOSE_DURATION = 2100;
export const INK_DURATION = 1950;
export const INK_START_DELAY = 100;
// One arrival front drives both the native-text mask and particle retirement.
export const INK_ARRIVAL = .65;
export const INK_ROW_DELAY = .16;
export const INK_HANDOFF = .035;

export function inkRevealFront(progress) {
  return Math.max(0, Math.min(125, (progress - INK_ARRIVAL + INK_HANDOFF) / INK_ROW_DELAY * 100));
}

const portraitSamplers = new WeakMap();

export function samplePortraitPixels(source, storyBounds, image = source) {
  const box = source.getBoundingClientRect();
  let canvas = portraitSamplers.get(source);
  if (!canvas) {
    canvas = document.createElement('canvas');
    portraitSamplers.set(source, canvas);
  }
  const width = Math.max(1, Math.ceil(box.width / 2));
  const height = Math.max(1, Math.ceil(box.height / 2));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const positions = [];
  positions.coverage = [];
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      if (pixels[i + 3] < 60) continue;
      positions.push(box.left - storyBounds.left + (x + .5) * box.width / width,
        box.top - storyBounds.top + (y + .5) * box.height / height, 0);
      positions.coverage.push(pixels[i + 3] / 255);
    }
  }
  return positions;
}

export function updatePortraitInk(ink, portraitPixels) {
  if (!ink?.portraitRange || !portraitPixels.length) return false;
  const { start, count } = ink.portraitRange;
  const available = portraitPixels.length / 3;
  for (let i = 0; i < count; i++) {
    const source = Math.min(available - 1, Math.floor(i * available / count)) * 3;
    const target = (start + i) * 3;
    ink.positions[target] = portraitPixels[source];
    ink.positions[target + 1] = portraitPixels[source + 1];
    if (ink.coverage) ink.coverage[start + i] = portraitPixels.coverage?.[source / 3] ?? 1;
  }
  ink.portraitVersion = (ink.portraitVersion || 0) + 1;
  return true;
}

// Sample the real glyphs and rules, preserving DOM wrapping and font metrics.
export function sampleInkTargets(element, inkColor = null) {
  const bounds = element.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(bounds.width));
  canvas.height = Math.max(1, Math.ceil(bounds.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node;
  while ((node = walker.nextNode())) {
    const style = getComputedStyle(node.parentElement);
    if (style.display === 'none') continue;
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.fillStyle = inkColor || style.color;
    ctx.textBaseline = 'alphabetic';
    let offset = 0;
    for (const character of node.textContent) {
      range.setStart(node, offset);
      offset += character.length;
      range.setEnd(node, offset);
      if (!character.trim()) continue;
      const box = range.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const glyph = style.textTransform === 'uppercase' ? character.toUpperCase() : style.textTransform === 'lowercase' ? character.toLowerCase() : character;
      const metrics = ctx.measureText(glyph);
      const ascent = metrics.fontBoundingBoxAscent ?? parseFloat(style.fontSize) * .8;
      const descent = metrics.fontBoundingBoxDescent ?? parseFloat(style.fontSize) * .2;
      const baseline = box.top - bounds.top + (box.height - ascent - descent) / 2 + ascent;
      ctx.fillText(glyph, box.left - bounds.left, baseline);
    }
  }
  for (const child of element.querySelectorAll('*')) {
    const style = getComputedStyle(child);
    const box = child.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    for (const edge of ['Top', 'Bottom', 'Left', 'Right']) {
      const width = parseFloat(style[`border${edge}Width`]);
      if (!width || style[`border${edge}Style`] === 'none') continue;
      ctx.fillStyle = style[`border${edge}Color`];
      const horizontal = edge === 'Top' || edge === 'Bottom';
      const x = box.left - bounds.left + (edge === 'Right' ? box.width - width : 0);
      const y = box.top - bounds.top + (edge === 'Bottom' ? box.height - width : 0);
      ctx.fillRect(x, y, horizontal ? box.width : Math.max(2, width), horizontal ? Math.max(2, width) : box.height);
    }
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const positions = [], colors = [], coverage = [];
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const i = (y * canvas.width + x) * 4;
      if (pixels[i + 3] < 45 || pixels[i] + pixels[i + 1] + pixels[i + 2] > 735) continue;
      positions.push(x + 1, y + 1, 0);
      colors.push(pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255);
      coverage.push(pixels[i + 3] / 255);
    }
  }
  const portraitStart = coverage.length;
  for (const source of element.querySelectorAll('canvas[data-ink-portrait]')) {
    if (!source.inkSnapshot) continue;
    const pixels = samplePortraitPixels(source, bounds, source.inkSnapshot);
    for (let i = 0; i < pixels.length; i += 3) {
      positions.push(pixels[i], pixels[i + 1], 0);
      colors.push(.09, .09, .09);
      coverage.push(pixels.coverage[i / 3]);
    }
  }
  const portraitCount = coverage.length - portraitStart;
  return { positions: new Float32Array(positions), colors: new Float32Array(colors), coverage: new Float32Array(coverage), height: canvas.height,
    portraitRange: portraitCount ? { start: portraitStart, count: portraitCount } : null, portraitVersion: 0 };
}
