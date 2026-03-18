# modeld — Claude guidance

## Layout

### Always include positions AND sizes on leaf nodes
Every leaf node (actor, app, db) needs **both** `meta: pos: x,y` and `meta: size: w,h`. The geometry update only fires when both are present — omitting `size` means the node will be auto-placed at a random free position, ignoring `pos` entirely.

Typical sizes:
- `app` / `db`: `size: 120, 60`
- `actor`: `size: 30, 55`

### Start coordinates near the canvas origin
The canvas origin `(0, 0)` is the top-left corner of the viewport when the app loads — there is no initial scroll offset or translate. Place the leftmost/topmost element of your diagram at or near `(0, 0)` so the diagram is visible without scrolling. For a reasonably centred look on a typical window, aim for the horizontal midpoint of your layout to land around x = 300–400 and vertical midpoint around y = 200–300, but keeping everything positive and close to the origin is the safe default.

### Plan layout before writing YAML
Before writing any coordinates, sketch the layout mentally:
1. Choose a flow direction (left→right for horizontal chains, top→bottom for stacks).
2. Pick a shared centre axis (y for horizontal flows, x for vertical).
3. Assign positions so that every connected pair shares that axis centre — this guarantees straight arrows.
4. Add boundary padding (≥20px on each side) around contained nodes.

**Worked example — horizontal chain with a nested boundary:**
- Three nodes in sequence: Actor (30×55), App (120×60), inner boundary (200×160) containing App (120×60).
- Shared centre-y = 190.
- Actor: pos `0, 163` (centre-y = 163 + 55/2 = 190 ✓)
- App: pos `120, 160` (centre-y = 160 + 60/2 = 190 ✓)
- Inner boundary: pos `320, 110`, size `200, 160` (centre-y = 110 + 160/2 = 190 ✓)
- Node inside boundary: centre-x = 320 + (200−120)/2 = 360, pos `360, 160` (centre-y = 190 ✓)
- Outer boundary wraps everything with 20px padding.

### Straight connections
For a horizontal arrow to route straight, source and target must share the same centre y. For a vertical arrow, align centre x.
- Use `from`/`to` side hints (`left`, `right`, `top`, `bottom`) to lock which edge the arrow exits/enters.
- Centre = pos + size/2. If an arrow bends unexpectedly, check that centres actually match.

### Centering nodes inside a boundary
node `pos.x` = boundary `pos.x` + (boundary width − node width) / 2

### Well-spaced vertical stacking
Leave ~80px between the bottom of one boundary and the top of the next.

### After any layout change, take a screenshot and verify
- Arrows are straight (no unexpected bends or long detours around boundaries)
- Nodes sit visually centred inside their boundary
- No node is clipped by or overlapping its boundary edge (keep ≥20px padding inside boundaries)

### Auto-sizing vs fixed boundaries
Boundaries auto-size to fit their `contains` nodes when `meta` is omitted. Add `meta: pos/size` to pin a boundary to a specific size — required if you want it to extend beyond its contents.

---

## Styles

Node appearance is controlled via `meta: style:` — a semicolon-separated DrawIO style string.

### When to use a style block
Only add `style:` when the default rendering for a node type isn't sufficient. Common reasons:
- Custom fill/stroke colours
- Dashed or invisible borders (e.g. decorative boundaries)
- Non-standard shapes (e.g. cloud, cylinder)

### `style:` lives inside `meta:`, not at the node level
`style:` is a `meta` field. Placing it at the node's top level causes a validation error.

```yaml
# WRONG — validation error
front_door:
  type: app
  style: "rounded=1;..."

# CORRECT
front_door:
  type: app
  meta:
    pos: 180, 170
    size: 120, 60
    style: "rounded=1;..."
```

### Format
Short style strings can be written inline:
```yaml
style: rounded=0;whiteSpace=wrap;html=1;fillColor=#bac8d3;strokeColor=#23445d;
```

Long strings should use the YAML block scalar `>-` to avoid line-length issues:
```yaml
style: >-
  rounded=1;whiteSpace=wrap;html=1;fillColor=none;dashed=1;
  strokeColor=#666666;verticalAlign=top;
```

### Common properties
| Property | Values | Notes |
|---|---|---|
| `fillColor` | `#rrggbb` or `none` | Background fill |
| `strokeColor` | `#rrggbb` | Border colour |
| `dashed` | `0` / `1` | Dashed border |
| `rounded` | `0` / `1` | Rounded corners |
| `whiteSpace` | `wrap` | Almost always needed |
| `html` | `1` | Required for HTML labels |
| `shape` | `cloud`, `cylinder`, etc. | Override default shape |
| `ellipse` | (prefix, not a key) | Draws an ellipse outline |
| `verticalAlign` | `top` / `middle` / `bottom` | Label position |

### Boundary style conventions
Decorative boundaries (regions, swim lanes) typically use:
```yaml
style: "rounded=1;whiteSpace=wrap;html=1;fillColor=none;dashed=1;strokeColor=#666666;verticalAlign=top;"
```

**Only add `locked=1` to boundaries, never to leaf nodes (app, db, actor).** Locking a leaf node prevents `clearGraph()` from removing it, causing ghost cells to accumulate across `set_model` calls. Never add `movable=0`, `resizable=0`, or `connectable=0` to any node for the same reason.

**Never try to reposition a locked element.** If a node has `locked=1` in its style, `update_node` cannot move it — the operation will silently do nothing. Instead, tell the user to unlock the element in the UI first, then apply the position change.

### Actors vs entry points
`actor` type is for human roles (users, attackers). Physical or digital entry points (doors, APIs, interfaces) are `app` nodes. Example: a Thief is an `actor`; a Front Door is an `app`.

### App/service node colour palette (examples)
- Light blue: `fillColor=#dae8fc;strokeColor=#6c8ebf;`
- Light green: `fillColor=#d5e8d4;strokeColor=#82b366;`
- Light purple: `fillColor=#d0cee2;strokeColor=#56517e;`
- Muted teal: `fillColor=#bac8d3;strokeColor=#23445d;`
- Plain white: `fillColor=#ffffff;strokeColor=#000000;`

---

## MCP workflow

### YAML must be wrapped in a `nodes:` root key
Every `set_model` payload must have `nodes:` as its top-level key. Omitting it produces a validation error: `root key "nodes" is required`.

```yaml
# WRONG — validation error
thief:
  type: actor

# CORRECT
nodes:
  thief:
    type: actor
```

---

### Connections are defined on the source node, not at the top level
A top-level `connections:` key is silently ignored. Connections must be nested under the node that originates the arrow.

```yaml
# WRONG — silently ignored
connections:
  - from: thief
    to: front_door

# CORRECT — nested under the source node
thief:
  type: actor
  connections:
    - front_door:
        label: "attempts entry"
```

Each entry is a map keyed by the target node ID. Optional fields: `text` (edge label), `from` (exit side), `to` (entry side).

> **Note:** the field is `text`, not `label`. Using `label` silently does nothing — the arrow renders unlabelled.

**Critical indentation:** `text`, `from`, and `to` must be at the **same indentation level** as the target key (siblings in the mapping), not nested under it. One extra level of indent wraps them under the target key and they are silently ignored.

```yaml
# CORRECT — flat siblings, text and routing work
connections:
  - backend:
    text: HTTP/JSON
    from: right
    to: left

# WRONG — nested under backend, all fields silently ignored
connections:
  - backend:
      text: HTTP/JSON
      from: right
      to: left
```

---

### Prefer `update_node` for targeted changes
Use `update_node` when changing a single node (e.g. repositioning, relabelling). Only use `set_model` when restructuring the whole diagram — it replaces everything and can silently drop fields if the YAML is incomplete.

### Always `get_model` before `set_model`
Read the current model first so you don't lose existing fields, connections, or metadata.

### Standard change loop
1. `get_model` — read current state
2. `set_model` or `update_node` — apply change
3. `get_screenshot` — verify visually
4. Fix any layout issues, repeat from step 2

### `undo` is available
If a `set_model` produces a broken state, call `undo` to revert before trying again.
