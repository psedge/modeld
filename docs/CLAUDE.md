# modeld — context for Claude

modeld is a dual-representation system design tool. A YAML editor (left) and a draw.io diagram (right) stay in bidirectional sync in real time. See `architecture.md` for the full design.

---

## Running and building

Start the single server (serves modeld, draw.io, and the MCP endpoint):

```
node mcp/server.js
```

Then open `http://localhost:3001` in a browser. The draw.io iframe is served from the same origin at `/drawio/src/main/webapp/index.html?test=1`.

After changing any file in `src/`:

```
npm run build
```

This bundles `src/app.js` → `dist/app.bundle.js` as an IIFE.

---

## Key files

| File | Role |
|---|---|
| `src/app.js` | Main coordinator — Ace editor, `triggerChanges()`, `onDrawioReady`, `eventHandler` |
| `src/events.js` | Event translation: `callEvent()` (code→diagram), `handleEvent()` (diagram→code) |
| `src/code.js` | All programmatic edits to the Ace editor |
| `src/diagram.js` | Style parsing: cell type inference, side detection, `inferSides()` |
| `src/helpers.js` | `formatConnections()`, `renameConnections()` |
| `src/syntax.js` | YAML schema validation, editor annotations |
| `drawio/src/main/webapp/index.html` | Custom draw.io entrypoint — `registerGlobalAndListeners`, `document.helpers` bridge |

`drawio/` is a sparse git checkout of diagrams.net. Only edit `drawio/src/main/webapp/index.html`. Don't touch other files in `drawio/`.

---

## Patterns to preserve

**Feedback loop prevention** — two guards must always be in place:
- `editor.lockEvents = true` before any programmatic edit in `code.js`, `false` after. The `on('change')` handler skips `triggerChanges()` while this is set.
- `document.locked = true` (on the iframe's document) before any programmatic mxGraph change in `document.helpers`, `false` after. Event listeners in `document.helpers` bail out while this is set.

**YAML indentation** — all `jsyaml.dump()` calls must use `{ indent: 4 }`. The replaceAll-based block replacement relies on consistent indentation.

**Trailing newline prevention** — every `.replaceAll("\n", "\n" + getIndentLevel(2))` chain must end with `.trimEnd()`. Without it, the trailing `\n` from `jsyaml.dump` becomes indented whitespace and gets inserted into the document.

**Suppressing the draw.io unsaved indicator** — `app.editor.setModified = function() {}` is set in `registerGlobalAndListeners`. The `.geStatus` CSS rule in `drawio/src/main/webapp/index.html` also hides the status element. Both must stay.

---

## ace and js-yaml are external

ace-builds does not bundle cleanly with Rollup due to its CJS structure. It is loaded via `<script>` tags in `index.html` from `/node_modules/ace-builds/src-min-noconflict/`. js-yaml is loaded from CDN. Both are marked `external` in `rollup.config.js`.

Do not attempt to import either into the bundle.

---

## Known rough edges

- **Regex-based YAML editing** (`code.js`): node block replacement uses regex patterns. It is fragile on node names containing regex special characters or unusual whitespace. A proper YAML AST approach is listed as a future improvement in `README.md`.
- **Connection deletion not synced**: deleting a connection from YAML does not remove the edge from the diagram. The reverse (deleting an edge in the diagram) does not currently remove the YAML entry either.
- **`handleNodesDeleted` only fires on `action: "removal"`**: the deletion path in `triggerChanges()` guards on `v.action`. If you're debugging missing deletions, check what action the change event carries.
