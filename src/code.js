import 'js-yaml';
import 'ace-builds/src/ace';
import {editor} from './app'
import * as consts from './consts'
import * as syntax from "./syntax";

function getIndentLevel(n) {
    return " ".repeat(n * 4)
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
    const valid = ["app", "db", "database", "application", "actor"]
    return valid.indexOf(type) >= 0;
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
    try {
        let nodeYaml = {
            type: node.type,
        }
        let newNodeBlock = "\n" + getIndentLevel(1)
        newNodeBlock += (node.name + ":\n" + jsyaml.dump(nodeYaml)).replaceAll("\n", "\n" + getIndentLevel(2))
        attemptInsert(newNodeBlock)
    } catch (e) {
        console.log("Node insertion: " + e)
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

        let newNodeBlock = (key + ":\n" + jsyaml.dump(yaml['nodes'][key])).replaceAll("\n", "\n" + getIndentLevel(2))
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
export function addConnectionToCode(key, cnx) {
    try {
        let docString = getLines().join("\n")
        let yaml = jsyaml.load(docString)

        if (!yaml['nodes'][key].hasOwnProperty("connections")) {
            yaml['nodes'][key]['connections'] = []
        }
        yaml['nodes'][key]['connections'].push(cnx)

        let newNodeBlock = (key + ":\n" + jsyaml.dump(yaml['nodes'][key]))
            .replaceAll("\n", "\n" + getIndentLevel(2))
            .replace(": null", "")
        let re = new RegExp(`${key}:(["a-zA-Z0-9:.'?,\\- \\n]+?)(?=($|\\n[ ]{4}[a-z]))`, 'ig')
        let match = re.exec(docString);

        attemptEditChange({changes: {from: match['index'], to: match['index'] + match[0].length, insert: newNodeBlock}})
    } catch (e) {
        console.log("Connection add: " + e)
    }
}

/**
 *
 * @param old_key
 * @param new_key
 */
export function renameNodeInCode(old_key, new_key) {
    try {
        let re = new RegExp(`[ -][ ]${old_key}[ \n:]`, 'ig')
        while (true) {
            let docString = getLines().join("\n")
            let matches = Array.from(docString.matchAll(re))
            if (matches.length === 0) break

            let offset = matches[0]['index'] + 2
            attemptEditChange({changes: {from: offset, to: offset + old_key.length, insert: new_key}})
        }
    } catch (e) {
        console.log("Node rename: " + e)
    }
}

/**
 *
 * @param key
 */
export function removeNodeFromCode(key) {
    try {
        let docString = getLines().join("\n")
        let re = new RegExp(`${key}:[ \na-zA-Z0-9:\\-\x27]+?(?=$|\n+    ([a-zA-Z]+))`, 'ig')
        let match = re.exec(docString);

        attemptEditChange({changes: {from: match['index'], to: match['index'] + match[0].length, insert: ""}})
    } catch (e) {
        console.log("Node removal: " + e)
    }
}
