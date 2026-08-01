const NS_PER_MS =
    1_000_000n

class PlaybackClock {

    constructor() {

        this.anchorPositionMs = 0
        this.anchorHr = process.hrtime.bigint()
        this.playing = false
    }

    hardResync(positionMs, playing) {

        this.anchorPositionMs =
            Math.max(0, positionMs)

        this.anchorHr =
            process.hrtime.bigint()

        this.playing =
            playing
    }

    softResync(targetPositionMs, strength = 0.2) {

        const currentPositionMs =
            this.nowMs()

        const correctionMs =
            (Math.max(0, targetPositionMs) - currentPositionMs)
            * strength

        this.hardResync(
            currentPositionMs + correctionMs,
            this.playing
        )
    }

    pauseAt(positionMs) {

        this.hardResync(
            positionMs,
            false
        )
    }

    resumeFrom(positionMs) {

        this.hardResync(
            positionMs,
            true
        )
    }

    nowMs() {

        if (!this.playing) {
            return this.anchorPositionMs
        }

        const elapsedNs =
            process.hrtime.bigint() - this.anchorHr

        const elapsedMs =
            Number(elapsedNs / NS_PER_MS)

        return this.anchorPositionMs + elapsedMs
    }
}

module.exports = PlaybackClock
