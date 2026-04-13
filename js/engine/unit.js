/**
 * engine/unit.js  —  STEP 3: Eliminate Unit Productions
 * ─────────────────────────────────────────────────────────────────
 * A *unit production* is a rule of the form  A → B  where B is a
 * single non-terminal. These create unnecessary indirection and
 * must be removed before converting to CNF.
 *
 * Algorithm:
 *   1. For each non-terminal A, compute UNIT(A) — the set of all
 *      non-terminals reachable from A via chains of unit productions.
 *      (This is the transitive closure over unit edges.)
 *   2. For each B ∈ UNIT(A), add every non-unit production of B
 *      directly to A's production set.
 *   3. Remove all unit productions from the grammar.
 *
 * Reference: Sipser §2.1, HMU §7.1.3
 *
 * @module engine/unit
 */

"use strict";

import { cloneGrammar } from '../parser.js';

/* ═══════════════════════════════════════════════════════════════
   PUBLIC EXPORT
═══════════════════════════════════════════════════════════════ */

/**
 * Eliminate all unit productions from grammar g.
 *
 * @param {Grammar} g   — input grammar (not mutated)
 * @returns {StepResult}
 */
export function eliminateUnitProductions(g) {
  const grammar = cloneGrammar(g);

  const allAdded   = [];   // for reporting: newly inlined productions
  const allRemoved = [];   // for reporting: deleted unit productions

  /* ── Step 1 & 2: for each NT, compute closure and inline ── */
  for (const A of grammar.nonTerminals) {
    const closure = computeUnitClosure(A, grammar);

    for (const B of closure) {
      if (!grammar.productions.has(B)) continue;

      for (const rhs of grammar.productions.get(B)) {
        // Only propagate non-unit productions
        if (isUnitProduction(rhs, grammar)) continue;

        const currentList = grammar.productions.get(A) || [];
        const key = JSON.stringify(rhs);

        // Avoid duplicates
        if (!currentList.some(r => JSON.stringify(r) === key)) {
          currentList.push([...rhs]);
          grammar.productions.set(A, currentList);
          allAdded.push(`${A} → ${rhs.join(' ')}   (inlined from ${A} ⟹⁺ ${B})`);
        }
      }
    }
  }

  /* ── Step 3: remove all unit productions ── */
  for (const [lhs, rhsList] of grammar.productions) {
    const filtered = rhsList.filter(rhs => {
      if (isUnitProduction(rhs, grammar)) {
        allRemoved.push(`${lhs} → ${rhs[0]}`);
        return false;
      }
      return true;
    });
    grammar.productions.set(lhs, filtered);
  }

  // Remove any LHS that ended up with no productions
  for (const [lhs, rhsList] of grammar.productions) {
    if (rhsList.length === 0) grammar.productions.delete(lhs);
  }

  return {
    stepName: 'Eliminate Unit Productions',
    description:
      'A <em>unit production</em> is a rule of the form <code>A → B</code> where B is a ' +
      'single non-terminal. They create useless indirection without adding any language content. ' +
      '<br><br>' +
      'We compute the <em>unit closure</em> of each non-terminal A — all non-terminals reachable ' +
      'from A through chains of unit rules. Then every <em>non-unit</em> production of any ' +
      'reachable B is added directly to A. Finally, all unit productions are deleted.',
    grammarAfter:       grammar,
    removedSymbols:     [],
    removedProductions: allRemoved,
    info: {
      addedProductions:   allAdded,
      removedProductions: allRemoved,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   HELPER: computeUnitClosure
═══════════════════════════════════════════════════════════════ */

/**
 * Compute the unit closure of non-terminal A.
 *
 * UNIT(A) = { B : A ⟹⁺ B  using only unit productions }
 *
 * Uses BFS over the unit-production graph.
 * A itself is excluded from the returned set (we want the
 * *strictly reachable* non-terminals, not A itself).
 *
 * @param {string}  startNT  — the non-terminal to start from
 * @param {Grammar} g
 * @returns {Set<string>}
 */
function computeUnitClosure(startNT, g) {
  const visited = new Set([startNT]);
  const queue   = [startNT];

  while (queue.length > 0) {
    const A = queue.shift();
    if (!g.productions.has(A)) continue;

    for (const rhs of g.productions.get(A)) {
      // Unit production: exactly one symbol, and it's a non-terminal
      if (
        rhs.length === 1 &&
        g.nonTerminals.has(rhs[0]) &&
        !visited.has(rhs[0])
      ) {
        visited.add(rhs[0]);
        queue.push(rhs[0]);
      }
    }
  }

  visited.delete(startNT);  // exclude self
  return visited;
}

/* ═══════════════════════════════════════════════════════════════
   HELPER: isUnitProduction
═══════════════════════════════════════════════════════════════ */

/**
 * Test whether a given RHS array represents a unit production.
 *
 * A unit production is:  exactly one symbol AND that symbol is
 * a non-terminal (appears in g.nonTerminals).
 *
 * @param {string[]} rhs
 * @param {Grammar}  g
 * @returns {boolean}
 */
function isUnitProduction(rhs, g) {
  return rhs.length === 1 && g.nonTerminals.has(rhs[0]);
}
