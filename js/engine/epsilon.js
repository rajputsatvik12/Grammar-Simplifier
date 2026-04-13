/**
 * engine/epsilon.js  —  STEP 2: Eliminate ε (Null) Productions
 * ─────────────────────────────────────────────────────────────────
 * An ε-production is any rule of the form  A → ε  (A derives the
 * empty string). Most grammar simplification algorithms require
 * their absence (e.g., CNF conversion).
 *
 * Algorithm overview:
 *   1. Compute NULLABLE — the set of non-terminals that can derive ε
 *      (directly or through a chain of nullable non-terminals).
 *   2. For each production that contains nullable symbols, add all
 *      combinations where those symbols are optionally omitted.
 *      (This is the 2^k power-set expansion for k nullable positions.)
 *   3. Remove all ε-productions.
 *      EXCEPTION: If S (the start symbol) is nullable, keep S → ε
 *      because ε ∈ L(G) and removing it would change the language.
 *
 * Reference: Sipser §2.1 (Lemma 2.21), HMU §7.1.2
 *
 * @module engine/epsilon
 */

"use strict";

import { cloneGrammar } from '../parser.js';

/* ═══════════════════════════════════════════════════════════════
   PUBLIC EXPORT
═══════════════════════════════════════════════════════════════ */

/**
 * Eliminate all ε-productions from grammar g.
 *
 * @param {Grammar} g   — input grammar (not mutated)
 * @returns {StepResult}
 */
export function eliminateEpsilonProductions(g) {
  const grammar = cloneGrammar(g);

  /* ── Step 1: compute the nullable set ── */
  const nullable = computeNullable(grammar);
  const startIsNullable = nullable.has(grammar.start);

  /* ── Step 2: expand each production ── */
  const addedProductions = [];
  const removedProductions = [];

  for (const [lhs, rhsList] of grammar.productions) {
    // Collect all current RHS as a dedup set (JSON-keyed)
    const uniqueRHS = new Map(rhsList.map(rhs => [JSON.stringify(rhs), rhs]));

    // For each existing alternative, generate combinations
    for (const rhs of [...rhsList]) {
      if (rhs.length === 0) continue;  // skip existing ε-productions for now

      // Identify positions in this RHS that hold nullable symbols
      const nullablePositions = rhs
        .map((sym, i) => (nullable.has(sym) ? i : -1))
        .filter(i => i !== -1);

      if (nullablePositions.length === 0) continue;  // no nullable symbols here

      // Generate all 2^k subsets of nullable positions
      const combCount = 1 << nullablePositions.length;
      for (let mask = 1; mask < combCount; mask++) {
        // Build the set of indices to omit for this mask
        const omit = new Set();
        nullablePositions.forEach((posIdx, bit) => {
          if (mask & (1 << bit)) omit.add(posIdx);
        });

        const expanded = rhs.filter((_, i) => !omit.has(i));
        const key = JSON.stringify(expanded);

        if (!uniqueRHS.has(key)) {
          uniqueRHS.set(key, expanded);
          if (expanded.length > 0) {
            addedProductions.push(`${lhs} → ${expanded.join(' ')} (expansion of ${lhs} → ${rhs.join(' ')})`);
          }
        }
      }
    }

    // Replace this LHS's production list with the expanded set,
    // filtering out ε-productions (length === 0)
    const expanded = [...uniqueRHS.values()].filter(rhs => rhs.length > 0);

    // Re-add S → ε if start symbol is nullable (preserves language)
    if (lhs === grammar.start && startIsNullable) {
      expanded.push([]);
    }

    // Record which ε-productions we removed
    if (rhsList.some(rhs => rhs.length === 0)) {
      if (!(lhs === grammar.start && startIsNullable)) {
        removedProductions.push(`${lhs} → ε`);
      }
    }

    grammar.productions.set(lhs, expanded);
  }

  return {
    stepName: 'Eliminate ε-Productions (Null Productions)',
    description:
      'An <em>ε-production</em> is a rule of the form <code>A → ε</code>. ' +
      'We first compute the <em>nullable set</em> — all non-terminals that can derive ε ' +
      'directly or through a chain of nullable symbols. ' +
      'Then for each production referencing a nullable symbol, we add all 2<sup>k</sup> ' +
      'combinations with those symbols optionally omitted. ' +
      (startIsNullable
        ? '<code>S → ε</code> is retained because ε ∈ L(G) — the language includes the empty string.'
        : 'Since the start symbol is not nullable, ε ∉ L(G) and all ε-productions are fully removed.'),
    grammarAfter:       grammar,
    removedSymbols:     [],
    removedProductions,
    info: {
      nullable:         [...nullable],
      startIsNullable,
      addedProductions,
      removedProductions,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   HELPER: computeNullable
═══════════════════════════════════════════════════════════════ */

/**
 * Compute the set of all nullable non-terminals.
 *
 * A non-terminal A is nullable if:
 *   • A → ε  is a direct production, OR
 *   • A → B₁ B₂ … Bₙ  where every Bᵢ is nullable
 *
 * Uses the same fixed-point (iterative marking) technique as
 * the generating-set computation in useless.js.
 *
 * @param {Grammar} g
 * @returns {Set<string>}
 */
export function computeNullable(g) {
  const nullable = new Set();

  // Seed: direct ε-productions
  for (const [lhs, rhsList] of g.productions) {
    if (rhsList.some(rhs => rhs.length === 0)) {
      nullable.add(lhs);
    }
  }

  // Fixed-point expansion
  let changed = true;
  while (changed) {
    changed = false;
    for (const [lhs, rhsList] of g.productions) {
      if (nullable.has(lhs)) continue;
      for (const rhs of rhsList) {
        // A non-empty production where EVERY symbol is nullable
        if (rhs.length > 0 && rhs.every(sym => nullable.has(sym))) {
          nullable.add(lhs);
          changed = true;
          break;
        }
      }
    }
  }

  return nullable;
}
