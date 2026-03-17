/**
 *
 * @param dict
 * @returns {number}
 */
export function lengthOfDict(dict) {
    try {
        return Object.keys(dict).length
    } catch (e) {
        return 0
    }
}

/**
 * Extract meaningful contents from connections yaml + document.nodes state
 *
 * @param key
 * @param cnxList
 * @returns {{}}
 */
export function formatConnections(key, cnxList, nodes = null) {
    const _nodes = nodes ?? document.nodes
    let connections = {}
    if (cnxList === null) {
        return connections
    }

    for (let target of cnxList) {
        if (target === null) continue

        let targetKey = null
        let id, text, type = null

        if (typeof(target) == 'string') {
            targetKey = target
            text = null
            type = null
        } else {
            targetKey = Object.keys(target)[0]
            id = null
            text = target.hasOwnProperty('text') ? target.text : null
            type = target.hasOwnProperty('type') ? target.type : null
        }

        if (_nodes[key].connections.hasOwnProperty(targetKey) && _nodes.hasOwnProperty(targetKey))
            id = _nodes[key].connections[targetKey].id

        connections[targetKey] = {
            id: id,
            text: text,
            type: type,
            from: (typeof target === 'object' && target.from) ? target.from : null,
            to:   (typeof target === 'object' && target.to)   ? target.to   : null,
        }
    }

    return connections
}

/**
 *
 * @param old_key
 * @param new_key
 */
export function renameConnections(old_key, new_key, nodes = null) {
    const _nodes = nodes ?? document.nodes
    for (let key of Object.keys(_nodes)) {
        if (_nodes[key].connections.length === 0) {
            continue
        }

        for (let cnx of Object.keys(_nodes[key].connections)) {
            if (cnx !== old_key) {
                continue
            }
            _nodes[key].connections[new_key] = _nodes[key].connections[old_key]
            delete _nodes[key].connections[old_key]
        }
    }
}
