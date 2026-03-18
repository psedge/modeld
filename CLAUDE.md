# modeld — Claude guidance

## Layout

### Always include positions
Every leaf node (actor, app, db) needs `meta: pos: x,y`. Without it the renderer stacks everything into a single column.

### Straight connections
For a horizontal arrow to route straight, source and target must share the same centre y. For a vertical arrow, align centre x.
- Use `from`/`to` side hints (`left`, `right`, `top`, `bottom`) to lock which edge the arrow exits/enters.
- Centre = pos + size/2. If an arrow bends unexpectedly, check that centres actually match.

### Centering nodes inside a boundary
Boundaries have an explicit `meta: pos` and `size`. To centre a node horizontally:
- node `pos.x` = boundary `pos.x` + (boundary width − node width) / 2
- Example: boundary width 160, node width 120 → pos.x = 0 + (160−120)/2 = 20

### Well-spaced vertical stacking
Leave ~80px between the bottom of one boundary and the top of the next. A gap of ~80px between contained node pos values works well (e.g. Web App at y=160, Postgres at y=320 with ~20px boundary padding each side).

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
style: >-
  rounded=1;whiteSpace=wrap;html=1;fillColor=none;dashed=1;
  strokeColor=#666666;verticalAlign=top;
  movable=0;resizable=0;rotatable=0;deletable=0;editable=0;locked=1;connectable=0;
```
The `movable=0;...locked=1` flags prevent accidental interaction in the UI.

### App/service node colour palette (examples)
- Light blue: `fillColor=#dae8fc;strokeColor=#6c8ebf;`
- Light green: `fillColor=#d5e8d4;strokeColor=#82b366;`
- Light purple: `fillColor=#d0cee2;strokeColor=#56517e;`
- Muted teal: `fillColor=#bac8d3;strokeColor=#23445d;`
- Plain white: `fillColor=#ffffff;strokeColor=#000000;`

---

## MCP workflow

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
