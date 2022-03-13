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
    if (style.indexOf("aws3.rds") !== -1) return 'db'
    if (style.indexOf("aws3d.rds") !== -1) return 'db'
    if (style.indexOf("aws4.rds") !== -1) return 'db'
    if (style.indexOf("aws3d.application_server") !== -1) return 'app'
    if (style.indexOf("aws4.ec2") !== -1) return 'app'

    return 'app'
}
