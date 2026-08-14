const SpotifyApi = require('../services/spotify-api')
const SpotifyAuth = require('../services/spotify-auth')
const LrclibApi = require('../services/lrclib-api')
const LocalLrc = require('../services/local-lrc')

const PLAYBACK_VERIFY_INTERVAL_MS = 5_000
const SCHEDULER_WATCHDOG_MS = 8_000
const SOFT_RESYNC_THRESHOLD_MS = 150
const HARD_RESYNC_THRESHOLD_MS = 500
const SOFT_RESYNC_STRENGTH = 0.2
const LYRIC_LEAD_MS = 0

function getCompensatedProgressMs(playbackState) {

    if (!playbackState) {
        return 0
    }

    const baseProgressMs =
        playbackState.progressMs || 0

    const latencyMs =
        playbackState.isPlaying
            ? playbackState.responseLatencyMs || 0
            : 0

    return Math.max(
        0,
        baseProgressMs + latencyMs + LYRIC_LEAD_MS
    )
}

function startSpotifyIPC(win, app, lyricsController, settings = {}) {

    const auth =
        new SpotifyAuth({
            userDataPath: app.getPath('userData'),
            clientId: settings.spotify?.clientId
        })

    const spotifyApi =
        new SpotifyApi({
            auth
        })

    const lrclibApi =
        new LrclibApi()

    const localLrc =
        new LocalLrc({
            userDataPath: app.getPath('userData')
        })

    let activeTrackId = null
    let playbackGeneration = 0
    let watchdogId = null
    let timelineVerificationTimer = null
    let timelineVerificationInFlight = false
    let timelineVerificationInFlightGeneration = null
    let lastPlaybackState = null
    let lastIsPlaying = false
    let authenticationInFlight = null

    function getPlaybackTrackId(playbackState) {

        return playbackState?.track?.id || null
    }

    function invalidatePlaybackGeneration(nextTrackId = null) {

        playbackGeneration += 1
        activeTrackId = nextTrackId

        clearTimelineVerificationTimer()
        timelineVerificationInFlight = false
        timelineVerificationInFlightGeneration = null
    }

    function isStaleVerifierResponse({
        generation,
        expectedTrackId
    } = {}) {

        if (!Number.isInteger(generation)) {
            return false
        }

        if (generation !== playbackGeneration) {
            return true
        }

        if (
            expectedTrackId &&
            activeTrackId &&
            expectedTrackId !== activeTrackId
        ) {
            return true
        }

        return false
    }

    async function findLyricsForTrack(track) {

        const localLyrics =
            await localLrc.findSyncedLyrics(track)

        return localLyrics || lrclibApi.findSyncedLyrics(track)
    }

    async function loadLyricsForPlayback(
        playbackState,
        generation = playbackGeneration
    ) {

        if (!playbackState?.track || !lyricsController) {
            return null
        }

        const track =
            playbackState.track

        const trackId =
            getPlaybackTrackId(playbackState)

        try {

            const lyricFetchStartedAt =
                Date.now()

            const lyricResult =
                await findLyricsForTrack(track)

            const lyricFetchElapsedMs =
                playbackState.isPlaying
                    ? Date.now() - lyricFetchStartedAt
                    : 0

            if (
                generation !== playbackGeneration ||
                trackId !== activeTrackId
            ) {
                return null
            }

            if (!lyricResult) {
                console.log(
                    'Lyrics not found:',
                    `${track.artists.join(', ')} - ${track.name}`
                )

                lyricsController.clearLyrics({ track })
                return null
            }

            console.log(
                'Lyrics loaded:',
                JSON.stringify(
                    {
                        source: lyricResult.source,
                        track: track.name,
                        artist: track.artists.join(', '),
                        lines: lyricResult.lines.length,
                        startPositionMs:
                            getCompensatedProgressMs(playbackState)
                            + lyricFetchElapsedMs
                    },
                    null,
                    2
                )
            )

            lyricsController.loadLyrics({
                lines: lyricResult.lines,
                startPositionMs:
                    getCompensatedProgressMs(playbackState)
                    + lyricFetchElapsedMs,
                loop: false,
                source: lyricResult.source,
                track,
                playing: playbackState.isPlaying
            })

            if (
                playbackState.isPlaying &&
                generation === playbackGeneration &&
                trackId === activeTrackId
            ) {
                startTimelineVerifier()
            }

            return lyricResult

        } catch (error) {

            console.error('Lyrics load failed:', error)
            return null
        }
    }

    async function reconcilePlayback(playbackState) {

        const responseTrackId =
            getPlaybackTrackId(playbackState)

        if (!playbackState?.connected || !playbackState.track) {
            if (activeTrackId !== null) {
                invalidatePlaybackGeneration(null)
            }
            lastPlaybackState =
                playbackState
            lyricsController?.pause()
            clearTimelineVerificationTimer()
            lastIsPlaying = false
            return
        }

        const trackChanged =
            responseTrackId !== activeTrackId

        if (trackChanged) {
            invalidatePlaybackGeneration(responseTrackId)
            lastPlaybackState =
                playbackState
            const generation =
                playbackGeneration
            await loadLyricsForPlayback(
                playbackState,
                generation
            )
            lastIsPlaying = playbackState.isPlaying
            return
        }

        lastPlaybackState =
            playbackState

        if (!playbackState.isPlaying) {

            if (lastIsPlaying) {
                lyricsController?.seek(
                    getCompensatedProgressMs(playbackState),
                    false
                )
                console.log('Lyrics scheduler paused')
            }

            clearTimelineVerificationTimer()
            lastIsPlaying = false
            return
        }

        if (!lastIsPlaying) {
            lyricsController?.seek(getCompensatedProgressMs(playbackState), true)
            console.log('Lyrics scheduler resumed')
            lastIsPlaying = true
            startTimelineVerifier()
            return
        }

        const localPositionMs =
            lyricsController?.getElapsedMs() || 0

        const spotifyPositionMs =
            getCompensatedProgressMs(playbackState)

        const driftMs =
            Math.abs(spotifyPositionMs - localPositionMs)

        if (driftMs > HARD_RESYNC_THRESHOLD_MS) {
            lyricsController?.seek(spotifyPositionMs, true)
            console.log(
                'Timeline verifier hard-corrected drift:',
                `${Math.round(driftMs)}ms`,
                `(lead ${LYRIC_LEAD_MS}ms)`
            )
        } else if (driftMs > SOFT_RESYNC_THRESHOLD_MS) {
            lyricsController?.softSeek(spotifyPositionMs, SOFT_RESYNC_STRENGTH)
            console.log(
                'Timeline verifier soft-corrected drift:',
                `${Math.round(driftMs)}ms`,
                `(strength ${SOFT_RESYNC_STRENGTH})`
            )
        }

        lastIsPlaying = true
    }

    async function sendPlaybackState({
        log = true,
        generation = null,
        expectedTrackId = null
    } = {}) {

        const playbackState =
            await spotifyApi.getPlaybackState()

        if (
            isStaleVerifierResponse({
                generation,
                expectedTrackId
            })
        ) {
            return playbackState
        }

        if (log) {
            console.log(
                'Spotify playback state:',
                JSON.stringify(playbackState, null, 2)
            )
        }

        if (win.isDestroyed()) return playbackState

        win.webContents.send(
            'spotify:playback-state',
            playbackState
        )

        await reconcilePlayback(playbackState)

        return playbackState
    }

    function clearTimelineVerificationTimer() {

        if (!timelineVerificationTimer) return

        clearTimeout(timelineVerificationTimer)
        timelineVerificationTimer = null
    }

    function getVerificationInterval() {

        const trackDurationMs =
            lastPlaybackState?.track?.durationMs || 0

        if (!trackDurationMs || !lastPlaybackState?.isPlaying) {
            return PLAYBACK_VERIFY_INTERVAL_MS
        }

        const localPositionMs =
            lyricsController?.getElapsedMs() || 0

        const remainingMs =
            Math.max(0, trackDurationMs - localPositionMs)

        if (remainingMs <= 1_000) return 350
        if (remainingMs <= 2_000) return 500
        if (remainingMs <= 3_000) return 1_000

        return PLAYBACK_VERIFY_INTERVAL_MS
    }

    function startTimelineVerifier({
        immediate = false
    } = {}) {

        clearTimelineVerificationTimer()

        if (!lastIsPlaying && !lastPlaybackState?.isPlaying) return
        if (!activeTrackId) return

        const intervalMs =
            immediate
                ? 0
                : getVerificationInterval()

        timelineVerificationTimer =
            setTimeout(() => {
                verifyTimeline().catch((error) => {
                    console.error('Timeline verifier failed:', error)
                    startTimelineVerifier()
                })
            }, intervalMs)
    }

    async function verifyTimeline() {

        if (timelineVerificationInFlight) {
            startTimelineVerifier()
            return
        }

        const generation =
            playbackGeneration

        const expectedTrackId =
            activeTrackId

        timelineVerificationInFlight = true
        timelineVerificationInFlightGeneration =
            generation

        try {
            await sendPlaybackState({
                log: false,
                generation,
                expectedTrackId
            })
        } finally {
            if (
                timelineVerificationInFlightGeneration ===
                generation
            ) {
                timelineVerificationInFlight = false
                timelineVerificationInFlightGeneration = null
            }
        }

        if (
            generation === playbackGeneration &&
            expectedTrackId === activeTrackId &&
            lastPlaybackState?.isPlaying &&
            activeTrackId
        ) {
            startTimelineVerifier()
        }
    }

    function startPlaybackMonitor() {

        startTimelineVerifier({
            immediate: true
        })

        if (watchdogId) return

        watchdogId = setInterval(() => {

            if (!lastIsPlaying) return

            lyricsController?.verifyAlignment(false)

        }, SCHEDULER_WATCHDOG_MS)
    }

    function stopPlaybackMonitor() {

        clearTimelineVerificationTimer()
        timelineVerificationInFlight = false
        timelineVerificationInFlightGeneration = null

        if (watchdogId) {
            clearInterval(watchdogId)
            watchdogId = null
        }
    }

    async function authenticate() {

        if (authenticationInFlight) {
            return authenticationInFlight
        }

        authenticationInFlight = authenticateWithSpotify()

        try {
            return await authenticationInFlight
        } finally {
            authenticationInFlight = null
        }
    }

    async function authenticateWithSpotify() {

        const token =
            await auth.authenticate()

        if (!win.isDestroyed()) {
            win.webContents.send(
                'spotify:auth-change',
                {
                    connected: Boolean(token?.access_token)
                }
            )
        }

        console.log('Spotify auth connected:', Boolean(token?.access_token))

        await sendPlaybackState()
        startPlaybackMonitor()
    }

    async function initialize() {

        await auth.loadToken()

        if (auth.token && auth.isTokenExpiringSoon()) {
            try {
                await auth.refreshToken()
            } catch (error) {
                console.error('Spotify startup token refresh failed:', error)
                auth.token = null
            }
        }

        if (!win.isDestroyed()) {
            win.webContents.send(
                'spotify:auth-change',
                {
                    connected: Boolean(auth.token?.access_token),
                    configured: auth.isConfigured()
                }
            )
        }

        console.log(
            'Spotify auth state:',
            JSON.stringify(
                {
                    connected: Boolean(auth.token?.access_token),
                    configured: auth.isConfigured()
                },
                null,
                2
            )
        )

        if (auth.token?.access_token) {
            await sendPlaybackState()
            startPlaybackMonitor()
            return
        }

        if (auth.isConfigured()) {
            await authenticate()
        }
    }

    if (win.webContents.isLoading()) {
            win.webContents.once('did-finish-load', () => {
                initialize().catch((error) => {
                    console.error(error)
                })
            })
        } else {
            initialize().catch((error) => {
                console.error(error)
            })
        }

    return {
        authenticate,
        sendPlaybackState,
        getVerificationInterval,
        verifyTimeline,
        startPlaybackMonitor,
        stopPlaybackMonitor
    }
}

module.exports = startSpotifyIPC
