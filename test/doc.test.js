import { describe, it, expect } from 'vitest'
import yaml from 'js-yaml'
import { addNode, removeNode, addConnection, removeConnection, updateGeometry, renameNode, updateConnectionText, updateNodeStyle, updateNodeStyleAndRotation, updateNodeLabel } from '../src/doc'

// ─── helpers ────────────────────────────────────────────────────────────────

function parse(docString) {
    return yaml.load(docString)
}

function connections(docString, key) {
    return parse(docString).nodes[key]?.connections ?? []
}

function cnxTargets(cnxList) {
    return cnxList.map(c => typeof c === 'string' ? c : Object.keys(c)[0])
}

// Every result from a doc operation must satisfy these invariants
function assertValid(result, { nodeCount } = {}) {
    expect(() => parse(result), 'must be valid YAML').not.toThrow()
    const doc = parse(result)
    expect(doc.nodes, 'nodes key must exist').toBeDefined()
    if (nodeCount !== undefined)
        expect(Object.keys(doc.nodes).length, 'node count').toBe(nodeCount)
    for (const [key, node] of Object.entries(doc.nodes)) {
        expect(typeof node.type, `${key}.type must be a string`).toBe('string')
        if (node.meta) {
            if (node.meta.pos  !== undefined) expect(typeof node.meta.pos,  `${key}.meta.pos`).toBe('string')
            if (node.meta.size !== undefined) expect(typeof node.meta.size, `${key}.meta.size`).toBe('string')
            if (node.meta.style !== undefined) expect(typeof node.meta.style, `${key}.meta.style`).toBe('string')
        }
        if (node.connections) {
            const targets = cnxTargets(node.connections)
            expect(new Set(targets).size, `${key} must not have duplicate connection targets`).toBe(targets.length)
        }
    }
}

// ─── fixtures ───────────────────────────────────────────────────────────────

const MINIMAL = `nodes:
    a:
        type: actor
    b:
        type: app
`

const FULL = `nodes:
    customer:
        type: actor
        meta:
            pos: 60,200
            size: 40,60
    frontend:
        type: app
        meta:
            pos: 200,180
            size: 120,60
        connections:
            - backend:
              from: right
              to: left
    backend:
        type: application
        meta:
            pos: 420,180
            size: 120,60
        connections:
            - database:
              from: right
              to: left
    database:
        type: db
        meta:
            pos: 640,180
            size: 120,60
`

// ─── addNode ─────────────────────────────────────────────────────────────────

describe('addNode', () => {
    it('adds the new node', () => {
        const r = addNode(MINIMAL, { name: 'c', type: 'db' })
        assertValid(r, { nodeCount: 3 })
        expect(parse(r).nodes.c.type).toBe('db')
    })

    it('adds a boundary node', () => {
        const r = addNode(MINIMAL, { name: 'internal-zone', type: 'boundary' })
        assertValid(r, { nodeCount: 3 })
        expect(parse(r).nodes['internal-zone'].type).toBe('boundary')
    })

    it('stores meta when provided', () => {
        const r = addNode(MINIMAL, { name: 'c', type: 'app', meta: { pos: '100,200', size: '120,60' } })
        assertValid(r, { nodeCount: 3 })
        expect(parse(r).nodes.c.meta.pos).toBe('100,200')
        expect(parse(r).nodes.c.meta.size).toBe('120,60')
    })

    it('omits meta key when not provided', () => {
        const r = addNode(MINIMAL, { name: 'c', type: 'app' })
        expect(parse(r).nodes.c.meta).toBeUndefined()
    })

    it('preserves all existing nodes', () => {
        const r = addNode(FULL, { name: 'proxy', type: 'app' })
        assertValid(r, { nodeCount: 5 })
        for (const key of ['customer', 'frontend', 'backend', 'database'])
            expect(parse(r).nodes).toHaveProperty(key)
    })

    it('preserves existing connections', () => {
        const r = addNode(FULL, { name: 'proxy', type: 'app' })
        const doc = parse(r)
        expect(cnxTargets(doc.nodes.frontend.connections)).toContain('backend')
        expect(cnxTargets(doc.nodes.backend.connections)).toContain('database')
    })
})

// ─── removeNode ──────────────────────────────────────────────────────────────

describe('removeNode', () => {
    it('removes the target node', () => {
        const r = removeNode(FULL, 'database')
        assertValid(r, { nodeCount: 3 })
        expect(parse(r).nodes).not.toHaveProperty('database')
    })

    it('preserves all other nodes', () => {
        const r = removeNode(FULL, 'database')
        for (const key of ['customer', 'frontend', 'backend'])
            expect(parse(r).nodes).toHaveProperty(key)
    })

    it('preserves unrelated connections', () => {
        const r = removeNode(FULL, 'database')
        expect(cnxTargets(parse(r).nodes.frontend.connections)).toContain('backend')
    })

    it('removing a non-existent key returns unchanged doc', () => {
        const r = removeNode(FULL, 'ghost')
        assertValid(r, { nodeCount: 4 })
        expect(parse(r)).toEqual(parse(FULL))
    })
})

// ─── addConnection ───────────────────────────────────────────────────────────

describe('addConnection', () => {
    it('adds a simple connection (no from/to)', () => {
        const r = addConnection(MINIMAL, 'a', 'b', null, null)
        assertValid(r, { nodeCount: 2 })
        expect(cnxTargets(connections(r, 'a'))).toContain('b')
    })

    it('adds a connection with from and to', () => {
        const r = addConnection(MINIMAL, 'a', 'b', 'right', 'left')
        assertValid(r, { nodeCount: 2 })
        const entry = connections(r, 'a').find(c => typeof c === 'object' && Object.keys(c)[0] === 'b')
        expect(entry).toBeDefined()
        expect(entry.from).toBe('right')
        expect(entry.to).toBe('left')
    })

    it('adds a connection with only from set', () => {
        const r = addConnection(MINIMAL, 'a', 'b', 'top', null)
        assertValid(r)
        const entry = connections(r, 'a').find(c => typeof c === 'object' && Object.keys(c)[0] === 'b')
        expect(entry.from).toBe('top')
        expect(entry.to).toBeUndefined()
    })

    it('does not bleed other node properties into source node', () => {
        const r = addConnection(FULL, 'customer', 'frontend', 'right', 'left')
        assertValid(r, { nodeCount: 4 })
        const doc = parse(r)
        expect(doc.nodes.customer.type).toBe('actor')
        expect(doc.nodes.customer.meta.pos).toBe('60,200')
        // customer must not inherit frontend's meta or connections
        expect(doc.nodes.customer.meta.pos).not.toBe('200,180')
    })

    it('preserves all other nodes and their connections', () => {
        const r = addConnection(FULL, 'customer', 'frontend', 'right', 'left')
        const doc = parse(r)
        expect(doc.nodes.frontend.type).toBe('app')
        expect(doc.nodes.frontend.meta.pos).toBe('200,180')
        expect(cnxTargets(doc.nodes.frontend.connections)).toContain('backend')
        expect(cnxTargets(doc.nodes.backend.connections)).toContain('database')
    })

    it('adding to a node that already has connections appends', () => {
        const r = addConnection(FULL, 'frontend', 'customer', 'left', 'right')
        const targets = cnxTargets(connections(r, 'frontend'))
        expect(targets).toContain('backend')
        expect(targets).toContain('customer')
        assertValid(r, { nodeCount: 4 })
    })

    it('adding a connection where source name appears in another connection is safe', () => {
        // 'backend' appears as a connection target in frontend — adding a connection
        // from backend itself must not corrupt the document
        const r = addConnection(FULL, 'backend', 'customer', 'left', 'right')
        assertValid(r, { nodeCount: 4 })
        expect(parse(r).nodes.backend.type).toBe('application')
        expect(cnxTargets(connections(r, 'backend'))).toContain('database')
        expect(cnxTargets(connections(r, 'backend'))).toContain('customer')
    })
})

// ─── removeConnection ─────────────────────────────────────────────────────────

describe('removeConnection', () => {
    it('removes the specified connection', () => {
        const r = removeConnection(FULL, 'frontend', 'backend')
        assertValid(r, { nodeCount: 4 })
        expect(cnxTargets(connections(r, 'frontend'))).not.toContain('backend')
    })

    it('removes connections key when last connection is removed', () => {
        const r = removeConnection(FULL, 'frontend', 'backend')
        expect(parse(r).nodes.frontend.connections).toBeUndefined()
    })

    it('preserves other connections on the same node', () => {
        const two = addConnection(FULL, 'frontend', 'customer', 'left', 'right')
        const r = removeConnection(two, 'frontend', 'backend')
        expect(cnxTargets(connections(r, 'frontend'))).toContain('customer')
    })

    it('preserves all other nodes unchanged', () => {
        const r = removeConnection(FULL, 'backend', 'database')
        const doc = parse(r)
        expect(doc.nodes.frontend.type).toBe('app')
        expect(cnxTargets(doc.nodes.frontend.connections)).toContain('backend')
    })

    it('removing a non-existent connection returns unchanged doc', () => {
        const r = removeConnection(FULL, 'customer', 'ghost')
        assertValid(r, { nodeCount: 4 })
        expect(parse(r)).toEqual(parse(FULL))
    })
})

// ─── updateGeometry ───────────────────────────────────────────────────────────

describe('updateGeometry', () => {
    it('updates pos and size', () => {
        const r = updateGeometry(FULL, 'customer', 100, 200, 50, 70)
        assertValid(r, { nodeCount: 4 })
        expect(parse(r).nodes.customer.meta.pos).toBe('100,200')
        expect(parse(r).nodes.customer.meta.size).toBe('50,70')
    })

    it('rounds float values', () => {
        const r = updateGeometry(FULL, 'frontend', 10.7, 20.3, 100.9, 50.1)
        expect(parse(r).nodes.frontend.meta.pos).toBe('11,20')
        expect(parse(r).nodes.frontend.meta.size).toBe('101,50')
    })

    it('does not bleed geometry from updated node into others', () => {
        const r = updateGeometry(FULL, 'customer', 999, 888, 50, 60)
        const doc = parse(r)
        expect(doc.nodes.frontend.meta.pos).toBe('200,180')
        expect(doc.nodes.backend.meta.pos).toBe('420,180')
    })

    it('preserves connections on updated node', () => {
        const r = updateGeometry(FULL, 'frontend', 250, 190, 120, 60)
        expect(cnxTargets(connections(r, 'frontend'))).toContain('backend')
    })

    it('preserves connections on all other nodes', () => {
        const r = updateGeometry(FULL, 'customer', 100, 200, 40, 60)
        expect(cnxTargets(connections(r, 'backend'))).toContain('database')
    })
})

// ─── renameNode ───────────────────────────────────────────────────────────────

describe('renameNode', () => {
    it('renames the node key', () => {
        const r = renameNode(FULL, 'frontend', 'ui')
        assertValid(r, { nodeCount: 4 })
        expect(parse(r).nodes).toHaveProperty('ui')
        expect(parse(r).nodes).not.toHaveProperty('frontend')
    })

    it('updates connection references to the renamed node', () => {
        const r = renameNode(FULL, 'frontend', 'ui')
        const targets = cnxTargets(connections(r, 'backend'))
        // backend's connections reference frontend — should now reference ui
        // (note: in FULL, backend connects to database, not frontend; use a fixture where it does)
        const doc = parse(r)
        // frontend's own connections (now ui) should still be intact
        expect(cnxTargets(doc.nodes.ui.connections)).toContain('backend')
    })

    it('updates connection references in other nodes', () => {
        // Add a connection that points to 'frontend', then rename it
        const withCnx = addConnection(FULL, 'backend', 'frontend', 'left', 'right')
        const r = renameNode(withCnx, 'frontend', 'ui')
        assertValid(r, { nodeCount: 4 })
        const targets = cnxTargets(connections(r, 'backend'))
        expect(targets).toContain('ui')
        expect(targets).not.toContain('frontend')
    })

    it('preserves from/to on connection references after rename', () => {
        const withCnx = addConnection(FULL, 'backend', 'frontend', 'left', 'right')
        const r = renameNode(withCnx, 'frontend', 'ui')
        const entry = connections(r, 'backend').find(c => typeof c === 'object' && Object.keys(c)[0] === 'ui')
        expect(entry).toBeDefined()
        expect(entry.from).toBe('left')
        expect(entry.to).toBe('right')
    })

    it('preserves all other nodes and their geometry', () => {
        const r = renameNode(FULL, 'frontend', 'ui')
        const doc = parse(r)
        expect(doc.nodes.customer.meta.pos).toBe('60,200')
        expect(doc.nodes.backend.meta.pos).toBe('420,180')
        expect(doc.nodes.database.meta.pos).toBe('640,180')
    })
})

// ─── updateGeometry (style preservation) ─────────────────────────────────────

describe('updateGeometry style preservation', () => {
    it('preserves meta.style when updating pos/size', () => {
        const withStyle = updateNodeStyle(FULL, 'customer', 'fillColor=#ff0000;')
        const r = updateGeometry(withStyle, 'customer', 100, 200, 50, 70)
        const meta = parse(r).nodes.customer.meta
        expect(meta.pos).toBe('100,200')
        expect(meta.size).toBe('50,70')
        expect(meta.style).toBe('fillColor=#ff0000;')
    })

    it('does not add style key when none existed before', () => {
        const r = updateGeometry(FULL, 'customer', 100, 200, 50, 70)
        expect(parse(r).nodes.customer.meta.style).toBeUndefined()
    })
})

// ─── updateNodeStyle ──────────────────────────────────────────────────────────

describe('updateNodeStyle', () => {
    it('sets style on a node with no existing meta', () => {
        const r = updateNodeStyle(MINIMAL, 'a', 'fillColor=#dae8fc;')
        assertValid(r)
        expect(parse(r).nodes.a.meta.style).toBe('fillColor=#dae8fc;')
    })

    it('sets style preserving existing pos/size', () => {
        const r = updateNodeStyle(FULL, 'customer', 'fillColor=#dae8fc;')
        assertValid(r, { nodeCount: 4 })
        const meta = parse(r).nodes.customer.meta
        expect(meta.style).toBe('fillColor=#dae8fc;')
        expect(meta.pos).toBe('60,200')
        expect(meta.size).toBe('40,60')
    })

    it('updates existing style', () => {
        const first = updateNodeStyle(FULL, 'customer', 'fillColor=#ff0000;')
        const r = updateNodeStyle(first, 'customer', 'fillColor=#00ff00;')
        expect(parse(r).nodes.customer.meta.style).toBe('fillColor=#00ff00;')
    })

    it('does not affect other nodes', () => {
        const r = updateNodeStyle(FULL, 'customer', 'fillColor=#ff0000;')
        assertValid(r, { nodeCount: 4 })
        expect(parse(r).nodes.frontend.meta?.style).toBeUndefined()
    })

    it('preserves connections on the styled node', () => {
        const r = updateNodeStyle(FULL, 'frontend', 'fillColor=#dae8fc;')
        expect(cnxTargets(connections(r, 'frontend'))).toContain('backend')
    })

    it('returns unchanged doc if key does not exist', () => {
        const r = updateNodeStyle(FULL, 'ghost', 'fillColor=#ff0000;')
        expect(parse(r)).toEqual(parse(FULL))
    })
})

// ─── updateConnectionText ─────────────────────────────────────────────────────

describe('updateConnectionText', () => {
    it('adds text to an existing simple-string connection', () => {
        // MINIMAL has no connections; add one first
        const withCnx = addConnection(MINIMAL, 'a', 'b', null, null)
        const r = updateConnectionText(withCnx, 'a', 'b', 'calls')
        assertValid(r, { nodeCount: 2 })
        const entry = connections(r, 'a').find(c => typeof c === 'object' && Object.keys(c)[0] === 'b')
        expect(entry).toBeDefined()
        expect(entry.text).toBe('calls')
    })

    it('adds text to a connection that already has from/to', () => {
        const r = updateConnectionText(FULL, 'frontend', 'backend', 'HTTP')
        assertValid(r, { nodeCount: 4 })
        const entry = connections(r, 'frontend').find(c => typeof c === 'object' && Object.keys(c)[0] === 'backend')
        expect(entry.text).toBe('HTTP')
        expect(entry.from).toBe('right')
        expect(entry.to).toBe('left')
    })

    it('updates existing text on a connection', () => {
        const first = updateConnectionText(FULL, 'frontend', 'backend', 'HTTP')
        const r = updateConnectionText(first, 'frontend', 'backend', 'gRPC')
        const entry = connections(r, 'frontend').find(c => typeof c === 'object' && Object.keys(c)[0] === 'backend')
        expect(entry.text).toBe('gRPC')
    })

    it('clears text when given empty string, simplifying to string if no from/to', () => {
        const withCnx = addConnection(MINIMAL, 'a', 'b', null, null)
        const withText = updateConnectionText(withCnx, 'a', 'b', 'calls')
        const r = updateConnectionText(withText, 'a', 'b', '')
        assertValid(r, { nodeCount: 2 })
        // Should simplify back to plain string since no from/to
        const cnxList = connections(r, 'a')
        expect(cnxList.some(c => c === 'b')).toBe(true)
    })

    it('clears text but keeps from/to when present', () => {
        const withText = updateConnectionText(FULL, 'frontend', 'backend', 'HTTP')
        const r = updateConnectionText(withText, 'frontend', 'backend', '')
        assertValid(r, { nodeCount: 4 })
        const entry = connections(r, 'frontend').find(c => typeof c === 'object' && Object.keys(c)[0] === 'backend')
        expect(entry).toBeDefined()
        expect(entry.text).toBeUndefined()
        expect(entry.from).toBe('right')
    })

    it('does not affect other connections on the same node', () => {
        const r = updateConnectionText(FULL, 'backend', 'database', 'SQL')
        assertValid(r, { nodeCount: 4 })
        // frontend → backend connection must be unchanged
        expect(cnxTargets(connections(r, 'frontend'))).toContain('backend')
    })

    it('returns docString unchanged when key has no connections', () => {
        const r = updateConnectionText(FULL, 'customer', 'backend', 'any')
        expect(parse(r)).toEqual(parse(FULL))
    })

    it('returns docString unchanged when target connection not found', () => {
        const r = updateConnectionText(FULL, 'frontend', 'ghost', 'any')
        expect(parse(r)).toEqual(parse(FULL))
    })
})

// ─── updateNodeStyleAndRotation ───────────────────────────────────────────────

describe('updateNodeStyleAndRotation', () => {
    it('style without rotation → written to meta.style, no meta.rotation', () => {
        const r = updateNodeStyleAndRotation(MINIMAL, 'a', 'fillColor=#ff0000;')
        assertValid(r)
        const meta = parse(r).nodes.a.meta
        expect(meta.style).toBe('fillColor=#ff0000;')
        expect(meta.rotation).toBeUndefined()
    })

    it('style with rotation → rotation split into meta.rotation, removed from meta.style', () => {
        const r = updateNodeStyleAndRotation(MINIMAL, 'a', 'fillColor=#ff0000;rotation=45;strokeColor=#000;')
        assertValid(r)
        const meta = parse(r).nodes.a.meta
        expect(meta.rotation).toBe(45)
        expect(meta.style).toBe('fillColor=#ff0000;strokeColor=#000;')
        expect(meta.style).not.toContain('rotation')
    })

    it('style that is only rotation → meta.rotation set, meta.style removed', () => {
        const first = updateNodeStyleAndRotation(MINIMAL, 'a', 'fillColor=#ff0000;')
        const r = updateNodeStyleAndRotation(first, 'a', 'rotation=90;')
        assertValid(r)
        const meta = parse(r).nodes.a.meta
        expect(meta.rotation).toBe(90)
        expect(meta.style).toBeUndefined()
    })

    it('style without rotation clears a previously set meta.rotation', () => {
        const first = updateNodeStyleAndRotation(MINIMAL, 'a', 'rotation=45;')
        const r = updateNodeStyleAndRotation(first, 'a', 'fillColor=#00ff00;')
        assertValid(r)
        const meta = parse(r).nodes.a.meta
        expect(meta.rotation).toBeUndefined()
        expect(meta.style).toBe('fillColor=#00ff00;')
    })

    it('preserves existing pos and size', () => {
        const withGeo = updateGeometry(FULL, 'customer', 100, 200, 40, 60)
        const r = updateNodeStyleAndRotation(withGeo, 'customer', 'rotation=30;fillColor=#eee;')
        assertValid(r, { nodeCount: 4 })
        const meta = parse(r).nodes.customer.meta
        expect(meta.pos).toBe('100,200')
        expect(meta.size).toBe('40,60')
        expect(meta.rotation).toBe(30)
    })
})

// ─── updateNodeLabel ──────────────────────────────────────────────────────────

describe('updateNodeLabel', () => {
    it('sets a label on a node', () => {
        const r = updateNodeLabel(MINIMAL, 'a', 'Alice')
        assertValid(r, { nodeCount: 2 })
        expect(parse(r).nodes.a.label).toBe('Alice')
    })

    it('updates an existing label', () => {
        const first = updateNodeLabel(MINIMAL, 'a', 'Alice')
        const r = updateNodeLabel(first, 'a', 'Bob')
        expect(parse(r).nodes.a.label).toBe('Bob')
    })

    it('removes the label field when given null', () => {
        const withLabel = updateNodeLabel(MINIMAL, 'a', 'Alice')
        const r = updateNodeLabel(withLabel, 'a', null)
        assertValid(r, { nodeCount: 2 })
        expect(parse(r).nodes.a.label).toBeUndefined()
    })

    it('does not affect other nodes', () => {
        const r = updateNodeLabel(MINIMAL, 'a', 'Alice')
        expect(parse(r).nodes.b.label).toBeUndefined()
    })

    it('preserves type and meta', () => {
        const r = updateNodeLabel(FULL, 'customer', 'End User')
        const node = parse(r).nodes.customer
        expect(node.type).toBe('actor')
        expect(node.meta.pos).toBe('60,200')
        expect(node.label).toBe('End User')
    })

    it('preserves connections on the labelled node', () => {
        const r = updateNodeLabel(FULL, 'frontend', 'UI')
        expect(cnxTargets(connections(r, 'frontend'))).toContain('backend')
    })

    it('returns unchanged doc if key does not exist', () => {
        const r = updateNodeLabel(FULL, 'ghost', 'Ghost')
        expect(parse(r)).toEqual(parse(FULL))
    })
})

// ─── chained operations ───────────────────────────────────────────────────────

describe('chained operations', () => {
    it('add connection → update geometry stays valid', () => {
        let doc = addConnection(FULL, 'customer', 'frontend', 'right', 'left')
        doc = updateGeometry(doc, 'customer', 80, 210, 40, 60)
        assertValid(doc, { nodeCount: 4 })
        const d = parse(doc)
        expect(d.nodes.customer.type).toBe('actor')
        expect(d.nodes.customer.meta.pos).toBe('80,210')
        expect(cnxTargets(d.nodes.customer.connections)).toContain('frontend')
    })

    it('multiple geometry updates do not duplicate content', () => {
        let doc = FULL
        doc = updateGeometry(doc, 'customer', 10, 20, 40, 60)
        doc = updateGeometry(doc, 'frontend', 200, 180, 120, 60)
        doc = updateGeometry(doc, 'backend', 400, 180, 120, 60)
        assertValid(doc, { nodeCount: 4 })
    })

    it('add then remove connection round-trips cleanly', () => {
        const withCnx = addConnection(FULL, 'customer', 'frontend', 'right', 'left')
        const removed = removeConnection(withCnx, 'customer', 'frontend')
        assertValid(removed, { nodeCount: 4 })
        expect(parse(removed).nodes.customer.connections).toBeUndefined()
    })

    it('full workflow: add nodes, connect, rename, update geometry', () => {
        let doc = MINIMAL
        doc = addNode(doc, { name: 'db', type: 'db' })
        doc = addConnection(doc, 'a', 'b', 'right', 'left')
        doc = addConnection(doc, 'b', 'db', 'bottom', 'top')
        doc = updateGeometry(doc, 'a', 50, 100, 40, 60)
        doc = renameNode(doc, 'a', 'user')
        assertValid(doc, { nodeCount: 3 })
        const d = parse(doc)
        expect(d.nodes.user.type).toBe('actor')
        expect(d.nodes.user.meta.pos).toBe('50,100')
        expect(cnxTargets(d.nodes.user.connections)).toContain('b')
        expect(cnxTargets(d.nodes.b.connections)).toContain('db')
    })
})
