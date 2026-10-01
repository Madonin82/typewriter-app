/* vr-room/placard.js
 *
 * Pure museum-placard text layout for the VR room. No three.js, no DOM, no
 * Firebase imports — importable by vr-gallery.html and plain node tests.
 *
 * Field order matches the 2D directory cards: Title / Artist — Year / Medium.
 * Descriptions stay off the wall.
 *
 * Text measurement is injected: measure(text, px, smallCaps) -> width in px.
 * The browser passes a canvas-2d measure; node tests pass a stub.
 */

export const PLACARD = {
  W: 1024,
  H: 512,
  PAD_X: 72,          // horizontal margin inside the brass border
  TITLE_START_PX: 76, // title starts here and shrinks to fit
  TITLE_MIN_PX: 42,
  TITLE_MAX_LINES: 3,
  BYLINE_PX: 42,      // "Artist — Year"
  MEDIUM_PX: 32,      // small caps
  MEDIUM_MAX_LINES: 2,
  SECTION_GAP: 26,    // vertical gap between title / byline / medium
  SMALL_CAPS_TRACKING: 2, // extra px per char for letter-spaced small caps
};

const clean = s => (typeof s === 'string' ? s.trim() : '');

// Greedy word wrap. Overlong single words are hard-broken so nothing
// overflows the placard. Returns an array of lines.
export function wrapLines(text, maxWidth, px, measure, smallCaps = false) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const w = t => measure(t, px, smallCaps);
  const lines = [];
  let cur = '';
  for (const word of words) {
    const trial = cur ? cur + ' ' + word : word;
    if (w(trial) <= maxWidth) { cur = trial; continue; }
    if (cur) lines.push(cur);
    if (w(word) > maxWidth) {
      // hard-break the overlong word
      let part = '';
      for (const ch of word) {
        if (part && w(part + ch) > maxWidth) { lines.push(part); part = ch; }
        else part += ch;
      }
      cur = part;
    } else {
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Cap lines at maxLines; the last visible line gets an ellipsis.
// Never returns an empty array for non-empty input.
export function ellipsize(lines, maxLines, maxWidth, px, measure, smallCaps = false) {
  if (lines.length <= maxLines) return lines;
  const w = t => measure(t, px, smallCaps);
  let last = lines[maxLines - 1].replace(/\s+$/, '');
  while (last && w(last + '…') > maxWidth) last = last.slice(0, -1).replace(/\s+$/, '');
  const kept = lines.slice(0, maxLines - 1);
  kept.push(last ? last + '…' : '…');
  return kept;
}

// Lay out the placard. Returns { lines: [{ text, px, y, smallCaps }], titlePx }
// where y is the line's vertical center on the PLACARD.W x PLACARD.H canvas.
export function layoutPlacard(fields, measure) {
  const f = fields || {};
  const maxW = PLACARD.W - PLACARD.PAD_X * 2;
  const sections = []; // { lines: [{text, px, smallCaps}], lh }

  // Title: word-wrap, auto-shrink until it fits TITLE_MAX_LINES.
  const title = clean(f.title) || 'Untitled';
  let titlePx = PLACARD.TITLE_START_PX;
  let titleLines = wrapLines(title, maxW, titlePx, measure);
  while (titleLines.length > PLACARD.TITLE_MAX_LINES && titlePx - 4 >= PLACARD.TITLE_MIN_PX) {
    titlePx -= 4;
    titleLines = wrapLines(title, maxW, titlePx, measure);
  }
  titleLines = ellipsize(titleLines, PLACARD.TITLE_MAX_LINES, maxW, titlePx, measure);
  sections.push({
    lines: titleLines.map(t => ({ text: t, px: titlePx, smallCaps: false })),
    lh: 1.12,
  });

  // Byline: "Artist — Year". Skipped when both are empty.
  const artist = clean(f.artist);
  const year = clean(f.year);
  const byline = [artist, year].filter(Boolean).join(' — ');
  if (byline) {
    const bLines = ellipsize(
      wrapLines(byline, maxW, PLACARD.BYLINE_PX, measure),
      1, maxW, PLACARD.BYLINE_PX, measure);
    sections.push({
      lines: bLines.map(t => ({ text: t, px: PLACARD.BYLINE_PX, smallCaps: false })),
      lh: 1.4,
    });
  }

  // Medium: small caps, wraps to MEDIUM_MAX_LINES, ellipsis beyond.
  // Skipped when empty.
  const medium = clean(f.medium);
  if (medium) {
    const mLines = ellipsize(
      wrapLines(medium, maxW, PLACARD.MEDIUM_PX, measure, true),
      PLACARD.MEDIUM_MAX_LINES, maxW, PLACARD.MEDIUM_PX, measure, true);
    sections.push({
      lines: mLines.map(t => ({ text: t, px: PLACARD.MEDIUM_PX, smallCaps: true })),
      lh: 1.35,
    });
  }

  // Vertically center the whole block.
  let total = 0;
  sections.forEach((s, i) => {
    if (i > 0) total += PLACARD.SECTION_GAP;
    total += s.lines.length * s.lines[0].px * s.lh;
  });
  let y = (PLACARD.H - total) / 2;
  const lines = [];
  sections.forEach((s, i) => {
    if (i > 0) y += PLACARD.SECTION_GAP;
    for (const ln of s.lines) {
      const lhPx = ln.px * s.lh;
      lines.push({ ...ln, y: y + lhPx / 2 });
      y += lhPx;
    }
  });
  return { lines, titlePx };
}

// Resolve what goes on the placard for an ITEMS entry:
//   exhibit doc fields -> legacy one-line plaque: string -> item label.
// exhibitMap is Map<exhibitId, docData> (empty/missing = degraded).
// Returns null only when the item has no text at all.
export function resolvePlacardFields(item, exhibitMap) {
  if (!item) return null;
  const doc = item.exhibitId && exhibitMap ? exhibitMap.get(item.exhibitId) : undefined;
  if (doc) {
    return {
      title: clean(doc.title) || 'Untitled',
      artist: clean(doc.artist),
      year: clean(doc.year),
      medium: clean(doc.medium),
    };
  }
  if (clean(item.plaque)) return { title: clean(item.plaque), artist: '', year: '', medium: '' };
  if (clean(item.label)) return { title: clean(item.label), artist: '', year: '', medium: '' };
  return null;
}
