const lyrics = require('../services/mock-lyrics')
const LyricScheduler = require('../services/lyric-scheduler')

function startLyricsIPC(win) {

    let scheduler = null
    let currentLyrics = lyrics

    const sendActiveLyric = (payload) => {

        if (win.isDestroyed()) {
            scheduler?.stop()
            return
        }

        win.webContents.send(
            'lyrics:update',
            payload
        )

    }

    const loadLyrics = ({
        lines,
        startPositionMs = 0,
        loop = false,
        source = 'unknown',
        track = null,
        playing = true
    }) => {

        if (!Array.isArray(lines) || lines.length === 0) {
            return
        }

        if (win.webContents.isLoading()) {

            win.webContents.once('did-finish-load', () => {
                loadLyrics({
                    lines,
                    startPositionMs,
                    loop,
                    source,
                    track,
                    playing
                })
            })

            return
        }

        scheduler?.stop()

        currentLyrics = lines

        win.webContents.send(
            'lyrics:load',
            {
                lines: currentLyrics,
                source,
                track
            }
        )

        scheduler =
            new LyricScheduler({
                lyrics: currentLyrics,
                loop,
                onLineChange: sendActiveLyric
            })

        scheduler.start(startPositionMs, playing)
    }

        const clearLyrics = ({
        track = null,
        reason = 'no-lyrics'
    } = {}) => {

        if (win.webContents.isLoading()) {

            win.webContents.once('did-finish-load', () => {
                clearLyrics({ track, reason })
            })

            return
        }

        scheduler?.stop()
        scheduler = null

        currentLyrics = []

        win.webContents.send(
            'lyrics:unavailable',
            {
                track,
                reason
            }
        )
    }

    const startMockScheduler = () => {

        loadLyrics({
            lines: lyrics,
            loop: true,
            source: 'mock'
        })

    }

    const controller = {
        loadLyrics,
        clearLyrics,
        getElapsedMs: () => scheduler?.getElapsedMs() || 0,
        pause: () => scheduler?.pause(),
        resume: () => scheduler?.resume(),
        seek: (positionMs, playing = true) => scheduler?.seek(positionMs, playing),
        softSeek: (positionMs, strength = 0.2) => scheduler?.softSeek(positionMs, strength),
        verifyAlignment: (allowBackward = false) => scheduler?.verifyAlignment(allowBackward),
        stop: () => scheduler?.stop()
    }

    if (win.webContents.isLoading()) {

        win.webContents.once(
            'did-finish-load',
            startMockScheduler
        )

        return controller
    }

    startMockScheduler()

    return controller

}

module.exports = startLyricsIPC
