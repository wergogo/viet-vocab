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

/** Unclosed "{{" skipped per scan. Past this the text is malformed beyond use, and stopping keeps scans linear. */
const MAX_STRAYS = 50;

/** Splits on `|` outside any `{{…}}` or `[[…]]`. */
export function splitParams(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      current += two;
      i++;
    } else if ((two === '}}' || two === ']]') && depth > 0) {
      depth--;
      current += two;
      i++;
    } else if (inner[i] === '|' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += inner[i];
    }
  }
  parts.push(current);
  return parts;
}

/** Index just past the `}}` that closes the `{{` at `start`, or -1 when it is never closed. */
function closingBraces(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    const two = text.slice(i, i + 2);
    if (two === '{{') {
      depth++;
      i++;
    } else if (two === '}}') {
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
    const two = param.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      i++;
    } else if ((two === '}}' || two === ']]') && depth > 0) {
      depth--;
      i++;
    } else if (param[i] === '=' && depth === 0) {
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

/**
 * Every call of the named templates, in order. Calls nested inside a matching call are not
 * reported separately; calls nested inside other templates (e.g. `{{col3|vi|{{vi-l|…}}}}`) are.
 */
export function findTemplates(text: string, names: string | readonly string[]): TemplateCall[] {
  const wanted = new Set((typeof names === 'string' ? [names] : names).map(normalizeName));
  const found: TemplateCall[] = [];
  let i = text.indexOf('{{');
  let strays = 0;
  while (i >= 0) {
    const end = closingBraces(text, i);
    if (end < 0) {
      // An unclosed "{{" (a typo on the page) must not hide the templates after it.
      if (++strays > MAX_STRAYS) break;
      i = text.indexOf('{{', i + 2);
      continue;
    }
    const call = parseCall(text, i, end);
    if (wanted.has(normalizeName(call.name))) {
      found.push(call);
      i = text.indexOf('{{', end);
    } else {
      i = text.indexOf('{{', i + 2);
    }
  }
  return found;
}

/** The first top-level template call that `accept` accepts (any call by default). */
export function firstTemplate(
  text: string,
  accept: (call: TemplateCall) => boolean = () => true,
): TemplateCall | null {
  let i = text.indexOf('{{');
  let strays = 0;
  while (i >= 0) {
    const end = closingBraces(text, i);
    if (end < 0) {
      if (++strays > MAX_STRAYS) break;
      i = text.indexOf('{{', i + 2);
      continue;
    }
    const call = parseCall(text, i, end);
    if (accept(call)) return call;
    i = text.indexOf('{{', end);
  }
  return null;
}

/** Replaces each top-level template with what `render` returns for it. */
function replaceTemplates(text: string, render: (call: TemplateCall) => string): string {
  let out = '';
  let pos = 0;
  let i = text.indexOf('{{');
  let strays = 0;
  while (i >= 0) {
    const end = closingBraces(text, i);
    if (end < 0) {
      if (++strays > MAX_STRAYS) break;
      i = text.indexOf('{{', i + 2);
      continue;
    }
    out += text.slice(pos, i) + render(parseCall(text, i, end));
    pos = end;
    i = text.indexOf('{{', end);
  }
  return out + text.slice(pos);
}

/**
 * Wikitext to plain text (spec §6.2): `[[a|b]]` → b, `[[a]]` → a, `{{l|en|x}}` → x, `{{q|x}}` → (x);
 * other templates, references, tags and bold/italic quotes are dropped; whitespace is collapsed.
 */
export function wikiToText(wikitext: string): string {
  const noRefs = wikitext.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  const noTemplates = replaceTemplates(noRefs, (call) => {
    const name = normalizeName(call.name);
    if (name === 'l') return wikiToText(call.positional[2] || call.positional[1] || '');
    if (name === 'q') return `(${wikiToText(call.positional.join(', '))})`;
    return '';
  });
  return noTemplates
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<\/?br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
