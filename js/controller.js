/**
 * controller.js  —  LAYER 3b: DOM Controller
 * ─────────────────────────────────────────────────────────────────
 * Responsibility:
 *   • Read values from the DOM (textarea, selects)
 *   • Call the parser and engine (pure layers)
 *   • Pass results to the renderer (HTML-string layer)
 *   • Write rendered HTML back into the DOM
 *   • Manage UI state: active tab, open step, loading state
 *   • Expose a minimal global API for inline onclick handlers
 *     (window.__cfgApp)
 *
 * This module knows about the DOM but has ZERO grammar logic.
 * It is the thin glue between the pure layers and the browser.
 * ─────────────────────────────────────────────────────────────────
 *
 * @module controller
 */

"use strict";

import { parseGrammar, grammarToText }            from './parser.js';
import { minimizeGrammar }                         from './engine/index.js';
import {
  renderGrammar,
  renderStepBlock,
  renderStatsRow,
  renderDiffGrid,
} from './renderer.js';

/* ═══════════════════════════════════════════════════════════════
   EXAMPLE GRAMMARS LIBRARY
   Curated examples that each highlight a different step type.
═══════════════════════════════════════════════════════════════ */
const EXAMPLES = {
  useless: {
    label: 'Example 1 · Useless Symbols',
    grammar:
`S → A B | a
A → a
B → C
C → c d
D → d e f`,   // D is unreachable
  },

  epsilon: {
    label: 'Example 2 · Null (ε) Productions',
    grammar:
`S → A B
A → a | ε
B → b B | ε`,
  },

  unit: {
    label: 'Example 3 · Unit Productions',
    grammar:
`S → A | a b
A → B | c
B → D | d e
D → f`,
  },

  mixed: {
    label: 'Example 4 · Mixed (all types)',
    grammar:
`S → A B | a
A → a | ε | C
B → b | B b
C → D
D → d
E → e f`,    // E is unreachable
  },

  arithmetic: {
    label: 'Example 5 · Arithmetic Expressions',
    grammar:
`E → E + T | T
T → T * F | F
F → ( E ) | id
G → H
H → h`,      // G, H are unreachable
  },
};

/* ═══════════════════════════════════════════════════════════════
   DOM ELEMENT REFERENCES
   Collected once at init — never queried inside event handlers.
═══════════════════════════════════════════════════════════════ */
let elTextarea, elExamplesSelect, elRunBtn, elClearBtn;
let elStatusBanner, elIdleState, elResultArea;
let elStatsRow, elStepsContainer, elFinalGrammarBox, elCompareBox;

/* ═══════════════════════════════════════════════════════════════
   APPLICATION STATE
   Single source of truth for UI state.
═══════════════════════════════════════════════════════════════ */
const state = {
  isRunning:     false,
  openStepIndex: null,      // which step accordion is open
  activeTab:     'steps',   // 'steps' | 'final' | 'compare'
};

/* ═══════════════════════════════════════════════════════════════
   INITIALISATION
═══════════════════════════════════════════════════════════════ */

/**
 * Main init — called once when the DOM is ready.
 * Binds all event listeners and populates the example selector.
 */
function init() {
  // Collect DOM references
  elTextarea        = document.getElementById('grammar-textarea');
  elExamplesSelect  = document.getElementById('examples-select');
  elRunBtn          = document.getElementById('run-btn');
  elClearBtn        = document.getElementById('clear-btn');
  elStatusBanner    = document.getElementById('status-banner');
  elIdleState       = document.getElementById('idle-state');
  elResultArea      = document.getElementById('result-area');
  elStatsRow        = document.getElementById('stats-row');
  elStepsContainer  = document.getElementById('steps-container');
  elFinalGrammarBox = document.getElementById('final-grammar-box');
  elCompareBox      = document.getElementById('compare-box');

  // Populate examples dropdown
  populateExamples();

  // Bind events
  elExamplesSelect.addEventListener('change', onExampleChange);
  elRunBtn.addEventListener('click', onRunClick);
  elClearBtn.addEventListener('click', onClearClick);

  // Keyboard shortcut: Ctrl+Enter or Cmd+Enter triggers minimization
  elTextarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onRunClick();
    }
  });

  // Tab bar delegation
  document.querySelector('.tab-bar')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (btn) onTabClick(btn.dataset.tab);
  });

  // Load default example to greet first-time users
  elTextarea.value = EXAMPLES.mixed.grammar;

  // Expose minimal global API for inline onclick handlers in rendered HTML
  window.__cfgApp = { toggleStep };
}

/* ═══════════════════════════════════════════════════════════════
   EVENT HANDLERS
═══════════════════════════════════════════════════════════════ */

/**
 * Load selected example grammar into the textarea.
 */
function onExampleChange() {
  const key = elExamplesSelect.value;
  if (key && EXAMPLES[key]) {
    elTextarea.value = EXAMPLES[key].grammar;
    hideStatus();
  }
}

/**
 * Run the minimization pipeline.
 */
function onRunClick() {
  if (state.isRunning) return;

  const rawText = elTextarea.value.trim();
  if (!rawText) {
    showStatus('error', 'Please enter a grammar before running.');
    return;
  }

  /* ── Parse ── */
  const parseResult = parseGrammar(rawText);
  if (!parseResult.ok) {
    showStatus('error', `Parse error: ${parseResult.error}`);
    return;
  }

  const original = parseResult.grammar;
  showStatus('success',
    `Parsed successfully — ${original.nonTerminals.size} non-terminals, ` +
    `${original.terminals.size} terminals, ` +
    `${countTotalProductions(original)} productions.`
  );

  /* ── Minimize ── */
  state.isRunning = true;
  elRunBtn.classList.add('running');
  elRunBtn.textContent = '⚙ Running…';

  // Use setTimeout to allow the UI to update before heavy computation
  setTimeout(() => {
    try {
      const steps   = minimizeGrammar(original);
      const minimal = steps[steps.length - 1].grammarAfter;

      renderResults(original, steps, minimal);
    } catch (err) {
      showStatus('error', `Engine error: ${err.message}`);
      console.error('[CFG Engine Error]', err);
    } finally {
      state.isRunning = false;
      elRunBtn.classList.remove('running');
      elRunBtn.innerHTML = '<span>⚙</span> Minimize Grammar';
    }
  }, 30);
}

/**
 * Clear the workspace.
 */
function onClearClick() {
  elTextarea.value = '';
  elExamplesSelect.value = '';
  hideStatus();
  showIdle();
}

/**
 * Switch the active output tab.
 * @param {string} tabId
 */
function onTabClick(tabId) {
  if (!tabId) return;
  state.activeTab = tabId;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${tabId}`);
  });
}

/* ═══════════════════════════════════════════════════════════════
   RENDERING  (writes HTML into the DOM)
═══════════════════════════════════════════════════════════════ */

/**
 * Populate all result sections and switch to the result view.
 *
 * @param {Grammar}      original
 * @param {StepResult[]} steps
 * @param {Grammar}      minimal
 */
function renderResults(original, steps, minimal) {
  // Stats row
  elStatsRow.innerHTML = renderStatsRow(original, minimal);

  // Step blocks
  elStepsContainer.innerHTML = steps.map(renderStepBlock).join('');

  // Auto-open first step
  state.openStepIndex = null;
  toggleStep(0);

  // Final grammar
  elFinalGrammarBox.innerHTML = renderGrammar(minimal);

  // Compare tab
  elCompareBox.innerHTML = renderDiffGrid(original, minimal);

  // Switch to result view, reset to Steps tab
  showResultArea();
  onTabClick('steps');
}

/* ═══════════════════════════════════════════════════════════════
   STEP ACCORDION
═══════════════════════════════════════════════════════════════ */

/**
 * Toggle the open/closed state of a step accordion block.
 * Exposed as window.__cfgApp.toggleStep for inline onclick handlers.
 *
 * @param {number} index
 */
function toggleStep(index) {
  const block = document.getElementById(`step-block-${index}`);
  if (!block) return;

  const isOpen = block.classList.contains('open');

  // Close currently open step if different
  if (state.openStepIndex !== null && state.openStepIndex !== index) {
    const prev = document.getElementById(`step-block-${state.openStepIndex}`);
    if (prev) {
      prev.classList.remove('open');
      prev.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
    }
  }

  block.classList.toggle('open', !isOpen);
  block.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', String(!isOpen));
  state.openStepIndex = isOpen ? null : index;
}

/* ═══════════════════════════════════════════════════════════════
   UI STATE HELPERS
═══════════════════════════════════════════════════════════════ */

function showStatus(type, message) {
  elStatusBanner.className    = `status-banner visible ${type}`;
  elStatusBanner.innerHTML    = message;
}

function hideStatus() {
  elStatusBanner.className = 'status-banner';
  elStatusBanner.textContent = '';
}

function showIdle() {
  elIdleState.style.display  = 'flex';
  elResultArea.style.display = 'none';
}

function showResultArea() {
  elIdleState.style.display  = 'none';
  elResultArea.style.display = 'block';
}

function populateExamples() {
  // First option is a placeholder
  elExamplesSelect.innerHTML =
    '<option value="">— load a sample grammar —</option>' +
    Object.entries(EXAMPLES)
      .map(([key, { label }]) => `<option value="${key}">${label}</option>`)
      .join('');
}

/* ═══════════════════════════════════════════════════════════════
   UTILITY
═══════════════════════════════════════════════════════════════ */

/**
 * Count total production alternatives across all LHS.
 * @param {Grammar} g
 * @returns {number}
 */
function countTotalProductions(g) {
  let n = 0;
  for (const [, rhsList] of g.productions) n += rhsList.length;
  return n;
}

/* ═══════════════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', init);
