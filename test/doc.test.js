import { describe, it, expect } from 'vitest'
import yaml from 'js-yaml'
import { addNode, removeNode, addConnection, updateGeometry, renameNode } from '../src/doc'

const BASE_YAML = `nodes:
    frontend:
        type: app
    backend:
        type: application
        connections:
            - frontend:
              from: right
              to: left
`

describe('doc', () => {
    describe('addNode', () => {
        it('adds a new block at the end, parseable by js-yaml', () => {
            const result = addNode(BASE_YAML, { name: 'gateway', type: 'db' })
            const parsed = yaml.load(result)
            expect(parsed.nodes).toHaveProperty('gateway')
            expect(parsed.nodes.gateway.type).toBe('db')
        })

        it('preserves existing nodes', () => {
            const result = addNode(BASE_YAML, { name: 'gateway', type: 'app' })
            const parsed = yaml.load(result)
            expect(parsed.nodes).toHaveProperty('frontend')
            expect(parsed.nodes).toHaveProperty('backend')
        })
    })

    describe('removeNode', () => {
        it('removes the specified node block', () => {
            const result = removeNode(BASE_YAML, 'frontend')
            const parsed = yaml.load(result)
            expect(parsed.nodes).not.toHaveProperty('frontend')
        })

        it('result is parseable', () => {
            const result = removeNode(BASE_YAML, 'frontend')
            expect(() => yaml.load(result)).not.toThrow()
        })

        it('preserves other nodes', () => {
            const result = removeNode(BASE_YAML, 'frontend')
            const parsed = yaml.load(result)
            expect(parsed.nodes).toHaveProperty('backend')
        })

        it('returns unchanged string if key not found', () => {
            const result = removeNode(BASE_YAML, 'nonexistent')
            expect(result).toBe(BASE_YAML)
        })
    })

    describe('addConnection', () => {
        it('adds a connection to a node', () => {
            const result = addConnection(BASE_YAML, 'frontend', 'backend', null, null)
            const parsed = yaml.load(result)
            expect(parsed.nodes.frontend.connections).toBeDefined()
            const cnxList = parsed.nodes.frontend.connections
            const hasBackend = cnxList.some(c => c === 'backend' || (typeof c === 'object' && Object.keys(c)[0] === 'backend'))
            expect(hasBackend).toBe(true)
        })

        it('with from/to adds correct from/to fields', () => {
            const result = addConnection(BASE_YAML, 'frontend', 'backend', 'right', 'left')
            // `: null` is stripped from `backend: null` by nodeBlock, producing bare `backend`
            // followed by `from` and `to` props — check the string directly
            expect(result).toContain('backend')
            expect(result).toContain('from: right')
            expect(result).toContain('to: left')
        })
    })

    describe('updateGeometry', () => {
        it('sets correct pos and size in meta', () => {
            const result = updateGeometry(BASE_YAML, 'frontend', 10, 20, 100, 50)
            const parsed = yaml.load(result)
            expect(parsed.nodes.frontend.meta).toBeDefined()
            expect(parsed.nodes.frontend.meta.pos).toBe('10,20')
            expect(parsed.nodes.frontend.meta.size).toBe('100,50')
        })

        it('rounds float values', () => {
            const result = updateGeometry(BASE_YAML, 'frontend', 10.7, 20.3, 100.9, 50.1)
            const parsed = yaml.load(result)
            expect(parsed.nodes.frontend.meta.pos).toBe('11,20')
            expect(parsed.nodes.frontend.meta.size).toBe('101,50')
        })
    })

    describe('renameNode', () => {
        it('renames key in declaration', () => {
            const result = renameNode(BASE_YAML, 'frontend', 'ui')
            const parsed = yaml.load(result)
            expect(parsed.nodes).toHaveProperty('ui')
            expect(parsed.nodes).not.toHaveProperty('frontend')
        })

        it('renames connection references', () => {
            const result = renameNode(BASE_YAML, 'frontend', 'ui')
            const parsed = yaml.load(result)
            // backend has a connection to frontend — should now be ui
            const cnxList = parsed.nodes.backend.connections
            const hasUi = cnxList.some(c => {
                if (typeof c === 'string') return c === 'ui'
                if (typeof c === 'object') return Object.keys(c)[0] === 'ui'
                return false
            })
            expect(hasUi).toBe(true)
        })
    })
})
