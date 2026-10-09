#!/usr/bin/env node
/**
 * copy-segments.mjs — the reader-facing text in a JS/TS/JSX/TSX source file.
 *
 * encounter-audit's `fingerprint: "copy"` manual-review mode hashes these
 * segments instead of file bytes, so a code-only edit (classes, layout,
 * imports, comments, logic without strings) leaves a reviewed snapshot current
 * while any edit to text a reader can meet makes it stale.
 *
 * Counted, in source order: JSX text, and every string and template literal
 * except
 *   - module specifiers (`import … from '…'`, `import '…'`, `import(…)`,
 *     `require(…)`);
 *   - values of presentational JSX attributes (NON_COPY_ATTRS, `data-*`);
 *   - arguments of class-name helpers (CLASS_HELPERS);
 *   - values of object properties named `className` or `class`.
 * When unsure it counts: href, src, alt, aria-*, role and data strings all
 * count, because links and labels are part of what a reader meets.
 *
 * Dependency-free: a small scanner, not a parser. A file it cannot follow
 * throws CopyScanError, and the caller hashes that file's bytes instead, so a
 * scanner gap can only make a receipt go stale more often, never hide copy.
 */
import { promises as fs } from 'node:fs';
import { invokedDirectly } from './invoked-directly.mjs';

export class CopyScanError extends Error {}

/** JSX attributes whose values style, identify, animate, or draw; never prose. */
export const NON_COPY_ATTRS = new Set([
  'className', 'class', 'style', 'key', 'id', 'ref', 'sizes',
  'loading', 'decoding', 'fetchPriority', 'crossOrigin', 'referrerPolicy',
  // framer-motion animation props
  'initial', 'animate', 'exit', 'transition', 'variants', 'viewport', 'layout', 'layoutId',
  'whileHover', 'whileTap', 'whileFocus', 'whileDrag', 'whileInView',
  // SVG geometry and paint
  'd', 'viewBox', 'xmlns', 'fill', 'fillRule', 'clipRule', 'stroke', 'strokeWidth',
  'strokeLinecap', 'strokeLinejoin', 'strokeDasharray', 'points', 'transform',
  'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'x2', 'y1', 'y2',
  'offset', 'stopColor', 'stopOpacity', 'gradientTransform', 'preserveAspectRatio',
]);
/** Calls whose arguments are class names. */
export const CLASS_HELPERS = new Set(['cn', 'clsx', 'twMerge', 'classNames', 'cx', 'cva']);
const NON_COPY_PROPS = new Set(['className', 'class']);
/** Keywords after which `/` starts a regex and `<` may start JSX. */
const EXPRESSION_KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'instanceof', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'default']);
const CLOSERS = { '(': ')', '[': ']', '{': '}' };
/** A `(` after these opens a condition, so a `/` right after its `)` starts a regex. */
const CONDITION_KEYWORDS = new Set(['if', 'while', 'for', 'with']);
const REGEX_FLAGS = /^[dgimsuvy]*$/;
/** What may follow a regex literal: member access, a separator, a closer, an operator, or the end of the line. */
const REGEX_FOLLOWER = /^[ \t]*(?:$|[\r\n.,;:)\]}?]|&&|\|\||===?|!==?)/;

const isIdentStart = (c) => c !== undefined && /[\p{L}_$]/u.test(c);
const isIdentPart = (c) => c !== undefined && /[\p{L}\p{N}_$]/u.test(c);

function decodeEscapes(raw) {
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])/g, (_, e) => {
    if (e.length > 1 && e[0] === 'u') return String.fromCodePoint(parseInt(e[1] === '{' ? e.slice(2, -1) : e.slice(1), 16));
    if (e.length > 1 && e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e === '\n' || e === '\r\n' || e === '\r') return '';
    return { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' }[e] ?? e;
  });
}

class Scanner {
  constructor(source, jsx) {
    this.s = source;
    this.n = source.length;
    this.i = 0;
    this.jsx = jsx;
    this.out = [];
    this.moduleSpecifierNext = false;
  }

  fail(message) { throw new CopyScanError(`${message} at offset ${this.i}`); }

  emit(text, excluded) {
    if (excluded) return;
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized) this.out.push(normalized);
  }

  nextNonSpace(from = this.i) {
    let j = from;
    while (j < this.n && /\s/.test(this.s[j])) j += 1;
    return this.s[j];
  }

  skipComment() {
    if (this.s[this.i + 1] === '/') {
      const end = this.s.indexOf('\n', this.i);
      this.i = end === -1 ? this.n : end + 1;
      return true;
    }
    if (this.s[this.i + 1] === '*') {
      const end = this.s.indexOf('*/', this.i + 2);
      if (end === -1) this.fail('unterminated comment');
      this.i = end + 2;
      return true;
    }
    return false;
  }

  skipSpaceAndComments() {
    for (;;) {
      while (this.i < this.n && /\s/.test(this.s[this.i])) this.i += 1;
      if (this.s[this.i] === '/' && (this.s[this.i + 1] === '/' || this.s[this.i + 1] === '*')) this.skipComment();
      else return;
    }
  }

  readQuoted(quote) {
    const start = ++this.i;
    while (this.i < this.n) {
      const c = this.s[this.i];
      if (c === '\\') { this.i += 2; continue; }
      if (c === quote) { this.i += 1; return decodeEscapes(this.s.slice(start, this.i - 1)); }
      if (c === '\n') this.fail('unterminated string');
      this.i += 1;
    }
    return this.fail('unterminated string');
  }

  readTemplate(excluded) {
    this.i += 1;
    const chunks = [''];
    while (this.i < this.n) {
      const c = this.s[this.i];
      if (c === '\\') { chunks[chunks.length - 1] += this.s.slice(this.i, this.i + 2); this.i += 2; continue; }
      if (c === '`') {
        this.i += 1;
        const skeleton = chunks.map(decodeEscapes).join('{}');
        if (skeleton.replace(/\{\}/g, '').trim()) this.emit(skeleton, excluded);
        return;
      }
      if (c === '$' && this.s[this.i + 1] === '{') {
        this.i += 2;
        this.scanUntil(new Set(['}']), excluded, { t: 'punct', v: '{' });
        this.expect('}');
        chunks.push('');
        continue;
      }
      chunks[chunks.length - 1] += c;
      this.i += 1;
    }
    this.fail('unterminated template');
  }

  skipRegex() {
    this.i += 1;
    let inClass = false;
    let swallowsCopy = false;
    while (this.i < this.n) {
      const c = this.s[this.i];
      if (c === '\\') { this.i += 2; continue; }
      if (c === '\n') this.fail('unterminated regex');
      if (c === '"' || c === "'" || c === '`' || c === '<') swallowsCopy = true;
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) {
        this.i += 1;
        const flagsStart = this.i;
        while (isIdentPart(this.s[this.i])) this.i += 1;
        // A body holding a quote or `<` could be a division sign misread as a
        // regex, swallowing a string or JSX. Keep it only if it ends like a real
        // regex; otherwise give up so the file is hashed by bytes.
        if (swallowsCopy && !(REGEX_FLAGS.test(this.s.slice(flagsStart, this.i)) && REGEX_FOLLOWER.test(this.s.slice(this.i)))) {
          this.fail('regex holding a quote or < does not end like a regex');
        }
        return;
      }
      this.i += 1;
    }
    this.fail('unterminated regex');
  }

  expect(c) {
    if (this.s[this.i] !== c) this.fail(`expected ${JSON.stringify(c)}`);
    this.i += 1;
  }

  startsExpression(prev) {
    if (!prev) return true;
    if (prev.t === 'punct') return true;
    return prev.t === 'ident' && EXPRESSION_KEYWORDS.has(prev.v);
  }

  /** Scan JS/TS tokens until a terminator character (left unconsumed) or end of input. */
  scanUntil(terminators, excluded, prev = null) {
    while (this.i < this.n) {
      const c = this.s[this.i];
      if (terminators.has(c)) return;
      if (/\s/.test(c)) { this.i += 1; continue; }
      if (c === '/' && this.skipComment()) continue;
      if (c === '"' || c === "'") {
        const value = this.readQuoted(c);
        if (this.moduleSpecifierNext) this.moduleSpecifierNext = false;
        else this.emit(value, excluded);
        prev = { t: 'value' };
        continue;
      }
      if (c === '`') { this.readTemplate(excluded); prev = { t: 'value' }; continue; }
      if (c in CLOSERS) {
        const callOfClassHelper = c === '(' && prev?.t === 'ident' && (CLASS_HELPERS.has(prev.v) || prev.v === 'require' || prev.v === 'import');
        const condition = c === '(' && prev?.t === 'ident' && CONDITION_KEYWORDS.has(prev.v);
        this.i += 1;
        this.scanUntil(new Set([CLOSERS[c]]), excluded || callOfClassHelper, { t: 'punct', v: c });
        this.expect(CLOSERS[c]);
        prev = condition ? { t: 'punct', v: ')' } : { t: 'value' };
        continue;
      }
      if (c === ')' || c === ']' || c === '}') this.fail(`unbalanced ${JSON.stringify(c)}`);
      if (c === '/' && this.startsExpression(prev)) { this.skipRegex(); prev = { t: 'value' }; continue; }
      if (c === '<' && this.jsx && this.startsExpression(prev) && /[\p{L}_$>]/u.test(this.s[this.i + 1] ?? '')) {
        this.parseElement(excluded);
        prev = { t: 'value' };
        continue;
      }
      if (isIdentStart(c)) {
        const start = this.i;
        while (isIdentPart(this.s[this.i])) this.i += 1;
        const word = this.s.slice(start, this.i);
        if (prev?.t === 'punct' && prev.v === '.') { prev = { t: 'value' }; continue; } // a property name, even `.default`
        const following = this.nextNonSpace();
        if ((word === 'from' || word === 'import') && (following === '"' || following === "'")) {
          this.moduleSpecifierNext = true;
        } else if (NON_COPY_PROPS.has(word) && following === ':' && prev?.t === 'punct' && (prev.v === '{' || prev.v === ',')) {
          this.i = this.s.indexOf(':', this.i) + 1;
          this.scanUntil(new Set([',', ';', ...Object.values(CLOSERS)]), true, { t: 'punct', v: ':' });
          prev = { t: 'value' };
          continue;
        }
        prev = { t: 'ident', v: word };
        continue;
      }
      if (/[0-9]/.test(c)) {
        while (/[0-9a-zA-Z_.]/.test(this.s[this.i] ?? '')) this.i += 1;
        prev = { t: 'value' };
        continue;
      }
      if (c === '=' && this.s[this.i + 1] === '>') { this.i += 2; prev = { t: 'punct', v: '=>' }; continue; }
      const afterValue = prev && (prev.t === 'value' || (prev.t === 'ident' && !EXPRESSION_KEYWORDS.has(prev.v)));
      if ((c === '+' || c === '-') && this.s[this.i + 1] === c) {
        this.i += 2;
        if (!afterValue) prev = { t: 'punct', v: c + c }; // prefix ++x: an operand follows; postfix x++ stays a value
        continue;
      }
      if (c === '!' && afterValue && this.s[this.i + 1] !== '=') { this.i += 1; continue; } // TypeScript non-null x!
      this.i += 1;
      prev = { t: 'punct', v: c };
    }
    if (terminators.size) this.fail('unexpected end of input');
  }

  readJsxName() {
    const start = this.i;
    while (/[\p{L}\p{N}_$.:-]/u.test(this.s[this.i] ?? '')) this.i += 1;
    return this.s.slice(start, this.i);
  }

  parseElement(excluded) {
    this.i += 1; // <
    this.skipSpaceAndComments();
    if (this.s[this.i] === '>') { this.i += 1; this.parseChildren('', excluded); return; }
    const name = this.readJsxName();
    if (!name) this.fail('expected JSX tag name');
    for (;;) {
      this.skipSpaceAndComments();
      const c = this.s[this.i];
      if (c === undefined) this.fail('unterminated JSX tag');
      if (c === '/' && this.s[this.i + 1] === '>') { this.i += 2; return; }
      if (c === '>') { this.i += 1; this.parseChildren(name, excluded); return; }
      if (c === '{') {
        this.i += 1;
        this.scanUntil(new Set(['}']), excluded, { t: 'punct', v: '{' });
        this.expect('}');
        continue;
      }
      const attr = this.readJsxName();
      if (!attr) this.fail('expected JSX attribute');
      this.skipSpaceAndComments();
      if (this.s[this.i] !== '=') continue; // boolean attribute
      this.i += 1;
      this.skipSpaceAndComments();
      const attrExcluded = excluded || NON_COPY_ATTRS.has(attr) || attr.startsWith('data-');
      const v = this.s[this.i];
      if (v === '"' || v === "'") {
        const end = this.s.indexOf(v, this.i + 1);
        if (end === -1) this.fail('unterminated JSX attribute');
        this.emit(`${attr}=${this.s.slice(this.i + 1, end)}`, attrExcluded);
        this.i = end + 1;
      } else if (v === '{') {
        this.i += 1;
        this.scanUntil(new Set(['}']), attrExcluded, { t: 'punct', v: '{' });
        this.expect('}');
      } else if (v === '<') {
        this.parseElement(attrExcluded);
      } else {
        this.fail('unexpected JSX attribute value');
      }
    }
  }

  parseChildren(name, excluded) {
    while (this.i < this.n) {
      const c = this.s[this.i];
      if (c === '<') {
        if (this.s[this.i + 1] === '/') {
          this.i += 2;
          this.skipSpaceAndComments();
          const closing = this.readJsxName();
          this.skipSpaceAndComments();
          this.expect('>');
          if (closing !== name) this.fail(`closing tag </${closing}> does not match <${name}>`);
          return;
        }
        this.parseElement(excluded);
        continue;
      }
      if (c === '{') {
        this.i += 1;
        this.scanUntil(new Set(['}']), excluded, { t: 'punct', v: '{' });
        this.expect('}');
        continue;
      }
      const start = this.i;
      while (this.i < this.n && this.s[this.i] !== '<' && this.s[this.i] !== '{') this.i += 1;
      this.emit(this.s.slice(start, this.i), excluded);
    }
    this.fail(`unterminated JSX element <${name}>`);
  }
}

/** Ordered reader-facing segments of one source file; throws CopyScanError if the scanner cannot follow it. */
export function copySegments(source, { jsx = true } = {}) {
  const scanner = new Scanner(source, jsx);
  scanner.scanUntil(new Set(), false);
  return scanner.out;
}

/** Whether a file extension is source the scanner reads, and whether it may contain JSX. */
export function scannerModeFor(ext) {
  if (['.tsx', '.jsx', '.js'].includes(ext)) return { jsx: true };
  if (['.ts', '.mts', '.cts', '.mjs', '.cjs'].includes(ext)) return { jsx: false };
  return null;
}

function selfTest() {
  const same = (actual, expected, label) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  const tsx = (source) => copySegments(source, { jsx: true });

  same(tsx(`import Link from 'next/link'
import './globals.css'
export function Card({ open }: { open: boolean }) {
  // a comment with "quoted" words
  return (
    <div className={cn('rounded-xl p-4', open && 'ring-2')} data-state="open" key="k">
      <h3 style={{ color: 'red' }}>Season {year} recap</h3>
      <img src="/a.webp" alt="Players at the net" sizes="50vw" />
      <Link href="/gallery" aria-label="View the gallery">View Gallery <span aria-hidden="true">→</span></Link>
      {/* not copy */}
      {open ? 'Open now' : \`Opens \${day} at 9\`}
    </div>
  )
}`), ['Season', 'recap', 'src=/a.webp', 'alt=Players at the net', 'href=/gallery', 'aria-label=View the gallery', 'View Gallery', 'aria-hidden=true', '→', 'Open now', 'Opens {} at 9'], 'tsx component');

  same(copySegments(`const items = [{ title: 'Media', className: 'p-2 text-sm', body: "Photo & video" }]
const re = /^[a-z]+\\/(\\d+)$/gi
const half = total / 2 / 3
const lazy = await import('./x')
const cfg = require('./cfg')
export * from './more'
type Variant = 'belle' | 'bell'
const list = useState<string | null>(null)`, { jsx: false }), ['Media', 'Photo & video', 'belle', 'bell'], 'ts data, regex, division, module specifiers');

  same(tsx(`const x = <>
  <p>Line one
     continues here.</p>
</>`), ['Line one continues here.'], 'fragment and multi-line JSX text');

  same(tsx(`export const motionProps = <motion.div initial={{ opacity: 0 }} transition={{ ease: 'easeOut' }} whileInView="show">Hi</motion.div>`), ['Hi'], 'motion props excluded');

  // Division signs the scanner must not mistake for a regex start (each would hide the string between them).
  same(copySegments(`const h = i++ / 2; const label = 'Hello reader'; const q = total / 3`, { jsx: false }), ['Hello reader'], 'division after postfix ++');
  same(copySegments(`const w = size.default / 2; const t = 'Welcome'; const r = a / b`, { jsx: false }), ['Welcome'], 'division after a keyword-named property');
  same(copySegments(`const n = value! / 2; const s = 'Non-null'; const m = x / y`, { jsx: false }), ['Non-null'], 'division after a non-null assertion');
  same(copySegments(`if (ok) /^a+$/.test(s); const z = 'After a condition'`, { jsx: false }), ['After a condition'], 'regex after an if condition');

  const throws = (source, label) => {
    let threw = false;
    try { tsx(source); } catch (error) { threw = error instanceof CopyScanError; }
    if (!threw) throw new Error(`${label} did not throw CopyScanError`);
  };
  same(tsx(`const safe = json.replace(/</g, '\\u003c'); const q = /['"]/.test(s) ? 'Quoted' : 'Plain'`), ['\u003c', 'Quoted', 'Plain'], 'real regexes holding < and quotes');
  throws(`const re = /['"]/ 2\nexport const s = 'x'`, 'a regex holding a quote that does not end like a regex');
  let threw = false;
  try { tsx(`const f = <T,>(x: T) => x\nexport const label = 'Hi'`); } catch (error) { threw = error instanceof CopyScanError; }
  if (!threw) throw new Error('a generic arrow the scanner cannot follow did not throw CopyScanError');
  threw = false;
  try { tsx(`const s = 'unterminated\n`); } catch (error) { threw = error instanceof CopyScanError; }
  if (!threw) throw new Error('an unterminated string did not throw CopyScanError');

  console.log('copy-segments self-test: PASS (JSX text, attributes, class helpers, data strings, module specifiers, regex vs division, scan errors)');
}

if (invokedDirectly(import.meta.url)) {
  if (process.argv.includes('--selftest') || process.argv.includes('--self-test')) {
    selfTest();
  } else {
    const file = process.argv[2];
    if (!file) {
      console.error('usage: copy-segments.mjs <file> | --selftest');
      process.exitCode = 2;
    } else {
      const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
      const mode = scannerModeFor(ext);
      if (!mode) {
        console.error(`not a scanned source type: ${ext} (copy fingerprints hash it by bytes)`);
        process.exitCode = 2;
      } else {
        for (const segment of copySegments(await fs.readFile(file, 'utf8'), mode)) console.log(segment);
      }
    }
  }
}
