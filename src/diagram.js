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

    return 'generic'
}

/**
 * @param style
 * @param prefix  'exit' or 'entry'
 * @returns {string|null}
 */
export function sideFromStyle(style, prefix) {
    if (!style) return null
    const xMatch = style.match(new RegExp(`${prefix}X=([\\d.]+)`))
    const yMatch = style.match(new RegExp(`${prefix}Y=([\\d.]+)`))
    if (!xMatch || !yMatch) return null
    const x = parseFloat(xMatch[1]), y = parseFloat(yMatch[1])
    if (x === 0.5 && y === 0)   return 'top'
    if (x === 0.5 && y === 1)   return 'bottom'
    if (x === 0   && y === 0.5) return 'left'
    if (x === 1   && y === 0.5) return 'right'
    return null
}

/**
 * Infer exit/entry sides from the relative centre positions of two cells.
 * @param srcCell  mxCell
 * @param tgtCell  mxCell
 * @returns {{ from: string, to: string } | null}
 */
export function inferSides(srcCell, tgtCell) {
    const sg = srcCell && srcCell.geometry
    const tg = tgtCell && tgtCell.geometry
    if (!sg || !tg) return null
    const dx = (tg.x + tg.width  / 2) - (sg.x + sg.width  / 2)
    const dy = (tg.y + tg.height / 2) - (sg.y + sg.height / 2)
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx > 0 ? { from: 'right', to: 'left'  }
                      : { from: 'left',  to: 'right' }
    } else {
        return dy > 0 ? { from: 'bottom', to: 'top'    }
                      : { from: 'top',    to: 'bottom' }
    }
}
