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
