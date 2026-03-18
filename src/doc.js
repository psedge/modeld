import yaml from 'js-yaml'

const INDENT2 = '        ' // 8 spaces = 2 indent levels

function serializeEntry(c) {
    if (typeof c === 'string') return '    - ' + c
    const [target] = Object.keys(c)
    const parts = ['    - ' + target + ':']
    if (c.from) parts.push('      from: ' + c.from)
    if (c.to)   parts.push('      to: '   + c.to)
    if (c.text) parts.push('      text: ' + c.text)
    return parts.join('\n')
}

function nodeBlock(key, nodeObj) {
    const { connections, ...rest } = nodeObj
    let body = yaml.dump(rest, { indent: 4 })
    if (connections && connections.length > 0)
        body += 'connections:\n' + connections.map(serializeEntry).join('\n') + '\n'
    return (key + ':\n' + body)
        .replaceAll('\n', '\n' + INDENT2).trimEnd()
}

function serializeDoc(doc) {
    const blocks = Object.entries(doc.nodes).map(([key, node]) => '    ' + nodeBlock(key, node))
    return 'nodes:\n' + blocks.join('\n') + '\n'
}

export function addNode(docString, node) {
    const doc = yaml.load(docString)
    if (!doc.nodes) doc.nodes = {}
    const entry = { type: node.type }
    if (node.meta) entry.meta = node.meta
    doc.nodes[node.name] = entry
    return serializeDoc(doc)
}

export function updateConnectionText(docString, key, target, text) {
    const doc = yaml.load(docString)
    if (!doc.nodes[key]?.connections) return docString
    doc.nodes[key].connections = doc.nodes[key].connections.map(c => {
        const t = typeof c === 'string' ? c : Object.keys(c)[0]
        if (t !== target) return c
        const entry = typeof c === 'string' ? { [target]: null } : { ...c }
        if (text) {
            entry.text = text
        } else {
            delete entry.text
        }
        if (!entry.from && !entry.to && !entry.text) return target
        return entry
    })
    return serializeDoc(doc)
}

export function removeNode(docString, key) {
    const doc = yaml.load(docString)
    delete doc.nodes[key]
    for (const node of Object.values(doc.nodes)) {
        if (!node.connections) continue
        node.connections = node.connections.filter(c =>
            (typeof c === 'string' ? c : Object.keys(c)[0]) !== key
        )
        if (node.connections.length === 0) delete node.connections
    }
    return serializeDoc(doc)
}

export function renameNode(docString, oldKey, newKey) {
    const doc = yaml.load(docString)
    const newNodes = {}
    for (const [key, node] of Object.entries(doc.nodes)) {
        newNodes[key === oldKey ? newKey : key] = node
    }
    for (const node of Object.values(newNodes)) {
        if (!node.connections) continue
        node.connections = node.connections.map(c => {
            if (typeof c === 'string') return c === oldKey ? newKey : c
            const [target] = Object.keys(c)
            if (target !== oldKey) return c
            const { [target]: _, ...rest } = c
            return { [newKey]: null, ...rest }
        })
    }
    doc.nodes = newNodes
    return serializeDoc(doc)
}

export function addConnection(docString, key, target, from, to) {
    const doc = yaml.load(docString)
    if (!doc.nodes[key].connections) doc.nodes[key].connections = []
    const already = doc.nodes[key].connections.some(c =>
        (typeof c === 'string' ? c : Object.keys(c)[0]) === target
    )
    if (already) return docString
    let entry = target
    if (from || to) {
        entry = { [target]: null }
        if (from) entry.from = from
        if (to) entry.to = to
    }
    doc.nodes[key].connections.push(entry)
    return serializeDoc(doc)
}

export function removeConnection(docString, key, target) {
    const doc = yaml.load(docString)
    if (!doc.nodes[key] || !doc.nodes[key].connections) return docString
    doc.nodes[key].connections = doc.nodes[key].connections.filter(c => {
        if (typeof c === 'string') return c !== target
        return Object.keys(c)[0] !== target
    })
    if (doc.nodes[key].connections.length === 0) delete doc.nodes[key].connections
    return serializeDoc(doc)
}

export function updateGeometry(docString, key, x, y, width, height) {
    const doc = yaml.load(docString)
    doc.nodes[key].meta = {
        ...(doc.nodes[key].meta ?? {}),
        pos:  `${Math.round(x)},${Math.round(y)}`,
        size: `${Math.round(width)},${Math.round(height)}`
    }
    return serializeDoc(doc)
}

export function updateNodeLabel(docString, key, label) {
    const doc = yaml.load(docString)
    if (!doc.nodes[key]) return docString
    if (label) {
        doc.nodes[key].label = label
    } else {
        delete doc.nodes[key].label
    }
    return serializeDoc(doc)
}

export function updateNodeStyle(docString, key, style) {
    const doc = yaml.load(docString)
    if (!doc.nodes[key]) return docString
    doc.nodes[key].meta = {
        ...(doc.nodes[key].meta ?? {}),
        style
    }
    return serializeDoc(doc)
}

export function updateNodeStyleAndRotation(docString, key, style) {
    const doc = yaml.load(docString)
    if (!doc.nodes[key]) return docString
    const rotMatch = style.match(/rotation=([^;]+)/)
    const rotation = rotMatch ? parseFloat(rotMatch[1]) : null
    const cleanStyle = style.replace(/rotation=[^;]+;?/, '').replace(/;;+/g, ';').replace(/^;/, '')
    doc.nodes[key].meta = { ...(doc.nodes[key].meta ?? {}) }
    if (cleanStyle) {
        doc.nodes[key].meta.style = cleanStyle
    } else {
        delete doc.nodes[key].meta.style
    }
    if (rotation !== null) {
        doc.nodes[key].meta.rotation = rotation
    } else {
        delete doc.nodes[key].meta.rotation
    }
    return serializeDoc(doc)
}
