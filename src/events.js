import {drawioCtx} from "./app"
import * as code from "./code";
import * as helpers from "./helpers";
import * as diagram from "./diagram";

/**
 * Calls an event handler with ctx
 * @param type str
 * @param context
 */
export function callEvent(type, context) {
    const ctx = drawioCtx()

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
            case "generic":
                cellId = ctx.helpers.insertShape(context.name, context.meta?.template ?? null)
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
            id: ctx.helpers.createEdge(context['source'], context['target'], context.from, context.to)
        }
    }

    if (type === "edgeUpdated") {
        // let origCnx = document.nodes[context['sourceName']].connections[context['targetName']]
        // origCnx.id = ctx.helpers.createEdge(context['source'], context['target'])
        document.nodes[context['sourceName']].connections[context['targetName']] = context.cnx
    }

    if (type === "edgeRemoved") {
        ctx.helpers.removeCell(context.id)
    }

    if (type === "geometryUpdated") {
        ctx.helpers.setCellGeometry(context.id, context.x, context.y, context.width, context.height)
    }
}

/**
 *
 * @param type
 * @param context
 */
export function handleEvent(type, context) {
    let ctx = drawioCtx()
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
            let from = diagram.sideFromStyle(edge.style, 'exit')
            let to   = diagram.sideFromStyle(edge.style, 'entry')
            if (!from || !to) {
                const inferred = diagram.inferSides(source, target)
                if (inferred) {
                    from = from || inferred.from
                    to   = to   || inferred.to
                }
            }
            code.addConnectionToCode(source.value, target.value, from, to)
        }
    }

    if (type === "cellsRemoved") {
        if (document.nodes === null || Object.keys(document.nodes) === 0) return;

        let cellsToRemove = context.context.properties.cells
        let nodes = {}
        for (let key of Object.keys(document.nodes)) {
            nodes[document.nodes[key].id] = document.nodes[key]
        }

        let edges = {}
        for (let sourceName of Object.keys(document.nodes)) {
            for (let targetName of Object.keys(document.nodes[sourceName].connections)) {
                const id = document.nodes[sourceName].connections[targetName].id
                if (id) edges[id] = { sourceName, targetName }
            }
        }

        for (let cell of cellsToRemove) {
            if (nodes[cell.id] != null) {
                code.removeNodeFromCode(cell.value)
                delete document.nodes[cell.value]
            } else if (edges[cell.id] != null) {
                const { sourceName, targetName } = edges[cell.id]
                code.removeConnectionFromCode(sourceName, targetName)
                delete document.nodes[sourceName].connections[targetName]
            }
        }
    }

    if (type === "cellsMoved" || type === "cellsResized") {
        let cells = context.context.properties.cells
        for (let cell of cells) {
            if (cell.edge === true) continue
            if (!document.nodes.hasOwnProperty(cell.value)) continue
            let geo = cell.getGeometry()
            if (!geo) continue
            code.updateNodeGeometryInCode(cell.value, geo.x, geo.y, geo.width, geo.height)
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
                line: code.getLines().length,
                trust: null,
                accepts: [],
                connections: {}
            }

            code.addNodeToCode(document.nodes[key])
            callEvent("nodeRenamed", {id: cell.id, name: key})
        }
    }
}
