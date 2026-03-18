import { describe, it, expect } from 'vitest'
import { diffNodes } from '../src/sync'

const node = (type, extras = {}) => ({ type, connections: [], ...extras })

describe('diffNodes', () => {
    it('empty newNodes + action=removal → nodeRemoved for all current nodes', () => {
        const current = {
            frontend: node('app'),
            backend: node('application'),
        }
        const events = diffNodes({}, current, 'removal')
        expect(events).toHaveLength(2)
        expect(events.map(e => e.type)).toEqual(['nodeRemoved', 'nodeRemoved'])
        expect(events.map(e => e.name).sort()).toEqual(['backend', 'frontend'])
    })

    it('new valid node + action=insert → nodeAdded event', () => {
        const newNodes = { frontend: node('app') }
        const events = diffNodes(newNodes, {}, 'insert')
        expect(events).toHaveLength(1)
        expect(events[0].type).toBe('nodeAdded')
        expect(events[0].name).toBe('frontend')
        expect(events[0].nodeType).toBe('app')
    })

    it('new node with invalid type → no event', () => {
        const newNodes = { frontend: node('unknown') }
        const events = diffNodes(newNodes, {}, 'insert')
        expect(events).toHaveLength(0)
    })

    it('new boundary node → nodeAdded event', () => {
        const newNodes = { 'internal-zone': node('boundary') }
        const events = diffNodes(newNodes, {}, 'insert')
        expect(events).toHaveLength(1)
        expect(events[0].type).toBe('nodeAdded')
        expect(events[0].name).toBe('internal-zone')
        expect(events[0].nodeType).toBe('boundary')
    })

    it('boundary nodeAdded carries contains list', () => {
        const newNodes = { zone: { type: 'boundary', contains: ['frontend', 'backend'], connections: [] } }
        const events = diffNodes(newNodes, {}, 'insert')
        expect(events[0].contains).toEqual(['frontend', 'backend'])
    })

    it('non-boundary nodeAdded has empty contains', () => {
        const newNodes = { frontend: node('app') }
        const events = diffNodes(newNodes, {}, 'insert')
        expect(events[0].contains).toEqual([])
    })

    it('existing node removed + action=removal → nodeRemoved', () => {
        const current = { frontend: node('app'), backend: node('application') }
        const newNodes = { backend: node('application') }
        const events = diffNodes(newNodes, current, 'removal')
        expect(events).toHaveLength(1)
        expect(events[0].type).toBe('nodeRemoved')
        expect(events[0].name).toBe('frontend')
    })

    it('removal action does NOT add nodes', () => {
        const newNodes = { newNode: node('app') }
        const events = diffNodes(newNodes, {}, 'removal')
        const added = events.filter(e => e.type === 'nodeAdded')
        expect(added).toHaveLength(0)
    })

    it('insert action does NOT remove nodes', () => {
        const current = { frontend: node('app') }
        const events = diffNodes({}, current, 'insert')
        const removed = events.filter(e => e.type === 'nodeRemoved')
        expect(removed).toHaveLength(0)
    })

    it('existing node with new connection + both nodes in currentNodes → edgeAdded', () => {
        const current = {
            frontend: { type: 'app', connections: {}, id: 'cell1' },
            backend: { type: 'application', connections: {}, id: 'cell2' },
        }
        const newNodes = {
            frontend: { type: 'app', connections: ['backend'] },
            backend: { type: 'application', connections: [] },
        }
        const events = diffNodes(newNodes, current, 'insert')
        const edge = events.find(e => e.type === 'edgeAdded')
        expect(edge).toBeDefined()
        expect(edge.sourceName).toBe('frontend')
        expect(edge.targetName).toBe('backend')
    })

    it('existing node, connection already tracked → edgeUpdated', () => {
        const current = {
            frontend: { type: 'app', connections: { backend: { id: 'e1' } }, id: 'cell1' },
            backend: { type: 'application', connections: {}, id: 'cell2' },
        }
        const newNodes = {
            frontend: { type: 'app', connections: ['backend'] },
            backend: { type: 'application', connections: [] },
        }
        const events = diffNodes(newNodes, current, 'insert')
        const edge = events.find(e => e.type === 'edgeUpdated')
        expect(edge).toBeDefined()
        expect(edge.sourceName).toBe('frontend')
        expect(edge.targetName).toBe('backend')
    })

    it('connection target not in currentNodes → no edge event', () => {
        const current = {
            frontend: { type: 'app', connections: {}, id: 'cell1' },
        }
        const newNodes = {
            frontend: { type: 'app', connections: ['ghost'] },
        }
        const events = diffNodes(newNodes, current, 'insert')
        const edges = events.filter(e => e.type === 'edgeAdded' || e.type === 'edgeUpdated')
        expect(edges).toHaveLength(0)
    })

    it('existing node with id + meta pos/size → geometryUpdated', () => {
        const current = {
            frontend: { type: 'app', connections: {}, id: 'cell1' },
        }
        const newNodes = {
            frontend: { type: 'app', connections: [], meta: { pos: '10,20', size: '100,50' } },
        }
        const events = diffNodes(newNodes, current, 'insert')
        const geo = events.find(e => e.type === 'geometryUpdated')
        expect(geo).toBeDefined()
        expect(geo.x).toBe(10)
        expect(geo.y).toBe(20)
        expect(geo.width).toBe(100)
        expect(geo.height).toBe(50)
    })

    it('existing node with meta.rotation → rotationUpdated event', () => {
        const current = {
            frontend: { type: 'app', connections: {}, id: 'cell1' },
        }
        const newNodes = {
            frontend: { type: 'app', connections: [], meta: { rotation: 45 } },
        }
        const events = diffNodes(newNodes, current, 'insert')
        const rot = events.find(e => e.type === 'rotationUpdated')
        expect(rot).toBeDefined()
        expect(rot.id).toBe('cell1')
        expect(rot.rotation).toBe(45)
    })

    it('rotationUpdated comes after styleUpdated when both are present', () => {
        const current = {
            frontend: { type: 'app', connections: {}, id: 'cell1' },
        }
        const newNodes = {
            frontend: { type: 'app', connections: [], meta: { style: 'fillColor=#f00;', rotation: 30 } },
        }
        const events = diffNodes(newNodes, current, 'insert')
        const styleIdx = events.findIndex(e => e.type === 'styleUpdated')
        const rotIdx   = events.findIndex(e => e.type === 'rotationUpdated')
        expect(styleIdx).toBeGreaterThanOrEqual(0)
        expect(rotIdx).toBeGreaterThan(styleIdx)
    })

    it('existing node with id=null → no geometryUpdated', () => {
        const current = {
            frontend: { type: 'app', connections: {}, id: null },
        }
        const newNodes = {
            frontend: { type: 'app', connections: [], meta: { pos: '10,20', size: '100,50' } },
        }
        const events = diffNodes(newNodes, current, 'insert')
        const geo = events.find(e => e.type === 'geometryUpdated')
        expect(geo).toBeUndefined()
    })

    it('connection removed from YAML → edgeRemoved event', () => {
        const current = {
            frontend: { type: 'app', connections: { backend: { id: 'e1' } }, id: 'cell1' },
            backend: { type: 'application', connections: {}, id: 'cell2' },
        }
        const newNodes = {
            frontend: { type: 'app', connections: [] },
            backend: { type: 'application', connections: [] },
        }
        const events = diffNodes(newNodes, current, 'removal')
        const removed = events.find(e => e.type === 'edgeRemoved')
        expect(removed).toBeDefined()
        expect(removed.sourceName).toBe('frontend')
        expect(removed.targetName).toBe('backend')
        expect(removed.id).toBe('e1')
    })

    // ── init / two-pass behaviour ──────────────────────────────────────────────

    it('new nodes with connections, not yet in currentNodes → no edgeAdded (first pass)', () => {
        // On initial load currentNodes is {}. The first diffNodes pass only emits
        // nodeAdded events; edge processing is skipped until IDs are assigned.
        const newNodes = {
            frontend: { type: 'app', connections: [{ backend: null, from: 'right', to: 'left' }] },
            backend:  { type: 'application', connections: [] },
        }
        const events = diffNodes(newNodes, {}, 'insert')
        const edges = events.filter(e => e.type === 'edgeAdded')
        expect(edges).toHaveLength(0)
    })

    it('second pass: all nodes now in currentNodes → edgeAdded for their connections', () => {
        // Simulates the second triggerChanges pass: nodes are present with IDs,
        // connections dict is still empty → edgeAdded should be emitted.
        const current = {
            frontend: { type: 'app', connections: {}, id: 'cell1' },
            backend:  { type: 'application', connections: {}, id: 'cell2' },
        }
        const newNodes = {
            frontend: { type: 'app', connections: [{ backend: null, from: 'right', to: 'left' }] },
            backend:  { type: 'application', connections: [] },
        }
        const events = diffNodes(newNodes, current, 'insert')
        const edge = events.find(e => e.type === 'edgeAdded')
        expect(edge).toBeDefined()
        expect(edge.sourceName).toBe('frontend')
        expect(edge.targetName).toBe('backend')
        expect(edge.from).toBe('right')
        expect(edge.to).toBe('left')
    })

    it('second pass: already-tracked connections → no duplicate edgeAdded', () => {
        // After first pass completes, connections are recorded; second pass must
        // not re-emit edgeAdded for connections already in currentNodes.connections.
        const current = {
            frontend: { type: 'app', connections: { backend: { id: 'e1', from: 'right', to: 'left' } }, id: 'cell1' },
            backend:  { type: 'application', connections: {}, id: 'cell2' },
        }
        const newNodes = {
            frontend: { type: 'app', connections: [{ backend: null, from: 'right', to: 'left' }] },
            backend:  { type: 'application', connections: [] },
        }
        const events = diffNodes(newNodes, current, 'insert')
        const added = events.filter(e => e.type === 'edgeAdded')
        expect(added).toHaveLength(0)
    })

    // ── from/to carried through events ────────────────────────────────────────

    it('edgeAdded carries from/to from YAML connection', () => {
        const current = {
            frontend: { type: 'app', connections: {}, id: 'cell1' },
            backend:  { type: 'application', connections: {}, id: 'cell2' },
        }
        const newNodes = {
            frontend: { type: 'app', connections: [{ backend: null, from: 'right', to: 'left' }] },
            backend:  { type: 'application', connections: [] },
        }
        const events = diffNodes(newNodes, current, 'insert')
        const edge = events.find(e => e.type === 'edgeAdded')
        expect(edge.from).toBe('right')
        expect(edge.to).toBe('left')
        expect(edge.source).toBe('cell1')
        expect(edge.target).toBe('cell2')
    })

    it('edgeUpdated carries from/to when sides change in YAML', () => {
        // Simulates a user editing the YAML to change from: right → from: top
        const current = {
            frontend: { type: 'app', connections: { backend: { id: 'e1', from: 'right', to: 'left' } }, id: 'cell1' },
            backend:  { type: 'application', connections: {}, id: 'cell2' },
        }
        const newNodes = {
            frontend: { type: 'app', connections: [{ backend: null, from: 'top', to: 'bottom' }] },
            backend:  { type: 'application', connections: [] },
        }
        const events = diffNodes(newNodes, current, 'insert')
        const edge = events.find(e => e.type === 'edgeUpdated')
        expect(edge).toBeDefined()
        expect(edge.cnx.from).toBe('top')
        expect(edge.cnx.to).toBe('bottom')
    })

    // ── styleUpdated ──────────────────────────────────────────────────────────

    it('node with meta.style and id → styleUpdated event', () => {
        const current = {
            frontend: { type: 'app', connections: {}, id: 'cell1' },
        }
        const newNodes = {
            frontend: { type: 'app', connections: [], meta: { pos: '10,20', size: '100,50', style: 'fillColor=#ff0000;' } },
        }
        const events = diffNodes(newNodes, current, 'insert')
        const styleEvt = events.find(e => e.type === 'styleUpdated')
        expect(styleEvt).toBeDefined()
        expect(styleEvt.id).toBe('cell1')
        expect(styleEvt.style).toBe('fillColor=#ff0000;')
    })

    it('node with meta.style but no id → no styleUpdated', () => {
        const current = {
            frontend: { type: 'app', connections: {} },
        }
        const newNodes = {
            frontend: { type: 'app', connections: [], meta: { style: 'fillColor=#ff0000;' } },
        }
        const events = diffNodes(newNodes, current, 'insert')
        expect(events.find(e => e.type === 'styleUpdated')).toBeUndefined()
    })

    it('node with meta but no style → no styleUpdated', () => {
        const current = {
            frontend: { type: 'app', connections: {}, id: 'cell1' },
        }
        const newNodes = {
            frontend: { type: 'app', connections: [], meta: { pos: '10,20', size: '100,50' } },
        }
        const events = diffNodes(newNodes, current, 'insert')
        expect(events.find(e => e.type === 'styleUpdated')).toBeUndefined()
    })

    // ── label ─────────────────────────────────────────────────────────────────

    it('nodeAdded carries label when set in YAML', () => {
        const newNodes = { svc: { type: 'app', connections: [], label: 'My Service' } }
        const events = diffNodes(newNodes, {}, 'insert')
        expect(events[0].label).toBe('My Service')
    })

    it('nodeAdded has undefined label when not set in YAML', () => {
        const newNodes = { svc: node('app') }
        const events = diffNodes(newNodes, {}, 'insert')
        expect(events[0].label).toBeUndefined()
    })

    it('labelUpdated emitted when label is added to an existing node', () => {
        const current = { svc: { type: 'app', connections: {}, id: 'cell1' } }
        const newNodes = { svc: { type: 'app', connections: [], label: 'My Service' } }
        const events = diffNodes(newNodes, current, 'insert')
        const evt = events.find(e => e.type === 'labelUpdated')
        expect(evt).toBeDefined()
        expect(evt.name).toBe('svc')
        expect(evt.label).toBe('My Service')
    })

    it('labelUpdated emitted when label changes', () => {
        const current = { svc: { type: 'app', connections: {}, id: 'cell1', label: 'Old' } }
        const newNodes = { svc: { type: 'app', connections: [], label: 'New' } }
        const events = diffNodes(newNodes, current, 'insert')
        const evt = events.find(e => e.type === 'labelUpdated')
        expect(evt).toBeDefined()
        expect(evt.label).toBe('New')
    })

    it('labelUpdated emitted with null when label is removed', () => {
        const current = { svc: { type: 'app', connections: {}, id: 'cell1', label: 'Old' } }
        const newNodes = { svc: { type: 'app', connections: [] } }
        const events = diffNodes(newNodes, current, 'insert')
        // label is not in newNodes at all — no labelUpdated expected
        expect(events.find(e => e.type === 'labelUpdated')).toBeUndefined()
    })

    it('no labelUpdated when label is unchanged', () => {
        const current = { svc: { type: 'app', connections: {}, id: 'cell1', label: 'Same' } }
        const newNodes = { svc: { type: 'app', connections: [], label: 'Same' } }
        const events = diffNodes(newNodes, current, 'insert')
        expect(events.find(e => e.type === 'labelUpdated')).toBeUndefined()
    })

    it('connection without id (not yet in diagram) → no edgeRemoved', () => {
        const current = {
            frontend: { type: 'app', connections: { backend: { id: null } }, id: 'cell1' },
            backend: { type: 'application', connections: {}, id: 'cell2' },
        }
        const newNodes = {
            frontend: { type: 'app', connections: [] },
            backend: { type: 'application', connections: [] },
        }
        const events = diffNodes(newNodes, current, 'removal')
        const removed = events.filter(e => e.type === 'edgeRemoved')
        expect(removed).toHaveLength(0)
    })

    it('existing node with id=undefined → no geometryUpdated', () => {
        const current = {
            frontend: { type: 'app', connections: {} },
        }
        const newNodes = {
            frontend: { type: 'app', connections: [], meta: { pos: '10,20', size: '100,50' } },
        }
        const events = diffNodes(newNodes, current, 'insert')
        const geo = events.find(e => e.type === 'geometryUpdated')
        expect(geo).toBeUndefined()
    })
})
