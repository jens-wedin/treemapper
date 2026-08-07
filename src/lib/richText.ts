/**
 * Notes imported from MyHeritage carry HTML: paragraphs, spans, the odd table,
 * and Swedish letters written as entities (`&auml;`). Nearly every source note
 * has some. This turns that into plain paragraphs for display.
 *
 * It deliberately produces *text*, not markup — the notes are third-party
 * content that includes anchors and images, and none of it is worth rendering
 * as live HTML. The stored value is never touched, so editing and GEDCOM
 * export still see exactly what was imported.
 */

/** The named entities that actually occur in the tree, plus the standard five. */
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', shy: '', ndash: '–', mdash: '—', hellip: '…',
  aring: 'å', auml: 'ä', ouml: 'ö', Aring: 'Å', Auml: 'Ä', Ouml: 'Ö',
  oslash: 'ø', Oslash: 'Ø', aelig: 'æ', AElig: 'Æ',
  eacute: 'é', egrave: 'è', uuml: 'ü', Uuml: 'Ü', szlig: 'ß',
};

/** Tags that end the current paragraph; `br` only ends the line. */
const BLOCK_TAGS = 'p|div|h[1-6]|li|ul|ol|table|tbody|thead|tfoot|tr|td|th|blockquote|pre|hr';

/**
 * Tags dropped while keeping their text. `linkurl`/`linkname` are MyHeritage's
 * own, and leave the address behind as readable text.
 */
const INLINE_TAGS = 'span|a|em|strong|b|i|u|s|font|small|big|sub|sup|code|tt|img|linkurl|linkname|o:p';

function decodeOnce(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;      // leave anything we don't know alone
  });
}

/**
 * Decodes until the text settles. Much of the export is escaped twice over —
 * `&amp;lt;br&amp;gt;` for a line break — so a single pass would leave `&lt;br&gt;`
 * sitting on screen.
 */
function decodeEntities(text: string): string {
  let out = text;
  for (let pass = 0; pass < 3; pass++) {
    const next = decodeOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * Splits a note into display paragraphs. A paragraph may contain newlines,
 * from `<br>` or from the text itself, so render with `whitespace-pre-line`.
 */
export function textBlocks(raw: string | null | undefined): string[] {
  if (!raw) return [];

  // Entities come first, because the export escapes some of its own markup:
  // line breaks arrive as `&lt;br&gt;`, and decoding them later would leave
  // them on screen as literal text — the very problem this solves.
  const broken = decodeEntities(raw)
    .replace(/<\s*br\b[^>]*>/gi, '\n')      // often carries a style attribute
    .replace(new RegExp(`<\\s*/?\\s*(?:${BLOCK_TAGS})\\b[^>]*>`, 'gi'), '\n\n')
    // Only known tag names are dropped. These notes are full of angle brackets
    // that are not markup — `<Privat>` stands in for a living relative — and a
    // generic "looks like a tag" rule silently ate them.
    .replace(new RegExp(`<\\s*/?\\s*(?:${INLINE_TAGS})\\b[^>]*>`, 'gi'), '');

  return broken
    .split(/\n{2,}/)
    .map(block => block.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').trim())
    .filter(Boolean);
}
