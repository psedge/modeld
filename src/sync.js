import { formatConnections } from './helpers'
import { VALID_TYPES } from './consts'

/**
 * Compute diagram events needed to bring the diagram in sync with new YAML.
 * Pure: no side effects, no DOM/editor access.
 *
 * @param {object} newNodes     - parsed yaml.nodes (may be {})
 * @param {object} currentNodes - snapshot of document.nodes
 * @param {string} action       - 'insert' | 'removal'
 * @returns {Array<{type: string, ...}>}
 */
export function diffNodes(newNodes, currentNodes, action = 'insert') {
    const events = []

    if (action === 'removal') {
        for (const key of Object.keys(currentNodes)) {
            if (!newNodes.hasOwnProperty(key)) {
                events.push({ type: 'nodeRemoved', name: key, node: currentNodes[key] })
            }
        }
    }

    if (action === 'insert') {
        for (const key of Object.keys(newNodes)) {
            const n = newNodes[key]
            if (!currentNodes.hasOwnProperty(key) && n?.type && VALID_TYPES.includes(n.type)) {
                events.push({
                    type: 'nodeAdded',
                    name: key,
                    nodeType: n.type,
                    trust: n.trust ?? null,
                    accepts: n.accepts ?? [],
                    meta: n.meta ?? null,
                })
            }
        }
    }

    for (const key of Object.keys(newNodes)) {
        if (!currentNodes.hasOwnProperty(key)) continue
        const n = newNodes[key]

        if (n?.meta && currentNodes[key].id) {
            const pos = parseVec(n.meta.pos)
            const size = parseVec(n.meta.size)
            if (pos && size) {
                events.push({ type: 'geometryUpdated', id: currentNodes[key].id, x: pos.x, y: pos.y, width: size.x, height: size.y })
            }
        }

        const candidates = n.connections
            ? formatConnections(key, n.connections, currentNodes)
            : {}
        for (const target of Object.keys(candidates)) {
            if (!currentNodes[key].connections.hasOwnProperty(target) && currentNodes.hasOwnProperty(target)) {
                events.push({ type: 'edgeAdded', sourceName: key, source: currentNodes[key].id, targetName: target, target: currentNodes[target].id, from: candidates[target].from, to: candidates[target].to })
            } else if (currentNodes.hasOwnProperty(target)) {
                events.push({ type: 'edgeUpdated', sourceName: key, targetName: target, cnx: candidates[target] })
            }
        }

        for (const target of Object.keys(currentNodes[key].connections)) {
            if (!candidates.hasOwnProperty(target)) {
                const id = currentNodes[key].connections[target].id
                if (id) {
                    events.push({ type: 'edgeRemoved', sourceName: key, targetName: target, id })
                }
            }
        }
    }

    return events
}

function parseVec(str) {
    if (!str) return null
    const [x, y] = str.toString().split(',').map(Number)
    return isNaN(x) || isNaN(y) ? null : { x, y }
}
