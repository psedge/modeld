<p align="center"><img src="./static/modeld.png" alt="modeld" /></p>

> *Make every model interactive, declarative, and programmable.*

A bi-directional, dual-representation modeling tool built on `draw.io` and yaml - editing one updates the other in real time. The result is a system model that's as easy to sketch as a whiteboard diagram and as precise as a spec.



---

## Why

Models represent a single view of a system at a point in time. They might not capture every detail, but they communicate the right level of abstraction for a given moment. The problem is that visual and written representations have always lived apart:

- **Drawing is fast, but loses precision.** A sketch communicates structure instantly, but converting it to interface definitions or system requirements requires manual follow-up work.
- **Code is precise, but loses the big picture.** Documentation tells you the details; it rarely gives a newcomer a whole-system view of how components fit together.
- **Diagrams don't version well.** Finding who changed something, or why, is either impossible or requires reaching out to people directly.

modeld solves all three by treating the diagram and the code as two views of the same artifact. Changes propagate in both directions, and the underlying text is version-controlled like any other source file.

## Really, why?

Threat Modelling had a real moment there, model-as-code never took off and I wanted to learn more about a bit of software I'd used a lot to run sessions: Draw.io. It's cool, surprisingly extensible, and I thought it'd be great to be able to type out a model faster than dragging boxes around. Lately, I was playing with MCPs for diagramming tools and thought it would be fun to throw a streamble HTTP server ontop of the YAML editor and see how far it could go!

I set out to make swimlanes.io for Threat Modelling, thanks for the inspiration. Ultimately this is a bad idea of a project to build though - WYSIWYG editors have lots of internal state and props that are difficult to express in markup - trying to keep them in sync requires implementing in both directions (which I got around with the `meta` block, and keeping the internal draw.io `style` string as-is). Regardless of much effort to harden this translation layer between the two representations, it's still pretty buggy - so there's a "Reload" button which re-draws the graphical version based on reliable edits made to the YAML (DSL validated)


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

## Docker

**Build the image:**

```bash
docker build -t modeld .
```

**Run with default (empty) model:**

```bash
docker run -d -p 3001:3001 modeld
```

**Run with your own `model.yaml`** (bind-mount it so changes persist and the file is editable from the host):

```bash
docker run -d -p 3001:3001 -v "$(pwd)/model.yaml:/app/model.yaml" modeld
```

> Note: do not use `VOLUME` mounts for `model.yaml` — Docker volumes work as directories, not files, and will conflict with the file path.

Then open [http://localhost:3001](http://localhost:3001) in your browser.

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
