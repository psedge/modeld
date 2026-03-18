/**
 * modeld draw.io integration
 *
 * Loaded by drawio/src/main/webapp/index.html immediately after draw.io's
 * own scripts. Wires up the two-way bridge between the draw.io graph and
 * the modeld parent frame.
 */

function registerGlobalAndListeners(app) {
    document.app = app;

    app.editor.graph.addListener(mxEvent.LABEL_CHANGED, document.helpers.cellRenamed)
    app.editor.graph.addListener(mxEvent.CELL_CONNECTED, document.helpers.cellConnected)
    app.editor.graph.addListener(mxEvent.CELLS_REMOVED, document.helpers.cellRemoved)
    app.editor.graph.addListener(mxEvent.CELLS_ADDED, document.helpers.cellsAdded)
    app.editor.graph.addListener(mxEvent.CELLS_MOVED, document.helpers.cellsMoved)
    app.editor.graph.addListener(mxEvent.CELLS_RESIZED, document.helpers.cellsResized)
    app.editor.graph.connectionHandler.addListener(mxEvent.CONNECT, document.helpers.connectionMade)

    // Allow edges to be drawn to empty space (pos: connections)
    app.editor.graph.allowDanglingEdges = true

    // Enter compact mode (hides menu bar / logo) with shapes panel open, format panel closed
    app.setCompactMode(true, null, 0)
    app.toggleShapesPanel(true)
    app.toggleFormatPanel(false)
    app.fullscreenMode = true

    // The diagram state is owned by our YAML — suppress the unsaved-changes indicator
    app.editor.setModified = function() {}

    // Detect style changes (format panel, right-click Edit Style, etc.)
    app.editor.graph.getModel().addListener(mxEvent.CHANGE, function(sender, event) {
        if (document.locked) return
        const changes = event.getProperty('changes')
        if (!changes) return
        for (const change of changes) {
            // mxStyleChange has a string 'style' property; geometry/value changes don't
            if (change.cell && typeof change.style === 'string') {
                document.helpers.eventHandler('cellStyleChanged', {
                    cell: change.cell,
                    style: change.cell.style
                })
            }
        }
    })

    // When draw.io undoes a user action, sync the undo to the YAML side too.
    app.editor.undoManager.addListener(mxEvent.UNDO, function() {
        if (parent.eventHandler) parent.eventHandler('undo', {})
    })

    // Wait for the initial file to finish loading before signalling ready,
    // so our clearGraph + render runs after drawio has settled its file state.
    app.editor.addListener("fileLoaded", function() {
        if (parent.onDrawioReady) parent.onDrawioReady()
    })
}

if (navigator.userAgent != null && navigator.userAgent.toLowerCase().indexOf(' electron/') >= 0 && typeof process !== 'undefined' && process.versions.electron < 5) {
    var div = document.getElementById('geInfo');
    if (div != null) {
        div.innerHTML = '<center><h2>You are using an out of date version of this app.<br>Please download the latest version ' +
            '<a href="https://github.com/jgraph/drawio-desktop/releases/latest" target="_blank">here</a>.</h2></center>';
    }
} else {
    if (urlParams['dev'] != '1' && typeof document.createElement('canvas').getContext === "function") {
        window.addEventListener('load', function () {
            mxWinLoaded = true;
            checkAllLoaded();
        });
    } else {
        App.main(registerGlobalAndListeners);
    }
}

document.helpers = {}

document.helpers.registerEventHandler = function() {
    document.helpers.eventHandler = parent.eventHandler
}

document.helpers.getInsertPoint = function() {
    return document.app.editor.graph.getFreeInsertPoint()
}

document.helpers.insertRectangle = function(name, rounded) {
    let graph = document.app.editor.graph
    let coords = document.helpers.getInsertPoint()
    let rect = new mxCell(name, new mxGeometry(coords.x, coords.y, 75, 75), "rounded="+rounded+";whiteSpace=wrap;html=1;")
    rect.setVisible(true)
    rect.setVertex(true)

    document.locked = true
    graph.getModel().beginUpdate();
    try {
        graph.addCell(rect, graph.defaultParent);
        graph.fireEvent(new mxEventObject('cellsInserted', 'cells', [rect]));
    } finally {
        graph.getModel().endUpdate();
        document.locked = false
    }

    graph.setSelectionCell(rect);
    graph.scrollCellToVisible(graph.getSelectionCell());
    return rect.id
}

document.helpers.insertBoundary = function(name) {
    let graph = document.app.editor.graph
    let coords = document.helpers.getInsertPoint()
    let style = "rounded=1;whiteSpace=wrap;html=1;fillColor=none;dashed=1;strokeColor=#666666;verticalAlign=top;"
    let rect = new mxCell(name, new mxGeometry(coords.x, coords.y, 200, 150), style)
    rect.setVisible(true)
    rect.setVertex(true)

    document.locked = true
    graph.getModel().beginUpdate();
    try {
        graph.addCell(rect, graph.defaultParent);
        graph.fireEvent(new mxEventObject('cellsInserted', 'cells', [rect]));
    } finally {
        graph.getModel().endUpdate();
        document.locked = false
    }

    graph.setSelectionCell(rect);
    graph.scrollCellToVisible(graph.getSelectionCell());
    return rect.id
}

document.helpers.insertActor = function(name) {
    let graph = document.app.editor.graph
    let actor = new mxCell(name, new mxGeometry(0, 0, 30, 55), "shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;")
    actor.setVisible(true)
    actor.setVertex(true)

    document.locked = true
    graph.getModel().beginUpdate();
    try {
        graph.addCell(actor, graph.defaultParent);
        graph.fireEvent(new mxEventObject('cellsInserted', 'cells', [actor]));
    } finally {
        graph.getModel().endUpdate();
        document.locked = false
    }

    graph.setSelectionCell(actor);
    graph.scrollCellToVisible(graph.getSelectionCell());
    return actor.id
}

document.helpers.insertShape = function(name, template) {
    let graph = document.app.editor.graph
    let style = template || "rounded=0;whiteSpace=wrap;html=1;"
    let coords = document.helpers.getInsertPoint()
    let shape = new mxCell(name, new mxGeometry(coords.x, coords.y, 120, 60), style)
    shape.setVisible(true)
    shape.setVertex(true)

    document.locked = true
    graph.getModel().beginUpdate();
    try {
        graph.addCell(shape, graph.defaultParent);
        graph.fireEvent(new mxEventObject('cellsInserted', 'cells', [shape]));
    } finally {
        graph.getModel().endUpdate();
        document.locked = false
    }

    graph.setSelectionCell(shape);
    graph.scrollCellToVisible(graph.getSelectionCell());
    return shape.id
}

document.helpers.createEdge = function(source, target, from, to, text, targetPos) {
    const exitMap = {
        top:    'exitX=0.5;exitY=0;exitDx=0;exitDy=0;',
        bottom: 'exitX=0.5;exitY=1;exitDx=0;exitDy=0;',
        left:   'exitX=0;exitY=0.5;exitDx=0;exitDy=0;',
        right:  'exitX=1;exitY=0.5;exitDx=0;exitDy=0;',
    }
    const entryMap = {
        top:    'entryX=0.5;entryY=0;entryDx=0;entryDy=0;',
        bottom: 'entryX=0.5;entryY=1;entryDx=0;entryDy=0;',
        left:   'entryX=0;entryY=0.5;entryDx=0;entryDy=0;',
        right:  'entryX=1;entryY=0.5;entryDx=0;entryDy=0;',
    }
    let style = 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;'
    if (from && exitMap[from]) style += exitMap[from]
    if (to   && entryMap[to]) style += entryMap[to]

    let graph = document.app.editor.graph
    let geo = new mxGeometry(0, 0, 0, 0)
    geo.relative = true
    let edge = new mxCell(text || "", geo, style)
    edge.setEdge(true)
    edge.source = graph.getModel().cells[source]
    edge.target = target ? graph.getModel().cells[target] : null
    if (targetPos) geo.targetPoint = new mxPoint(targetPos.x, targetPos.y)

    document.locked = true
    graph.getModel().beginUpdate();
    try {
        graph.addCell(edge, graph.defaultParent);
        graph.fireEvent(new mxEventObject('cellsInserted', 'cells', [edge]));
    } finally {
        graph.getModel().endUpdate();
        document.locked = false
    }

    return edge.id
}

document.helpers.setCellRotation = function(id, degrees) {
    let graph = document.app.editor.graph
    let cell = graph.model.cells[id]
    if (!cell) return
    document.locked = true
    graph.getModel().beginUpdate()
    try {
        graph.setCellStyles(mxConstants.STYLE_ROTATION, degrees, [cell])
    } finally {
        graph.getModel().endUpdate()
        document.locked = false
    }
}

document.helpers.getCellGeometry = function(id) {
    let graph = document.app.editor.graph
    let cell = graph.model.cells[id]
    if (!cell) return null
    let geo = graph.model.getGeometry(cell)
    if (!geo) return null
    return { x: geo.x, y: geo.y, width: geo.width, height: geo.height }
}

document.helpers.changeCellStyle = function(id, style) {
    let graph = document.app.editor.graph
    let cell = graph.model.cells[id]
    if (!cell) return
    document.locked = true
    graph.getModel().beginUpdate()
    try {
        graph.model.setStyle(cell, style)
    } finally {
        graph.getModel().endUpdate()
        document.locked = false
    }
}

document.helpers.changeValueOfId = function(id, value) {
    let graph = document.app.editor.graph
    graph.getModel().beginUpdate();
    try {
        graph.model.setValue(graph.model.cells[id], value);
    } finally {
        graph.getModel().endUpdate();
    }
}

document.helpers.setCellGeometry = function(id, x, y, width, height) {
    let graph = document.app.editor.graph
    let cell = graph.model.cells[id]
    if (!cell) return
    document.locked = true
    graph.getModel().beginUpdate()
    try {
        let geo = graph.model.getGeometry(cell).clone()
        geo.x = x
        geo.y = y
        geo.width = width
        geo.height = height
        graph.model.setGeometry(cell, geo)
    } finally {
        graph.getModel().endUpdate()
        document.locked = false
    }
}

document.helpers.cellsMoved = function(graph, context) {
    if (document.locked) return
    document.helpers.eventHandler(mxEvent.CELLS_MOVED, {graph, context})
}

document.helpers.cellsResized = function(graph, context) {
    if (document.locked) return
    document.helpers.eventHandler(mxEvent.CELLS_RESIZED, {graph, context})
}

document.helpers.clearGraph = function() {
    let graph = document.app.editor.graph
    document.locked = true
    graph.getModel().beginUpdate()
    try {
        graph.removeCells(graph.getModel().getChildCells(graph.getDefaultParent()), true)
    } finally {
        graph.getModel().endUpdate()
        document.locked = false
    }
}

document.helpers.removeCell = function(id) {
    let graph = document.app.editor.graph
    document.locked = true
    graph.getModel().beginUpdate();
    try {
        graph.removeCells([graph.model.cells[id]], true);
    } finally {
        graph.getModel().endUpdate();
        document.locked = false
    }
}

document.helpers.cellRenamed = function(graph, event) {
    document.helpers.eventHandler(mxEvent.LABEL_CHANGED, {graph, event})
}

document.helpers.cellConnected = function(graph, context) {
    document.helpers.eventHandler(mxEvent.CELL_CONNECTED, {graph, context})
}

document.helpers.cellRemoved = function(graph, context) {
    document.helpers.eventHandler(mxEvent.CELLS_REMOVED, {graph, context})
}

document.helpers.cellsAdded = function(graph, context) {
    document.helpers.eventHandler(mxEvent.CELLS_ADDED, {graph, context})
}

document.helpers.connectionMade = function(handler, context) {
    document.helpers.eventHandler('connectionCreated', {handler, context})
}

document.helpers.getSvg = function() {
    const graph = document.app.editor.graph
    const bg = graph.background
    const svgRoot = graph.getSvg(bg, null, null, null, null, true)
    return new XMLSerializer().serializeToString(svgRoot)
}
