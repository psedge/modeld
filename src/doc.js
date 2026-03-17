import yaml from 'js-yaml'

const INDENT2 = '        ' // 8 spaces = 2 indent levels

function nodeBlock(key, nodeObj) {
    return (key + ':\n' + yaml.dump(nodeObj, { indent: 4 }))
        .replaceAll('\n', '\n' + INDENT2).trimEnd()
        .replaceAll(': null', '')
}

function nodeBlockRegex(key) {
    return new RegExp(`${key}:(["a-zA-Z0-9:.'?,\\- \\n]+?)(?=($|\\n[ ]{4}[a-z]))`, 'ig')
}

export function addNode(docString, node) {
    const nodeObj = { type: node.type }
    const block = '\n    ' + nodeBlock(node.name, nodeObj)
    return docString + block
}

export function removeNode(docString, key) {
    const re = new RegExp(`${key}:[ \\na-zA-Z0-9:\\-\x27]+?(?=$|\\n+    ([a-zA-Z]+))`, 'ig')
    const match = re.exec(docString)
    if (!match) return docString
    return docString.slice(0, match.index) + docString.slice(match.index + match[0].length)
}

export function renameNode(docString, oldKey, newKey) {
    const re = new RegExp(`(?<=[ -] )${oldKey}(?=[ \\n:])`, 'g')
    return docString.replace(re, newKey)
}

export function addConnection(docString, key, target, from, to) {
    const doc = yaml.load(docString)
    if (!doc.nodes[key].connections) doc.nodes[key].connections = []
    let entry = target
    if (from || to) {
        entry = { [target]: null }
        if (from) entry.from = from
        if (to) entry.to = to
    }
    doc.nodes[key].connections.push(entry)
    const newBlock = nodeBlock(key, doc.nodes[key])
    const re = nodeBlockRegex(key)
    const match = re.exec(docString)
    if (!match) return docString
    return docString.slice(0, match.index) + newBlock + docString.slice(match.index + match[0].length)
}

export function removeConnection(docString, key, target) {
    const doc = yaml.load(docString)
    if (!doc.nodes[key] || !doc.nodes[key].connections) return docString
    doc.nodes[key].connections = doc.nodes[key].connections.filter(c => {
        if (typeof c === 'string') return c !== target
        return Object.keys(c)[0] !== target
    })
    if (doc.nodes[key].connections.length === 0) delete doc.nodes[key].connections
    const newBlock = nodeBlock(key, doc.nodes[key])
    const re = nodeBlockRegex(key)
    const match = re.exec(docString)
    if (!match) return docString
    return docString.slice(0, match.index) + newBlock + docString.slice(match.index + match[0].length)
}

export function updateGeometry(docString, key, x, y, width, height) {
    const doc = yaml.load(docString)
    doc.nodes[key].meta = {
        pos: `${Math.round(x)},${Math.round(y)}`,
        size: `${Math.round(width)},${Math.round(height)}`
    }
    const newBlock = nodeBlock(key, doc.nodes[key])
    const re = nodeBlockRegex(key)
    const match = re.exec(docString)
    if (!match) return docString
    return docString.slice(0, match.index) + newBlock + docString.slice(match.index + match[0].length)
}
