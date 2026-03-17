# Examples

## Minimal

Two nodes and a connection. No position metadata — draw.io will place them automatically.

```yaml
nodes:
  api:
    type: app
    connections:
      - database

  database:
    type: db
```

---

## Web application stack

A typical three-tier web app with a human actor. Connections specify exit and entry sides so the diagram routes cleanly left-to-right.

```yaml
nodes:
  customer:
    type: actor

  frontend:
    type: app
    connections:
      - backend:
        from: right
        to: left

  backend:
    type: app
    connections:
      - database:
        from: right
        to: left

  database:
    type: db
```

---

## Microservices

Multiple services communicating in different directions. Connections without explicit sides are inferred from relative position.

```yaml
nodes:
  gateway:
    type: app
    connections:
      - auth-service
      - user-service
      - order-service

  auth-service:
    type: app

  user-service:
    type: app
    connections:
      - user-db

  order-service:
    type: app
    connections:
      - order-db
      - user-service

  user-db:
    type: db

  order-db:
    type: db
```

---

## Trust zones

Use `trust` to annotate security boundaries. The field is free-form — use whatever labelling fits your threat model.

```yaml
nodes:
  browser:
    type: actor
    trust: external

  load-balancer:
    type: app
    trust: dmz
    connections:
      - api:
        from: right
        to: left

  api:
    type: app
    trust: internal
    connections:
      - database:
        from: bottom
        to: top

  database:
    type: db
    trust: internal
```

---

## Interface contracts with `accepts`

`accepts` documents what a node receives. Useful for capturing protocol and data-type boundaries.

```yaml
nodes:
  mobile-app:
    type: actor
    connections:
      - api-gateway

  api-gateway:
    type: app
    accepts:
      - https
      - graphql
    connections:
      - backend

  backend:
    type: app
    accepts:
      - grpc
    connections:
      - cache
      - primary-db

  cache:
    type: db
    accepts:
      - redis

  primary-db:
    type: db
    accepts:
      - postgres
```

---

## Starting from the diagram

1. Open modeld. The left panel shows YAML; the right shows the diagram.
2. In the diagram, drag a shape from the shapes panel onto the canvas.
3. The YAML on the left updates immediately with a new node block. The type is inferred from the shape you chose.
4. Rename the shape by double-clicking its label in the diagram. The node key in the YAML updates to match.
5. Draw a connection between two shapes by hovering over a shape until the blue connection handles appear, then dragging to another shape.
6. The `connections` list in the source node's YAML block is updated with the target name and inferred `from`/`to` sides.

---

## Starting from code

1. Open modeld. Edit the YAML in the left panel.
2. Type a new node under `nodes:` with a valid `type`. The diagram adds the corresponding shape as soon as the YAML is valid.
3. Add a `connections` entry pointing to another node. An edge appears in the diagram.
4. Add `meta.pos` and `meta.size` to place the shape at a specific position. The diagram moves it immediately.
5. Drag the shape in the diagram to adjust its position — the `meta` block in the YAML updates to reflect the new coordinates.
