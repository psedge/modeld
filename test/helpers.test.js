import { describe, it, expect } from 'vitest'
import { formatConnections } from '../src/helpers'

describe('formatConnections', () => {
    it('string target → correct key, null from/to', () => {
        const nodes = {
            frontend: { connections: {} },
            backend: { connections: {} },
        }
        const result = formatConnections('frontend', ['backend'], nodes)
        expect(result).toHaveProperty('backend')
        expect(result.backend.from).toBeNull()
        expect(result.backend.to).toBeNull()
    })

    it('object target with from/to → preserved', () => {
        const nodes = {
            frontend: { connections: {} },
            backend: { connections: {} },
        }
        const cnxList = [{ backend: null, from: 'right', to: 'left' }]
        const result = formatConnections('frontend', cnxList, nodes)
        expect(result.backend.from).toBe('right')
        expect(result.backend.to).toBe('left')
    })

    it('existing connection in nodes → id is carried over', () => {
        const nodes = {
            frontend: { connections: { backend: { id: 'edge42' } } },
            backend: { connections: {} },
        }
        const result = formatConnections('frontend', ['backend'], nodes)
        expect(result.backend.id).toBe('edge42')
    })

    it('null cnxList → empty result', () => {
        const nodes = {
            frontend: { connections: {} },
        }
        const result = formatConnections('frontend', null, nodes)
        expect(result).toEqual({})
    })

    it('skips null entries in cnxList', () => {
        const nodes = {
            frontend: { connections: {} },
            backend: { connections: {} },
        }
        const result = formatConnections('frontend', [null, 'backend'], nodes)
        expect(Object.keys(result)).toEqual(['backend'])
    })
})
