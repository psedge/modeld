# modeld YAML syntax

A modeld file is a YAML document with a single root key: `nodes`. Each key under `nodes` is the name of a component in your system.

```yaml
nodes:
  component-name:
    type: app
```

---

## Node fields

| Field | Required | Description |
|---|---|---|
| `type` | yes | Shape type in the diagram. See [Types](#types). |
| `label` | no | Display name shown in the diagram. Defaults to the node key if absent. Useful when the key is a machine-friendly ID but you want a human-readable label. |
| `connections` | no | Outgoing edges from this node. See [Connections](#connections). |
| `trust` | no | Trust level or zone — free-form, used for security modelling. |
| `accepts` | no | Data types, protocols, or interfaces this node accepts. |
| `contains` | no | `boundary` only. List of node names to enclose. See [Boundary sizing](#boundary-sizing). |
| `meta` | no | Diagram state: position, size, style. See [Meta](#meta). |

Unknown keys produce an editor annotation.

---

## Types

| Value | Aliases | Diagram shape |
|---|---|---|
| `app` | `application` | Rectangle |
| `db` | `database` | Rounded rectangle |
| `actor` | `person` | UML stick figure |
| `boundary` | — | Large dashed rounded rectangle; for trust zones and security boundaries |
| `generic` | — | Any draw.io shape; style stored in `meta.style` |

When a shape is dragged from the draw.io panel, its type is inferred from the style string. Cylinders, database shapes, and AWS RDS icons map to `db`; UML actor shapes map to `actor`; dashed rounded rectangles map to `boundary`; shapes with an explicit draw.io style template map to `generic`; everything else maps to `app`.

---

## Connections

A connection is an outgoing edge from this node to another node or position. Listed as a YAML sequence under `connections`.

### Simple (inferred sides)

```yaml
connections:
  - target-node
```

Creates an edge. Entry and exit sides are inferred from the relative positions of the two nodes.

### With explicit sides

```yaml
connections:
  - target-node:
    from: right
    to: left
```

`from` is the exit side on this node. `to` is the entry side on the target. Valid values: `top`, `bottom`, `left`, `right`.

When omitted, sides are inferred: target to the right → `from: right, to: left`; target below → `from: bottom, to: top`, etc.

### With a label

```yaml
connections:
  - target-node:
    from: right
    to: left
    text: HTTP/JSON
```

`text` sets the label displayed on the connector. Can be combined with `from`/`to` or used alone.

### To a canvas position (dangling edge)

```yaml
connections:
  - pos:240,180
```

or with an exit side:

```yaml
connections:
  - pos:240,180:
    from: right
```

Creates an edge that ends at a fixed canvas coordinate rather than a node. Written automatically when you draw a connector to empty space in the diagram. The `pos:x,y` value is the absolute canvas position of the floating endpoint.

---

## Boundary sizing

A `boundary` node with a `contains` list is automatically sized to enclose all of its listed nodes, with 20 px of padding on each side.

```yaml
nodes:
  internal-zone:
    type: boundary
    contains:
      - frontend
      - backend

  frontend:
    type: app
    meta:
      pos: 200,180
      size: 120,60

  backend:
    type: app
    meta:
      pos: 420,180
      size: 120,60
```

The sizing runs after all nodes are placed, so the boundary will correctly wrap nodes regardless of their order in the YAML.

**Explicit `meta` takes precedence.** If `meta.pos` and `meta.size` are present on the boundary, they are used as-is and `contains` has no effect on geometry. To refit the boundary to its contents, delete the `meta` block and save — it will be resized automatically, then `meta` will be written back the next time you move or resize the boundary.

`contains` is only valid on `boundary` nodes. Using it on any other type produces an editor annotation.

---

## Meta

`meta` stores diagram state. It is written automatically by draw.io interactions — you normally don't need to write it by hand.

```yaml
meta:
  pos: 200,180
  size: 120,60
  style: "rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;"
```

| Field | Description |
|---|---|
| `pos` | `x,y` — top-left position of the shape on the canvas |
| `size` | `width,height` in pixels |
| `rotation` | Clockwise rotation in degrees. Auto-written when a shape is rotated in the diagram. |
| `style` | draw.io style string. Auto-written when a shape's style is changed via the format panel or right-click → Edit Style. Also written for `generic` nodes to capture the shape template. Rotation is stored in `rotation`, not here. |

**When `meta` is absent** on initial render, draw.io places the shape automatically. `pos` and `size` are written when a node is first added from the diagram, and updated on every move or resize. `rotation` is written when a shape is rotated, and `style` is written when any other style change is applied or when a `generic` shape is first added.

---

## Full example

```yaml
nodes:
  customer:
    type: actor
    meta:
      pos: 60,200
      size: 40,60

  frontend:
    type: app
    meta:
      pos: 200,180
      size: 120,60
    connections:
      - backend:
        from: right
        to: left
        text: HTTPS

  backend:
    type: application
    trust: internal
    accepts:
      - http
      - grpc
    meta:
      pos: 420,180
      size: 120,60
    connections:
      - database:
        from: right
        to: left
      - pos:560,80:
        from: top

  database:
    type: db
    meta:
      pos: 640,180
      size: 120,60

  firewall:
    type: generic
    meta:
      pos: 320,60
      size: 80,40
      style: "shape=mxgraph.cisco.firewalls.firewall;sketch=0;html=1;"
```
