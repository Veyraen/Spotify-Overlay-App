function parseTimestamp(timestamp) {

    const match =
        timestamp.match(/^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/)

    if (!match) return null

    const minutes =
        Number(match[1])

    const seconds =
        Number(match[2])

    const fraction =
        match[3] || '0'

    const milliseconds =
        Number(fraction.padEnd(3, '0').slice(0, 3))

    return (minutes * 60 * 1000) + (seconds * 1000) + milliseconds
}

function parseLrc(lrcText) {

    if (typeof lrcText !== 'string') {
        return []
    }

    return lrcText
        .split(/\r?\n/)
        .flatMap((rawLine) => {

            const timestamps =
                [...rawLine.matchAll(/\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\]/g)]

            if (timestamps.length === 0) {
                return []
            }

            const text =
                rawLine.replace(/\[[^\]]+\]/g, '').trim()

            if (!text) {
                return []
            }

            return timestamps
                .map((timestampMatch) => ({
                    timeMs: parseTimestamp(timestampMatch[1]),
                    text
                }))
                .filter((line) => Number.isFinite(line.timeMs))
        })
        .sort((firstLine, secondLine) => firstLine.timeMs - secondLine.timeMs)
}

module.exports = {
    parseLrc,
    parseTimestamp
}
