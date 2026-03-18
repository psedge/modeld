import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import crypto from 'crypto';

// ── model serializer (mirrors doc.js serializeDoc) ───────────────────────────

const INDENT2 = '        ';

function serializeEntry(c) {
    if (typeof c === 'string') return '    - ' + c;
    const [target] = Object.keys(c);
    const parts = ['    - ' + target + ':'];
    if (c.from) parts.push('      from: ' + c.from);
    if (c.to)   parts.push('      to: '   + c.to);
    if (c.text) parts.push('      text: ' + c.text);
    return parts.join('\n');
}

function nodeBlock(key, nodeObj) {
    const { connections, ...rest } = nodeObj;
    let body = yaml.dump(rest, { indent: 4 });
    if (connections && connections.length > 0)
        body += 'connections:\n' + connections.map(serializeEntry).join('\n') + '\n';
    return (key + ':\n' + body).replaceAll('\n', '\n' + INDENT2).trimEnd();
}

function serializeModel(doc) {
    const blocks = Object.entries(doc.nodes).map(([key, node]) => '    ' + nodeBlock(key, node));
    return 'nodes:\n' + blocks.join('\n') + '\n';
}

// ── schema validation ─────────────────────────────────────────────────────────

const VALID_NODE_KEYS = ['type', 'trust', 'accepts', 'connections', 'meta', 'contains', 'label'];
const VALID_TYPES = ['app', 'application', 'db', 'database', 'actor', 'person', 'boundary', 'generic'];

function validateModel(parsed) {
    const errors = [];
    if (!parsed || !parsed.nodes || typeof parsed.nodes !== 'object') {
        errors.push('root key "nodes" is required');
        return errors;
    }
    const nodeIds = Object.keys(parsed.nodes);
    for (const [id, node] of Object.entries(parsed.nodes)) {
        if (!node || typeof node !== 'object') { errors.push(`${id}: must be an object`); continue; }
        if (!node.type) {
            errors.push(`${id}: missing required field "type"`);
        } else if (!VALID_TYPES.includes(node.type)) {
            errors.push(`${id}: invalid type "${node.type}". Valid: ${VALID_TYPES.join(', ')}`);
        }
        for (const key of Object.keys(node)) {
            if (!VALID_NODE_KEYS.includes(key)) errors.push(`${id}: unknown field "${key}"`);
        }
        if (node.contains && node.type !== 'boundary') {
            errors.push(`${id}: "contains" is only valid on boundary nodes`);
        }
        if (Array.isArray(node.connections)) {
            for (const cnx of node.connections) {
                const target = typeof cnx === 'string' ? cnx : Object.keys(cnx)[0];
                if (target && !target.startsWith('pos:') && !nodeIds.includes(target))
                    errors.push(`${id}: connection target "${target}" does not exist`);
            }
        }
    }
    return errors;
}

// ── in-memory model state ─────────────────────────────────────────────────────

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_PATH = join(ROOT, 'model.yaml');
const SYNTAX_PATH = join(ROOT, 'docs', 'syntax.md');

// Seeded from model.yaml (the blank starter); never written back to disk.
let currentModel = readFileSync(MODEL_PATH, 'utf8');

const MAX_HISTORY = 10;
const modelHistory = [];

const app = express();
app.use(express.json({ limit: '10mb' }));

// Serve model.yaml and modeld.js without caching so a fresh reload always picks up disk changes
app.get('/model.yaml', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(MODEL_PATH);
});
app.get('/static/modeld.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(join(ROOT, 'static', 'modeld.js'));
});

app.use(express.static(ROOT));

// --- SSE broadcast to browser ---

const sseClients = new Set();
let pendingSetModel = null;

app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.add(res);

    if (pendingSetModel !== null) {
        res.write(`data: ${JSON.stringify({ type: 'set_model', yaml: pendingSetModel })}\n\n`);
        pendingSetModel = null;
    }

    req.on('close', () => sseClients.delete(res));
});

function broadcast(data) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) client.write(msg);
}

// --- Browser → server endpoints ---

const pendingScreenshots = new Map();

app.post('/screenshot-response', (req, res) => {
    const { id, svg } = req.body;
    const resolve = pendingScreenshots.get(id);
    if (resolve) { pendingScreenshots.delete(id); resolve(svg); }
    res.json({ ok: true });
});

function requestScreenshot() {
    return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        pendingScreenshots.set(id, resolve);
        setTimeout(() => { pendingScreenshots.delete(id); reject(new Error('timeout')); }, 5000);
        broadcast({ type: 'get_screenshot', id });
    });
}

// --- MCP endpoint ---

function makeMcpServer() {
    const server = new Server(
        { name: 'modeld', version: '1.0.0' },
        { capabilities: { tools: {}, resources: {} } }
    );

    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
        resources: [
            {
                uri: 'modeld://syntax',
                name: 'modeld YAML syntax',
                description: 'Formal specification of the modeld YAML format: node fields, types, connections, and meta.',
                mimeType: 'text/markdown',
            },
        ],
    }));

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        if (request.params.uri === 'modeld://syntax') {
            return {
                contents: [
                    {
                        uri: 'modeld://syntax',
                        mimeType: 'text/markdown',
                        text: readFileSync(SYNTAX_PATH, 'utf8'),
                    },
                ],
            };
        }
        throw new Error(`Unknown resource: ${request.params.uri}`);
    });

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
            {
                name: 'get_model',
                description: 'Read the current system design model as YAML',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'set_model',
                description: `Replace the system design model with new YAML. Updates the live browser view if open.

Node fields: type (required), label (display name, separate from the node key), trust, accepts, connections, meta, contains (boundary only).
Valid types: app, application, db, database, actor, person, boundary, generic.

Boundary auto-sizing: set contains: [node1, node2] on a boundary and omit meta — the boundary will be sized automatically to fit its children. To refit an existing boundary, delete its meta block.

Connections support: from/to sides (top/bottom/left/right) and a text label:
  - backend:
    from: right
    to: left
    text: HTTP/JSON

Threat modelling fields: trust and accepts are free-form strings/lists for annotating nodes.`,
                inputSchema: {
                    type: 'object',
                    properties: { yaml: { type: 'string', description: 'Full YAML model content' } },
                    required: ['yaml'],
                },
            },
            {
                name: 'update_node',
                description: `Patch a single node without replacing the whole model. Merges top-level fields and meta sub-fields; replaces connections/contains/trust/accepts/label if provided.

Example — update just the style:
  id: my_service
  yaml: |
    meta:
      style: "rounded=1;fillColor=#dae8fc;"`,
                inputSchema: {
                    type: 'object',
                    properties: {
                        id:   { type: 'string', description: 'Node key to update' },
                        yaml: { type: 'string', description: 'Partial node YAML (fields to merge/replace)' },
                    },
                    required: ['id', 'yaml'],
                },
            },
            {
                name: 'undo',
                description: 'Revert the model to the previous state (up to 10 levels). Returns an error if there is nothing to undo.',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'get_screenshot',
                description: 'Get an SVG of the current diagram. Requires a browser tab to be open.',
                inputSchema: { type: 'object', properties: {} },
            },
        ],
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        if (name === 'get_model') {
            return { content: [{ type: 'text', text: currentModel }] };
        }

        if (name === 'set_model') {
            const parsed = yaml.load(args.yaml);
            const errors = validateModel(parsed);
            if (errors.length > 0)
                return { content: [{ type: 'text', text: `Validation errors:\n${errors.join('\n')}` }], isError: true };
            modelHistory.push(currentModel);
            if (modelHistory.length > MAX_HISTORY) modelHistory.shift();
            currentModel = args.yaml;
            if (sseClients.size > 0) {
                broadcast({ type: 'set_model', yaml: args.yaml });
            } else {
                pendingSetModel = args.yaml;
            }
            return { content: [{ type: 'text', text: 'Model updated.' }] };
        }

        if (name === 'update_node') {
            const { id, yaml: nodeYaml } = args;
            const doc = yaml.load(currentModel);
            if (!doc.nodes?.[id])
                return { content: [{ type: 'text', text: `Error: node "${id}" not found` }], isError: true };
            const patch = yaml.load(nodeYaml);
            const existing = doc.nodes[id];
            for (const [k, v] of Object.entries(patch)) {
                if (k === 'meta' && existing.meta && v && typeof v === 'object') {
                    existing.meta = { ...existing.meta, ...v };
                } else {
                    existing[k] = v;
                }
            }
            const errors = validateModel(doc);
            if (errors.length > 0)
                return { content: [{ type: 'text', text: `Validation errors:\n${errors.join('\n')}` }], isError: true };
            modelHistory.push(currentModel);
            if (modelHistory.length > MAX_HISTORY) modelHistory.shift();
            const newYaml = serializeModel(doc);
            currentModel = newYaml;
            if (sseClients.size > 0) {
                broadcast({ type: 'set_model', yaml: newYaml });
            } else {
                pendingSetModel = newYaml;
            }
            return { content: [{ type: 'text', text: 'Node updated.' }] };
        }

        if (name === 'undo') {
            if (modelHistory.length === 0)
                return { content: [{ type: 'text', text: 'Nothing to undo.' }], isError: true };
            const prev = modelHistory.pop();
            currentModel = prev;
            if (sseClients.size > 0) {
                broadcast({ type: 'set_model', yaml: prev });
            } else {
                pendingSetModel = prev;
            }
            return { content: [{ type: 'text', text: 'Undone.' }] };
        }

        if (name === 'get_screenshot') {
            if (sseClients.size === 0) {
                return { content: [{ type: 'text', text: 'Error: no browser connected.' }], isError: true };
            }
            try {
                const svg = await requestScreenshot();
                if (!svg) return { content: [{ type: 'text', text: 'Error: browser returned empty screenshot. Check the browser console for details.' }], isError: true };
                return { content: [{ type: 'text', text: svg }] };
            } catch (e) {
                return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
            }
        }

        throw new Error(`Unknown tool: ${name}`);
    });

    return server;
}

app.all('/mcp', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = makeMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('finish', () => server.close());
});

app.listen(3001, () => {
    process.stderr.write('modeld running at http://localhost:3001\n');
});
