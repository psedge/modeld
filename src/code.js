import 'js-yaml';
import {editor} from './app'
import * as consts from './consts'

function getIndentLevel(n) {
    return " ".repeat(n * 4)
}

/**
 * Attempt a series of changes to the editor content
 * @param changes
 */
export function attemptEditChange(changes) {
    editor.lockEvents = true
    try {
        editor.dispatch(changes)
    } finally {
        editor.lockEvents = false
    }
}

/**
 * Parse the YAML contained within a textArea t, replacing tabs with 4 spaces
 * It's fairly common half way through editing it won't be valid, wait until it is
 * @param t
 * @returns {*}
 */
export function parseTextAreaToYaml(t) {
    try {
        return jsyaml.load(t.text.join("\n"));
    } catch (e) {
        consts.DEBUG === true ? console.log(e) : null
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
 * Return the child with a class attribute of "cm-activeLine"
 * @param v
 * @returns {number}
 */
export function activeLineFromViewUpdate(v) {
    let count = 0
    for (let lv of v.view.docView.children) {
        if (lv.attrs === null || lv.attrs.length === 0) {
            count += 1
            continue
        }

        if (!lv.attrs.hasOwnProperty("class")) {
            count += 1
            continue
        }

        const classes = lv.attrs['class'].split(" ")
        for (let cl of classes) {
            if (cl === "cm-activeLine") {
                return count
            }
        }

        count += 1
    }
}

/**
 *
 * @param node
 */
export function addNodeToCode(node) {
    try {
        let nodeYaml = {
            type: node.type,
            // connections: [' '],
        }
        let newNodeBlock = "\n" + getIndentLevel(1)
        newNodeBlock += (node.name + ":\n" + jsyaml.dump(nodeYaml)).replaceAll("\n", "\n" + getIndentLevel(2))
        let documentEnd = document.editor.viewState.state.doc.length

        attemptEditChange({changes: {from: documentEnd, to: documentEnd, insert: newNodeBlock}})
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
        let docString = editor.viewState.state.doc.text.join("\n")
        let yaml = jsyaml.load(docString)

        if (!yaml['nodes'][key].hasOwnProperty("connections")) {
            yaml['nodes'][key]['connections'] = []
        }
        yaml['nodes'][key]['connections'].push(cnx)

        let newNodeBlock = (key + ":\n" + jsyaml.dump(yaml['nodes'][key])).replaceAll("\n", "\n" + getIndentLevel(2))
        let re = new RegExp(`${key}:[ \na-zA-Z:-]+?(?=$|\n[ ]{2,4}([a-zA-Z]+))`, 'ig')
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
        let docString = editor.viewState.state.doc.text.join("\n")
        let yaml = jsyaml.load(docString)

        if (!yaml['nodes'][key].hasOwnProperty("connections")) {
            yaml['nodes'][key]['connections'] = []
        }
        yaml['nodes'][key]['connections'].push(cnx)

        let newNodeBlock = (key + ":\n" + jsyaml.dump(yaml['nodes'][key]))
            .replaceAll("\n", "\n" + getIndentLevel(2))
            .replace(": null", "")
        let re = new RegExp(`${key}:(["a-zA-Z:.'?,\\- \\n]+?)(?=($|\\n[ ]{4}[a-z]))`, 'ig')
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
        let docString = editor.viewState.state.doc.text.join("\n")
        let changes = []
        let re = new RegExp(`[ -][ ]${old_key}[ \n:]`, 'ig')

        let matches = docString.matchAll(re)
        for (let m of matches) {
            let offset = m['index'] + 2
            changes.push({from: offset, to: offset + old_key.length, insert: new_key})
        }

        attemptEditChange({changes})
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
        let docString = editor.viewState.state.doc.text.join("\n")
        let re = new RegExp(`${key}:[ \na-zA-Z:\\-\x27]+?(?=$|\n+  ([a-zA-Z]+))`, 'ig')
        let match = re.exec(docString);

        attemptEditChange({changes: {from: match['index'], to: match['index'] + match[0].length, insert: null}})
    } catch (e) {
        console.log("Node removal: " + e)
    }
}
