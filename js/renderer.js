/**
 * renderer.js  —  LAYER 3a: Data → HTML Strings
 * ─────────────────────────────────────────────────────────────────
 * Responsibility:
 *   Convert Grammar objects and StepResult objects into HTML
 *   markup strings.  This module has ZERO DOM access — it only
 *   returns strings.  The controller (controller.js) decides
 *   where to inject them.
 *
 * Exported API:
 *   renderGrammar(grammar)          → string (HTML)
 *   renderStepBlock(step, index)    → string (HTML)
 *   renderStatsRow(original, final) → string (HTML)
 *   renderDiffGrid(original, final) → string (HTML)
 *   renderSymbolSet(symbols, kind)  → string (HTML)
 * ─────────────────────────────────────────────────────────────────
 *
 * @module renderer
 */

"use strict";

/* ═══════════════════════════════════════════════════════════════
   GRAMMAR RENDERER
═══════════════════════════════════════════════════════════════ */

/**
 * Render all production rules of a Grammar as a styled HTML list.
 * Uses .production-list / .production-item CSS classes.
 *
 * Non-terminals are coloured blue (.tok-nt),
 * terminals green (.tok-t), epsilon violet (.tok-eps).
 *
 * @param {Grammar} grammar
 * @returns {string}  HTML string (NOT yet in the DOM)
 */
export function renderGrammar(grammar) {
  if (!grammar || grammar.productions.size === 0) {
    return '<p class="empty-grammar">— empty grammar —</p>';
  }

  // Always render start symbol first, then others in insertion order
  const lhsOrder = [
    grammar.start,
    ...[...grammar.productions.keys()].filter(k => k !== grammar.start),
  ];

  const items = lhsOrder
    .filter(lhs => grammar.productions.has(lhs))
    .map(lhs => {
      const rhsList = grammar.productions.get(lhs);
      if (!rhsList || rhsList.length === 0) return '';

      // Build the RHS HTML — alternatives separated by a muted pipe
      const rhsHTML = rhsList
        .map((rhs, i) => {
          const altHTML = rhs.length === 0
            ? '<span class="tok-eps">ε</span>'
            : rhs.map(sym => renderSymbol(sym, grammar)).join(' ');
          return i === 0
            ? altHTML
            : `<span class="prod-pipe">|</span> ${altHTML}`;
        })
        .join(' ');

      return `
        <li class="production-item anim-fadeup">
          <span class="prod-lhs">${escapeHtml(lhs)}</span>
          <span class="prod-arrow">→</span>
          <span class="prod-rhs">${rhsHTML}</span>
        </li>`;
    })
    .join('');

  return `<ul class="production-list" role="list">${items}</ul>`;
}

/**
 * Render a single symbol token with the appropriate class.
 *
 * @param {string}  sym
 * @param {Grammar} grammar
 * @returns {string}
 */
function renderSymbol(sym, grammar) {
  const s = escapeHtml(sym);
  if (grammar.nonTerminals.has(sym)) return `<span class="tok-nt">${s}</span>`;
  return `<span class="tok-t">${s}</span>`;
}

/* ═══════════════════════════════════════════════════════════════
   STEP BLOCK RENDERER
═══════════════════════════════════════════════════════════════ */

/**
 * Render a single step accordion block.
 *
 * @param {StepResult} step
 * @param {number}     index   — 0-based step index
 * @returns {string}   HTML string
 */
export function renderStepBlock(step, index) {
  const changedCount = step.removedSymbols.length + step.removedProductions.length;
  const outcomeClass = changedCount > 0 ? 'changed' : 'unchanged';
  const outcomeText  = changedCount > 0
    ? `−${changedCount} item${changedCount > 1 ? 's' : ''}`
    : 'no changes';

  const infoHTML = buildStepInfoHTML(step);

  return `
    <div class="step-block anim-fadeup" id="step-block-${index}">
      <div class="step-header"
           role="button"
           aria-expanded="false"
           aria-controls="step-body-${index}"
           onclick="window.__cfgApp.toggleStep(${index})">
        <span class="step-num">${index + 1}</span>
        <span class="step-title">${escapeHtml(step.stepName)}</span>
        <span class="step-outcome ${outcomeClass}">${outcomeText}</span>
        <span class="step-caret" aria-hidden="true">▶</span>
      </div>

      <div class="step-body" id="step-body-${index}" role="region">
        <div class="step-body-inner">
          <p class="step-desc">${step.description}</p>
          ${infoHTML}
          <div class="step-section-label">Grammar after this step</div>
          <div class="prod-box">${renderGrammar(step.grammarAfter)}</div>
        </div>
      </div>
    </div>`;
}

/**
 * Build the step-specific informational detail HTML (nullable sets,
 * eliminated symbols, inlined productions, etc.)
 *
 * @param {StepResult} step
 * @returns {string}
 */
function buildStepInfoHTML(step) {
  const info = step.info;
  const parts = [];

  /* ── Useless step ── */
  if (step.stepName.includes('Useless')) {
    if (info.nonGenerating && info.nonGenerating.length > 0) {
      parts.push(`
        <div class="info-box">
          <strong>Non-generating non-terminals (removed):</strong>
          <div class="symbol-set">${
            info.nonGenerating.map(s => `<span class="sym-pill gone">${escapeHtml(s)}</span>`).join('')
          }</div>
        </div>`);
    } else if (info.nonGenerating) {
      parts.push(`<div class="info-box">All non-terminals are generating. No symbols removed in Phase A.</div>`);
    }

    if (info.unreachableNT && (info.unreachableNT.length + (info.unreachableT || []).length) > 0) {
      parts.push(`
        <div class="info-box">
          <strong>Unreachable symbols (removed):</strong>
          <div class="symbol-set">
            ${info.unreachableNT.map(s => `<span class="sym-pill gone nt">${escapeHtml(s)}</span>`).join('')}
            ${(info.unreachableT || []).map(s => `<span class="sym-pill gone t">${escapeHtml(s)}</span>`).join('')}
          </div>
        </div>`);
    } else if (info.unreachableNT) {
      parts.push(`<div class="info-box">All symbols are reachable from the start symbol. No symbols removed in Phase B.</div>`);
    }
  }

  /* ── Epsilon step ── */
  if (step.stepName.includes('ε') || step.stepName.includes('Epsilon') || step.stepName.includes('Null')) {
    if (info.nullable && info.nullable.length > 0) {
      parts.push(`
        <div class="info-box">
          <strong>Nullable set:</strong>
          <div class="symbol-set">${
            info.nullable.map(s => `<span class="sym-pill nullable">${escapeHtml(s)}</span>`).join('')
          }</div>
          ${info.addedProductions && info.addedProductions.length > 0
            ? `<br><strong>New productions added by expansion:</strong><br>
               ${info.addedProductions.slice(0, 10).map(p => `<code>${escapeHtml(p)}</code>`).join('<br>')}
               ${info.addedProductions.length > 10 ? `<br><em>…and ${info.addedProductions.length - 10} more</em>` : ''}`
            : ''}
        </div>`);
    } else {
      parts.push(`<div class="info-box">No nullable non-terminals found. Grammar has no ε-productions to eliminate.</div>`);
    }
  }

  /* ── Unit production step ── */
  if (step.stepName.includes('Unit')) {
    if (info.removedProductions && info.removedProductions.length > 0) {
      parts.push(`
        <div class="info-box">
          <strong>Unit productions removed:</strong><br>
          ${info.removedProductions.map(p => `<code>${escapeHtml(p)}</code>`).join('<br>')}
          ${info.addedProductions && info.addedProductions.length > 0
            ? `<br><br><strong>Productions inlined:</strong><br>
               ${info.addedProductions.slice(0, 8).map(p => `<code>${escapeHtml(p)}</code>`).join('<br>')}
               ${info.addedProductions.length > 8 ? `<br><em>…and ${info.addedProductions.length - 8} more</em>` : ''}`
            : ''}
        </div>`);
    } else {
      parts.push(`<div class="info-box">No unit productions found. This step made no changes.</div>`);
    }
  }

  return parts.join('');
}

/* ═══════════════════════════════════════════════════════════════
   STATS ROW RENDERER
═══════════════════════════════════════════════════════════════ */

/**
 * Render the three-column statistics row shown above the tab bar.
 *
 * @param {Grammar} original
 * @param {Grammar} final
 * @returns {string}  HTML string
 */
export function renderStatsRow(original, final) {
  const origCount = countProductions(original);
  const finalCount = countProductions(final);
  const reduction = origCount > 0
    ? Math.round((1 - finalCount / origCount) * 100)
    : 0;

  return `
    <div class="stat-card anim-fadein">
      <span class="stat-value">${origCount}</span>
      <span class="stat-label">Original rules</span>
    </div>
    <div class="stat-card anim-fadein">
      <span class="stat-value">${finalCount}</span>
      <span class="stat-label">Minimized rules</span>
    </div>
    <div class="stat-card anim-fadein">
      <span class="stat-value positive">${reduction}%</span>
      <span class="stat-label">Reduction</span>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   DIFF GRID RENDERER
═══════════════════════════════════════════════════════════════ */

/**
 * Render the before / after comparison grid.
 *
 * @param {Grammar} original
 * @param {Grammar} final
 * @returns {string}  HTML string
 */
export function renderDiffGrid(original, final) {
  return `
    <div class="diff-grid">
      <div>
        <div class="diff-col-header before">▶ Original grammar</div>
        <div class="prod-box diff-col">${renderGrammar(original)}</div>
      </div>
      <div>
        <div class="diff-col-header after">▶ Minimized grammar</div>
        <div class="prod-box diff-col">${renderGrammar(final)}</div>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   SYMBOL SET RENDERER  (reusable pill row)
═══════════════════════════════════════════════════════════════ */

/**
 * Render a row of symbol pills.
 *
 * @param {string[]} symbols
 * @param {'nt'|'t'|'gone'|'nullable'} kind   — CSS modifier
 * @returns {string}  HTML string
 */
export function renderSymbolSet(symbols, kind = '') {
  if (!symbols || symbols.length === 0) return '';
  return `<div class="symbol-set">${
    symbols.map(s => `<span class="sym-pill ${kind}">${escapeHtml(s)}</span>`).join('')
  }</div>`;
}

/* ═══════════════════════════════════════════════════════════════
   PRIVATE UTILITIES
═══════════════════════════════════════════════════════════════ */

/**
 * Count the total number of production alternatives across all LHS.
 * @param {Grammar} g
 * @returns {number}
 */
function countProductions(g) {
  let total = 0;
  for (const [, rhsList] of g.productions) total += rhsList.length;
  return total;
}

/**
 * Escape HTML special characters to prevent XSS.
 * Called on every user-supplied symbol before inserting into HTML.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
