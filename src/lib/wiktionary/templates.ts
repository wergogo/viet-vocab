/** A `{{name|…}}` call found in wikitext. */
export interface TemplateCall {
  name: string;
  /** Unnamed parameters in order, trimmed. Parameter 1 is `positional[0]`. */
  positional: string[];
  /** `key=value` parameters, trimmed. */
  named: Record<string, string>;
  /** Offsets of the whole `{{…}}` in the searched text. */
  start: number;
  end: number;
}

/** Template names compare with a case-insensitive first letter, and `_` equals a space. */
export function normalizeName(name: string): string {
  const clean = name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.charAt(0).toLowerCase() + clean.slice(1);
}

/** Unclosed "{{" skipped per scan (see scanCalls). */
const MAX_STRAYS = 50;

// Character codes. The scanners compare codes instead of slicing two-character strings, which keeps them fast on
// long pages.
const OPEN_BRACE = 123; // {
const CLOSE_BRACE = 125; // }
const OPEN_BRACKET = 91; // [
const CLOSE_BRACKET = 93; // ]
const PIPE = 124; // |
const EQUALS = 61; // =

/** 1 when `{{` or `[[` starts at i, -1 for `}}` or `]]`, otherwise 0. */
function nestingAt(s: string, i: number): number {
  const c = s.charCodeAt(i);
  const next = s.charCodeAt(i + 1);
  if ((c === OPEN_BRACE && next === OPEN_BRACE) || (c === OPEN_BRACKET && next === OPEN_BRACKET)) return 1;
  if ((c === CLOSE_BRACE && next === CLOSE_BRACE) || (c === CLOSE_BRACKET && next === CLOSE_BRACKET)) return -1;
  return 0;
}

/** Splits on `|` outside any `{{…}}` or `[[…]]`. */
export function splitParams(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < inner.length; i++) {
    const step = nestingAt(inner, i);
    if (step === 1 || (step === -1 && depth > 0)) {
      depth += step;
      i++;
    } else if (inner.charCodeAt(i) === PIPE && depth === 0) {
      parts.push(inner.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(inner.slice(from));
  return parts;
}

/** Index just past the `}}` that closes the `{{` at `start`, or -1 when it is never closed. */
function closingBraces(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    const c = text.charCodeAt(i);
    if (c === OPEN_BRACE && text.charCodeAt(i + 1) === OPEN_BRACE) {
      depth++;
      i++;
    } else if (c === CLOSE_BRACE && text.charCodeAt(i + 1) === CLOSE_BRACE) {
      depth--;
      i++;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** Index of the first `=` outside nesting, or -1. */
function topLevelEquals(param: string): number {
  let depth = 0;
  for (let i = 0; i < param.length; i++) {
    const step = nestingAt(param, i);
    if (step === 1 || (step === -1 && depth > 0)) {
      depth += step;
      i++;
    } else if (param.charCodeAt(i) === EQUALS && depth === 0) {
      return i;
    }
  }
  return -1;
}

function parseCall(text: string, start: number, end: number): TemplateCall {
  const [rawName = '', ...params] = splitParams(text.slice(start + 2, end - 2));
  const positional: string[] = [];
  const named: Record<string, string> = {};
  for (const param of params) {
    const eq = topLevelEquals(param);
    const key = eq >= 0 ? param.slice(0, eq).trim() : '';
    if (eq >= 0 && /^[\w -]+$/.test(key)) named[key] = param.slice(eq + 1).trim();
    else positional.push(param.trim());
  }
  return { name: rawName.trim(), positional, named, start, end };
}

/** Characters a scan may read in total. Real sections need far less; nested vandalism would otherwise go quadratic. */
const SCAN_BUDGET = 5_000_000;

/**
 * Visits template calls in order. `visit` says where to go on: past the call (`'skip'`), inside it to find nested
 * calls (`'inside'`), or nowhere (`'stop'`). An unclosed "{{" (a typo on the page) is skipped so it can't hide the
 * templates after it. Past MAX_STRAYS of them, or SCAN_BUDGET characters, the text is malformed beyond use and the
 * scan stops, which keeps it linear on hostile input.
 */
function scanCalls(text: string, visit: (call: TemplateCall) => 'skip' | 'inside' | 'stop'): void {
  let i = text.indexOf('{{');
  let strays = 0;
  let budget = SCAN_BUDGET;
  while (i >= 0) {
    const end = closingBraces(text, i);
    budget -= (end < 0 ? text.length : end) - i;
    if (budget < 0) return;
    if (end < 0) {
      if (++strays > MAX_STRAYS) return;
      i = text.indexOf('{{', i + 2);
      continue;
    }
    const next = visit(parseCall(text, i, end));
    if (next === 'stop') return;
    i = text.indexOf('{{', next === 'skip' ? end : i + 2);
  }
}

/**
 * Every call of the named templates, in order. Calls nested inside a matching call are not
 * reported separately; calls nested inside other templates (e.g. `{{col3|vi|{{vi-l|…}}}}`) are.
 */
export function findTemplates(text: string, names: string | readonly string[]): TemplateCall[] {
  const wanted = new Set((typeof names === 'string' ? [names] : names).map(normalizeName));
  const found: TemplateCall[] = [];
  scanCalls(text, (call) => {
    if (!wanted.has(normalizeName(call.name))) return 'inside';
    found.push(call);
    return 'skip';
  });
  return found;
}

/** The first top-level template call that `accept` accepts (any call by default). */
export function firstTemplate(
  text: string,
  accept: (call: TemplateCall) => boolean = () => true,
): TemplateCall | null {
  const found: TemplateCall[] = [];
  scanCalls(text, (call) => {
    if (!accept(call)) return 'skip';
    found.push(call);
    return 'stop';
  });
  return found[0] ?? null;
}

/** Replaces each top-level template with what `render` returns for it. */
function replaceTemplates(text: string, render: (call: TemplateCall) => string): string {
  let out = '';
  let pos = 0;
  scanCalls(text, (call) => {
    out += text.slice(pos, call.start) + render(call);
    pos = call.end;
    return 'skip';
  });
  return out + text.slice(pos);
}

/** Template nesting wikiToText renders; deeper levels are dropped, so a vandalized page can't overflow the stack. */
const MAX_DEPTH = 40;

/**
 * Text wikiToText reads. Its inputs are short (a meaning line, a parameter, a label); the cap bounds the reference
 * pattern, which is quadratic on many unclosed `<ref>` tags.
 */
const MAX_TEXT = 20_000;

/**
 * Wikitext to plain text (spec §6.2): `[[a|b]]` → b, `[[a]]` → a, `{{l|en|x}}` → x, `{{q|x}}` → (x);
 * other templates, references, tags and bold/italic quotes are dropped; whitespace is collapsed.
 */
export function wikiToText(wikitext: string): string {
  return toText(wikitext.slice(0, MAX_TEXT), 0);
}

// The link and tag patterns stop at the next "[" or "<", so unclosed links and tags can't make them quadratic.
function toText(wikitext: string, depth: number): string {
  const noRefs = wikitext.replace(/<ref[^<>]*\/>/g, '').replace(/<ref[^<>]*>[\s\S]*?<\/ref>/g, '');
  const noTemplates = replaceTemplates(noRefs, (call) => {
    if (depth >= MAX_DEPTH) return '';
    const name = normalizeName(call.name);
    if (name === 'l') return toText(call.positional[2] || call.positional[1] || '', depth + 1);
    if (name === 'q') return `(${toText(call.positional.join(', '), depth + 1)})`;
    return '';
  });
  return noTemplates
    .replace(/\[\[[^\][|]*\|([^\][]*)\]\]/g, '$1')
    .replace(/\[\[([^\][]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<\/?br\s*\/?>/gi, ' ')
    .replace(/<[^<>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
