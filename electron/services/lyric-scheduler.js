const PlaybackClock = require('./playback-clock')

const LOOKAHEAD_COUNT = 7
const CONFIDENCE_WINDOW_MS = 100
const MAX_SCHEDULE_MS = 120_000

class LyricScheduler {

    constructor({
        lyrics,
        onLineChange,
        loop = false,
        lyricOffsetMs = -120
    }) {

        this.clock =
            new PlaybackClock()

        this.lyrics =
            this.normalizeLyrics(lyrics)

        this.onLineChange =
            onLineChange

        this.loop =
            loop

        this.lyricOffsetMs =
            lyricOffsetMs

        this.activeIndex =
            0

        this.transitionTimers =
            []
    }

    normalizeLyrics(lyrics) {

        return Array.isArray(lyrics)
            ? lyrics
                .filter((line) => Number.isFinite(line.timeMs))
                .sort((firstLine, secondLine) => firstLine.timeMs - secondLine.timeMs)
            : []
    }

    start(startPositionMs = 0, playing = true) {

        this.cancelTransitionTimers()
        this.clock.hardResync(startPositionMs, playing)
        this.rebuildScheduleFromTimestamp(
            this.clock.nowMs(),
            {
                allowBackward: true
            }
        )
    }

    stop() {

        this.cancelTransitionTimers()
        this.clock.pauseAt(this.clock.nowMs())
    }

    pause() {

        this.cancelTransitionTimers()
        this.clock.pauseAt(this.clock.nowMs())
    }

    resume() {

        this.clock.resumeFrom(this.clock.nowMs())
        this.rebuildScheduleFromTimestamp(
            this.clock.nowMs(),
            {
                allowBackward: true
            }
        )
    }

    seek(positionMs, playing = true) {

        this.clock.hardResync(positionMs, playing)
        this.rebuildScheduleFromTimestamp(
            this.clock.nowMs(),
            {
                allowBackward: true
            }
        )
    }

    softSeek(positionMs, strength = 0.2) {

        this.clock.softResync(positionMs, strength)
        this.rebuildScheduleFromTimestamp(
            this.clock.nowMs(),
            {
                allowBackward: false
            }
        )
    }

    getElapsedMs() {

        return this.clock.nowMs()
    }

    cancelTransitionTimers() {

        this.transitionTimers.forEach((entry) => {
            clearTimeout(entry.timer)
        })

        this.transitionTimers = []
    }

    resolveIndex(positionMs, allowBackward) {

        if (this.lyrics.length === 0) {
            return 0
        }

        if (positionMs < this.lyrics[0].timeMs) {
            return -1
        }

        let idealIndex = 0

        for (let index = 0; index < this.lyrics.length; index++) {

            if (this.lyrics[index].timeMs > positionMs) {
                break
            }

            idealIndex = index
        }

        if (allowBackward) {
            return idealIndex
        }

        if (idealIndex < this.activeIndex) {
            return this.activeIndex
        }

        if (idealIndex > this.activeIndex) {

            const boundaryMs =
                this.lyrics[idealIndex].timeMs

            if (positionMs < boundaryMs - CONFIDENCE_WINDOW_MS) {
                return this.activeIndex
            }
        }

        return idealIndex
    }

    emitActiveLine() {

        if (this.activeIndex === -1) {

            this.onLineChange({
                index: -1,
                line: null,
                timeMs: null,
                total: this.lyrics.length
            })

            return
        }

        const line =
            this.lyrics[this.activeIndex]

        if (!line) return

        this.onLineChange({
            index: this.activeIndex,
            line,
            timeMs: line.timeMs,
            total: this.lyrics.length
        })
    }

    applyLineAtIndex(index) {

        if (this.lyrics.length === 0) return

        this.activeIndex =
            Math.max(-1, Math.min(index, this.lyrics.length - 1))

        this.emitActiveLine()
    }

    rebuildScheduleFromTimestamp(positionMs, {
        allowBackward = false
    } = {}) {

        this.cancelTransitionTimers()

        if (this.lyrics.length === 0) {
            this.activeIndex = 0
            return
        }

        const targetPositionMs =
            positionMs + this.lyricOffsetMs

        const resolvedIndex =
            this.resolveIndex(targetPositionMs, allowBackward)

        this.applyLineAtIndex(resolvedIndex)
        this.maintainLookahead()
    }

    armTransition(targetIndex) {

        const line =
            this.lyrics[targetIndex]

        if (!line) return

        const fireAtMs =
            line.timeMs - this.lyricOffsetMs

        const delayMs =
            Math.min(
                MAX_SCHEDULE_MS,
                Math.max(0, fireAtMs - this.clock.nowMs())
            )

        const timer =
            setTimeout(() => {
                this.onTransitionFire(targetIndex)
            }, delayMs)

        this.transitionTimers.push({
            timer,
            targetIndex
        })
    }

    onTransitionFire(targetIndex) {

        this.transitionTimers =
            this.transitionTimers.filter((entry) => (
                entry.targetIndex !== targetIndex
            ))

        if (!this.clock.playing) return

        if (targetIndex <= this.activeIndex) {
            return
        }

        if (targetIndex !== this.activeIndex + 1) {
            return
        }

        this.applyLineAtIndex(targetIndex)
        this.maintainLookahead()
    }

    maintainLookahead() {

        if (!this.clock.playing || this.lyrics.length === 0) {
            return
        }

        this.transitionTimers =
            this.transitionTimers.filter((entry) => {

                if (entry.targetIndex <= this.activeIndex) {
                    clearTimeout(entry.timer)
                    return false
                }

                return true
            })

        const scheduled =
            new Set(
                this.transitionTimers.map((entry) => entry.targetIndex)
            )

        for (let offset = 1; offset <= LOOKAHEAD_COUNT; offset++) {

            const targetIndex =
                this.activeIndex + offset

            if (targetIndex >= this.lyrics.length) {

                if (this.loop && targetIndex === this.lyrics.length) {
                    this.armLoopRestart()
                }

                break
            }

            if (scheduled.has(targetIndex)) {
                continue
            }

            this.armTransition(targetIndex)
        }
    }

    armLoopRestart() {

        if (this.transitionTimers.some((entry) => entry.targetIndex === 0)) {
            return
        }

        const lastLine =
            this.lyrics[this.lyrics.length - 1]

        const delayMs =
            Math.max(0, lastLine.timeMs + 1200 - this.clock.nowMs())

        const timer =
            setTimeout(() => {
                this.start(0, true)
            }, delayMs)

        this.transitionTimers.push({
            timer,
            targetIndex: 0
        })
    }

    verifyAlignment(allowBackward = false) {

        if (this.lyrics.length === 0 || !this.clock.playing) {
            return
        }

        const expectedIndex =
            this.resolveIndex(
                this.clock.nowMs() + this.lyricOffsetMs,
                allowBackward
            )

        if (expectedIndex !== this.activeIndex) {
            this.applyLineAtIndex(expectedIndex)
            this.maintainLookahead()
            return
        }

        const armedAhead =
            this.transitionTimers.filter((entry) => (
                entry.targetIndex > this.activeIndex
            )).length

        if (armedAhead < LOOKAHEAD_COUNT) {
            this.maintainLookahead()
        }
    }
}

module.exports = LyricScheduler
