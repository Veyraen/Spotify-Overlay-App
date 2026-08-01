const PLAYBACK_STATE_URL = 'https://api.spotify.com/v1/me/player'

class SpotifyApi {

    constructor({
        auth
    }) {

        this.auth = auth
    }

    async getPlaybackState() {

        const requestedAt =
            Date.now()

        const accessToken =
            await this.auth.getAccessToken()

        if (!accessToken) {
            return {
                connected: false,
                reason: 'not-authenticated'
            }
        }

        const response =
            await fetch(
                PLAYBACK_STATE_URL,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                }
            )

        if (response.status === 204) {
            return {
                connected: true,
                isPlaying: false,
                item: null,
                progressMs: 0
            }
        }

        if (response.status === 401) {
            try {
                await this.auth.refreshToken()
            } catch {
                return {
                    connected: false,
                    reason: 'not-authenticated'
                }
            }

            return this.getPlaybackState()
        }

        if (!response.ok) {
            throw new Error(`Spotify playback request failed: ${response.status}`)
        }

        const playback =
            await response.json()

        return this.normalizePlaybackState(
            playback,
            {
                requestedAt,
                receivedAt: Date.now()
            }
        )
    }

    normalizePlaybackState(playback, timing = {}) {

        const item =
            playback.item || null

        const receivedAt =
            timing.receivedAt || Date.now()

        const requestedAt =
            timing.requestedAt || receivedAt

        const roundTripMs =
            Math.max(0, receivedAt - requestedAt)

        const responseLatencyMs =
            Math.round(roundTripMs / 2)

        return {
            connected: true,
            timestamp: playback.timestamp,
            progressMs: playback.progress_ms || 0,
            observedProgressMs: playback.progress_ms || 0,
            responseLatencyMs,
            receivedAt,
            isPlaying: Boolean(playback.is_playing),
            track: item
                ? {
                    id: item.id,
                    uri: item.uri,
                    name: item.name,
                    durationMs: item.duration_ms,
                    artists: Array.isArray(item.artists)
                        ? item.artists.map((artist) => artist.name)
                        : [],
                    album: item.album?.name || '',
                    imageUrl: item.album?.images?.[0]?.url || ''
                }
                : null
        }
    }
}

module.exports = SpotifyApi
