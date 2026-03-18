import {drawioCtx, pushYamlHistory, undoYaml} from "./app"
import * as code from "./code";
import * as helpers from "./helpers";
import * as diagram from "./diagram";

/** Look up a node's YAML key by its draw.io cell ID. */
function keyById(cellId) {
    if (!cellId) return null
    for (const [k, n] of Object.entries(document.nodes)) {
        if (n.id === cellId) return k
    }
    return null
}

/**
 * Calls an event handler with ctx
 * @param type str
 * @param context
 */
export function callEvent(type, context) {
    const ctx = drawioCtx()

    if (type === "nodeAdded") {
        const displayName = context.label ?? context.name
        const prevFocus = document.activeElement
        let cellId = null
        switch (context.type) {
            case "app":
            case "application":
                cellId = ctx.helpers.insertRectangle(displayName, 0)
                break
            case "db":
            case "database":
                cellId = ctx.helpers.insertRectangle(displayName, 1)
                break
            case "actor":
            case "person":
                cellId = ctx.helpers.insertActor(displayName)
                break
            case "boundary":
                cellId = ctx.helpers.insertBoundary(displayName)
                break
            case "generic":
                cellId = ctx.helpers.insertShape(displayName, context.meta?.style ?? context.meta?.template ?? null)
                break
        }
        prevFocus?.focus?.()
        document.nodes[context.name].id = cellId
        // Apply stored style override (covers non-generic types whose style was changed)
        if (context.meta?.style && cellId) {
            ctx.helpers.changeCellStyle(cellId, context.meta.style)
        }
    }

    if (type === "nodeRenamed") {
        ctx.helpers.changeValueOfId(context.id, context.name)
    }

    if (type === "nodeRemoved") {
        ctx.helpers.removeCell(context.id)
    }

    if (type === "edgeAdded") {
        document.nodes[context['sourceName']].connections[context['targetName']] = {
            id: ctx.helpers.createEdge(context['source'], context['target'], context.from, context.to, context.text, context.targetPos),
            from: context.from,
            to: context.to,
            text: context.text ?? null
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

    if (type === "styleUpdated") {
        ctx.helpers.changeCellStyle(context.id, context.style)
    }

    if (type === "rotationUpdated") {
        ctx.helpers.setCellRotation(context.id, context.rotation)
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

    if (type === 'undo') {
        undoYaml()
        return
    }

    pushYamlHistory()

    if (type === "cellStyleChanged") {
        const { cell, style } = context
        for (const [name, node] of Object.entries(document.nodes)) {
            if (node.id === cell.id) {
                code.updateNodeStyleInCode(name, style)
                node.meta = { ...(node.meta ?? {}), style }
                return
            }
        }
        // Not a tracked node (e.g. edge) — ignore
        return
    }

    if (type === "labelChanged") {
        const cell = context['event']['properties']['cell']

        if (cell?.edge === true) {
            const newText = context['event']['properties']['value'] || ''
            for (const [sName, sNode] of Object.entries(document.nodes)) {
                for (const [tName, cnx] of Object.entries(sNode.connections)) {
                    if (cnx.id === cell.id) {
                        code.updateConnectionTextInCode(sName, tName, newText)
                        cnx.text = newText || null
                        return
                    }
                }
            }
            return
        }

        // Find the node by cell ID first
        let nodeKey = null
        for (const [k, n] of Object.entries(document.nodes)) {
            if (n.id === cell.id) { nodeKey = k; break }
        }

        // Node has a label field — update it rather than renaming the key
        if (nodeKey && 'label' in document.nodes[nodeKey]) {
            const newLabel = context['event']['properties']['value'] || null
            code.updateNodeLabelInCode(nodeKey, newLabel)
            if (newLabel) {
                document.nodes[nodeKey].label = newLabel
            } else {
                delete document.nodes[nodeKey].label
            }
            return
        }

        // No label field — rename the node key (existing behaviour)
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

        // Find any existing recording of this edge (handles reconnection/move)
        let prevSrc = null, prevTgt = null
        outer: for (const [sName, sNode] of Object.entries(document.nodes)) {
            for (const [tName, cnx] of Object.entries(sNode.connections)) {
                if (cnx.id === edge.id) { prevSrc = sName; prevTgt = tName; break outer }
            }
        }

        const srcName = keyById(source?.id)
        const tgtName = keyById(target?.id)

        // Compute new from/to before any early-return so side changes are caught
        let from = diagram.sideFromStyle(edge.style, 'exit')
        let to   = diagram.sideFromStyle(edge.style, 'entry')
        if ((!from || !to) && source && target) {
            const inferred = diagram.inferSides(source, target)
            if (inferred) {
                from = from || inferred.from
                to   = to   || inferred.to
            }
        }

        // No change if same endpoints AND same sides
        if (prevSrc === srcName && prevTgt === tgtName) {
            const existing = prevSrc ? document.nodes[prevSrc]?.connections[prevTgt] : null
            if (existing?.from === from && existing?.to === to) return
        }

        // Remove old recording if the edge was previously connected
        if (prevSrc !== null) {
            code.removeConnectionFromCode(prevSrc, prevTgt)
            delete document.nodes[prevSrc].connections[prevTgt]
        }

        // Source must be a known node
        if (!srcName || !document.nodes.hasOwnProperty(srcName)) return

        if (tgtName === null) {
            // Dangling edge: record the floating endpoint position
            const geo = edge.getGeometry()
            const pt = geo?.targetPoint
            if (pt) {
                const posKey = `pos:${Math.round(pt.x)},${Math.round(pt.y)}`
                document.nodes[srcName].connections[posKey] = { id: edge.id }
                code.addConnectionToCode(srcName, posKey, null, null)
            }
            return
        }

        if (!document.nodes.hasOwnProperty(tgtName)) return

        document.nodes[srcName].connections[tgtName] = { id: edge.id, from, to }
        code.addConnectionToCode(srcName, tgtName, from, to)
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
            const docNode = nodes[cell.id]
            if (docNode != null) {
                code.removeNodeFromCode(docNode.name)
                delete document.nodes[docNode.name]
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
            let nodeKey = null
            for (const [k, n] of Object.entries(document.nodes)) {
                if (n.id === cell.id) { nodeKey = k; break }
            }
            if (!nodeKey) continue
            let geo = cell.getGeometry()
            if (!geo) continue
            code.updateNodeGeometryInCode(nodeKey, geo.x, geo.y, geo.width, geo.height)
        }
    }

    if (type === "connectionCreated") {
        // mxEvent.CONNECT fires on the connection handler after geo.setTerminalPoint()
        // has been called — the only moment targetPoint is guaranteed set for new
        // dangling edges (CELL_CONNECTED and CELLS_ADDED both fire before that).
        const props = context.context.properties
        const edge = props.cell
        if (props.terminal != null) return  // connected edge; CELL_CONNECTED handles it (loose != catches undefined too)
        const srcName = keyById(edge.source?.id)
        if (!srcName || !document.nodes.hasOwnProperty(srcName)) return
        const geo = edge.getGeometry()
        const pt = geo?.targetPoint
        if (!pt) return
        const posKey = `pos:${Math.round(pt.x)},${Math.round(pt.y)}`
        const from = diagram.sideFromStyle(edge.style, 'exit')
        document.nodes[srcName].connections[posKey] = { id: edge.id }
        code.addConnectionToCode(srcName, posKey, from || null, null)
        return
    }

    if (type === "cellsAdded") {
        let cellsToAdd = context.context.properties.cells
        for (let cell of cellsToAdd) {
            // Skip edge label cells (child vertices of edges)
            if (cell.parent?.edge === true) continue

            if (cell.edge === true) {
                // Edges (dangling or connected) are handled by cellConnected /
                // connectionCreated — nothing to do here for the YAML side.
                continue
            }

            let cellType = diagram.determineCellTypeFromStyling(cell.style)
            let key = cell.id
            const geo = cell.getGeometry()
            const meta = geo ? {
                pos:  `${Math.round(geo.x)},${Math.round(geo.y)}`,
                size: `${Math.round(geo.width)},${Math.round(geo.height)}`,
                // Store style for generic shapes (it IS the template) so reload is faithful
                ...(cellType === 'generic' && cell.style ? { style: cell.style } : {})
            } : null

            document.nodes[key] = {
                name: key,
                id: cell.id,
                type: cellType,
                meta,
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
