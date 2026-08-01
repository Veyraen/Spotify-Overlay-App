const fs = require('fs/promises')
const path = require('path')
const { parseLrc } = require('./lrc-parser')

function sanitizeFilePart(value) {

    return String(value || '')
        .replace(/[<>:"/\\|?*]+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

class LocalLrc {

    constructor({
        userDataPath
    }) {

        this.lyricsDirectory =
            path.join(userDataPath, 'lyrics')
    }

    getFileName(track) {

        const artist =
            sanitizeFilePart(track.artists?.[0] || 'Unknown Artist')

        const title =
            sanitizeFilePart(track.name || 'Unknown Track')

        return `${artist} - ${title}.lrc`
    }

    async findSyncedLyrics(track) {

        const filePath =
            path.join(
                this.lyricsDirectory,
                this.getFileName(track)
            )

        try {

            const lrcText =
                await fs.readFile(filePath, 'utf8')

            const lines =
                parseLrc(lrcText)

            if (lines.length === 0) {
                return null
            }

            return {
                source: 'local-lrc',
                filePath,
                lines
            }

        } catch {

            return null
        }
    }
}

module.exports = LocalLrc
