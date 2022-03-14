import {editor} from './app'
import * as consts from './consts'

/**
 * Add a code annotation to specific line
 * @param row
 * @param text
 */
export function addAnnotation(row, text) {
    editor.getSession().setAnnotations([{
        row: row,
        column: 0,
        type: "error",
        text: text
    }]);
}

/**
 * Validate the text area to see that input matches our spec
 * @param yaml
 */
export function validateYaml(yaml) {
    const nodeKeys = ["type", "trust", "connections"]
    try {
        let obj = jsyaml.load(yaml.join("\n"));
        for (let node of Object.keys(obj.nodes)) {
            for (let key of Object.keys(obj.nodes[node])) {
                if (nodeKeys.indexOf(key) < 0) {
                    addAnnotation(1, `${key} isn't valid here. See \`node\``)
                }
            }
        }
    } catch (e) {
        console.log(e)
    }
}
