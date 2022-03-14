import * as code from './code'
import * as consts from './consts'
import * as events from './events'
import * as helpers from './helpers'

import 'ace-builds/src/ace';
import 'ace-builds/src-min-noconflict/mode-yaml'

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
        v.yaml ? triggerChanges(v) : null

        document.lines = lines
    }
})
editor.lockEvents = false

// Document globals
document.editor = editor
document.nodes = {}
document.lines = []
window.onload = function () {
    const ctx = dioCtx()
    ctx.helpers.registerEventHandler(events.handleEvent)
}
window.eventHandler = events.handleEvent
export let dioCtx = () => {return document.getElementById("dio").contentWindow.document}

/**
 * Analyse diff between parsed YAML and global state
 * @param v
 */
function triggerChanges(v) {
    if (v.yaml.hasOwnProperty('nodes') === false) {
        return
    }

    // handle the last remaining node deleted
    if (v.yaml['nodes'] === null || Object.keys(v.yaml['nodes']).length === 0) {
        handleNodesDeleted(v)
        return
    }

    // handle nodes renamed safely (finding an active line greater than editor legnth throws)
    let activeLine = code.activeLineFromEditor(v)
    try {
        let old_key = code.cleanKeyLine(document.lines[activeLine])
        let new_key = code.cleanKeyLine(code.getLines()[activeLine])
        if (new_key !== "" && document.nodes.hasOwnProperty(old_key)) {
            document.nodes[new_key] = document.nodes[old_key]
            document.nodes[new_key].name = new_key
            helpers.renameConnections(old_key, new_key)
            delete document.nodes[old_key];
            code.renameNodeInCode(old_key, new_key)
            events.callEvent("nodeRenamed", document.nodes[new_key])
            return
        }
    } catch (e) {}

    // handle all other nodes deleted
    handleNodesDeleted(v)

    // need to loop to create all nodes before trying to create cnxs
    for (let key of Object.keys(v.yaml['nodes'])) {
        handleNodeAddition(v, key)
    }

    for (let key of Object.keys(v.yaml['nodes'])) {
        handlePropertyUpdates(v, key)
    }

    consts.DEBUG === true ? console.log(document.nodes) : null
}

/**
 * Only if the type is valid, trigger the change
 *
 * @param v
 * @param key
 */
function handleNodeAddition(v, key) {
    if (v.action !== "insert") return

    const line = code.determineLineOfNode(key, code.getLines())
    if (!document.nodes.hasOwnProperty(key) && v.yaml['nodes'][key] !== null && v.yaml['nodes'][key].hasOwnProperty('type')) {
        if (!code.isValidType(v.yaml['nodes'][key]['type'])) {
            return
        }

        // Trigger addition
        document.nodes[key] = {
            name: key,
            type: v.yaml['nodes'][key]['type'],
            trust: v.yaml['nodes'][key].hasOwnProperty('trust') ? v.yaml['nodes'][key]['trust'] : null,
            line: line,
            accepts: v.yaml['nodes'][key].hasOwnProperty('accepts') ? v.yaml['nodes'][key]['accepts'] : [],
            connections: {}
        }

        consts.DEBUG === true ? console.log("Adding node: " + key) : null
        events.callEvent("nodeAdded", document.nodes[key])
    }
}

/**
 * Handle an event where a property of a node has changed.
 * @param v
 * @param key
 */
function handlePropertyUpdates(v, key) {
    const line = code.determineLineOfNode(key, code.getLines())
    if (!document.nodes.hasOwnProperty(key)) return

    document.nodes[key].name = key
    document.nodes[key].type = v.yaml['nodes'][key]['type']
    document.nodes[key].trust =  v.yaml['nodes'][key].hasOwnProperty('trust') ? v.yaml['nodes'][key]['trust'] : null
    document.nodes[key].line = line
    document.nodes[key].accepts = v.yaml['nodes'][key].hasOwnProperty('accepts') ? v.yaml['nodes'][key]['accepts'] : []

    // check through the yaml connections for any keys that don't exist on the node
    let candidateCnxs = v.yaml['nodes'][key].hasOwnProperty('connections') ? helpers.formatConnections(key, v.yaml['nodes'][key]['connections']) : {}
    for (let cnx of Object.keys(candidateCnxs)) {
        if (!document.nodes[key].connections.hasOwnProperty(cnx) && document.nodes.hasOwnProperty(cnx)) {
            // we haven't created an edge yet, do it now
            events.callEvent("edgeAdded", {
                sourceName: key,
                source: document.nodes[key].id,
                targetName: cnx,
                target: document.nodes[cnx].id,
            })
            continue
        }

        if (document.nodes.hasOwnProperty(cnx)) {
            // handle connection prop update
            events.callEvent("edgeUpdated", {
                sourceName: key,
                targetName: cnx,
                cnx: candidateCnxs[cnx]
            })
        }
    }

}

/**
 *
 * @param v
 */
function handleNodesDeleted(v) {
    if (v.action !== "removal") return

    //handle nodes deleted
    let startYaml = document.nodes
    let endYaml = code.parseTextAreaToYaml(code.getLines().join("\n"))
    if (typeof (startYaml['nodes']) == "object" && (helpers.lengthOfDict(startYaml) > helpers.lengthOfDict(endYaml['nodes']))) {
        // if we got an empty endYaml, remove all
        let removedNodes = []
        if (helpers.lengthOfDict(endYaml['nodes']) === 0) {
            removedNodes = Object.keys(startYaml)
        } else {
            removedNodes = Object.keys(startYaml).filter(x => Object.keys(endYaml['nodes']).indexOf(x) === -1);
        }

        for (let removedNode of removedNodes) {
            events.callEvent("nodeRemoved", document.nodes[removedNode])
            delete document.nodes[removedNode]
        }
    }
}
