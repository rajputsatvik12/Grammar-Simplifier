/**
 * engine/index.js  —  Pipeline Orchestrator
 * ─────────────────────────────────────────────────────────────────
 * This is the single public entry-point for the grammar engine.
 * It chains the three simplification steps in the correct order
 * and returns the full list of StepResult objects for the renderer.
 *
 * Canonical simplification order (Sipser / HMU):
 *   1. Remove useless symbols (non-generating then unreachable)
 *   2. Eliminate ε-productions
 *   3. Eliminate unit productions
 *   [Optional second pass of step 1 if steps 2-3 created new useless symbols]
 *
 * Each step function is a PURE function:
 *   (Grammar) → StepResult
 *
 * StepResult = {
 *   stepName:           string        — display title
 *   description:        string        — HTML explanation for students
 *   grammarAfter:       Grammar       — grammar state AFTER this step
 *   removedSymbols:     string[]      — symbols deleted
 *   removedProductions: string[]      — production strings deleted
 *   info:               Object        — step-specific detail data
 * }
 *
 * @module engine/index
 */

"use strict";

import { removeUselessSymbols }        from './useless.js';
import { eliminateEpsilonProductions } from './epsilon.js';
import { eliminateUnitProductions }    from './unit.js';

/* ═══════════════════════════════════════════════════════════════
   PUBLIC EXPORT
═══════════════════════════════════════════════════════════════ */

/**
 * Run the full simplification pipeline on grammar g.
 *
 * @param {Grammar} original   — parsed input grammar (not mutated)
 * @returns {StepResult[]}     — one entry per transformation step
 */
export function minimizeGrammar(original) {
  /** @type {StepResult[]} */
  const steps = [];

  // Track current grammar state through the pipeline
  let current = original;

  /**
   * Helper: apply a step function, push the result, advance current.
   * @param {function(Grammar): StepResult} stepFn
   */
  const run = (stepFn) => {
    const result = stepFn(current);
    steps.push(result);
    current = result.grammarAfter;
  };

  /* ── Pass 1 ── */
  run(removeUselessSymbols);         // Step 1: useless symbols
  run(eliminateEpsilonProductions);  // Step 2: ε-productions
  run(eliminateUnitProductions);     // Step 3: unit productions

  /* ── Pass 2 (conditional) ──────────────────────────────────
     Eliminating ε and unit productions can expose new useless
     symbols.  For example, if A was reachable only through a
     unit chain A → B that we just removed, A is now unreachable.
     We run useless-symbol removal a second time to catch this.
  ─────────────────────────────────────────────────────────── */
  const pass2 = removeUselessSymbols(current);

  if (
    pass2.removedSymbols.length > 0 ||
    pass2.removedProductions.length > 0
  ) {
    // There were new useless symbols — show this as an extra step
    pass2.stepName = 'Remove Useless Symbols (Pass 2)';
    pass2.description =
      'After eliminating ε and unit productions, some symbols may have become ' +
      'useless (non-generating or unreachable) that were not useless before. ' +
      'A second pass of useless-symbol removal cleans those up.';
    steps.push(pass2);
    current = pass2.grammarAfter;
  } else {
    // No changes — update the last step to reflect the cleaned grammar
    // (pass2 ran but found nothing to remove; still use its result as canonical)
    steps[steps.length - 1].grammarAfter = pass2.grammarAfter;
  }

  return steps;
}

/**
 * Convenience: return only the final (minimized) grammar.
 *
 * @param {Grammar} original
 * @returns {Grammar}
 */
export function getFinalGrammar(original) {
  const steps = minimizeGrammar(original);
  return steps[steps.length - 1].grammarAfter;
}
