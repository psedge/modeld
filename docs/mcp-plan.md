# MCP server — technical plan

### Goal

Three MCP tools: `get_model`, `set_model`, `get_screenshot`. The YAML file on disk is the canonical source of truth; the browser is a live view of it.

---

## Architecture

```
Claude (MCP client)
    ↕  MCP over stdio
mcp/server.js  (new Node.js process)
    ↕  WebSocket on port 3001
Browser (modeld tab)
    ↕  existing sync
draw.io / Ace editor
```

One new process handles both the MCP protocol and the WebSocket bridge. The browser connects to it on load and stays connected.

---

## New files

**`mcp/server.js`** — MCP server + WebSocket bridge

Implements the three tools. Also runs a `ws` WebSocket server on port 3001. Holds the current model in memory (loaded from `model.yaml` on startup) and keeps a reference to the connected browser socket.

**`model.yaml`** — canonical model file

Moves the initial YAML content out of `index.html` and onto disk. This is what Claude reads and writes; the browser loads it on startup and persists changes back to it.

---

## Modified files

**`index.html`** — fetch `model.yaml` on load instead of inline content; the `<div id="editor">` starts empty and is populated after fetch.

**`src/app.js`** — two additions:
1. On editor change (after `triggerChanges`), POST the current YAML to the bridge so it stays in sync with `model.yaml` on disk.
2. Connect to WebSocket on startup. On `set_model` message, replace the Ace editor content and call `triggerChanges`.

**`drawio/src/main/webapp/index.html`** — add `document.helpers.getSvg()`:
```js
document.helpers.getSvg = function() {
    return document.app.editor.graph.getSvg()
}
```

---

## WebSocket message protocol

```
browser → server
  { type: "ready" }                               // on connect
  { type: "model_update", yaml: "..." }           // on every editor save
  { type: "screenshot_response", id, svg: "..." } // response to a request

server → browser
  { type: "set_model", yaml: "..." }              // tool call: set_model
  { type: "get_screenshot", id }                  // tool call: get_screenshot
```

Screenshot requests use a correlation `id` and a Promise with a timeout (5s) on the server side:

```js
const pending = new Map()

function requestScreenshot() {
    return new Promise((resolve, reject) => {
        const id = crypto.randomUUID()
        pending.set(id, resolve)
        setTimeout(() => { pending.delete(id); reject(new Error('timeout')) }, 5000)
        browserSocket.send(JSON.stringify({ type: 'get_screenshot', id }))
    })
}
```

---

## MCP tools

**`get_model`**
- Reads `model.yaml` from disk (not from browser — works even if no tab is open).
- Returns the YAML string as text content.

**`set_model(yaml: string)`**
- Validates the YAML parses cleanly before touching anything.
- Writes `model.yaml` to disk.
- If browser is connected, sends `{ type: "set_model", yaml }` over WebSocket.
- If no browser is connected, the file is updated and will be picked up on next load.

**`get_screenshot`**
- Requires browser to be connected; returns a clear error if not.
- Sends `{ type: "get_screenshot", id }` and awaits the response.
- Returns the SVG as an MCP `image` content block (SVG is XML text — Claude can read it directly without rasterisation).

---

## Browser reconnection

The browser retries the WebSocket connection every 2 seconds if it drops. The MCP server holds at most one pending `set_model` (the latest) and delivers it immediately on reconnect, so the file and the live view stay consistent even across reloads.

---

## Startup

```
# Terminal 1 — draw.io
cd drawio && python3 -m http.server 8000

# Terminal 2 — MCP server / bridge
node mcp/server.js

# Terminal 3 — modeld (any static server)
npx serve .
```

Add to Claude's MCP config:
```json
{
  "modeld": {
    "command": "node",
    "args": ["/path/to/modeld/mcp/server.js"]
  }
}
```

---

## New dependencies

```
@modelcontextprotocol/sdk   — MCP server protocol
ws                          — WebSocket server
```

Both are small and add no build complexity since `mcp/server.js` runs directly in Node, outside the Rollup bundle.

---

## What this unlocks

Claude can `get_model`, reason about the current system design, edit the YAML directly (it already knows the syntax well from `syntax.md`), `set_model` with the revised version, then `get_screenshot` to verify the diagram looks right — all in one conversation turn. Because `model.yaml` is on disk, it's also version-controllable and editable outside the browser.
