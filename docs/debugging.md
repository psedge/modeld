# Frontend debugging

modeld's frontend is a three-way coupling: Ace editor ↔ `app.js` ↔ draw.io iframe. Bugs in this layer usually manifest as unexpected cursor positions, desync between the YAML and the diagram, or silent failures mid-event-chain. This guide covers the tools available and when to reach for each.

---

## Tools

### 1. Chrome DevTools MCP

The DevTools MCP (`mcp__chrome-devtools__*`) gives Claude direct access to a running browser page. Use it for **interactive investigation and one-off verification** — the equivalent of opening DevTools and poking around manually.

Key actions:

```
take_screenshot          — visual check
take_snapshot            — accessibility tree + uid map for clicking
evaluate_script          — run arbitrary JS in page context
click / type_text        — simulate real user input via DOM events
list_console_messages    — surface JS errors you'd otherwise miss
navigate_page reload     — reload after a rebuild
```

**Workflow for a bug investigation:**

1. Navigate to `http://localhost:3001` and confirm the page loads.
2. Load a known-good model with `window.__setModel(yaml)` via `evaluate_script`.
3. Position the Ace cursor precisely:
   ```js
   window.ace.edit('editor').moveCursorToPosition({ row: 1, column: 12 })
   ```
4. Simulate user input. For cursor-position bugs, use `type_text` to fire real DOM keyboard events — **not** `editor.insert()`, which bypasses the keydown handler entirely.
5. Read back state:
   ```js
   const editor = window.ace.edit('editor')
   return {
       pos:   editor.getCursorPosition(),
       line:  editor.getSession().getDocument().getAllLines()[1],
       nodes: Object.keys(document.nodes)
   }
   ```
6. Take a screenshot to confirm the diagram side matches.

**Useful globals exposed by the app:**

| Global | What it gives you |
|---|---|
| `window.ace.edit('editor')` | The Ace editor instance |
| `document.nodes` | In-memory node/connection state (includes draw.io cell IDs) |
| `document.lines` | Snapshot of editor lines as of the last processed change |
| `document.editor` | Alias for the Ace editor instance |
| `window.__setModel(yaml)` | Test hook — loads a YAML string exactly as the SSE `set_model` event would, without keyboard simulation |

**Always rebuild before testing changes.** The browser serves `dist/app.bundle.js`. After editing anything in `src/`, run `npm run build` then reload the page — otherwise you're testing stale code.

---

### 2. Playwright e2e tests (`test/e2e/`)

Playwright drives a real browser and is the right tool for **regression tests**: scenarios you want to re-run automatically after every change.

Run with:
```
npm run test:e2e
```

The test server starts automatically (or reuses one already running on port 3001).

**Standard helpers used in `test/e2e/app.test.js`:**

```js
// Wait for both Ace and draw.io to finish initialising
async function waitForApp(page) {
    await page.waitForFunction(() => {
        const iframe = document.getElementById('drawio')
        return iframe?.contentDocument?.app?.editor?.graph != null &&
               typeof iframe?.contentDocument?.helpers?.eventHandler === 'function'
    }, { timeout: 20_000 })
}

// Load a model without keyboard simulation
await page.evaluate(y => window.__setModel(y), yaml)
await page.waitForTimeout(300)  // let the sync loop settle

// Read Ace editor content
const yaml = await page.evaluate(() => document.editor.getValue())

// Read diagram cell labels
const labels = await page.evaluate(() => {
    const iframe = document.getElementById('drawio')
    const graph  = iframe.contentDocument.app.editor.graph
    const cells  = graph.getModel().getChildCells(graph.getDefaultParent())
    return cells.map(c => c.value).filter(Boolean)
})
```

**Simulating keyboard events:**

Use `page.click('#editor')` to focus the editor, then `page.keyboard.type()` and `page.keyboard.press()`. These go through the browser's normal event dispatch — the keydown handler in `app.js` fires correctly, including the Enter-key colon guard.

```js
await page.click('#editor')
await page.keyboard.press('Control+End')
await page.keyboard.type('mynode')
await page.keyboard.press('Enter')
const col = await page.evaluate(() => document.editor.getCursorPosition().column)
```

**Triggering diagram→YAML events:**

draw.io's event listeners fire on `mxEventObject` instances posted to the graph's event system. To simulate a user-initiated shape drop without going through our `insertRectangle` helper (which sets `document.locked`), inject directly into the mxGraph model and fire the appropriate event:

```js
await page.evaluate(() => {
    const win = document.getElementById('drawio').contentWindow
    const { mxCell, mxGeometry, mxEventObject } = win
    const graph = win.document.app.editor.graph
    const cell  = new mxCell('myservice', new mxGeometry(100, 100, 120, 60),
                             'rounded=0;whiteSpace=wrap;html=1;')
    cell.setVertex(true)
    graph.getModel().beginUpdate()
    try {
        graph.addCell(cell, graph.defaultParent)
        graph.fireEvent(new mxEventObject('cellsInserted', 'cells', [cell]))
    } finally {
        graph.getModel().endUpdate()
    }
})
```

---

### 3. Unit tests (`test/`, vitest)

The unit layer covers pure functions only — no DOM, no Ace, no draw.io. Fast and deterministic.

```
npm test
```

See `docs/testing.md` for the full breakdown of what each test file covers.

---

## Where the boundaries lie

```
┌──────────────────────────────────────────────────────────────────┐
│  Unit tests (vitest)                                             │
│  sync.js · doc.js · diagram.js · helpers.js                     │
│  → pure in/out, no browser needed, ~270ms                       │
└────────────────────────────┬─────────────────────────────────────┘
                             │ not covered
┌────────────────────────────▼─────────────────────────────────────┐
│  Playwright e2e                                                  │
│  Full browser + real keyboard events + draw.io iframe           │
│  → YAML↔diagram sync, hash persistence, Tab/Enter key behaviour │
│  → Slow (~seconds), runs in CI, assertions must be deterministic │
└────────────────────────────┬─────────────────────────────────────┘
                             │ not suitable for
┌────────────────────────────▼─────────────────────────────────────┐
│  DevTools MCP                                                    │
│  Live session, direct JS execution, cursor-level inspection      │
│  → One-off investigation, iterative debugging, visual checks     │
│  → Not persisted, not repeatable, cannot run in CI              │
└──────────────────────────────────────────────────────────────────┘
```

### Use unit tests when:
- You're testing a pure transform: YAML string → YAML string, or `newNodes`/`currentNodes` → event array.
- The bug is in `doc.js`, `sync.js`, `diagram.js`, or `helpers.js`.
- You want fast feedback while iterating on logic.

### Use Playwright when:
- The bug involves real keyboard input (Tab, Enter, typing).
- You need to assert on cursor position, editor content, or diagram state after user interaction.
- You want a regression test that will catch regressions on future changes.
- The scenario can be expressed as a deterministic sequence of actions with a clear assertion.

### Use DevTools MCP when:
- You need to reproduce a bug interactively before you know what to assert.
- The bug involves async timing (e.g. a draw.io callback firing after a cursor correction).
- You want to inspect intermediate state that a Playwright test can't easily observe.
- You're iterating on a fix and want to verify before writing a formal test.

---

## Common pitfalls

**`editor.insert()` bypasses keydown handlers.**
`editor.insert(str)` inserts text programmatically and does not fire any DOM keyboard events. The Enter-key colon guard in `app.js` (added to prevent stray colons when pressing Enter before a `:`) will not trigger. Use `page.keyboard.type()` in Playwright or `type_text` in DevTools MCP for tests that depend on key handlers.

**`editor.lockEvents` silences the change handler.**
All `code.js` functions set `editor.lockEvents = true` before calling `editor.setValue()`. If you call `editor.setValue()` directly in a test while `lockEvents` is already true, the change handler will not fire and `document.nodes` will not update. Always use `window.__setModel()` to load test state — it resets the full pipeline including `document.nodes` and `document.lines`.

**`__setModel` is asynchronous on the draw.io side.**
`window.__setModel(yaml)` calls `triggerChanges()` which fires draw.io cell insertions synchronously, but draw.io processes the underlying `endUpdate()` in a deferred layout pass. Always `waitForTimeout(300)` in Playwright (or use `setTimeout` in DevTools scripts) before asserting on diagram state.

**The sync loop fires on every keypress.**
`triggerChanges()` runs on every Ace change event. During a rename, the rename detection heuristic fires on each character. Tests that type multiple characters and then check state must account for the fact that intermediate states (e.g. `existing2` while typing `existing23`) each trigger a full sync cycle, including a potential draw.io round-trip.

**Snapshot UIDs change after every navigation.**
DevTools MCP snapshot UIDs (e.g. `uid=2_1`) are scoped to the current navigation. After a `navigate_page reload` or any `__setModel` call that changes the page state significantly, always take a fresh snapshot before trying to click elements.

**`evaluate_script` promises and page lifetime.**
Avoid wrapping `evaluate_script` calls in nested `setTimeout`+`Promise` chains — the outer promise can be garbage-collected before the inner callback fires, causing a `Promise was collected` error. Keep the structure flat: do setup synchronously, then issue a single `setTimeout`-based resolution.
