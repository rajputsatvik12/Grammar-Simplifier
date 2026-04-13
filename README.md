# CFG Simplifier — Context-Free Grammar Minimization Tool

> **CS 4820 · Theory of Computation · Class of 2028**
> A sample project demonstrating clean software architecture applied to formal language theory.

---

## Overview

CFG Simplifier is a browser-based educational tool that accepts a Context-Free Grammar (CFG) as input and walks through the standard simplification pipeline step-by-step, visualizing every transformation so students can understand *why* each rule changes — not just that it does.

---

## Features

| Feature | Description |
|---|---|
| **Useless Symbol Removal** | Eliminates non-generating and unreachable non-terminals |
| **Null (ε) Production Elimination** | Computes nullable set, expands combinations, removes ε-rules |
| **Unit Production Elimination** | Computes unit closures, inlines transitive productions |
| **Step Visualizer** | Each transformation shown as an animated accordion with before/after grammar |
| **Before / After Diff** | Side-by-side comparison of original and minimized grammar |
| **5 Built-in Examples** | Cover each step type individually and in combination |
| **Keyboard Shortcut** | `Ctrl+Enter` runs the minimization from anywhere |

---

## Repository Architecture

```
cfg-simplifier/
│
├── index.html              # Entry point — pure markup, zero logic
├── README.md               # This file
│
├── assets/
│   └── favicon.svg         # App icon
│
├── css/
│   ├── base.css            # Design tokens, CSS variables, reset, typography
│   ├── layout.css          # Header, hero, two-panel workspace, responsive grid
│   ├── components.css      # Buttons, cards, inputs, badges, tabs, status bars
│   ├── grammar.css         # Production-rule lists, step blocks, diff view, symbol pills
│   └── animations.css      # All @keyframes and transition utilities
│
└── js/
    ├── parser.js           # LAYER 1 — Text → internal Grammar data structure
    │
    ├── engine/
    │   ├── index.js        # LAYER 2 — Pipeline orchestrator; chains all steps
    │   ├── useless.js      # Step 1 — Remove non-generating + unreachable symbols
    │   ├── epsilon.js      # Step 2 — Eliminate ε (null) productions
    │   └── unit.js         # Step 3 — Eliminate unit productions (A → B)
    │
    ├── renderer.js         # LAYER 3a — Grammar data → HTML strings (zero DOM writes)
    └── controller.js       # LAYER 3b — DOM wiring, events, tab/accordion state
```

### Architectural Principles

1. **Separation of Concerns** — The parser, engine, renderer and controller are fully independent. The engine has zero knowledge of the DOM; the controller has zero knowledge of grammar algorithms.
2. **Pure Functions** — Every engine function accepts a Grammar and returns a new Grammar + metadata. No mutation, no side effects.
3. **Data-first design** — All state lives in plain JS objects. The UI is a pure function of that state.
4. **Progressive Enhancement** — The HTML file is valid and readable without JS. Styles are additive.

---

## Grammar Input Syntax

```
S → A B | a         # LHS → RHS alternatives separated by |
A → a | ε           # ε (or eps / epsilon / λ) for empty string
B → b B | b         # Recursion is fine
```

**Rules:**
- One production rule per line (multiple RHS alternatives on one line with `|`)
- `→` or `->` or `:` as the arrow
- Upper-case letters = non-terminals; lower-case = terminals
- First rule's LHS is the **start symbol**
- Comments with `//` or `#` are ignored

---

## Algorithm Reference

### Step 1 — Useless Symbol Removal

**Phase A — Non-generating:** A non-terminal is *generating* if it can derive some string of terminals. Computed via fixed-point iteration: terminals are trivially generating; a non-terminal A is generating if any production `A → α` has all generating symbols in α.

**Phase B — Unreachable:** A symbol is *reachable* if it appears in some sentential form derivable from S. Computed via BFS over the production graph starting from the start symbol.

### Step 2 — ε-Production Elimination

1. Compute the **nullable set** (non-terminals deriving ε, directly or transitively).
2. For each production containing nullable symbols, add all 2ᵏ combinations with those symbols optionally omitted.
3. Remove all `A → ε` rules (retain `S → ε` only if ε ∈ L(G)).

### Step 3 — Unit Production Elimination

1. For each non-terminal A, compute **unit(A)**: the set of non-terminals reachable from A via chains of unit productions.
2. For each B ∈ unit(A), add all non-unit productions of B directly to A.
3. Remove all unit productions `A → B`.

---

## Running the Project

No build step required. Open `index.html` in any modern browser:

```bash
# Option 1 — Just open it
open index.html

# Option 2 — Serve locally (avoids any ES module restrictions)
npx serve .
# or
python3 -m http.server 8080
```

---

## Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| Markup | Semantic HTML5 | Accessible, no framework overhead |
| Styling | Vanilla CSS with custom properties | Full control, zero dependencies |
| Logic | Vanilla ES6+ JavaScript (modules) | Teaches clean JS without framework magic |
| Fonts | Google Fonts (Syne + JetBrains Mono) | Distinctive academic-technical aesthetic |

---


