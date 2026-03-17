# Architecture

modeld is a dual-representation system design tool. A YAML text editor on the left and a draw.io diagram on the right stay in sync in real time — changes to either side are reflected immediately in the other.

## Components

```
┌─────────────────────┐        ┌──────────────────────────┐
│   Ace editor        │        │   draw.io (iframe)        │
│   (left panel)      │        │   (right panel)           │
│                     │        │                           │
│  YAML source text   │        │  mxGraph model            │
│  document.editor    │        │  document.helpers.*       │
└────────┬────────────┘        └──────────┬────────────────┘
         │                                │
         │  on('change')                  │  parent.eventHandler(type, ctx)
         ▼                                ▼
┌────────────────────────────────────────────────────────────┐
│                        app.js                              │
│                                                            │
│  triggerChanges()   ←──── parses YAML, diffs state        │
│  window.onDioReady  ←──── called once iframe is ready     │
│  window.eventHandler ←─── called by iframe on user action │
│                                                            │
│  document.nodes  ──  in-memory node/connection state       │
└───────────┬────────────────────────┬───────────────────────┘
            │                        │
            ▼                        ▼
     events.js                   code.js
     callEvent()                 addNodeToCode()
     handleEvent()               addConnectionToCode()
                                 updateNodeGeometryInCode()
                                 renameNodeInCode()
                                 removeNodeFromCode()
```

### `src/app.js`
The central coordinator. Owns the Ace editor instance, `document.nodes` (the in-memory state), and the two cross-boundary entry points: `window.onDioReady` (called by draw.io once it's loaded) and `window.eventHandler` (called by draw.io on every user action). `triggerChanges()` is the core diff loop — it compares the current parsed YAML against `document.nodes` and fires the appropriate events.

### `src/events.js`
Translates between abstract events and concrete actions on each side.

- `callEvent(type, context)` — outbound: a YAML change needs to update the diagram. Calls `document.helpers.*` in the iframe.
- `handleEvent(type, context)` — inbound: a diagram action needs to update YAML. Calls `code.*` functions.

### `src/code.js`
All programmatic edits to the Ace editor live here. Uses regex-based replacement to find and rewrite node blocks in the YAML text. Wraps every edit in `editor.lockEvents = true` to prevent the change handler from re-firing.

### `src/diagram.js`
Decodes draw.io cell styles. `determineCellTypeFromStyling()` maps shape style strings to node types (`app`, `db`, `actor`). `sideFromStyle()` extracts explicit entry/exit sides from edge styles. `inferSides()` falls back to computing sides from relative cell centre positions when the edge has no explicit side information.

### `src/helpers.js`
Utility functions. `formatConnections()` normalises the raw YAML connections list (which can contain plain strings or objects) into a consistent keyed map. `renameConnections()` updates all in-memory connection references when a node is renamed.

### `src/syntax.js`
Validates YAML node keys against the allowed schema and annotates the editor with errors for unknown keys.

### `drawio/src/main/webapp/index.html`
A custom entrypoint for draw.io (based on the upstream `drawio.html`). Contains the `registerGlobalAndListeners()` callback that runs after draw.io initialises, and the `document.helpers` bridge object that the parent frame calls to manipulate the mxGraph model.

---

## Data flow: code → diagram

```
User edits YAML
  → editor on('change')
  → parseTextAreaToYaml()
  → triggerChanges()
      → handleNodeAddition()    → callEvent("nodeAdded")     → helpers.insertRectangle / insertActor
      → handlePropertyUpdates() → callEvent("edgeAdded")     → helpers.createEdge
                                → callEvent("geometryUpdated") → helpers.setCellGeometry
      → handleNodesDeleted()    → callEvent("nodeRemoved")   → helpers.removeCell
```

## Data flow: diagram → code

```
User moves a shape in draw.io
  → mxEvent.CELLS_MOVED listener
  → document.helpers.cellsMoved()
  → parent.eventHandler("cellsMoved", {...})
  → events.handleEvent()
  → code.updateNodeGeometryInCode()
  → editor text updated (with lockEvents = true)
```

The same pattern applies for `cellsResized`, `labelChanged`, `cellConnected`, `cellsRemoved`, and `cellsAdded`.

---

## State

Three representations are kept in sync at all times:

| Store | Location | What it holds |
|---|---|---|
| YAML text | Ace editor | Source of truth for model structure |
| `document.nodes` | `app.js` global | Node metadata + draw.io cell IDs + connection map |
| mxGraph model | draw.io iframe | Visual representation, geometry, styles |

`document.nodes` is the bridge — it maps node names to their draw.io cell IDs, which is required to issue targeted commands to the diagram.

---

## Feedback loop prevention

Without guards, a change on one side would trigger an update on the other, which would trigger another update, and so on.

**`editor.lockEvents`** (boolean on the Ace editor instance): set to `true` before any programmatic edit in `code.js`, and back to `false` after. The `on('change')` handler in `app.js` skips `triggerChanges()` while this is true.

**`document.locked`** (on the iframe's `document`): set to `true` before any programmatic change to the mxGraph model in `document.helpers`. Event listeners in `document.helpers.cellsMoved` etc. return early while this is true.

---

## Build

```
npm run build
```

Bundles `src/app.js` → `dist/app.bundle.js` as an IIFE using Rollup.

**ace-builds** and **js-yaml** are marked as external and loaded separately — ace via `<script>` tags from `/node_modules/ace-builds/src-min-noconflict/`, js-yaml from a CDN. This is because ace's CJS modules don't bundle cleanly with Rollup; loading them as globals sidesteps the issue.

Always rebuild after changing anything in `src/`.
