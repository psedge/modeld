/**
 *
 * @param style
 * @returns {string}
 */
export function determineCellTypeFromStyling(style) {
    if (style.indexOf("shape=umlActor") !== -1) return 'actor'
    if (style.indexOf("shape=actor") !== -1) return 'actor'
    if (style.indexOf("mxgraph.basic.smiley") !== -1) return 'actor'
    if (style.indexOf("rounded=1") !== -1) return 'db'
    if (style.indexOf("cylinder") !== -1) return 'db'
    if (style.indexOf("database") !== -1) return 'db'

    return 'app'
}
