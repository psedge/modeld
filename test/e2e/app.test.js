import { test, expect } from '@playwright/test'

const BLANK_YAML = 'nodes:\n'

// Wait for the draw.io iframe to finish initialising (onDrawioReady fires)
async function waitForApp(page) {
    await page.waitForFunction(() => {
        const iframe = document.getElementById('drawio')
        return iframe?.contentDocument?.app?.editor?.graph != null &&
               typeof iframe?.contentDocument?.helpers?.eventHandler === 'function'
    }, { timeout: 20_000 })
}

// Read the current Ace editor value from the page
function editorValue(page) {
    return page.evaluate(() => document.editor.getValue())
}

// Return the draw.io iframe frame handle
function drawioFrame(page) {
    return page.frameLocator('#drawio')
}

// Get all cell labels currently visible in the draw.io SVG layer
async function diagramCellLabels(page) {
    return page.evaluate(() => {
        const iframe = document.getElementById('drawio')
        const graph = iframe.contentDocument.app.editor.graph
        const cells = graph.getModel().getChildCells(graph.getDefaultParent())
        return cells.map(c => c.value).filter(Boolean)
    })
}

// ---------------------------------------------------------------------------
// Fresh load
// ---------------------------------------------------------------------------

test('fresh load without hash shows blank nodes', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)

    const yaml = await editorValue(page)
    expect(yaml.trimStart()).toMatch(/^nodes:/)
    const labels = await diagramCellLabels(page)
    expect(labels).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// Hash persistence
// ---------------------------------------------------------------------------

test('YAML is persisted to URL hash after typing', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)

    const yaml = 'nodes:\n    web:\n        type: app\n'
    await page.evaluate(y => window.__setModel(y), yaml)
    await page.waitForTimeout(300)

    const hash = await page.evaluate(() => window.location.hash)
    expect(hash.length).toBeGreaterThan(1)

    // Hash should decode back to our YAML
    const decoded = await page.evaluate(
        h => decodeURIComponent(escape(atob(h.slice(1)))),
        hash
    )
    expect(decoded).toBe(yaml)
})

test('reloading with hash restores YAML', async ({ page }) => {
    const yaml = 'nodes:\n    api:\n        type: app\n'
    const hash = await page.evaluate(
        y => '#' + btoa(unescape(encodeURIComponent(y))),
        yaml
    )
    await page.goto('/' + hash)
    await waitForApp(page)

    const restored = await editorValue(page)
    expect(restored).toBe(yaml)
})

// ---------------------------------------------------------------------------
// Editor – Tab key
// ---------------------------------------------------------------------------

test('Tab key indents inside editor (does not leave editor)', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)

    // Place cursor in the editor
    await page.click('#editor')
    // Move to end of content and press Tab
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Tab')

    // Active element should still be inside the editor container
    const activeInEditor = await page.evaluate(() =>
        document.getElementById('editor').contains(document.activeElement)
    )
    expect(activeInEditor).toBe(true)
})

// ---------------------------------------------------------------------------
// Editor – colon key does not shift cursor left
// ---------------------------------------------------------------------------

test('typing a colon does not shift cursor position', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)

    await page.click('#editor')
    await page.keyboard.press('Control+End')

    // Type a word then a colon
    await page.keyboard.type('mynode')
    const colBefore = await page.evaluate(() => document.editor.getCursorPosition().column)
    await page.keyboard.type(':')
    const colAfter = await page.evaluate(() => document.editor.getCursorPosition().column)

    // Column should advance by exactly 1 (the colon itself)
    expect(colAfter).toBe(colBefore + 1)
})

// ---------------------------------------------------------------------------
// YAML → diagram sync
// ---------------------------------------------------------------------------

test('adding a node in YAML creates a cell in draw.io', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)

    await page.evaluate(() => window.__setModel('nodes:\n    svc:\n        type: app\n'))
    await page.waitForTimeout(300)

    const labels = await diagramCellLabels(page)
    expect(labels).toContain('svc')
})

// ---------------------------------------------------------------------------
// YAML → diagram: focus is preserved in the editor
// ---------------------------------------------------------------------------

test('adding a node via YAML does not steal focus from the editor', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)

    // Focus the Ace editor and position cursor at the end
    await page.click('#editor')
    await page.keyboard.press('Control+End')

    // Type a new node (triggers nodeAdded → insertRectangle in draw.io)
    await page.keyboard.type('newnode:\n')
    await page.keyboard.type('        type: app')
    await page.waitForTimeout(300)

    // Focus should still be inside the editor container
    const activeInEditor = await page.evaluate(() =>
        document.getElementById('editor').contains(document.activeElement)
    )
    expect(activeInEditor).toBe(true)
})

// ---------------------------------------------------------------------------
// Reload button
// ---------------------------------------------------------------------------

test('reload button redraws diagram from current editor YAML', async ({ page }) => {
    const yaml = 'nodes:\n    svc:\n        type: app\n'
    const hash = await page.evaluate(
        y => '#' + btoa(unescape(encodeURIComponent(y))),
        yaml
    )
    await page.goto('/' + hash)
    await waitForApp(page)

    // Clear the diagram without touching the editor
    await page.evaluate(() => {
        const ctx = document.getElementById('drawio').contentDocument
        ctx.helpers.clearGraph()
        document.nodes = {}
    })
    const labelsBefore = await diagramCellLabels(page)
    expect(labelsBefore).toHaveLength(0)

    await page.click('#btn-reload')
    await page.waitForTimeout(300)

    const labelsAfter = await diagramCellLabels(page)
    expect(labelsAfter).toContain('svc')
})

// ---------------------------------------------------------------------------
// New button
// ---------------------------------------------------------------------------

test('new button clears the URL hash', async ({ page }) => {
    const yaml = 'nodes:\n    svc:\n        type: app\n'
    const hash = await page.evaluate(
        y => '#' + btoa(unescape(encodeURIComponent(y))),
        yaml
    )
    await page.goto('/' + hash)
    await waitForApp(page)

    await page.click('#btn-new')
    await page.waitForTimeout(300)

    const newHash = await page.evaluate(() => window.location.hash)
    expect(newHash).toBe('')
})

test('new button resets diagram to a single canvas boundary', async ({ page }) => {
    const yaml = 'nodes:\n    svc:\n        type: app\n'
    const hash = await page.evaluate(
        y => '#' + btoa(unescape(encodeURIComponent(y))),
        yaml
    )
    await page.goto('/' + hash)
    await waitForApp(page)

    await page.click('#btn-new')
    await page.waitForTimeout(300)

    const editorYaml = await editorValue(page)
    expect(editorYaml).toMatch(/^nodes:/)
    expect(editorYaml).toContain('canvas')
    expect(editorYaml).not.toContain('svc')
})

// ---------------------------------------------------------------------------
// diagram → YAML sync
// ---------------------------------------------------------------------------

test('adding a cell in draw.io creates a node in YAML', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)

    // Simulate a user-initiated shape drag: add a cell directly to the mxGraph
    // model without going through our insertRectangle helper (which sets
    // document.locked and is used for YAML→diagram, not diagram→YAML).
    await page.evaluate(() => {
        const iframeWin = document.getElementById('drawio').contentWindow
        const { mxCell, mxGeometry, mxEventObject } = iframeWin
        const graph = iframeWin.document.app.editor.graph
        const cell = new mxCell('myservice', new mxGeometry(100, 100, 120, 60), 'rounded=0;whiteSpace=wrap;html=1;')
        cell.setVertex(true)
        graph.getModel().beginUpdate()
        try {
            graph.addCell(cell, graph.defaultParent)
            graph.fireEvent(new mxEventObject('cellsInserted', 'cells', [cell]))
        } finally {
            graph.getModel().endUpdate()
        }
    })

    await page.waitForTimeout(500)

    // draw.io uses the cell's auto-generated ID as the node key; the user
    // renames it afterwards. Just verify a node entry was written into YAML.
    const yaml = await editorValue(page)
    expect(yaml).toContain('type: app')
})
