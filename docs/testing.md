# Testing

```
npm test
```

49 tests, ~270ms. No browser required.

---

## What we test

The test boundary is drawn at the two directions of the sync loop:

- **YAML → diagram**: given a change to the YAML, the right events are computed
- **Diagram → YAML**: given a diagram event, the YAML string is transformed correctly

We don't test draw.io itself (it emits the right events) or the Ace editor integration (it applies changes to the document). Those are trusted boundaries.

---

## Test files

### `test/sync.test.js` — `src/sync.js`

Tests `diffNodes(newNodes, currentNodes, action)`, the pure diff function at the heart of the YAML→diagram direction.

`diffNodes` takes a snapshot of the new YAML nodes, the current tracked state, and the Ace change action (`'insert'` or `'removal'`), and returns an array of typed events to fire. It has no side effects.

Key cases covered:
- New node with a valid type → `nodeAdded`
- New node with an invalid type → nothing
- Node absent from new YAML on a removal → `nodeRemoved`
- Action guard: `'removal'` never produces `nodeAdded`; `'insert'` never produces `nodeRemoved`
- New connection between two known nodes → `edgeAdded`
- Already-tracked connection → `edgeUpdated`
- Connection to an unknown node → no edge event (target hasn't been created yet)
- Node with `meta.pos`/`meta.size` and a live cell id → `geometryUpdated`
- Node without a cell id yet → no `geometryUpdated` (node hasn't been inserted into the diagram)

### `test/doc.test.js` — `src/doc.js`

Tests the pure YAML string → string transforms used in the diagram→YAML direction. Each function takes a full YAML document string and returns a new one.

| Function | What it does |
|---|---|
| `addNode` | Appends a new node block |
| `removeNode` | Removes a node block by key |
| `renameNode` | Renames a key in its declaration and all connection references |
| `addConnection` | Adds a connection entry to a node's list |
| `updateGeometry` | Sets `meta.pos` and `meta.size` on a node |

Tests parse the output with `js-yaml` to verify correctness rather than asserting on exact strings — except for `addConnection` with `from`/`to`, where the serialized form (`- backend\n  from: right`) isn't cleanly round-trippable through the parser. That test checks the raw string instead.

### `test/diagram.test.js` — `src/diagram.js`

Tests three pure helpers used when a cell arrives from draw.io and we need to infer its properties:

- `determineCellTypeFromStyling(style)` — maps a draw.io style string to a model type (`app`, `db`, `actor`)
- `sideFromStyle(style, prefix)` — extracts `left`/`right`/`top`/`bottom` from exit/entry coordinates in a style string
- `inferSides(srcCell, tgtCell)` — infers connection sides from the relative positions of two cells' geometry

### `test/helpers.test.js` — `src/helpers.js`

Tests `formatConnections(key, cnxList, nodes)`, which normalises the raw YAML connection list (mixed strings and objects) into a keyed map with `from`, `to`, and `id` fields.

The `nodes` parameter is always passed explicitly in tests. In production it defaults to `document.nodes`.

---

## What we don't test

- **`src/app.js`** — orchestrates the sync loop but depends on the Ace editor and `document.nodes` global state. Covered indirectly through `sync.js` tests.
- **`src/code.js`** — editor mutation functions (insert, replace, setValue). These wrap `doc.js` functions and apply them to Ace; the logic is tested via `doc.js`, the editor integration is not.
- **`src/events.js`** — calls draw.io helpers via `dioCtx()`. draw.io is a trusted boundary.
- **`mcp/server.js`** — the HTTP/MCP layer. End-to-end behaviour is verifiable by running the server and checking tool responses manually.

---

## Adding tests

The modules under test (`sync`, `doc`, `diagram`, `helpers`) are all pure — no DOM, no editor, no draw.io. New tests can import them directly.

When adding a new YAML transformation to `doc.js`, write a test that:
1. Starts from a valid YAML string
2. Calls the function
3. Parses the output with `yaml.load()` and asserts on the structure

When adding a new event type to `diffNodes`, write a test that constructs the minimal `newNodes`/`currentNodes` state that should trigger it and asserts on the returned event array.
