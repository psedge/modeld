![modeld](./static/modeld.png "modeld")

> *Make every model collaborative, declarative, and programmable.*

**modeld** keeps a visual diagram and a code definition in sync — editing one updates the other in real time. The result is a system model that's as easy to sketch as a whiteboard diagram and as precise as a spec.

---

## Why

Models represent a single view of a system at a point in time. They might not capture every detail, but they communicate the right level of abstraction for a given moment. The problem is that visual and written representations have always lived apart:

- **Drawing is fast, but loses precision.** A sketch communicates structure instantly, but converting it to interface definitions or system requirements requires manual follow-up work.
- **Code is precise, but loses the big picture.** Documentation tells you the details; it rarely gives a newcomer a whole-system view of how components fit together.
- **Diagrams don't version well.** Finding who changed something, or why, is either impossible or requires reaching out to people directly.

modeld solves all three by treating the diagram and the code as two views of the same artifact. Changes propagate in both directions, and the underlying text is version-controlled like any other source file.

---

## Features

- **Bidirectional sync** — add a node to the diagram and the code updates; edit the code and the diagram reflects it.
- **Declarative model format** — models are defined in a plain-text YAML syntax that's readable, diffable, and scriptable.
- **MCP integration** — an included Model Context Protocol server exposes the model to Claude Code for AI-assisted editing and querying.

---

## Getting Started

**Clone draw.io** (required — the diagramming UI is served from a local draw.io checkout):

```bash
git clone https://github.com/jgraph/drawio.git drawio
```

**Install dependencies:**

```bash
npm install
```

**Build:**

```bash
npm run build
```

**Run:**

```bash
npm start
```

Then open [http://localhost:3001](http://localhost:3001) in your browser.

**Run tests:**

```bash
npm test
```

---

## MCP Setup

Start the MCP server:

```bash
node mcp/server.js
```

Register it with Claude Code:

```bash
claude mcp add --transport http modeld http://localhost:3001/mcp
```
