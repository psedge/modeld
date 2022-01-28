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
export function formatConnections(key, cnxList) {
    let connections = {}
    if (cnxList === null) {
        return connections
    }

    for (let target of cnxList) {
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

        if (document.nodes[key].connections.hasOwnProperty(targetKey) && document.nodes.hasOwnProperty(targetKey))
            id = document.nodes[key].connections[targetKey].id

        connections[targetKey] = {
            id: id,
            text: text,
            type: type,
        }
    }

    return connections
}

/**
 *
 * @param old_key
 * @param new_key
 */
export function renameConnections(old_key, new_key) {
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
