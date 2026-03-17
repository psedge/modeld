import * as code from './code'
import * as consts from './consts'
import * as events from './events'
import * as helpers from './helpers'
import * as sync from './sync'

import 'ace-builds/src/ace';
import 'ace-builds/src-min-noconflict/mode-yaml'

// SSE connection to MCP server
const evtSource = new EventSource('/events');
evtSource.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'get_screenshot') {
        const svg = drawioCtx().helpers.getSvg();
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
    }
};

// PINNED
export let editor = ace.edit("editor");

editor.setTheme("ace/theme/monokai");
editor.getSession().setMode("ace/mode/yaml");
editor.setOptions({
    enableBasicAutocompletion: false,
    fontSize: "11pt"
})

// langTools.addCompleter({
//     getCompletions: function(editor, session, pos, prefix, callback) { return {name: "a", value: "b", meta: "optional text"}}
// });
editor.getSession().on('change', (v) => {
    if (document.activeElement.className === 'ace_text-input' && editor.lockEvents === false) {
        // Cleanup
        editor.getSession().setAnnotations([])

        let lines = code.getLines()
        v.yaml = code.parseTextAreaToYaml(lines)
        if (v.yaml) {
            triggerChanges(v)
            editor.focus()
            fetch('/model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ yaml: code.getLines().join('\n') })
            })
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
            if (new_key !== "" && document.nodes.hasOwnProperty(old_key)) {
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
                trust: evt.trust,
                accepts: evt.accepts,
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
            }
            break
        }

        case 'edgeRemoved':
            events.callEvent('edgeRemoved', evt)
            delete document.nodes[evt.sourceName].connections[evt.targetName]
            break

        case 'edgeAdded':
        case 'edgeUpdated':
        case 'geometryUpdated':
            events.callEvent(evt.type, evt)
            break
    }
}
