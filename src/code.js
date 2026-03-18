import 'js-yaml';
import 'ace-builds/src/ace';
import {editor, persistModel} from './app'
import * as consts from './consts'
import * as syntax from "./syntax";
import * as doc from './doc';

function getIndentLevel(n) {
    return " ".repeat(n * 4)
}

/**
 * Replace editor content while keeping the cursor where the user left it.
 * editor.setValue(str, -1) always jumps to the start; this prevents that.
 * Schedules a debounced persist so draw.io-triggered changes are saved to
 * disk and the URL hash even though the Ace editor isn't focused.
 */
let _persistTimer = null
function setValueKeepCursor(newStr, pos = null) {
    pos = pos ?? editor.getCursorPosition()
    editor.setValue(newStr, -1)
    editor.moveCursorToPosition(pos)
    editor.clearSelection()
    clearTimeout(_persistTimer)
    _persistTimer = setTimeout(persistModel, 150)
}

export function getLines() {
    return editor.getSession().getDocument().getAllLines()
}

/**
 * Take an index from the start of the document, get the row and column of it
 * @param index
 */
export function getPosFromIndex(index) {
    let cursor = 0
    let lines = getLines()

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i]
        if (cursor + line.length < index) {
            cursor += line.length + 1
            continue
        }
        console.log("returning " + [i, index-cursor])
        return [i, index-cursor]
    }
}

/**
 * Attempt a series of changes to the editor content
 * @param changes
 */
export function attemptEditChange(changes) {
    if (!changes.hasOwnProperty('changes')) return

    editor.lockEvents = true
    try {
        let change = changes.changes
        let fromPos, toPos;
        fromPos = getPosFromIndex(change.from)
        toPos = getPosFromIndex(change.to)

        document.editor.getSession().replace(new ace.Range(fromPos[0], fromPos[1], toPos[0], toPos[1]), change.insert);
    } catch (e) {
        console.log(e)
    } finally {
        editor.lockEvents = false
    }
}

/**
 * Attempt an insert at document end
 * @param
 */
export function attemptInsert(text) {
    editor.lockEvents = true
    try {
        document.editor.getSession().insert({
           row: editor.getSession().getLength(),
           column: 0
        }, "\n" + text)
    } catch (e) {
        console.log(e)
    } finally {
        editor.lockEvents = false
    }
}

/**
 * Parse the YAML contained within a textArea t, replacing tabs with 4 spaces
 * It's fairly common half way through editing it won't be valid, wait until it is
 * @param t
 * @returns bool
 */
export function parseTextAreaToYaml(t) {
    try {
        let yamlObj = jsyaml.load(t.join("\n"));
        syntax.validateYaml(t)
        return yamlObj
    } catch (e) {
        consts.DEBUG === true ? console.log(e) : null
        editor.getSession().setAnnotations([{
            row: e.mark.line,
            column: e.mark.column,
            type: "error",
            text: e.reason
        }]);

        return false
    }
}

/**
 * Check the type has reached a valid string
 * @param type
 * @returns {boolean}
 */
export function isValidType(type) {
    return consts.VALID_TYPES.indexOf(type) >= 0;
}

/**
 * Return a line that appears to have the key we just edited
 * @param key
 * @param lines
 * @returns {null|number}
 */
export function determineLineOfNode(key, lines) {
    let count = 0
    for (let l of lines) {
        if (cleanKeyLine(l) !== key) {
            count += 1
            continue
        }
        return count
    }
    return null
}

/**
 *
 * @param line
 * @returns {*}
 */
export function cleanKeyLine(line) {
    return line.trim().replace(":", "")
}

/**
 * Return the active line
 * @param v
 * @returns {number}
 */
export function activeLineFromEditor(v) {
    return editor.getCursorPosition().row
}

/**
 *
 * @param node
 */
export function addNodeToCode(node) {
    editor.lockEvents = true
    try {
        const newStr = doc.addNode(getLines().join('\n'), node)
        setValueKeepCursor(newStr)
    } catch (e) {
        console.log("Node insertion: " + e)
    } finally {
        editor.lockEvents = false
    }
}

/**
 *
 * @param key
 * @param cnx
 */
export function addConnectionToCodeRegex(key, cnx) {
    try {
        let docString = getLines().join("\n")
        let yaml = jsyaml.load(docString)

        if (!yaml['nodes'][key].hasOwnProperty("connections")) {
            yaml['nodes'][key]['connections'] = []
        }
        yaml['nodes'][key]['connections'].push(cnx)

        let newNodeBlock = (key + ":\n" + jsyaml.dump(yaml['nodes'][key], { indent: 4 })).replaceAll("\n", "\n" + getIndentLevel(2)).trimEnd()
        let re = new RegExp(`${key}:[ \na-zA-Z0-9:-]+?(?=$|\n[ ]{2,4}([a-zA-Z]+))`, 'ig')
        let match = re.exec(docString);

        attemptEditChange({changes: {from: match['index'], to: match['index'] + match[0].length, insert: newNodeBlock}})
    } catch (e) {
        console.log("Connection add: " + e)
    }
}

/**
 *
 * @param key
 * @param cnx
 */
export function addConnectionToCode(key, cnx, from, to) {
    editor.lockEvents = true
    try {
        const newStr = doc.addConnection(getLines().join('\n'), key, cnx, from, to)
        setValueKeepCursor(newStr)
    } catch (e) {
        console.log("Connection add: " + e)
    } finally {
        editor.lockEvents = false
    }
}

/**
 *
 * @param old_key
 * @param new_key
 */
export function renameNodeInCode(old_key, new_key) {
    editor.lockEvents = true
    try {
        const currentStr = getLines().join('\n')
        const newStr = doc.renameNode(currentStr, old_key, new_key)
        if (newStr !== currentStr) {
            // Content changed (e.g. connection references updated) — replace and place
            // cursor at end of the renamed key line (after the colon).
            const newLines = newStr.split('\n')
            const keyRow = determineLineOfNode(new_key, newLines)
            const pos = keyRow !== null ? { row: keyRow, column: newLines[keyRow].length } : null
            setValueKeepCursor(newStr, pos)
        }
        // If content is unchanged, skip setValue — cursor stays naturally after
        // the last typed character, ready for continued key editing.
    } catch (e) {
        console.log("Node rename: " + e)
    } finally {
        editor.lockEvents = false
    }
}

/**
 *
 * @param key
 * @param x
 * @param y
 * @param width
 * @param height
 */
export function updateNodeGeometryInCode(key, x, y, width, height) {
    editor.lockEvents = true
    try {
        const newStr = doc.updateGeometry(getLines().join('\n'), key, x, y, width, height)
        setValueKeepCursor(newStr)
    } catch (e) {
        console.log("Geometry update: " + e)
    } finally {
        editor.lockEvents = false
    }
}

/**
 *
 * @param key
 * @param target
 */
export function removeConnectionFromCode(key, target) {
    editor.lockEvents = true
    try {
        const newStr = doc.removeConnection(getLines().join('\n'), key, target)
        setValueKeepCursor(newStr)
    } catch (e) {
        console.log("Connection removal: " + e)
    } finally {
        editor.lockEvents = false
    }
}

/**
 *
 * @param key
 * @param target
 * @param text
 */
export function updateNodeStyleInCode(key, style) {
    editor.lockEvents = true
    try {
        const newStr = doc.updateNodeStyleAndRotation(getLines().join('\n'), key, style)
        setValueKeepCursor(newStr)
    } catch (e) {
        console.log("Style update: " + e)
    } finally {
        editor.lockEvents = false
    }
}

export function updateNodeLabelInCode(key, label) {
    editor.lockEvents = true
    try {
        const newStr = doc.updateNodeLabel(getLines().join('\n'), key, label)
        setValueKeepCursor(newStr)
    } catch (e) {
        console.log("Label update: " + e)
    } finally {
        editor.lockEvents = false
    }
}

export function updateConnectionTextInCode(key, target, text) {
    editor.lockEvents = true
    try {
        const newStr = doc.updateConnectionText(getLines().join('\n'), key, target, text)
        setValueKeepCursor(newStr)
    } catch (e) {
        console.log("Connection text update: " + e)
    } finally {
        editor.lockEvents = false
    }
}

/**
 *
 * @param key
 */
export function removeNodeFromCode(key) {
    editor.lockEvents = true
    try {
        const newStr = doc.removeNode(getLines().join('\n'), key)
        setValueKeepCursor(newStr)
    } catch (e) {
        console.log("Node removal: " + e)
    } finally {
        editor.lockEvents = false
    }
}
