export function lengthOfDict(dict) {
    try {
        return Object.keys(dict).length
    } catch (e) {
        return 0
    }
}
