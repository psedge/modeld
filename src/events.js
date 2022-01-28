import {dioCtx} from "./app"
import * as code from "./code";
import * as helpers from "./helpers";
import * as diagram from "./diagram";

/**
 * Calls an event handler with ctx
 * @param type str
 * @param context
 */
export function callEvent(type, context) {
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

    if (type === "edgeUpdated") {
        // let origCnx = document.nodes[context['sourceName']].connections[context['targetName']]
        // origCnx.id = ctx.helpers.createEdge(context['source'], context['target'])
        document.nodes[context['sourceName']].connections[context['targetName']] = context.cnx
    }
}

/**
 *
 * @param type
 * @param context
 */
export function handleEvent(type, context) {
    let ctx = dioCtx()
    if (ctx.locked === true) {
        return
    }

    if (type === "labelChanged") {
        let old_key = context['event']['properties']['old']
        let new_key = context['event']['properties']['value']

        if (document.nodes.hasOwnProperty(old_key)) {
            code.renameNodeInCode(old_key, new_key)

            document.nodes[new_key] = {
                name: new_key,
                type: document.nodes[old_key]['type'],
                line: document.nodes[old_key]['line'],
                id: document.nodes[old_key].id,
                trust: document.nodes[old_key]['trust'],
                connections: document.nodes[old_key].connections
            }
            delete document.nodes[old_key];

            helpers.renameConnections(old_key, new_key)
        }
    }

    if (type === "cellConnected") {
        let edge = context['context']['properties']['edge']
        let source = edge['source']
        let target = edge['target']

        if (source === null || target === null) {
            return
        }

        if (document.nodes.hasOwnProperty(source.value)) {
            if (document.nodes[source.value].connections.hasOwnProperty(target.value) &&
                document.nodes[source.value].connections[target.value].id === edge.id) {
                return
            }

            document.nodes[source.value].connections[target.value] = {
                id: edge.id
            }
            code.addConnectionToCode(source.value, target.value)
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
            code.removeNodeFromCode(cell.value)
            delete document.nodes[cell.value]
        }
    }

    if (type === "cellsAdded") {
        let cellsToAdd = context.context.properties.cells
        for (let cell of cellsToAdd) {
            if (cell.edge === true) {
                continue
            }

            let cellType = diagram.determineCellTypeFromStyling(cell.style)
            let key = cell.id

            document.nodes[key] = {
                name: key,
                id: cell.id,
                type: cellType,
                line: document.editor.viewState.state.doc.text.length,
                trust: null,
                accepts: [],
                connections: {}
            }

            code.addNodeToCode(document.nodes[key])
            callEvent("nodeRenamed", {id: cell.id, name: key})
        }
    }
}
