import {EditorState, basicSetup} from "@codemirror/basic-setup"
import {EditorView, ViewUpdate, keymap} from "@codemirror/view"
import {javascript} from "@codemirror/lang-javascript"
import {indentWithTab} from "@codemirror/commands"
import 'js-yaml';

import {lengthOfDict} from './helpers'

// import {handleEvent, callEvent, dioCtx} from './events'

const DEBUG = true

const doc = `# Describe your model & elements in YAML
nodes:

`

let editor = new EditorView({
    state: EditorState.create({
        doc: doc,
        extensions: [
            basicSetup,
            javascript(),
            keymap.of([indentWithTab]),
            EditorView.updateListener.of((v) => {
                if (document.activeElement.className === 'cm-content' && v.docChanged && editor.lockEvents === false) {
                    v.yaml = parseTextAreaToYaml(v.state.doc)
                    v.yaml ? triggerChanges(v) : null
                }
            })
        ]

    }),
    parent: document.querySelector("#editor"),
})
editor.lockEvents = false

// Document globals
document.editor = editor
document.nodes = {}

/**
 * Parse the YAML contained within a textArea t, replacing tabs with 4 spaces
 * It's fairly common half way through editing it won't be valid, wait until it is
 * @param v
 * @returns {*}
 */
function parseTextAreaToYaml(t) {
    try {
        return jsyaml.load(t.text.join("\n"));
    } catch (e) {
        DEBUG === true ? console.log(e) : null
        return false
    }
}

/**
 * Analyse diff between parsed YAML and global state
 * @param v
 */
function triggerChanges(v) {
    let comp = v.yaml
    if (comp.hasOwnProperty('nodes') === false) {
        return
    }
    if (comp['nodes'] === null || Object.keys(comp['nodes']).length === 0) {
        handleNodesDeleted(v)
        return
    }

    // handle nodes renamed
    let activeLine = activeLineFromViewUpdate(v)
    DEBUG === true ? console.log("activeLine: " + activeLine) : null
    let old_key = cleanKeyLine(v.startState.doc.text[activeLine])
    let new_key = cleanKeyLine(v.state.doc.text[activeLine])
    if (new_key !== "" && document.nodes.hasOwnProperty(old_key)) {
        document.nodes[new_key] = document.nodes[old_key]
        document.nodes[new_key].name = new_key
        renameConnections(old_key, new_key)
        delete document.nodes[old_key];
        renameNodeInCode(old_key, new_key)
        callEvent("nodeRenamed", document.nodes[new_key])
        return
    }

    handleNodesDeleted(v)

    for (let key of Object.keys(comp['nodes'])) {
        const line = determineLineOfNode(key, v.state.doc.text)

        // handle new additions
        // Only if the type is valid, trigger the change
        if (!document.nodes.hasOwnProperty(key) && comp['nodes'][key] !== null && comp['nodes'][key].hasOwnProperty('type')) {
            if (!isValidType(comp['nodes'][key]['type'])) {
                return
            }

            // Trigger addition
            document.nodes[key] = {
                name: key,
                type: comp['nodes'][key]['type'],
                line: line,
                accepts: comp['nodes'][key].hasOwnProperty('accepts') ? comp['nodes'][key]['accepts'] : [],
                connections: {}
            }

            DEBUG === true ? console.log("Adding node: " + key) : null
            callEvent("nodeAdded", document.nodes[key])
        }

        // handle property updates
        if (document.nodes.hasOwnProperty(key)) {
            document.nodes[key].name = key
            document.nodes[key].type = comp['nodes'][key]['type']
            document.nodes[key].line = line
            document.nodes[key].accepts = comp['nodes'][key].hasOwnProperty('accepts') ? comp['nodes'][key]['accepts'] : []

            // check through the yaml connections for any keys that don't exist on the node
            let candidateCnxs = comp['nodes'][key].hasOwnProperty('connections') ? formatConnections(comp['nodes'][key]['connections']) : {}
            for (let cnx of Object.keys(candidateCnxs)) {
                if (!document.nodes[key].connections.hasOwnProperty(cnx) && document.nodes.hasOwnProperty(cnx)) {
                    // we haven't created an edge yet, do it now
                    callEvent("edgeAdded", {
                        sourceName: key,
                        source: document.nodes[key].id,
                        targetName: cnx,
                        target: document.nodes[cnx].id,
                    })
                }
            }
        }
    }

    DEBUG === true ? console.log(document.nodes) : null
}

function handleNodesDeleted(v) {
    //handle nodes deleted
    let startYaml = parseTextAreaToYaml(v.startState.doc)
    let endYaml = v.yaml
    if (typeof (startYaml['nodes']) == "object" && (lengthOfDict(startYaml['nodes']) > lengthOfDict(endYaml['nodes']))) {
        // if we got an empty endYaml, remove all
        let removedNodes = []
        if (lengthOfDict(endYaml['nodes']) === 0) {
            removedNodes = Object.keys(startYaml['nodes'])
        } else {
            removedNodes = Object.keys(startYaml['nodes']).filter(x => Object.keys(endYaml['nodes']).indexOf(x) === -1);
        }

        for (let removedNode of removedNodes) {
            callEvent("nodeRemoved", document.nodes[removedNode])
            delete document.nodes[removedNode]
        }
    }
}

/**
 * Check the type has reached a valid string
 * @param type
 * @returns {boolean}
 */
function isValidType(type) {
    const valid = ["app", "db", "database", "application", "actor"]
    return valid.indexOf(type) >= 0;
}

/**
 * Return a line that appears to have the key we just edited
 * @param key
 * @param lines
 * @returns {null|number}
 */
function determineLineOfNode(key, lines) {
    let count = 0
    for (let l of lines) {
        if (cleanKeyLine(l) !== key) {
            count += 1
            continue
        }
        return count
    }
    return null
}

function cleanKeyLine(line) {
    return line.trim().replace(":", "")
}

function attemptEditChange(changes) {
    editor.lockEvents = true
    try {
        editor.dispatch(changes)
    } finally {
        editor.lockEvents = false
    }
}

/**
 * Return the child with a class attribute of "cm-activeLine"
 * @param v
 * @returns {number}
 */
function activeLineFromViewUpdate(v) {
    let count = 0
    for (let lv of v.view.docView.children) {
        if (lv.attrs === null || lv.attrs.length === 0) {
            count += 1
            continue
        }

        if (!lv.attrs.hasOwnProperty("class")) {
            count += 1
            continue
        }

        const classes = lv.attrs['class'].split(" ")
        for (let cl of classes) {
            if (cl === "cm-activeLine") {
                return count
            }
        }

        count += 1
        continue
    }
}

function formatConnections(cnxList) {
    let connections = {}
    if (cnxList === null) {
        return connections
    }

    for (let target of cnxList) {
        connections[target] = {
            id: null,
        }
    }

    return connections
}

function addConnectionToCode(key, cnx) {
    try {
        let docString = editor.viewState.state.doc.text.join("\n")
        let yaml = jsyaml.load(docString)

        if (!yaml['nodes'][key].hasOwnProperty("connections")) {
            yaml['nodes'][key]['connections'] = []
        }
        yaml['nodes'][key]['connections'].push(cnx)

        let newNodeBlock = (key + ":\n" + jsyaml.dump(yaml['nodes'][key])).replaceAll("\n", "\n    ")
        let re = new RegExp(`${key}:[ \na-zA-Z:-]+?(?=$|\n  ([a-zA-Z]+))`, 'ig')
        let match = re.exec(docString);

        attemptEditChange({changes: {from: match['index'], to: match['index'] + match[0].length, insert: newNodeBlock}})
    } catch (e) {
        console.log("Connection add: " + e)
    }
}

function renameNodeInCode(old_key, new_key) {
    try {
        let docString = editor.viewState.state.doc.text.join("\n")
        let changes = []
        let re = new RegExp(`[ -][ ]${old_key}[ \n:]`, 'ig')

        let matches = docString.matchAll(re)
        for (let m of matches) {
            let offset = m['index'] + 2
            changes.push({from: offset, to: offset + old_key.length, insert: new_key})
        }

        attemptEditChange({changes})
    } catch (e) {
        console.log("Node rename: " + e)
    }
}

function removeNodeFromCode(key) {
    try {
        let docString = editor.viewState.state.doc.text.join("\n")
        let re = new RegExp(`${key}:[ \na-zA-Z:\\-\x27]+?(?=$|\n+  ([a-zA-Z]+))`, 'ig')
        let match = re.exec(docString);

        attemptEditChange({changes: {from: match['index'], to: match['index'] + match[0].length, insert: null}})
    } catch (e) {
        console.log("Node removal: " + e)
    }
}

function addNodeToCode(node) {
    try {
        let nodeYaml ={
            type: node.type,
            // connections: [' '],
        }
        let newNodeBlock = "\n  "
        newNodeBlock += (node.name + ":\n" + jsyaml.dump(nodeYaml)).replaceAll("\n", "\n    ")
        let documentEnd = document.editor.viewState.state.doc.length

        attemptEditChange({changes: {from: documentEnd, to: documentEnd, insert: newNodeBlock}})
    } catch (e) {
        console.log("Node insertion: " + e)
    }
}

function renameConnections(old_key, new_key) {
    for (let key of Object.keys(document.nodes)) {
        if (document.nodes[key].connections.length === 0) {
            continue
        }

        for (let cnx of Object.keys(document.nodes[key].connections)) {
            if (cnx !== old_key) {
                continue
            }
            document.nodes[key].connections[new_key] = document.nodes[key].connections[old_key]
            delete document.nodes[key].connections[old_key]
        }
    }
}

window.onload = function () {
    const ctx = dioCtx()
    ctx.helpers.registerEventHandler(handleEvent)
}

window.eventHandler = handleEvent


/**
 * MOVE TO EVENTS
 */


function dioCtx() {
    return document.getElementById("dio").contentWindow.document
}

/**
 *
 * @param type
 * @param context
 */
function handleEvent(type, context) {
    let ctx = dioCtx()
    if (ctx.locked === true) {
        return
    }

    if (type === "labelChanged") {
        let old_key = context['event']['properties']['old']
        let new_key = context['event']['properties']['value']

        if (document.nodes.hasOwnProperty(old_key)) {
            renameNodeInCode(old_key, new_key)

            document.nodes[new_key] = {
                name: new_key,
                type: document.nodes[old_key]['type'],
                line: document.nodes[old_key]['line'],
                id: document.nodes[old_key].id,
                connections: document.nodes[old_key].connections
            }
            delete document.nodes[old_key];

            renameConnections(old_key, new_key)
        }
    }

    if (type === "cellConnected") {
        let edge = context['context']['properties']['edge']
        let source = edge['source']
        let target = edge['target']

        if (source === null || target === null) {
            return
        }

        if (document.nodes.hasOwnProperty(source['value'])) {
            document.nodes[source['value']].connections[target['value']] = {
                id: edge.id
            }

            addConnectionToCode(source['value'], target['value'])
        }
    }

    if (type === "cellsRemoved") {
        if (document.nodes === null || Object.keys(document.nodes) === 0) return;

        let cellsToRemove = context.context.properties.cells
        let nodes = {}
        for (let key of Object.keys(document.nodes)) {
            nodes[document.nodes[key].id] = document.nodes[key]
        }

        for (let cell of cellsToRemove) {
            // we found no node with that ID, delete away - no code change
            if (nodes[cell.id] == null) continue

            // remove the block and nodes entry
            removeNodeFromCode(cell.value)
            delete document.nodes[cell.value]
        }
    }

    if (type === "cellsAdded") {
        let cellsToAdd = context.context.properties.cells
        for (let cell of cellsToAdd) {
            if (cell.edge === true) {
                continue
            }

            let cellType = determineCellTypeFromStyling(cell.style)
            let key = cell.id

            document.nodes[key] = {
                name: key,
                id: cell.id,
                type: cellType,
                line: document.editor.viewState.state.doc.text.length,
                accepts: [],
                connections: {}
            }

            addNodeToCode(document.nodes[key])
            callEvent("nodeRenamed", {id: cell.id, name: key})
        }
    }
}

function determineCellTypeFromStyling(style) {
    if (style.indexOf("shape=umlActor") !== -1) return 'actor'
    if (style.indexOf("rounded=1") !== -1) return 'db'
    return 'app'
}

/**
 * Calls an event handler with ctx
 * @param type str
 * @param context
 */
function callEvent(type, context) {
    const ctx = dioCtx()

    if (type === "nodeAdded") {
        let cellId = null
        switch (context.type) {
            case "app":
            case "application":
                cellId = ctx.helpers.insertRectangle(context.name, 0)
                break
            case "db":
            case "database":
                cellId = ctx.helpers.insertRectangle(context.name, 1)
                break
            case "actor":
            case "person":
                cellId = ctx.helpers.insertActor(context.name)
                break
        }
        document.nodes[context.name].id = cellId
    }

    if (type === "nodeRenamed") {
        ctx.helpers.changeValueOfId(context.id, context.name)
    }

    if (type === "nodeRemoved") {
        ctx.helpers.removeCell(context.id)
    }

    if (type === "edgeAdded") {
        document.nodes[context['sourceName']].connections[context['targetName']] = {
            id: ctx.helpers.createEdge(context['source'], context['target'])
        }
    }
}
