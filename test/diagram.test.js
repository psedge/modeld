import { describe, it, expect } from 'vitest'
import { determineCellTypeFromStyling, sideFromStyle, inferSides } from '../src/diagram'

describe('determineCellTypeFromStyling', () => {
    it('returns actor for umlActor shape', () => {
        expect(determineCellTypeFromStyling('shape=umlActor;fillColor=#fff')).toBe('actor')
    })

    it('returns actor for shape=actor', () => {
        expect(determineCellTypeFromStyling('shape=actor;strokeColor=#000')).toBe('actor')
    })

    it('returns actor for smiley shape', () => {
        expect(determineCellTypeFromStyling('shape=mxgraph.basic.smiley')).toBe('actor')
    })

    it('returns db for cylinder style', () => {
        expect(determineCellTypeFromStyling('shape=cylinder;fillColor=#dae8fc')).toBe('db')
    })

    it('returns db for database style', () => {
        expect(determineCellTypeFromStyling('shape=database;')).toBe('db')
    })

    it('returns db for aws3.rds', () => {
        expect(determineCellTypeFromStyling('shape=mxgraph.aws3.rds;')).toBe('db')
    })

    it('returns app for default/unknown style', () => {
        expect(determineCellTypeFromStyling('rounded=0;whiteSpace=wrap;')).toBe('app')
    })

    it('returns app for aws4.ec2', () => {
        expect(determineCellTypeFromStyling('shape=mxgraph.aws4.ec2;')).toBe('app')
    })
})

describe('sideFromStyle', () => {
    it('exitX=1,exitY=0.5 → right', () => {
        expect(sideFromStyle('exitX=1;exitY=0.5;exitDx=0;exitDy=0;', 'exit')).toBe('right')
    })

    it('exitX=0,exitY=0.5 → left', () => {
        expect(sideFromStyle('exitX=0;exitY=0.5;exitDx=0;exitDy=0;', 'exit')).toBe('left')
    })

    it('exitX=0.5,exitY=0 → top', () => {
        expect(sideFromStyle('exitX=0.5;exitY=0;exitDx=0;exitDy=0;', 'exit')).toBe('top')
    })

    it('exitX=0.5,exitY=1 → bottom', () => {
        expect(sideFromStyle('exitX=0.5;exitY=1;exitDx=0;exitDy=0;', 'exit')).toBe('bottom')
    })

    it('no coords → null', () => {
        expect(sideFromStyle('rounded=0;whiteSpace=wrap;', 'exit')).toBeNull()
    })

    it('null style → null', () => {
        expect(sideFromStyle(null, 'exit')).toBeNull()
    })

    it('entry side works with entry prefix', () => {
        expect(sideFromStyle('entryX=1;entryY=0.5;', 'entry')).toBe('right')
    })
})

describe('inferSides', () => {
    const makeCell = (x, y, w, h) => ({ geometry: { x, y, width: w, height: h } })

    it('target to the right → {from: right, to: left}', () => {
        const src = makeCell(0, 0, 100, 50)
        const tgt = makeCell(200, 0, 100, 50)
        expect(inferSides(src, tgt)).toEqual({ from: 'right', to: 'left' })
    })

    it('target to the left → {from: left, to: right}', () => {
        const src = makeCell(200, 0, 100, 50)
        const tgt = makeCell(0, 0, 100, 50)
        expect(inferSides(src, tgt)).toEqual({ from: 'left', to: 'right' })
    })

    it('target below → {from: bottom, to: top}', () => {
        const src = makeCell(0, 0, 100, 50)
        const tgt = makeCell(0, 200, 100, 50)
        expect(inferSides(src, tgt)).toEqual({ from: 'bottom', to: 'top' })
    })

    it('target above → {from: top, to: bottom}', () => {
        const src = makeCell(0, 200, 100, 50)
        const tgt = makeCell(0, 0, 100, 50)
        expect(inferSides(src, tgt)).toEqual({ from: 'top', to: 'bottom' })
    })

    it('null geometry → null', () => {
        expect(inferSides(null, makeCell(0, 0, 100, 50))).toBeNull()
        expect(inferSides(makeCell(0, 0, 100, 50), null)).toBeNull()
        expect(inferSides({ geometry: null }, makeCell(0, 0, 100, 50))).toBeNull()
    })
})
