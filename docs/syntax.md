# Syntax

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
| `type` | yes | Shape type in the diagram. See [types](#types) below. |
| `connections` | no | List of outgoing connections from this node. |
| `trust` | no | Trust level or zone — free-form, used for security modelling. |
| `accepts` | no | Data types, protocols, or interfaces this node accepts. |
| `meta` | no | Position and size in the diagram. Auto-written on drag/resize. |

Unknown keys produce an editor annotation.

---

## Types

| Value | Aliases | Diagram shape |
|---|---|---|
| `app` | `application` | Rectangle |
| `db` | `database` | Rounded rectangle |
| `actor` | — | UML stick figure |

If you draw a shape in the diagram, the type is inferred from its style. Cylinders, database shapes, and AWS RDS icons map to `db`; UML actor shapes map to `actor`; everything else maps to `app`.

---

## Connections

A connection is an outgoing edge from this node to another. Connections are listed as a YAML sequence under the `connections` key.

### Simple

```yaml
connections:
  - target-node
```

Creates an edge. Entry and exit sides are inferred from the relative positions of the two nodes.

### With direction

```yaml
connections:
  - target-node:
    from: right
    to: left
```

`from` is the exit side on this node. `to` is the entry side on the target node. Valid values for both: `top`, `bottom`, `left`, `right`.

When omitted, sides are inferred: if the target is mostly to the right, `from: right, to: left` is used; if mostly below, `from: bottom, to: top`, and so on.

---

## Meta

`meta` stores the diagram position and size. You normally don't write this by hand — it's updated automatically when you move or resize a shape.

```yaml
meta:
  pos: 200,180
  size: 120,60
```

`pos` is `x,y` from the top-left corner of the diagram canvas. `size` is `width,height` in pixels. If `meta` is absent when a node is first created, draw.io places the shape automatically.

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

  database:
    type: db
    meta:
      pos: 640,180
      size: 120,60
```
