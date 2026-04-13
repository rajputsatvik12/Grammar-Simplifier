/**
 * parser.js  —  LAYER 1: Text → Grammar
 * ─────────────────────────────────────────────────────────────────
 * Responsibility:
 *   Convert raw multi-line text entered by the user into a
 *   well-defined Grammar data structure consumed by the engine.
 *
 * This module has ZERO knowledge of the DOM or the grammar engine.
 * It only knows about strings, sets, and maps.
 *
 * Exported API:
 *   parseGrammar(text)  →  { ok, grammar?, error? }
 *   cloneGrammar(g)     →  Grammar  (deep copy, used by engine)
 *   grammarToText(g)    →  string   (used by renderer for export)
 * ─────────────────────────────────────────────────────────────────
 *
 * @module parser
 */

"use strict";

/* ═══════════════════════════════════════════════════════════════
   GRAMMAR DATA STRUCTURE (TypeDef documentation)

   Grammar = {
     start:        string                    — start symbol (first LHS seen)
     nonTerminals: Set<string>               — all non-terminal symbols
     terminals:    Set<string>               — all terminal symbols
     productions:  Map<string, string[][]>   — LHS → list-of-RHS-arrays
   }

   An RHS is represented as a plain array of symbol strings.
   The empty array [] represents an epsilon (ε) production.

   Example for grammar:  S → a S b | ε
   productions = Map {
     "S" → [ ["a","S","b"], [] ]
   }
═══════════════════════════════════════════════════════════════ */

/**
 * Supported arrow syntaxes (order matters — try longest first).
 * Matches: →  →  ->  :
 */
const ARROW_PATTERN = /→|->|:/;

/**
 * Strings that represent epsilon (the empty string).
 * Users may type any of these as an RHS alternative.
 */
const EPSILON_TOKENS = new Set(['ε', 'eps', 'epsilon', 'λ', 'lambda', '']);

/**
 * A non-terminal is any token matching an uppercase letter,
 * optionally followed by more uppercase letters, digits, ' or _.
 * Examples: S, A, B1, S', START
 */
const NT_PATTERN = /^[A-Z][A-Z0-9'_]*$/;

/* ── Public: parseGrammar ─────────────────────────────────────── */

/**
 * Parse a raw grammar string into a Grammar object.
 *
 * @param {string} text  — raw textarea content
 * @returns {{ ok: true,  grammar: Grammar } |
 *           { ok: false, error: string    }}
 */
export function parseGrammar(text) {
  /* ── 1. Pre-process: strip comments, blank lines ─────────── */
  const lines = text
    .split('\n')
    .map(line => line.replace(/\/\/.*$/, '').replace(/#.*$/, '').trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    return { ok: false, error: 'No production rules found. Please enter at least one rule.' };
  }

  /** @type {Grammar} */
  const grammar = {
    start:        '',
    nonTerminals: new Set(),
    terminals:    new Set(),
    productions:  new Map(),
  };

  let startSet = false;

  /* ── 2. Parse each line ──────────────────────────────────── */
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Split on the arrow
    const arrowIdx = indexOfArrow(line);
    if (arrowIdx === -1) {
      return {
        ok: false,
        error: `Line ${lineNum}: cannot find arrow (→, ->, or :) in: "${line}"`
      };
    }

    const lhs = line.slice(0, arrowIdx).trim();
    const rhsRaw = line.slice(arrowIdx + arrowLength(line, arrowIdx)).trim();

    // Validate LHS is a valid non-terminal
    if (!NT_PATTERN.test(lhs)) {
      return {
        ok: false,
        error: `Line ${lineNum}: left-hand side "${lhs}" must start with an uppercase letter.`
      };
    }

    if (!rhsRaw) {
      return {
        ok: false,
        error: `Line ${lineNum}: no right-hand side found for "${lhs}".`
      };
    }

    grammar.nonTerminals.add(lhs);
    if (!startSet) { grammar.start = lhs; startSet = true; }

    /* ── 3. Parse RHS alternatives (split on |) ──────────── */
    const alternatives = rhsRaw.split('|').map(alt => alt.trim());
    const rhsList = [];

    for (const alt of alternatives) {
      if (EPSILON_TOKENS.has(alt.toLowerCase())) {
        // Epsilon: stored as empty array
        rhsList.push([]);
      } else {
        // Tokenise: split on whitespace OR split into single chars if no spaces
        rhsList.push(tokenise(alt));
      }
    }

    /* ── 4. Merge with any previous rules for this LHS ───── */
    //  (two lines defining the same LHS are combined)
    if (grammar.productions.has(lhs)) {
      grammar.productions.get(lhs).push(...rhsList);
    } else {
      grammar.productions.set(lhs, rhsList);
    }
  }

  /* ── 5. Classify every RHS symbol as terminal or non-terminal */
  for (const [, rhsList] of grammar.productions) {
    for (const rhs of rhsList) {
      for (const sym of rhs) {
        if (!grammar.nonTerminals.has(sym)) {
          grammar.terminals.add(sym);
        }
      }
    }
  }

  /* ── 6. Validate start symbol has at least one production ── */
  if (!grammar.productions.has(grammar.start)) {
    return {
      ok: false,
      error: `Start symbol "${grammar.start}" has no productions.`
    };
  }

  return { ok: true, grammar };
}

/* ── Public: cloneGrammar ─────────────────────────────────────── */

/**
 * Deep-clone a Grammar object so each engine step operates on
 * a fresh copy without mutating earlier states.
 *
 * @param {Grammar} g
 * @returns {Grammar}
 */
export function cloneGrammar(g) {
  const newProds = new Map();
  for (const [lhs, alts] of g.productions) {
    newProds.set(lhs, alts.map(alt => [...alt]));
  }
  return {
    start:        g.start,
    nonTerminals: new Set(g.nonTerminals),
    terminals:    new Set(g.terminals),
    productions:  newProds,
  };
}

/* ── Public: grammarToText ────────────────────────────────────── */

/**
 * Serialise a Grammar back to a human-readable string.
 * Used by the controller to let users copy the minimized grammar.
 *
 * @param {Grammar} g
 * @returns {string}
 */
export function grammarToText(g) {
  const lines = [];
  // Start symbol first, then alphabetical order
  const order = [g.start, ...[...g.productions.keys()].filter(k => k !== g.start).sort()];

  for (const lhs of order) {
    if (!g.productions.has(lhs)) continue;
    const rhsList = g.productions.get(lhs);
    if (rhsList.length === 0) continue;

    const rhsStr = rhsList
      .map(rhs => rhs.length === 0 ? 'ε' : rhs.join(' '))
      .join(' | ');

    lines.push(`${lhs} → ${rhsStr}`);
  }

  return lines.join('\n');
}

/* ══════════════════════════════════════════════════════════════════
   PRIVATE HELPERS
══════════════════════════════════════════════════════════════════ */

/**
 * Find the character index of the first arrow token in a line.
 * Returns -1 if no arrow found.
 *
 * @param {string} line
 * @returns {number}
 */
function indexOfArrow(line) {
  // Try multi-char arrows first, then single-char
  for (const arrow of ['→', '->', ':']) {
    const idx = line.indexOf(arrow);
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Return the character length of the arrow starting at arrowIdx.
 *
 * @param {string} line
 * @param {number} arrowIdx
 * @returns {number}
 */
function arrowLength(line, arrowIdx) {
  if (line.startsWith('->', arrowIdx)) return 2;
  return 1;  // → and : are both length 1
}

/**
 * Split an RHS string into an array of symbol tokens.
 *
 * Strategy:
 *   • If the string contains spaces: split on whitespace.
 *     "a B c"  → ["a", "B", "c"]
 *   • If no spaces: treat each character as its own symbol.
 *     "aB"     → ["a", "B"]
 *     "ab"     → ["a", "b"]
 *
 * This handles both space-separated and concatenated notations
 * without requiring the user to add spaces.
 *
 * @param {string} rhs
 * @returns {string[]}
 */
function tokenise(rhs) {
  const trimmed = rhs.trim();
  if (trimmed.includes(' ')) {
    return trimmed.split(/\s+/).filter(Boolean);
  }
  // No spaces — each char is its own symbol
  return [...trimmed];
}
