/**
 * engine/useless.js  —  STEP 1: Remove Useless Symbols
 * ─────────────────────────────────────────────────────────────────
 * A symbol is "useless" if it is either:
 *   (a) Non-generating — cannot derive any string of terminals, OR
 *   (b) Unreachable    — cannot appear in any sentential form
 *                        derivable from the start symbol
 *
 * Standard order: remove non-generating FIRST, then unreachable.
 * This order matters: removing non-generating symbols may make
 * previously reachable symbols unreachable.
 *
 * Reference: Sipser §2.1, Hopcroft–Motwani–Ullman §7.1
 *
 * @module engine/useless
 */

"use strict";

import { cloneGrammar } from '../parser.js';

/* ═══════════════════════════════════════════════════════════════
   PUBLIC EXPORT
═══════════════════════════════════════════════════════════════ */

/**
 * Run the full useless-symbol removal step (both phases).
 *
 * @param {Grammar} g   — input grammar (not mutated)
 * @returns {StepResult}
 */
export function removeUselessSymbols(g) {
  // Phase A: non-generating
  const phaseA = _removeNonGenerating(g);
  // Phase B: unreachable (applied to result of phase A)
  const phaseB = _removeUnreachable(phaseA.grammarAfter);

  // Merge reporting data from both phases
  return {
    stepName: 'Remove Useless Symbols',
    description:
      'A symbol is <em>useless</em> if it is non-generating (cannot derive any terminal string) ' +
      'or unreachable (never appears in a sentential form derivable from S). ' +
      '<br><br>' +
      '<strong>Phase A — Non-generating:</strong> Mark every terminal as generating. ' +
      'Then repeatedly mark a non-terminal A as generating if ∃ production A → α where ' +
      'every symbol in α is already generating. Remove all symbols not marked. ' +
      '<br><br>' +
      '<strong>Phase B — Unreachable:</strong> BFS/DFS from the start symbol over the ' +
      'production graph. Any symbol never visited is unreachable and can be removed.',
    grammarAfter:       phaseB.grammarAfter,
    removedSymbols:     [...phaseA.removedSymbols, ...phaseB.removedSymbols],
    removedProductions: [...phaseA.removedProductions, ...phaseB.removedProductions],
    info: {
      // Phase A
      generatingSet:    phaseA.info.generatingSet,
      nonGenerating:    phaseA.info.nonGenerating,
      // Phase B
      reachableSet:     phaseB.info.reachableSet,
      unreachableNT:    phaseB.info.unreachableNT,
      unreachableT:     phaseB.info.unreachableT,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   PHASE A — Remove Non-Generating Symbols
═══════════════════════════════════════════════════════════════ */

/**
 * A non-terminal is *generating* if it can derive at least one
 * finite string consisting entirely of terminals.
 *
 * Algorithm (fixed-point / marking):
 *   1. All terminals are trivially generating.
 *   2. Epsilon (empty RHS) means LHS can derive ε — mark as generating.
 *   3. A non-terminal A is generating if ANY of its productions
 *      A → α has every symbol in α already marked as generating.
 *   4. Repeat until no new symbols are added.
 *
 * @param {Grammar} g
 * @returns {{ grammarAfter: Grammar, removedSymbols: string[],
 *             removedProductions: string[], info: Object }}
 */
function _removeNonGenerating(g) {
  const grammar = cloneGrammar(g);

  // Seed: all terminals are generating
  const generating = new Set(grammar.terminals);

  // Fixed-point loop
  let changed = true;
  while (changed) {
    changed = false;
    for (const [lhs, rhsList] of grammar.productions) {
      if (generating.has(lhs)) continue;       // already marked

      for (const rhs of rhsList) {
        // An empty RHS means lhs can derive ε → generating
        const allGenerating = rhs.every(sym => generating.has(sym));
        if (allGenerating) {
          generating.add(lhs);
          changed = true;
          break;  // no need to check other RHS for this LHS
        }
      }
    }
  }

  // Identify non-generating non-terminals
  const nonGenerating = [...grammar.nonTerminals].filter(nt => !generating.has(nt));

  // Remove all productions that contain a non-generating symbol
  const removedProductions = [];

  for (const [lhs, rhsList] of grammar.productions) {
    if (nonGenerating.includes(lhs)) {
      // Entire rule set for this LHS is removed
      grammar.productions.delete(lhs);
      removedProductions.push(`${lhs} → (all productions deleted — LHS is non-generating)`);
      continue;
    }

    // Filter out individual RHS alternatives that reference a non-generating symbol
    const before = rhsList.length;
    const filtered = rhsList.filter(rhs =>
      !rhs.some(sym => nonGenerating.includes(sym))
    );
    const delta = before - filtered.length;

    if (delta > 0) {
      rhsList.splice(0, rhsList.length, ...filtered);
      removedProductions.push(`${lhs}: removed ${delta} alternative(s) containing non-generating symbol(s)`);
    }
  }

  // Update non-terminal set
  nonGenerating.forEach(nt => grammar.nonTerminals.delete(nt));

  return {
    grammarAfter:       grammar,
    removedSymbols:     nonGenerating,
    removedProductions,
    info: {
      generatingSet: [...generating].filter(s =>
        grammar.nonTerminals.has(s) || grammar.terminals.has(s)
      ),
      nonGenerating,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   PHASE B — Remove Unreachable Symbols
═══════════════════════════════════════════════════════════════ */

/**
 * A symbol X is *reachable* if there exists a derivation
 *   S ⟹* α X β   for some strings α, β.
 *
 * Algorithm (BFS from start symbol):
 *   1. Mark S as reachable.
 *   2. For each reachable non-terminal A, mark every symbol
 *      appearing in any production of A as reachable.
 *   3. Repeat until queue is empty.
 *
 * @param {Grammar} g
 * @returns {{ grammarAfter: Grammar, removedSymbols: string[],
 *             removedProductions: string[], info: Object }}
 */
function _removeUnreachable(g) {
  const grammar = cloneGrammar(g);

  // BFS
  const reachable = new Set([grammar.start]);
  const queue     = [grammar.start];

  while (queue.length > 0) {
    const sym = queue.shift();
    if (!grammar.productions.has(sym)) continue;

    for (const rhs of grammar.productions.get(sym)) {
      for (const s of rhs) {
        if (!reachable.has(s)) {
          reachable.add(s);
          queue.push(s);
        }
      }
    }
  }

  // Classify unreachable symbols
  const unreachableNT = [...grammar.nonTerminals].filter(nt => !reachable.has(nt));
  const unreachableT  = [...grammar.terminals].filter(t  => !reachable.has(t));

  // Remove productions for unreachable non-terminals
  const removedProductions = [];

  for (const nt of unreachableNT) {
    if (grammar.productions.has(nt)) {
      grammar.productions.delete(nt);
      removedProductions.push(`${nt} → (all productions deleted — symbol is unreachable)`);
    }
    grammar.nonTerminals.delete(nt);
  }

  unreachableT.forEach(t => grammar.terminals.delete(t));

  return {
    grammarAfter:       grammar,
    removedSymbols:     [...unreachableNT, ...unreachableT],
    removedProductions,
    info: {
      reachableSet: [...reachable],
      unreachableNT,
      unreachableT,
    },
  };
}
