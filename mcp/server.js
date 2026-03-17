import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import crypto from 'crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_PATH = join(ROOT, 'model.yaml');

const app = express();
app.use(express.json({ limit: '10mb' }));
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

app.post('/model', (req, res) => {
    writeFileSync(MODEL_PATH, req.body.yaml, 'utf8');
    res.json({ ok: true });
});

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
        { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
            {
                name: 'get_model',
                description: 'Read the current system design model as YAML',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'set_model',
                description: 'Replace the system design model with new YAML. Updates the live browser view if open.',
                inputSchema: {
                    type: 'object',
                    properties: { yaml: { type: 'string', description: 'Full YAML model content' } },
                    required: ['yaml'],
                },
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
            return { content: [{ type: 'text', text: readFileSync(MODEL_PATH, 'utf8') }] };
        }

        if (name === 'set_model') {
            yaml.load(args.yaml); // throws if invalid
            writeFileSync(MODEL_PATH, args.yaml, 'utf8');
            if (sseClients.size > 0) {
                broadcast({ type: 'set_model', yaml: args.yaml });
            } else {
                pendingSetModel = args.yaml;
            }
            return { content: [{ type: 'text', text: 'Model updated.' }] };
        }

        if (name === 'get_screenshot') {
            if (sseClients.size === 0) {
                return { content: [{ type: 'text', text: 'Error: no browser connected.' }], isError: true };
            }
            try {
                const svg = await requestScreenshot();
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
