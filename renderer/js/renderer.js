import Kawarp
from '../../node_modules/@kawarp/core/dist/index.js'

import * as THREE from '../../node_modules/three/build/three.module.js'

console.log(
    'Three Revision:',
    THREE.REVISION
)

const lyricsList =
    document.getElementById('lyrics-list')

const pausedOverlay =
    document.getElementById('paused-overlay')

const noLyricsMessage =
    document.getElementById('no-lyrics-message')

const lyricsWrapper =
    document.getElementById('lyrics-wrapper')

const webglCanvas =
    document.getElementById(
        'webgl-background'
    )

const kawarpCanvas =
    document.getElementById(
        'kawarp-background'
    )

const overlay =
    document.getElementById('overlay')

const resizeHandle =
    document.getElementById('resize-handle')

const sceneA =
    document.getElementById('scene-a')

const sceneB =
    document.getElementById('scene-b')

let activeScene =
    sceneA

const trackArtwork =
    document.getElementById('track-artwork')

const liquidBackground =
    document.getElementById('liquid-background')

const liquidLayers =
    document.querySelectorAll('.liquid-layer')

const trackTitle =
    document.getElementById('track-title')

const trackArtist =
    document.getElementById('track-artist')

const settingsPanel =
    document.getElementById('settings-panel')

const settingsButton =
    document.getElementById('settings-button')

const minimizeButton =
    document.getElementById('minimize-button')

const closeButton =
    document.getElementById('close-button')

const fullscreenButton =
    document.getElementById('fullscreen-button')

const playbackProgress =
    document.getElementById('playback-progress')

const playbackProgressFill =
    document.getElementById('playback-progress-fill')

const playbackElapsedLabel =
    document.getElementById('playback-elapsed')

const playbackDurationLabel =
    document.getElementById('playback-duration')

const syncLyricsButton =
    document.getElementById('sync-lyrics-button')

const saveSettingsButton =
    document.getElementById('save-settings')

const cancelSettingsButton =
    document.getElementById('cancel-settings')

const resetSettingsButton =
    document.getElementById('reset-settings')

const resetConfirmDialog =
    document.getElementById('reset-confirm-dialog')

const resetConfirmYesButton =
    document.getElementById('reset-confirm-yes')

const resetConfirmNoButton =
    document.getElementById('reset-confirm-no')

const clientIdPrompt =
    document.getElementById('client-id-prompt')

const clientIdPromptYesButton =
    document.getElementById('client-id-prompt-yes')

const clientIdPromptLaterButton =
    document.getElementById('client-id-prompt-later')

let clientIdPromptShown = false

const backgroundModeInputs =
    document.querySelectorAll(
        'input[name="background-mode"]'
    )

const lyricAnimationInputs =
    document.querySelectorAll(
        'input[name="lyric-animation"]'
    )

const webglPreviewCanvas =
    document.getElementById('webgl-preview')

const kawarpPreviewCanvas =
    document.getElementById('kawarp-preview')

const previewLiquidLayers =
    document.querySelectorAll('.preview-liquid-layer')

const settingsInputs = {
    clientId: document.getElementById('spotify-client-id'),
    clickThrough: document.getElementById('shortcut-click-through'),
    spotifyLogin: document.getElementById('shortcut-spotify-login'),
    playbackRefresh: document.getElementById('shortcut-playback-refresh'),
    quit: document.getElementById('shortcut-quit')
}

setupShortcutRecorder(
    settingsInputs.clickThrough
)

setupShortcutRecorder(
    settingsInputs.spotifyLogin
)

setupShortcutRecorder(
    settingsInputs.playbackRefresh
)

setupShortcutRecorder(
    settingsInputs.quit
)

function updateOverlayScale() {

    const scale =
        Math.min(
            window.innerWidth,
            window.innerHeight
        ) / BASE_OVERLAY_SIZE

    const isFullscreen =
        overlay?.classList.contains('is-fullscreen')

    const controlsScale =
        Math.max(0.7, Math.min(scale, 1.45))

    const uiScale = isFullscreen
        ? scale
        : controlsScale

    document.documentElement.style.setProperty(
        '--ui-scale',
        uiScale.toFixed(3)
    )

    document.documentElement.style.setProperty(
        '--controls-scale',
        controlsScale.toFixed(3)
    )

    requestAnimationFrame(cacheLyricLayout)
}

function setupTopLeftResize() {

    if (!resizeHandle || !window.electronAPI?.startWindowResize) return

    let pointerId = null
    let startScreenX = 0
    let startScreenY = 0

    resizeHandle.addEventListener('pointerdown', async (event) => {

        if (event.button !== 0) return
        if (settingsPanel?.classList.contains('is-open')) return

        event.preventDefault()
        event.stopPropagation()

        pointerId = event.pointerId
        startScreenX = event.screenX
        startScreenY = event.screenY

        resizeHandle.setPointerCapture(pointerId)
        overlay?.classList.add('is-resizing')

        try {
            await window.electronAPI.startWindowResize()
        } catch (error) {
            console.error(error)
            pointerId = null
            overlay?.classList.remove('is-resizing')
        }
    })

    let pendingResizeEvent = null

    resizeHandle.addEventListener('pointermove', (event) => {

        if (pointerId !== event.pointerId) return

        event.preventDefault()

        pendingResizeEvent = event

        if (pendingResizeEvent === event) {
            requestAnimationFrame(() => {
                if (!pendingResizeEvent) return
                window.electronAPI.resizeWindowFromTopLeft?.({
                    deltaX: pendingResizeEvent.screenX - startScreenX,
                    deltaY: pendingResizeEvent.screenY - startScreenY
                })
                pendingResizeEvent = null
            })
        }
    })

    const finishResize = (event) => {

        if (pointerId !== event.pointerId) return

        try {
            resizeHandle.releasePointerCapture(pointerId)
        } catch {
            // Pointer capture may already be released by Chromium.
        }

        pointerId = null
        overlay?.classList.remove('is-resizing')
        window.electronAPI.finishWindowResize?.()
    }

    resizeHandle.addEventListener('pointerup', finishResize)
    resizeHandle.addEventListener('pointercancel', finishResize)
}

let previewKawarp = null
let previewKawarpInitialized = false

let webglPreviewInitialized = false
let webglPreviewRenderer = null
let webglPreviewRunning = false
let webglPreviewAnimationFrame = null
let webglPreviewFrameTimer = null
let activeSettingsPreviewMode = null

let kawarp = null
let kawarpInitialized = false

let webglInitialized = false
let webglRenderer = null
let webglScene = null
let webglCamera = null
let webglMaterial = null
let webglTextureLoader = null
let webglClock = null
let webglAnimationFrame = null
let webglFrameTimer = null
let webglRunning = false

let currentTexture = null
let webglFallbackTexture = null
let pendingWebGLTextureDispose = null
let webglArtworkUrl = null
let fadeStartTime = 0
const CROSSFADE_DURATION = 800
const WEBGL_FRAME_INTERVAL_MS = 1000 / 30
const WEBGL_PIXEL_RATIO_LIMIT = 1.15
const BASE_OVERLAY_SIZE = 400

let currentTrackId = null
let currentArtworkUrl =
    null

let lyrics = [

    {
        timeMs: 0,
        text: "Cause all my kindness"
    },

    {
        timeMs: 2500,
        text: "is taken for weakness"
    },

    {
        timeMs: 5000,
        text: "Now I'm four-five seconds from wildin'"
    },

    {
        timeMs: 7500,
        text: "and we got three more days"
    },

    {
        timeMs: 10000,
        text: "I just need time"
    },

    {
        timeMs: 12500,
        text: "snapping one, two"
    },

    {
        timeMs: 15000,
        text: "Where are you now"
    },

    {
        timeMs: 17500,
        text: "Atlantis"
    }

]

let activeIndex = 0

let wasSpotifyPlaying = true
let pausedBlurTimer = null
let pausedTextTimer = null

const PAUSED_BLUR_DURATION_MS = 1400
const PAUSED_TEXT_DELAY_MS = 200

function showPausedOverlay() {
    
    if (pausedBlurTimer) clearTimeout(pausedBlurTimer)
    if (pausedTextTimer) clearTimeout(pausedTextTimer)

    pausedOverlay.classList.remove('show-text')
    pausedOverlay.classList.add('is-visible')

    requestAnimationFrame(() => {
        pausedOverlay.classList.add('is-blurring')
    })

    pausedTextTimer = setTimeout(() => {
        pausedOverlay.classList.add('show-text')
    }, PAUSED_TEXT_DELAY_MS)
}

function hidePausedOverlay() {

    if (pausedBlurTimer) clearTimeout(pausedBlurTimer)
    if (pausedTextTimer) clearTimeout(pausedTextTimer)

    pausedOverlay.classList.remove('is-blurring')
    pausedOverlay.classList.remove('show-text')

    pausedBlurTimer = setTimeout(() => {
        pausedOverlay.classList.remove('is-visible')
    }, PAUSED_BLUR_DURATION_MS)
}

let lyricElements = []
let centerFrame = null
let activeArtworkUrl = ''
let currentSettings = null
let lyricPreviewOffset = 0
let lyricPreviewFrame = null
let cachedWrapperHeight = 0
let cachedLyricsHeight = 0
let cachedLyricOffsets = []
let lyricStaggerFrame = null
let lyricStaggerCleanupTimer = null
const LYRIC_WHEEL_SENSITIVITY = 1.05
const LYRIC_SYNC_BUTTON_THRESHOLD_RATIO = 0.22
const LYRIC_STAGGER_DELAY_MS = 55
const LYRIC_STAGGER_DURATION_MS = 640
const LYRIC_STAGGER_MAX_DELAY_MS = 440

function clamp(value, min, max) {

    return Math.min(Math.max(value, min), max)
}

function cacheLyricLayout() {

    cachedWrapperHeight =
        lyricsWrapper.clientHeight

    cachedLyricsHeight =
        lyricsList.scrollHeight

    cachedLyricOffsets =
        lyricElements.map(
            element => element.offsetTop
        )
}

function getLyricVisualTops() {

    const wrapperRect =
        lyricsWrapper.getBoundingClientRect()

    return lyricElements.map((element) => (
        element.getBoundingClientRect().top - wrapperRect.top
    ))
}

function clearLyricStaggerState() {

    if (lyricStaggerFrame) {
        cancelAnimationFrame(lyricStaggerFrame)
        lyricStaggerFrame = null
    }

    if (lyricStaggerCleanupTimer) {
        clearTimeout(lyricStaggerCleanupTimer)
        lyricStaggerCleanupTimer = null
    }

    lyricElements.forEach((element) => {
        element.getAnimations().forEach((anim) => anim.cancel())
    })
}


function rgbToHsl(red, green, blue) {

    const r = red / 255
    const g = green / 255
    const b = blue / 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const lightness = (max + min) / 2

    if (max === min) {
        return {
            hue: 0,
            saturation: 0,
            lightness
        }
    }

    const delta = max - min
    const saturation =
        lightness > 0.5
            ? delta / (2 - max - min)
            : delta / (max + min)

    let hue

    if (max === r) {
        hue = ((g - b) / delta) + (g < b ? 6 : 0)
    } else if (max === g) {
        hue = ((b - r) / delta) + 2
    } else {
        hue = ((r - g) / delta) + 4
    }

    return {
        hue: hue / 6,
        saturation,
        lightness
    }
}

function hslToRgb(hue, saturation, lightness) {

    if (saturation === 0) {
        const value = Math.round(lightness * 255)
        return [value, value, value]
    }

    const hueToRgb = (p, q, t) => {

        let nextT = t

        if (nextT < 0) nextT += 1
        if (nextT > 1) nextT -= 1
        if (nextT < 1 / 6) return p + ((q - p) * 6 * nextT)
        if (nextT < 1 / 2) return q
        if (nextT < 2 / 3) return p + ((q - p) * ((2 / 3) - nextT) * 6)

        return p
    }

    const q =
        lightness < 0.5
            ? lightness * (1 + saturation)
            : lightness + saturation - (lightness * saturation)

    const p =
        (2 * lightness) - q

    return [
        Math.round(hueToRgb(p, q, hue + (1 / 3)) * 255),
        Math.round(hueToRgb(p, q, hue) * 255),
        Math.round(hueToRgb(p, q, hue - (1 / 3)) * 255)
    ]
}

function tuneColor(rgb) {

    const hsl =
        rgbToHsl(rgb[0], rgb[1], rgb[2])

    return hslToRgb(
        hsl.hue,
        hsl.saturation < 0.12
            ? clamp(hsl.saturation, 0, 0.10)
            : clamp(hsl.saturation * 1.25, 0.22, 0.78),
        clamp(hsl.lightness, 0.28, 0.62)
    )
}

function formatRgb(rgb, alpha = 1) {

    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`
}

function chooseArtworkColors(imageData) {

    const buckets =
        new Map()

    for (let index = 0; index < imageData.length; index += 4) {

        const alpha =
            imageData[index + 3]

        if (alpha < 180) continue

        const red =
            imageData[index]

        const green =
            imageData[index + 1]

        const blue =
            imageData[index + 2]

        const hsl =
            rgbToHsl(red, green, blue)

        if (hsl.lightness < 0.08 || hsl.lightness > 0.92) continue

        const bucketKey =
            [
                Math.round(red / 24),
                Math.round(green / 24),
                Math.round(blue / 24)
            ].join(',')

        const existing =
            buckets.get(bucketKey) || {
                red: 0,
                green: 0,
                blue: 0,
                count: 0,
                saturation: 0,
                lightness: 0
            }

        existing.red += red
        existing.green += green
        existing.blue += blue
        existing.count += 1
        existing.saturation += hsl.saturation
        existing.lightness += hsl.lightness

        buckets.set(bucketKey, existing)
    }

    return [...buckets.values()]
        .map((bucket) => {

        const count =
            bucket.count

        const averageSaturation =
            bucket.saturation / count

        const averageLightness =
            bucket.lightness / count

        const contrast =
            1 - Math.abs(averageLightness - 0.5) * 1.35

            const score =
            Math.log(count + 1)
            * (0.35 + averageSaturation * 2.6)
            * Math.max(0.2, contrast)

            return {
                score,
                rgb: tuneColor([
                Math.round(bucket.red / count),
                Math.round(bucket.green / count),
                Math.round(bucket.blue / count)
                ])
            }
        })
        .sort((firstColor, secondColor) => secondColor.score - firstColor.score)
        .slice(0, 3)
        .map((color) => color.rgb)
}

function applyArtworkColors(colors) {

    const palette =
        colors.length > 0
            ? colors
            : [[150, 150, 150]]

    const primary =
        palette[0]

    const secondary =
        palette[1] || primary

    const tertiary =
        palette[2] || secondary

    const primaryHsl =
        rgbToHsl(primary[0], primary[1], primary[2])

    const shadowColor =
        hslToRgb(
            primaryHsl.hue,
            clamp(primaryHsl.saturation * 0.75, 0.12, 0.55),
            clamp(primaryHsl.lightness * 0.42, 0.12, 0.32)
        )

    const lightColor =
        hslToRgb(
            primaryHsl.hue,
            clamp(primaryHsl.saturation * 0.55, 0.10, 0.42),
            clamp(primaryHsl.lightness + 0.18, 0.52, 0.74)
        )

    overlay.style.setProperty('--artwork-accent', formatRgb(primary, 0.46))
    overlay.style.setProperty('--artwork-accent-soft', formatRgb(primary, 0.22))
    overlay.style.setProperty('--artwork-secondary', formatRgb(secondary, 0.34))
    overlay.style.setProperty('--artwork-tertiary', formatRgb(tertiary, 0.30))
    overlay.style.setProperty('--artwork-shadow', formatRgb(shadowColor, 0.68))
    overlay.style.setProperty('--artwork-light', formatRgb(lightColor, 0.42))
    overlay.style.setProperty('--artwork-base', formatRgb(shadowColor, 1))
}

function resetArtworkTheme() {

    [
        '--artwork-accent',
        '--artwork-accent-soft',
        '--artwork-secondary',
        '--artwork-tertiary',
        '--artwork-shadow',
        '--artwork-light',
        '--artwork-base'
    ].forEach((property) => {
        overlay.style.removeProperty(property)
    })
}

function updateArtworkTheme(imageUrl) {

    if (!imageUrl || imageUrl === activeArtworkUrl) return

    activeArtworkUrl = imageUrl
    resetArtworkTheme()

    const image =
        new Image()

    image.crossOrigin = 'anonymous'

    image.onload = () => {

        if (imageUrl !== activeArtworkUrl) return

        const canvas =
            document.createElement('canvas')

        const size =
            48

        canvas.width = size
        canvas.height = size

        const context =
            canvas.getContext('2d', {
                willReadFrequently: true
            })

        context.drawImage(
            image,
            0,
            0,
            size,
            size
        )

        const imageData =
            context.getImageData(0, 0, size, size).data

        applyArtworkColors(
            chooseArtworkColors(imageData)
        )
    }

    image.onerror = () => {
        activeArtworkUrl = ''
    }

    image.src = imageUrl
}

function getLyricText(line) {

    if (typeof line === 'string') {
        return line
    }

    if (line && typeof line.text === 'string') {
        return line.text
    }

    return ''
}

function getLyricTimeMs(line) {

    if (line && Number.isFinite(line.timeMs)) {
        return line.timeMs
    }

    return null
}

function getActiveRevealDurationMs(index) {

    const currentTimeMs =
        getLyricTimeMs(lyrics[index])

    const nextTimeMs =
        getLyricTimeMs(lyrics[index + 1])

    if (!Number.isFinite(currentTimeMs) || !Number.isFinite(nextTimeMs)) {
        return 1200
    }

    return Math.max(
        450,
        nextTimeMs - currentTimeMs - 1000
    )
}

function renderLyrics(nextLyrics = lyrics) {

    clearLyricStaggerState()

    lyrics = nextLyrics
    lyricPreviewOffset = 0

    lyricsList.innerHTML = ''
    lyricElements = []

    lyrics.forEach((line) => {

        const div =
            document.createElement('div')

        const lyricText =
            getLyricText(line)

        div.classList.add('lyric-line')
        div.dataset.text = lyricText

        const baseText =
            document.createElement('span')

        baseText.classList.add('lyric-text-base')
        baseText.textContent = lyricText

        const highlightText =
            document.createElement('span')

        highlightText.classList.add('lyric-text-highlight')
        highlightText.textContent = lyricText

        div.append(
            baseText,
            highlightText
        )

        lyricElements.push(div)
        lyricsList.appendChild(div)

    })

    activeIndex =
        Math.max(0, Math.min(activeIndex, lyrics.length - 1))

    updateLyricClasses()
    requestAnimationFrame(() => {

        cacheLyricLayout()
        centerActiveLyric(false)
    })
}

function getActiveLyricBaseY() {

    if (
        activeIndex < 0 ||
        activeIndex >= cachedLyricOffsets.length
    ) {
        return 0
    }

    const activeTopLockPoint =
        cachedWrapperHeight * 0.28

    return (
        activeTopLockPoint -
        cachedLyricOffsets[activeIndex]
    )
}

function getLyricPreviewBounds(baseY) {

    const wrapperHeight =
        cachedWrapperHeight

    const listHeight =
        cachedLyricsHeight

    if (listHeight <= wrapperHeight) {
        return {
            min: 0,
            max: 0
        }
    }

    const edgeRoom =
        wrapperHeight * 0.24

    const maxReelY =
        edgeRoom

    const minReelY =
        wrapperHeight - listHeight - edgeRoom

    return {
        min: minReelY - baseY,
        max: maxReelY - baseY
    }
}

function getLyricSyncThreshold() {

    return Math.max(
        72,
        cachedWrapperHeight *
        LYRIC_SYNC_BUTTON_THRESHOLD_RATIO
    )
}

function updateLyricSyncButton(effectiveOffset = lyricPreviewOffset) {

    if (!syncLyricsButton) return

    const shouldShow =
        Math.abs(effectiveOffset) >
        getLyricSyncThreshold()

    syncLyricsButton.classList.toggle(
        'is-visible',
        shouldShow
    )
}

function applyLyricReelPosition(animate = true) {

    const baseY =
        getActiveLyricBaseY()

    const previewBounds =
        getLyricPreviewBounds(baseY)

    const effectivePreviewOffset =
        clamp (
            lyricPreviewOffset,
            previewBounds.min,
            previewBounds.max
        )

    if (!animate) {
        clearLyricStaggerState()
        lyricsList.classList.add('is-positioning')
    }

    lyricsList.style.setProperty(
        '--lyric-reel-y',
        `${baseY + effectivePreviewOffset}px`
    )

    updateLyricSyncButton(effectivePreviewOffset)

    if (!animate) {
        requestAnimationFrame(() => {
            lyricsList.classList.remove('is-positioning')
        })
    }
}

function updateLyricClasses() {

    lyricElements.forEach((lineElement, index) => {

        const distance =
            Math.abs(index - activeIndex)

        lineElement.classList.remove(
            'active',
            'near',
            'far'
        )

        lineElement.dataset.distance = String(distance)

        if (index === activeIndex) {

            lineElement.style.setProperty(
                '--active-reveal-duration',
                `${getActiveRevealDurationMs(index)}ms`
            )

            lineElement.classList.add('active')

        } else if (distance === 1) {

            lineElement.classList.add('near')

        } else {

            lineElement.classList.add('far')
        }

    })
}

function centerActiveLyric(animate = true) {

    if (centerFrame) {
        cancelAnimationFrame(centerFrame)
    }

    centerFrame = requestAnimationFrame(() => {

        centerFrame = null

        applyLyricReelPosition(animate)
    })
}

function setupScrollingText(container) {

    const text =
        container.querySelector('.track-scroll-text')

    if (!text) return

    if (text._scrollAnimation) {

        clearTimeout(text._scrollAnimation.pauseTimer)
        clearTimeout(text._scrollAnimation.moveTimer)
    }

    text.style.transition = 'none'
    text.style.transform = 'translateX(0px)'
    container.classList.remove('is-overflowing')

    requestAnimationFrame(() => {

        const overflow =
            text.scrollWidth - container.clientWidth

        if (overflow <= 8) {
            text._scrollAnimation = null
            return
        }

        container.classList.add('is-overflowing')

        const speed = 18

        const travelTime =
            (overflow / speed) * 1000

        const pauseTime = 3000

        let direction = -1

        const run = () => {

            text.style.transition = 'none'

            text._scrollAnimation.pauseTimer =
                setTimeout(() => {

                    text.style.transition =
                        `transform ${travelTime}ms linear`

                    text.style.transform =
                        direction === -1
                            ? `translateX(-${overflow}px)`
                            : 'translateX(0px)'

                    text._scrollAnimation.moveTimer =
                        setTimeout(() => {

                            direction *= -1

                            run()

                        }, travelTime)

                }, pauseTime)
        }

        text._scrollAnimation = {
            pauseTimer: null,
            moveTimer: null
        }

        run()
    })
}

function updateLiquidBackground(
    imageUrl
) {

    const nextScene =

        activeScene === sceneA
            ? sceneB
            : sceneA

    nextScene
        .querySelectorAll('.liquid-layer')
        .forEach(layer => {

            layer.style.backgroundImage =
                `url("${imageUrl}")`

        })

    requestAnimationFrame(() => {

        nextScene.classList.add(
            'active'
        )

        activeScene.classList.remove(
            'active'
        )

        activeScene =
            nextScene
    })
}

function setActiveLyric(index) {

    if (!Number.isInteger(index)) return

    const nextIndex =
        Math.max(-1, Math.min(index, lyrics.length - 1))

    if (nextIndex === activeIndex) return

    if (centerFrame) {
        cancelAnimationFrame(centerFrame)
        centerFrame = null
    }

    const lyricAnimation =
        currentSettings?.overlay?.lyricAnimation || 'smooth'

    if (lyricAnimation === 'stagger' && !settingsPanel?.classList.contains('is-open')) {
        setActiveLyricStagger(nextIndex)
    } else {
        setActiveLyricSmooth(nextIndex)
    }
}

function setActiveLyricSmooth(nextIndex) {

    // Cancel any in-flight stagger before switching back to smooth
    if (lyricStaggerFrame) {
        cancelAnimationFrame(lyricStaggerFrame)
        lyricStaggerFrame = null
    }

    if (lyricStaggerCleanupTimer) {
        clearTimeout(lyricStaggerCleanupTimer)
        lyricStaggerCleanupTimer = null
    }

    lyricElements.forEach((el) => {
        el.getAnimations().forEach((anim) => anim.cancel())
    })

    activeIndex = nextIndex
    lyricPreviewOffset = 0

    updateLyricClasses()
    cacheLyricLayout()
    applyLyricReelPosition(true)
}

function setActiveLyricStagger(nextIndex) {

    const previousTops = getLyricVisualTops()

    if (lyricStaggerFrame) {
        cancelAnimationFrame(lyricStaggerFrame)
        lyricStaggerFrame = null
    }

    if (lyricStaggerCleanupTimer) {
        clearTimeout(lyricStaggerCleanupTimer)
        lyricStaggerCleanupTimer = null
    }

    lyricElements.forEach((el) => {
        el.getAnimations().forEach((anim) => anim.cancel())
    })

    activeIndex = nextIndex

    updateLyricClasses()
    cacheLyricLayout()

    const baseY = getActiveLyricBaseY()
    const previewBounds = getLyricPreviewBounds(baseY)

    const effectivePreviewOffset =
        clamp(
            lyricPreviewOffset,
            previewBounds.min,
            previewBounds.max
        )

    lyricsList.classList.add('is-positioning')
    lyricsList.style.setProperty('--lyric-reel-y', `${baseY + effectivePreviewOffset}px`)
    updateLyricSyncButton(effectivePreviewOffset)
    lyricsList.offsetHeight

    const nextTops = getLyricVisualTops()

    lyricsList.classList.remove('is-positioning')

    const wrapperHeight = lyricsWrapper.clientHeight

    const visibleOrder = lyricElements
        .map((element, i) => ({ element, i, top: nextTops[i] }))
        .filter(({ top }) => top > -wrapperHeight && top < wrapperHeight * 2)
        .sort((a, b) => a.top - b.top)

    const lineRanks = new Map(visibleOrder.map((entry, rank) => [entry.element, rank]))

    let longestDelay = 0

    lyricElements.forEach((element, i) => {

        const deltaY = previousTops[i] - nextTops[i]

        if (Math.abs(deltaY) < 1 || !lineRanks.has(element)) return

        const rank = lineRanks.get(element)
        const delayMs = Math.min(rank * LYRIC_STAGGER_DELAY_MS, LYRIC_STAGGER_MAX_DELAY_MS)

        longestDelay = Math.max(longestDelay, delayMs)

        const anim = element.animate(
            [
                { transform: `translateY(${deltaY}px)` },
                { transform: `translateY(0px)` }
            ],
            {
                duration: LYRIC_STAGGER_DURATION_MS,
                delay: delayMs,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                fill: 'backwards',
                composite: 'add'
            }
        )

        anim.onfinish = () => anim.cancel()
    })

    lyricStaggerCleanupTimer = setTimeout(() => {
        lyricStaggerCleanupTimer = null
    }, longestDelay + LYRIC_STAGGER_DURATION_MS + 80)
}

function syncLyricsToCurrent() {

    lyricPreviewOffset = 0
    applyLyricReelPosition(true)
}

function handleLyricsWheel(event) {

    if (
        settingsPanel &&
        settingsPanel.getAttribute('aria-hidden') === 'false'
    ) {
        return
    }

    if (lyrics.length <= 1) return

    event.preventDefault()
    event.stopPropagation()

    const modeMultiplier =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
            ? 18
            : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                ? lyricsWrapper.clientHeight
                : 1

    lyricPreviewOffset -=
        event.deltaY *
        modeMultiplier *
        LYRIC_WHEEL_SENSITIVITY

    if (lyricPreviewFrame) {
        cancelAnimationFrame(lyricPreviewFrame)
    }

    lyricsList.classList.add('is-positioning')

    lyricPreviewFrame =
        requestAnimationFrame(() => {
            lyricPreviewFrame = null
            applyLyricReelPosition(false)
        })
}

function setDebugState(key, value) {

    window.spotifyLyricsOverlay =
        window.spotifyLyricsOverlay || {}

    window.spotifyLyricsOverlay[key] =
        value
}

function applySettings(settings) {

    currentSettings =
        settings

    if (Number.isFinite(settings?.overlay?.clickThroughOpacity)) {
        overlay.style.setProperty(
            '--click-through-opacity',
            settings.overlay.clickThroughOpacity
        )
    }

    overlay.classList.toggle(
        'is-click-through',
        Boolean(settings?.overlay?.clickThrough)
    )

    const backgroundMode =
        settings?.overlay?.backgroundMode || "kawarp"

    backgroundModeInputs.forEach((radio) => {

        radio.checked =
            radio.value === backgroundMode

    })

    const lyricAnimation =
        settings?.overlay?.lyricAnimation || 'smooth'

    lyricAnimationInputs.forEach((radio) => {

        radio.checked =
            radio.value === lyricAnimation

    })

    settingsInputs.clientId.value =
        settings?.spotify?.clientId || ''

    settingsInputs.clickThrough.value =
        settings?.shortcuts?.clickThrough || ''

    settingsInputs.spotifyLogin.value =
        settings?.shortcuts?.spotifyLogin || ''

    settingsInputs.playbackRefresh.value =
        settings?.shortcuts?.playbackRefresh || ''

    settingsInputs.quit.value =
        settings?.shortcuts?.quit || ''
}

function openClientIdPrompt() {

    clientIdPrompt.classList.add('is-open')
    clientIdPrompt.setAttribute('aria-hidden', 'false')
}

function closeClientIdPrompt() {

    clientIdPrompt.classList.remove('is-open')
    clientIdPrompt.setAttribute('aria-hidden', 'true')
}

function openSettings() {

    settingsPanel.classList.add('is-open')
    settingsPanel.setAttribute('aria-hidden', 'false')

    resizeHandle?.classList.add('is-disabled')

    syncSettingsPreviewPlayback()
}

function toggleSettings() {

    if (settingsPanel.classList.contains('is-open')) {
        closeSettings()
        return
    }

    openSettings()
}

function closeSettings() {

    settingsPanel.classList.remove('is-open')
    settingsPanel.setAttribute('aria-hidden', 'true')

    resizeHandle?.classList.remove('is-disabled')

    pauseAllSettingsPreviews()

    if (currentSettings) {
        applySettings(currentSettings)
    }
}

function openResetConfirm() {

    resetConfirmDialog.classList.add('is-open')
    resetConfirmDialog.setAttribute('aria-hidden', 'false')
}

function closeResetConfirm() {

    resetConfirmDialog.classList.remove('is-open')
    resetConfirmDialog.setAttribute('aria-hidden', 'true')
}

async function confirmResetSettings() {

    if (
        !window.electronAPI?.getSettingsDefaults ||
        !window.electronAPI?.saveSettings
    ) return

    const defaults =
        await window.electronAPI.getSettingsDefaults()

    const preservedClientId =
        currentSettings?.spotify?.clientId || ''

    const nextSettings = {
        ...defaults,
        window: {
            ...defaults.window,
            ...(currentSettings?.window || {})
        },
        spotify: {
            ...defaults.spotify,
            clientId: preservedClientId
        }
    }

    const savedSettings =
        await window.electronAPI.saveSettings(nextSettings)

    applySettings(savedSettings)
    initializeSelectedBackground()

    closeResetConfirm()
    closeSettings()
}

async function saveSettings() {

    if (!currentSettings || !window.electronAPI?.saveSettings) return

    const selectedBackgroundMode =
        [...backgroundModeInputs]
            .find(radio => radio.checked)
            ?.value || 'kawarp'

    const selectedLyricAnimation =
        [...lyricAnimationInputs]
            .find(radio => radio.checked)
            ?.value || 'smooth'

    const nextSettings =
        {
            ...currentSettings,
            spotify: {
                ...currentSettings.spotify,
                clientId: settingsInputs.clientId.value.trim()
            },

            overlay: {
                ...currentSettings.overlay,
                backgroundMode: selectedBackgroundMode,
                lyricAnimation: selectedLyricAnimation
            },
            
            shortcuts: {
                ...currentSettings.shortcuts,
                clickThrough: settingsInputs.clickThrough.value.trim(),
                spotifyLogin: settingsInputs.spotifyLogin.value.trim(),
                playbackRefresh: settingsInputs.playbackRefresh.value.trim(),
                quit: settingsInputs.quit.value.trim()
            }
        }

    const savedSettings =
        await window.electronAPI.saveSettings(nextSettings)

    applySettings(savedSettings)
    initializeSelectedBackground()
    closeSettings()
}

function updateTrackHeader(playbackState) {

    const track =
        playbackState?.track

    if (!track) return

    let titleText =
        trackTitle.querySelector('.track-scroll-text')

    let artistText =
        trackArtist.querySelector('.track-scroll-text')

    if (!titleText) {

        trackTitle.innerHTML =
            '<span class="track-scroll-text"></span>'

        titleText =
            trackTitle.querySelector('.track-scroll-text')
    }

    if (!artistText) {

        trackArtist.innerHTML =
            '<span class="track-scroll-text"></span>'

        artistText =
            trackArtist.querySelector('.track-scroll-text')
    }

    titleText.textContent =
        track.name || 'Unknown Track'

    artistText.textContent =
        Array.isArray(track.artists)
            ? track.artists.join(', ')
            : 'Unknown Artist'

    setupScrollingText(trackTitle)
    setupScrollingText(trackArtist)

    if (track.imageUrl) {

        currentArtworkUrl =
            track.imageUrl

        trackArtwork.src =
            track.imageUrl

        if (previewKawarpInitialized) {
            previewKawarp?.loadImage(track.imageUrl)
        }

        previewLiquidLayers.forEach((layer) => {
            layer.style.backgroundImage = `url("${track.imageUrl}")`
        })

        const backgroundMode =
            currentSettings?.overlay?.backgroundMode || 'kawarp'

        if (
            backgroundMode === 'kawarp' &&
            kawarp &&
            track.imageUrl
        ) {

            kawarp.loadImage(
                track.imageUrl
            )

        }

        if (backgroundMode === 'css') {
            updateLiquidBackground(
                track.imageUrl
            )
        }

        trackArtwork.classList.add(
            'has-artwork'
        )
    }
}

function syncKawarpCanvasSize() {

    if (!kawarpCanvas) return

    const pixelRatio =
        Math.min(
            window.devicePixelRatio || 1,
            WEBGL_PIXEL_RATIO_LIMIT
        )

    const width =
        Math.max(1, Math.round(kawarpCanvas.clientWidth * pixelRatio))

    const height =
        Math.max(1, Math.round(kawarpCanvas.clientHeight * pixelRatio))

    if (kawarpCanvas.width === width && kawarpCanvas.height === height) return

    kawarpCanvas.width = width
    kawarpCanvas.height = height

    kawarp?.resize?.()
}

function initializeKawarp() {

    if (!kawarpCanvas || kawarpInitialized)
        return

    syncKawarpCanvasSize()

    if (!kawarp) {

        kawarp =
            new Kawarp(

                kawarpCanvas,

                {

                    warpIntensity: 1.0,

                    blurPasses: 3,

                    animationSpeed: 0.55,

                    transitionDuration: 1000,

                    saturation: 2.4,

                    scale: 1.8,

                    tintColor: [0, 0, 0],

                    tintIntensity: 0.18,

                    dithering: 0.012,

                    patternScale: 400

                }

            )
    }

    kawarpInitialized = true

    if (currentArtworkUrl) {
        kawarp.loadImage(currentArtworkUrl)
    }
}

function syncKawarpPreviewCanvasSize() {

    if (!kawarpPreviewCanvas) return

    const pixelRatio =
        Math.min(window.devicePixelRatio || 1, WEBGL_PIXEL_RATIO_LIMIT)

    const width =
        Math.max(1, Math.round(kawarpPreviewCanvas.clientWidth * pixelRatio))

    const height =
        Math.max(1, Math.round(kawarpPreviewCanvas.clientHeight * pixelRatio))

    if (kawarpPreviewCanvas.width === width && kawarpPreviewCanvas.height === height) return

    kawarpPreviewCanvas.width = width
    kawarpPreviewCanvas.height = height

    previewKawarp?.resize?.()
}

function initializeKawarpPreview() {

    if (!kawarpPreviewCanvas || previewKawarpInitialized) return

    syncKawarpPreviewCanvasSize()

    previewKawarp =
        new Kawarp(
            kawarpPreviewCanvas,
            {
                warpIntensity: 1.0,
                blurPasses: 3,
                animationSpeed: 0.55,
                transitionDuration: 1000,
                saturation: 2.4,
                scale: 1.8,
                tintColor: [0, 0, 0],
                tintIntensity: 0.18,
                dithering: 0.012,
                patternScale: 140
            }
        )

    previewKawarpInitialized = true

    if (currentArtworkUrl) {
        previewKawarp.loadImage(currentArtworkUrl)
    }
}

function resumeKawarpPreview() {

    if (!previewKawarpInitialized) {
        initializeKawarpPreview()
    }

    syncKawarpPreviewCanvasSize()

    previewKawarp?.start?.()
}

function pauseKawarpPreview() {

    previewKawarp?.stop?.()
}

function getSelectedBackgroundMode() {

    return [...backgroundModeInputs]
        .find((radio) => radio.checked)
        ?.value || currentSettings?.overlay?.backgroundMode || 'kawarp'
}

function pauseAllSettingsPreviews() {

    activeSettingsPreviewMode = null

    settingsPanel?.classList.remove(
        'is-previewing-css',
        'is-previewing-webgl',
        'is-previewing-kawarp'
    )

    pauseKawarpPreview()
    pauseWebGLPreviewBackground()
}

function syncSettingsPreviewPlayback() {

    if (!settingsPanel?.classList.contains('is-open')) return

    if (document.hidden) {
        pauseAllSettingsPreviews()
        return
    }

    const mode =
        getSelectedBackgroundMode()

    if (activeSettingsPreviewMode === mode) return

    pauseAllSettingsPreviews()
    activeSettingsPreviewMode = mode

    settingsPanel?.classList.add(`is-previewing-${mode}`)

    if (mode === 'kawarp') {
        resumeKawarpPreview()
        return
    }

    if (mode === 'webgl') {
        resumeWebGLPreviewBackground()
    }
}

function resumeKawarpBackground() {

    if (!kawarpInitialized) {
        initializeKawarp()
    }

    kawarp?.start?.()
}

function pauseKawarpBackground() {

    kawarp?.stop?.()
}

function initializeWebGLTest() {

    if (!webglCanvas || webglInitialized) return

    webglRenderer =
        new THREE.WebGLRenderer({

            canvas: webglCanvas,

            alpha: true,

            antialias: false,

            powerPreference: 'low-power'

        })

    webglRenderer.setPixelRatio(
        Math.min(
            window.devicePixelRatio || 1,
            WEBGL_PIXEL_RATIO_LIMIT
        )
    )

    webglRenderer.setSize(
        window.innerWidth,
        window.innerHeight
    )

    webglScene =
        new THREE.Scene()

    webglCamera =
        new THREE.OrthographicCamera(
            -1,
            1,
            1,
            -1,
            0.1,
            10
        )

    webglCamera.position.z = 1

    const geometry =
        new THREE.PlaneGeometry(
            2,
            2
        )

    webglMaterial =
        new THREE.ShaderMaterial({

            transparent: true,

            uniforms: {

                uTextureA: {
                    value: null
                },

                uTextureB: {
                    value: null
                },

                uMix: {
                    value: 0
                },

                uTime: {
                    value: 0
                }

            },

            vertexShader: `

                varying vec2 vUv;

                void main() {

                    vUv = uv;

                    gl_Position =
                        projectionMatrix *
                        modelViewMatrix *
                        vec4(position, 1.0);
                }

            `,

            fragmentShader: `

                uniform sampler2D uTextureA;
                uniform sampler2D uTextureB;
                uniform float uMix;
                uniform float uTime;

                varying vec2 vUv;

                void main() {

                    vec2 uv = vUv;

                    uv -= 0.5;

                    float angle =
                        uTime * 0.05;

                    mat2 rot = mat2(

                        cos(angle),
                        -sin(angle),

                        sin(angle),
                        cos(angle)

                    );

                    uv = rot * uv;

                    uv += 0.5;

                    uv = (uv - 0.5) * 3.5 + 0.5;

                    float noise1 =
                        sin(
                            uv.x * 12.0 +
                            uTime * 0.15
                        ) *
                        cos(
                            uv.y * 8.0 -
                            uTime * 0.12
                        );

                    float noise2 =
                        sin(
                            uv.y * 17.0 -
                            uTime * 0.18
                        ) *
                        cos(
                            uv.x * 11.0 +
                            uTime * 0.10
                        );

                    float noise3 =

                        sin(
                            uv.x * 3.0 +
                            uTime * 0.05
                        ) *

                        cos(
                            uv.y * 4.0 -
                            uTime * 0.07
                        );

                        uv.x += noise1 * 0.08;
                        uv.y += noise2 * 0.08;

                        uv.x += noise2 * 0.04;
                        uv.y += noise1 * 0.04;

                        uv.x += noise3 * 0.12;
                        uv.y += noise3 * 0.08;

                    vec2 uv2 = uv;

                    uv2 -= 0.5;

                    float angle2 =
                        -uTime * 0.08;

                    mat2 rot2 = mat2(

                        cos(angle2),
                        -sin(angle2),

                        sin(angle2),
                        cos(angle2)

                    );

                    uv2 = rot2 * uv2;

                    uv2 += 0.5;

                    uv2.x +=
                        noise1 * 0.25;

                    uv2.y +=
                        noise2 * 0.25;

                    vec4 colorA1 =
                        texture2D(
                            uTextureA,
                            uv
                        );

                    vec4 colorA2 =
                        texture2D(
                            uTextureA,
                            uv2
                        );

                    vec4 colorA =
                        mix(
                            colorA1,
                            colorA2,
                            0.5
                        );

                    vec4 colorB1 =
                        texture2D(
                            uTextureB,
                            uv
                        );

                    vec4 colorB2 =
                        texture2D(
                            uTextureB,
                            uv2
                        );

                    vec4 colorB =
                        mix(
                            colorB1,
                            colorB2,
                            0.5
                        );

                    vec4 color =
                        mix(
                            colorA,
                            colorB,
                            uMix
                        );

                    color.a *= 0.85;

                    gl_FragColor =
                        color;
                }

            `
        })

    webglTextureLoader =
        new THREE.TextureLoader()

    const fallbackTexture =
        new THREE.DataTexture(
            new Uint8Array([24, 24, 24, 255]),
            1,
            1
        )

    fallbackTexture.needsUpdate =
        true

    webglFallbackTexture =
        fallbackTexture

    webglMaterial.uniforms.uTextureA.value =
        fallbackTexture

    webglMaterial.uniforms.uTextureB.value =
        fallbackTexture

    currentTexture =
        fallbackTexture

    const plane =
        new THREE.Mesh(
            geometry,
            webglMaterial
        )

    webglScene.add(plane)

    webglClock =
        new THREE.Clock()

    webglInitialized = true

    if (currentArtworkUrl) {
        updateWebGLArtwork(currentArtworkUrl)
    }

    console.log(
        'WEBGL INITIALIZED'
    )

}

function syncWebglPreviewCanvasSize() {

    if (!webglPreviewRenderer || !webglPreviewCanvas) return

    const pixelRatio =
        Math.min(window.devicePixelRatio || 1, WEBGL_PIXEL_RATIO_LIMIT)

    webglPreviewRenderer.setPixelRatio(pixelRatio)

    webglPreviewRenderer.setSize(
        webglPreviewCanvas.clientWidth,
        webglPreviewCanvas.clientHeight,
        false
    )
}

function initializeWebGLPreview() {

    if (!webglPreviewCanvas || webglPreviewInitialized) return

    if (!webglInitialized) {
        initializeWebGLTest()   // ensures shared scene/material/clock exist
    }

    webglPreviewRenderer =
        new THREE.WebGLRenderer({
            canvas: webglPreviewCanvas,
            alpha: true,
            antialias: false,
            powerPreference: 'low-power'
        })

    webglPreviewInitialized = true

    syncWebglPreviewCanvasSize()
}

function renderWebGLPreviewFrame() {

    if (
        !webglPreviewRunning ||
        !webglPreviewRenderer ||
        !webglScene ||
        !webglCamera ||
        !webglMaterial ||
        !webglClock
    ) return

    webglMaterial.uniforms.uTime.value =
        webglClock.getElapsedTime()

    if (fadeStartTime > 0) {

        const elapsed = performance.now() - fadeStartTime

        webglMaterial.uniforms.uMix.value =
            Math.min(elapsed / CROSSFADE_DURATION, 1)

        if (webglMaterial.uniforms.uMix.value >= 1) {
            completeWebGLCrossfade()
        }
    }

    webglPreviewRenderer.render(webglScene, webglCamera)

    webglPreviewFrameTimer =
        setTimeout(() => {
            webglPreviewFrameTimer = null
            if (!webglPreviewRunning) return
            webglPreviewAnimationFrame =
                requestAnimationFrame(renderWebGLPreviewFrame)
        }, WEBGL_FRAME_INTERVAL_MS)
}

function resumeWebGLPreviewBackground() {

    if (!webglPreviewInitialized) {
        initializeWebGLPreview()
    }

    syncWebglPreviewCanvasSize()

    if (webglPreviewRunning) return

    webglPreviewRunning = true

    webglClock?.start?.()
    renderWebGLPreviewFrame()
}

function pauseWebGLPreviewBackground() {

    webglPreviewRunning = false

    if (webglPreviewAnimationFrame) {
        cancelAnimationFrame(webglPreviewAnimationFrame)
        webglPreviewAnimationFrame = null
    }

    if (webglPreviewFrameTimer) {
        clearTimeout(webglPreviewFrameTimer)
        webglPreviewFrameTimer = null
    }

    if (!webglRunning) {           // don't stop the shared clock if the
        completeWebGLCrossfade()    // real webgl background still needs it
        webglClock?.stop?.()
    }
}

function renderWebGLFrame() {

    if (
        !webglRunning ||
        !webglRenderer ||
        !webglScene ||
        !webglCamera ||
        !webglMaterial ||
        !webglClock
    ) {
        return
    }

    webglMaterial.uniforms.uTime.value =
        webglClock.getElapsedTime()

    if (fadeStartTime > 0) {

        const elapsed =
            performance.now() -
            fadeStartTime

        webglMaterial
            .uniforms
            .uMix
            .value = Math.min(

                elapsed /
                CROSSFADE_DURATION,

                1

            )

        if (

            webglMaterial
                .uniforms
                .uMix
                .value >= 1

        ) {

            completeWebGLCrossfade()
        }
    }

    webglRenderer.render(
        webglScene,
        webglCamera
    )

    webglFrameTimer =
        setTimeout(() => {

            webglFrameTimer = null

            if (!webglRunning) return

            webglAnimationFrame =
                requestAnimationFrame(
                    renderWebGLFrame
                )

        }, WEBGL_FRAME_INTERVAL_MS)
}

function resumeWebGLBackground() {

    if (!webglInitialized) {
        initializeWebGLTest()
    }

    if (webglRunning) return

    webglRunning =
        true

    webglClock?.start?.()
    renderWebGLFrame()
}

function pauseWebGLBackground() {

    webglRunning =
        false

    if (webglAnimationFrame) {
        cancelAnimationFrame(webglAnimationFrame)
        webglAnimationFrame = null
    }

    if (webglFrameTimer) {
        clearTimeout(webglFrameTimer)
        webglFrameTimer = null
    }

    if (!webglPreviewRunning) {
        completeWebGLCrossfade()
    }

    webglClock?.stop?.()
}

function disposeWebGLTexture(texture) {

    if (
        !texture ||
        texture === currentTexture ||
        texture === webglFallbackTexture
    ) {
        return
    }

    texture.dispose?.()
}

function completeWebGLCrossfade() {

    fadeStartTime = 0

    if (webglMaterial && currentTexture) {
        webglMaterial.uniforms.uTextureA.value = currentTexture
        webglMaterial.uniforms.uTextureB.value = currentTexture
        webglMaterial.uniforms.uMix.value = 1
    }

    disposeWebGLTexture(pendingWebGLTextureDispose)
    pendingWebGLTextureDispose = null
}

function updateWebGLArtwork(url) {

    if (
        !url ||
        !webglMaterial ||
        !webglTextureLoader
    ) {
        return
    }

    if (webglArtworkUrl === url) {
        return
    }

    webglTextureLoader.load(

        url,

        (newTexture) => {

            webglArtworkUrl =
                url

            if (!currentTexture) {

                currentTexture =
                    newTexture

                webglMaterial
                    .uniforms
                    .uTextureA
                    .value = newTexture

                webglMaterial
                    .uniforms
                    .uTextureB
                    .value = newTexture

                return
            }

            disposeWebGLTexture(pendingWebGLTextureDispose)

            const previousTexture =
                currentTexture

            webglMaterial
                .uniforms
                .uTextureA
                .value = previousTexture

            webglMaterial
                .uniforms
                .uTextureB
                .value = newTexture

            webglMaterial
                .uniforms
                .uMix
                .value = 0

            currentTexture =
                newTexture

            pendingWebGLTextureDispose =
                previousTexture

            fadeStartTime =
                performance.now()

            console.log(
                'STARTING CROSSFADE'
            )

        }
    )
}

renderLyrics()

function setupShortcutRecorder(input) {

    const modifierKeys = new Set([
        'Control',
        'Shift',
        'Alt',
        'Meta'
    ])

    const formatShortcutKey = (event) => {

        if (/^Key[A-Z]$/.test(event.code)) {
            return event.code.slice(3)
        }

        if (/^Digit[0-9]$/.test(event.code)) {
            return event.code.slice(5)
        }

        if (/^Numpad[0-9]$/.test(event.code)) {
            return `Num${event.code.slice(6)}`
        }

        if (/^F[0-9]{1,2}$/.test(event.key)) {
            return event.key.toUpperCase()
        }

        const namedKeys = {
            ' ': 'Space',
            ArrowUp: 'Up',
            ArrowDown: 'Down',
            ArrowLeft: 'Left',
            ArrowRight: 'Right',
            Escape: 'Esc',
            '+': 'Plus',
            '-': 'Minus',
            '=': 'Plus',
            ',': 'Comma',
            '.': 'Period',
            '/': 'Slash',
            '\\': 'Backslash',
            ';': 'Semicolon',
            "'": 'Quote',
            '[': 'BracketLeft',
            ']': 'BracketRight',
            '`': 'Backtick'
        }

        if (namedKeys[event.key]) {
            return namedKeys[event.key]
        }

        if (event.key.length === 1) {
            return event.key.toUpperCase()
        }

        return event.key
    }

    const buildShortcut = (event) => {

        const parts = []

        if (event.ctrlKey) parts.push('Ctrl')
        if (event.shiftKey) parts.push('Shift')
        if (event.altKey) parts.push('Alt')
        if (event.metaKey) parts.push('Meta')

        if (!modifierKeys.has(event.key)) {
            parts.push(formatShortcutKey(event))
        }

        return parts.join('+')
    }

    input.addEventListener(
        'keydown',
        (event) => {

            event.preventDefault()
            event.stopPropagation()

            if (
                event.key === 'Backspace' ||
                event.key === 'Delete'
            ) {
                input.value = ''
                return
            }

            const shortcut =
                buildShortcut(event)

            if (shortcut) {
                input.value = shortcut
            }
        }
    )
}

if (window.electronAPI) {

    window.electronAPI.onSettingsLoad((settings) => {

        applySettings(settings)

        initializeSelectedBackground()

    })

    window.electronAPI.onLyricsLoad((payload) => {

        if (!payload || !Array.isArray(payload.lines)) return

        noLyricsMessage?.classList.remove('is-visible')

        activeIndex = -1

        renderLyrics(payload.lines)

    })

    window.electronAPI.onLyricsUpdate((payload) => {

        if (!payload || !Number.isInteger(payload.index)) return

        setActiveLyric(payload.index)

    })

    window.electronAPI.onLyricsUnavailable((payload) => {

        activeIndex = -1

        renderLyrics([])

        noLyricsMessage?.classList.add('is-visible')

    })

    window.electronAPI.onClickThroughChange((payload) => {

        overlay.classList.toggle(
            'is-click-through',
            Boolean(payload && payload.enabled)
        )

    })

    window.electronAPI.onSpotifyAuthChange((payload) => {

        setDebugState('spotifyAuth', payload)

        if (
            !clientIdPromptShown &&
            typeof payload?.configured === 'boolean' &&
            payload.configured === false
        ) {
            clientIdPromptShown = true
            openClientIdPrompt()
        }

    })

    window.electronAPI.onSpotifyPlaybackState((payload) => {

        setDebugState('spotifyPlayback', payload)

        updatePlaybackProgress(payload)
        if (
            typeof  payload?.isPlaying === 'boolean' &&
            payload.isPlaying !== wasSpotifyPlaying
        ) {
            wasSpotifyPlaying = payload.isPlaying

            if (payload.isPlaying) {
                hidePausedOverlay()
            } else {
                showPausedOverlay()
            }
        }

        const trackId =
            payload?.track?.id

        if (
            trackId &&
            trackId !== currentTrackId
        ) {

            currentTrackId =
                trackId

            updateTrackHeader(payload)

            updateArtworkTheme(
                payload?.track?.imageUrl
            )

            if (
                (currentSettings?.overlay?.backgroundMode || 'kawarp') === 'webgl' ||
                webglPreviewRunning
            ) {
                updateWebGLArtwork(
                    payload?.track?.imageUrl
                )
            }
        }

    })
}

settingsButton.addEventListener('click', toggleSettings)

backgroundModeInputs.forEach((radio) => {
    radio.addEventListener('change', syncSettingsPreviewPlayback)
})

window.addEventListener('blur', pauseAllSettingsPreviews)

window.addEventListener('focus', () => {
    syncSettingsPreviewPlayback()
})

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        pauseAllSettingsPreviews()
        return
    }

    syncSettingsPreviewPlayback()
})

cancelSettingsButton.addEventListener('click', closeSettings)
saveSettingsButton.addEventListener('click', () => {
    saveSettings().catch((error) => {
        console.error(error)
    })
})

minimizeButton.addEventListener('click', () => {
    window.electronAPI?.minimizeWindow?.()
})

resetSettingsButton?.addEventListener(
    'click',
    openResetConfirm
)

resetConfirmNoButton?.addEventListener(
    'click',
    closeResetConfirm
)

resetConfirmYesButton?.addEventListener(
    'click',
    () => {
        confirmResetSettings().catch((error) => {
            console.error(error)
        })
    }
)

clientIdPromptLaterButton?.addEventListener(
    'click',
    closeClientIdPrompt
)

clientIdPromptYesButton?.addEventListener(
    'click',
    () => {
        closeClientIdPrompt()
        openSettings()
    }
)

function formatPlaybackTime(ms) {

    if (!Number.isFinite(ms) || ms < 0) return '0:00'

    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    return minutes + ':' + String(seconds).padStart(2, '0')
}

let playbackAnchorPositionMs = 0
let playbackAnchorTimestamp = 0

let playbackLastDisplayedMs = 0
let playbackDurationMs = 0

let playbackIsPlaying = false

let playbackTrackId = null
let playbackTickerFrame = null

let playbackLastLabelSeconds = -1

function computePredictedProgressMs() {

    if (!playbackIsPlaying) return playbackAnchorPositionMs

    const elapsedSinceAnchor =
        performance.now() - playbackAnchorTimestamp

    return playbackAnchorPositionMs + elapsedSinceAnchor
}

function renderPlaybackFrame() {

    if (!playbackProgress) return

    const rawMs =
        computePredictedProgressMs()

    const displayMs =
        Math.min(
            playbackDurationMs || rawMs,
            Math.max(playbackLastDisplayedMs, rawMs)
        )

    playbackLastDisplayedMs = displayMs

    const percent =
        playbackDurationMs > 0
            ? Math.min(100, (displayMs / playbackDurationMs) * 100)
            : 0

    playbackProgressFill.style.width = percent + '%'

    const wholeSeconds =
        Math.floor(displayMs / 1000)

    if (wholeSeconds !== playbackLastLabelSeconds) {
        playbackLastLabelSeconds = wholeSeconds
        playbackElapsedLabel.textContent = formatPlaybackTime(displayMs)
    }

    if (playbackIsPlaying) {
        playbackTickerFrame = requestAnimationFrame(renderPlaybackFrame)
    }
}

function updatePlaybackProgress(payload) {

    if (!playbackProgress) return

    const verifiedMs = payload?.progressMs || 0
    const durationMs = payload?.track?.durationMs || 0
    const isPlaying = Boolean(payload?.isPlaying)
    const trackId = payload?.track?.id || null

    const isNewTrack =
        trackId !== playbackTrackId

    playbackTrackId = trackId
    playbackDurationMs = durationMs
    playbackDurationLabel.textContent = formatPlaybackTime(durationMs)

    playbackAnchorPositionMs = verifiedMs
    playbackAnchorTimestamp = performance.now()
    playbackIsPlaying = isPlaying

    if (!isPlaying || isNewTrack) {
        playbackLastDisplayedMs = verifiedMs
        playbackLastLabelSeconds = -1
    }

    if (playbackTickerFrame) {
        cancelAnimationFrame(playbackTickerFrame)
        playbackTickerFrame = null
    }

    renderPlaybackFrame()
}

function refreshLyricsModeChange() {

    requestAnimationFrame(() => {

        cacheLyricLayout()
        syncLyricsToCurrent()

    })
}

closeButton.addEventListener('click', () => {
    window.electronAPI?.closeWindow?.()
})

fullscreenButton?.addEventListener('click', (event) => {
    event.stopPropagation()
    window.electronAPI?.toggleFullscreen?.()
})

window.electronAPI?.onFullscreenChange?.((payload) => {
    overlay.classList.toggle(
        'is-fullscreen',
        Boolean(payload?.isFullscreen)
    )
    updateOverlayScale()
    setupScrollingText(trackTitle)
    setupScrollingText(trackArtist)
    refreshLyricsModeChange()
})

syncLyricsButton?.addEventListener(
    'click',
    syncLyricsToCurrent
)

lyricsWrapper.addEventListener(
    'wheel',
    handleLyricsWheel,
    {
        passive: false
    }
)

setupTopLeftResize()
updateOverlayScale()
window.addEventListener('resize', () => {
    updateOverlayScale()
    cacheLyricLayout()
    centerActiveLyric(false)
    setupScrollingText(trackTitle)
    setupScrollingText(trackArtist)

    if (webglRenderer) {
        webglRenderer.setSize(
            window.innerWidth,
            window.innerHeight
        )
    }

    syncKawarpCanvasSize()
})

window.spotifyLyricsOverlay = {
    ...window.spotifyLyricsOverlay,
    renderLyrics,
    setActiveLyric
}

function setBackgroundVisibility({
    css = false,
    webgl = false,
    kawarp: showKawarp = false
}) {

    if (liquidBackground) {
        liquidBackground.style.display =
            css ? 'block' : 'none'
    }

    if (webglCanvas) {
        webglCanvas.style.display =
            webgl ? 'block' : 'none'
    }

    if (kawarpCanvas) {
        kawarpCanvas.style.display =
            showKawarp ? 'block' : 'none'
    }
}

function initializeSelectedBackground() {

    const mode =
        currentSettings?.overlay?.backgroundMode
        || "kawarp"

    if (mode === "css") {

        if (currentArtworkUrl) {
            updateLiquidBackground(currentArtworkUrl)
        }

        setBackgroundVisibility({
            css: true
        })

        pauseWebGLBackground()
        pauseKawarpBackground()
        return
    }

    if (mode === "webgl") {

        initializeWebGLTest()

        setBackgroundVisibility({
            webgl: true
        })

        pauseKawarpBackground()
        resumeWebGLBackground()
        return
    }

    if (mode === "kawarp") {

        initializeKawarp()

        setBackgroundVisibility({
            kawarp: true
        })

        pauseWebGLBackground()
        resumeKawarpBackground()
    }
}
