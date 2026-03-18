import * as code from './code'
import * as consts from './consts'
import * as diagram from './diagram'
import * as events from './events'
import * as helpers from './helpers'
import * as sync from './sync'

import 'ace-builds/src-min-noconflict/mode-yaml'
import 'ace-builds/src-min-noconflict/theme-monokai'

// SSE connection to MCP server
const evtSource = new EventSource('/events');
evtSource.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'get_screenshot') {
        let svg = null;
        try { svg = drawioCtx().helpers.getSvg(); } catch (e) { console.error('getSvg failed:', e); }
        fetch('/screenshot-response', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: msg.id, svg })
        });
    } else if (msg.type === 'set_model') {
        const ctx = drawioCtx();
        ctx.helpers.clearGraph();
        document.nodes = {};
        editor.lockEvents = true;
        editor.setValue(msg.yaml, -1);
        editor.lockEvents = false;
        let lines = code.getLines();
        document.lines = lines;
        let parsed = code.parseTextAreaToYaml(lines);
        if (parsed) triggerChanges({ action: 'insert', yaml: parsed });
        pushModelToHash(msg.yaml);
    }
};

// PINNED
export let editor = ace.edit("editor");

editor.setTheme("ace/theme/monokai");
editor.getSession().setMode("ace/mode/yaml");
editor.setOptions({
    enableBasicAutocompletion: false,
    enableLiveAutocompletion: false,
    enableSnippets: false,
    useSoftTabs: true,
    tabSize: 4,
    fontSize: "11pt"
})
editor.setBehavioursEnabled(false)
editor.setWrapBehavioursEnabled(false)

// Re-apply after mode finishes loading (mode change can re-enable behaviours)
editor.getSession().on('changeMode', () => {
    editor.setBehavioursEnabled(false)
    editor.setWrapBehavioursEnabled(false)
})

// Ensure Tab always indents inside the editor rather than navigating the page.
// On Enter: if the cursor is before a trailing ':' on a YAML key line, skip past
// it first so the colon doesn't split onto the next line.
editor.container.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        editor.focus()
        e.shiftKey ? editor.blockOutdent() : editor.indent()
    }
    if (e.key === 'Enter') {
        const pos = editor.getCursorPosition()
        const line = editor.getSession().getDocument().getAllLines()[pos.row] ?? ''
        const trimmed = line.trimEnd()
        if (trimmed.endsWith(':') && pos.column < trimmed.length) {
            e.preventDefault()
            e.stopPropagation()
            editor.moveCursorToPosition({ row: pos.row, column: trimmed.length })
            editor.insert('\n')
        }
    }
})

// langTools.addCompleter({
//     getCompletions: function(editor, session, pos, prefix, callback) { return {name: "a", value: "b", meta: "optional text"}}
// });
export function pushModelToHash(yaml) {
    try { history.replaceState(null, '', '#' + btoa(unescape(encodeURIComponent(yaml)))) } catch(e) {}
}

// Hash is the browser's persistence mechanism; model.yaml is MCP-only.
export function persistModel() {
    pushModelToHash(code.getLines().join('\n'))
}

editor.getSession().on('change', (v) => {
    if (document.activeElement.className === 'ace_text-input' && editor.lockEvents === false) {
        // Cleanup
        editor.getSession().setAnnotations([])

        let lines = code.getLines()
        v.yaml = code.parseTextAreaToYaml(lines)
        if (v.yaml) {
            triggerChanges(v)
            pushModelToHash(code.getLines().join('\n'))
        }

        document.lines = lines
    }
})
editor.lockEvents = false

// Document globals
document.editor = editor
document.nodes = {}
document.lines = []
window.onload = function () {
    // eventHandler must be on window before the iframe calls registerEventHandler
}
window.eventHandler = events.handleEvent
window.onDrawioReady = function () {
    const ctx = drawioCtx()
    ctx.helpers.registerEventHandler(events.handleEvent)
    ctx.helpers.clearGraph()
    document.nodes = {}

    let lines = code.getLines()
    document.lines = lines
    let yaml = code.parseTextAreaToYaml(lines)
    if (yaml) triggerChanges({ action: 'insert', yaml })
}
export let drawioCtx = () => {return document.getElementById("drawio").contentWindow.document}

// YAML undo history — pushed before every diagram→YAML mutation
const yamlHistory = []

function loadYaml(yaml) {
    const ctx = drawioCtx()
    ctx.helpers.clearGraph()
    document.nodes = {}
    editor.lockEvents = true
    editor.setValue(yaml, -1)
    editor.lockEvents = false
    const lines = code.getLines()
    document.lines = lines
    const parsed = code.parseTextAreaToYaml(lines)
    if (parsed) triggerChanges({ action: 'insert', yaml: parsed })
    pushModelToHash(yaml)
}

export function pushYamlHistory() {
    const current = code.getLines().join('\n')
    if (yamlHistory.length > 0 && yamlHistory[yamlHistory.length - 1] === current) return
    yamlHistory.push(current)
    if (yamlHistory.length > 50) yamlHistory.shift()
}

export function undoYaml() {
    if (yamlHistory.length === 0) return
    loadYaml(yamlHistory.pop())
    try { drawioCtx().app?.editor?.undoManager?.clear() } catch (e) {}
}

window.reloadDiagram = function(yaml) {
    loadYaml(yaml ?? editor.getValue())
}

// Test hook: replicates the SSE set_model flow so e2e tests can load a model
// without relying on keyboard simulation or SSE.
window.__setModel = function(yaml) {
    const ctx = drawioCtx()
    ctx.helpers.clearGraph()
    document.nodes = {}
    editor.lockEvents = true
    editor.setValue(yaml, -1)
    editor.lockEvents = false
    let lines = code.getLines()
    document.lines = lines
    let parsed = code.parseTextAreaToYaml(lines)
    if (parsed) triggerChanges({ action: 'insert', yaml: parsed })
    pushModelToHash(yaml)
}

/**
 * Analyse diff between parsed YAML and global state
 * @param v
 */
function triggerChanges(v) {
    if (!v.yaml.hasOwnProperty('nodes')) return

    const newNodes = v.yaml.nodes || {}

    // Rename detection: line-based, editor-specific — stays here
    if (Object.keys(newNodes).length > 0) {
        let activeLine = code.activeLineFromEditor(v)
        try {
            let old_key = code.cleanKeyLine(document.lines[activeLine])
            let new_key = code.cleanKeyLine(code.getLines()[activeLine])
            if (new_key !== "" && new_key !== old_key && document.nodes.hasOwnProperty(old_key)) {
                document.nodes[new_key] = document.nodes[old_key]
                document.nodes[new_key].name = new_key
                helpers.renameConnections(old_key, new_key)
                delete document.nodes[old_key]
                code.renameNodeInCode(old_key, new_key)
                events.callEvent("nodeRenamed", document.nodes[new_key])
                return
            }
        } catch (e) {}
    }

    for (const evt of sync.diffNodes(newNodes, document.nodes, v.action)) {
        applyEvent(evt)
    }

    // Second pass: wire edges for nodes that were just added.
    // diffNodes skips connection processing for new nodes (IDs aren't assigned yet at
    // that point). After the first pass, all nodeAdded events have run and IDs are set,
    // so a targeted second pass can safely emit edgeAdded events.
    for (const evt of sync.diffNodes(newNodes, document.nodes, 'insert')) {
        if (evt.type === 'edgeAdded') applyEvent(evt)
    }

    // Third pass: fit boundary nodes to their contained nodes using live draw.io geometry.
    // Runs after all nodes (and their geometry) are placed, so getCellGeometry is reliable.
    // Only fires for boundaries whose meta is absent — explicit meta takes precedence.
    // To refit a boundary, delete its meta block and save.
    const ctx = drawioCtx()
    for (const [name, newNode] of Object.entries(newNodes)) {
        if (!newNode || newNode.type !== 'boundary') continue
        const docNode = document.nodes[name]
        if (!docNode?.id) continue
        if (newNode.meta?.pos && newNode.meta?.size) continue
        const contains = newNode.contains ?? []
        if (contains.length === 0) continue
        const geos = contains
            .map(n => document.nodes[n]?.id ? ctx.helpers.getCellGeometry(document.nodes[n].id) : null)
            .filter(Boolean)
        const box = diagram.computeBoundaryGeometry(geos, 20)
        if (box) applyEvent({ type: 'geometryUpdated', id: docNode.id, x: box.x, y: box.y, width: box.width, height: box.height })
    }

    consts.DEBUG ? console.log(document.nodes) : null
}

function applyEvent(evt) {
    switch (evt.type) {
        case 'nodeRemoved':
            events.callEvent('nodeRemoved', evt.node)
            delete document.nodes[evt.name]
            break

        case 'nodeAdded': {
            document.nodes[evt.name] = {
                name: evt.name,
                type: evt.nodeType,
                ...(evt.label !== undefined ? { label: evt.label } : {}),
                trust: evt.trust,
                accepts: evt.accepts,
                contains: evt.contains ?? [],
                meta: evt.meta ?? null,
                line: code.determineLineOfNode(evt.name, code.getLines()),
                connections: {}
            }
            events.callEvent('nodeAdded', document.nodes[evt.name])
            if (evt.meta && document.nodes[evt.name].id) {
                const parseVec = str => {
                    if (!str) return null
                    const [x, y] = str.toString().split(',').map(Number)
                    return isNaN(x) || isNaN(y) ? null : { x, y }
                }
                const pos = parseVec(evt.meta.pos), size = parseVec(evt.meta.size)
                if (pos && size) events.callEvent('geometryUpdated', {
                    id: document.nodes[evt.name].id,
                    x: pos.x, y: pos.y, width: size.x, height: size.y
                })
                if (evt.meta.rotation !== undefined) events.callEvent('rotationUpdated', {
                    id: document.nodes[evt.name].id,
                    rotation: evt.meta.rotation
                })
            }
            break
        }

        case 'labelUpdated': {
            document.nodes[evt.name].label = evt.label
            const displayName = evt.label ?? evt.name
            events.callEvent('nodeRenamed', { id: document.nodes[evt.name].id, name: displayName })
            break
        }

        case 'edgeRemoved':
            events.callEvent('edgeRemoved', evt)
            delete document.nodes[evt.sourceName].connections[evt.targetName]
            break

        case 'edgeAdded':
        case 'edgeUpdated':
        case 'geometryUpdated':
        case 'styleUpdated':
            events.callEvent(evt.type, evt)
            break
    }
}
