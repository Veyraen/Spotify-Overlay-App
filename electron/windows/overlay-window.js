const path = require('path')
const { BrowserWindow, screen } = require('electron')

const NUDGE_DISTANCE = 20
const MIN_OVERLAY_SIZE = 280

function clamp(value, min, max) {

    return Math.min(Math.max(value, min), max)
}

function createOverlayWindow(settings = {}) {

    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workArea
    const overlaySize = settings.window?.size || 400

    const defaultX =
        workArea.x + workArea.width - overlaySize

    const defaultY =
        workArea.y + 80

    const x =
        Number.isInteger(settings.window?.x)
            ? clamp(
                settings.window.x,
                workArea.x,
                workArea.x + workArea.width - overlaySize
            )
            : defaultX

    const y =
        Number.isInteger(settings.window?.y)
            ? clamp(
                settings.window.y,
                workArea.y,
                workArea.y + workArea.height - overlaySize
            )
            : defaultY

    const win = new BrowserWindow({
        width: overlaySize,
        height: overlaySize,

        x,
        y,

        icon: path.join(__dirname, "../../build/icon.ico"),

        frame: false,
        transparent: true,

        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: false,

        hasShadow: false,
        backgroundColor: '#00000000',

        webPreferences: {
            preload: path.join(__dirname, '../preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    win.setAlwaysOnTop(true, 'screen-saver')

    win.isClickThrough = false

    win.setClickThrough = (enabled) => {

        win.isClickThrough = enabled

        win.setIgnoreMouseEvents(
            enabled,
            {
                forward: true
            }
        )

    }

    win.toggleClickThrough = () => {

        win.setClickThrough(!win.isClickThrough)

        return win.isClickThrough
    }

    win.moveBy = (deltaX, deltaY) => {

        const bounds =
            win.getBounds()

        const display =
            screen.getDisplayMatching(bounds)

        const workArea =
            display.workArea

        const nextX =
            clamp(
                bounds.x + deltaX,
                workArea.x,
                workArea.x + workArea.width - bounds.width
            )

        const nextY =
            clamp(
                bounds.y + deltaY,
                workArea.y,
                workArea.y + workArea.height - bounds.height
            )

        win.setPosition(
            nextX,
            nextY,
            true
        )
    }

    win.nudge = (direction) => {

        const nudges = {
            up: [0, -NUDGE_DISTANCE],
            down: [0, NUDGE_DISTANCE],
            left: [-NUDGE_DISTANCE, 0],
            right: [NUDGE_DISTANCE, 0]
        }

        const nudge =
            nudges[direction]

        if (!nudge) return

        win.moveBy(
            nudge[0],
            nudge[1]
        )
    }

    win.resizeFromTopLeft = ({
        deltaX = 0,
        deltaY = 0,
        startBounds = null
    } = {}) => {

        const bounds =
            startBounds || win.getBounds()

        const right =
            bounds.x + bounds.width

        const bottom =
            bounds.y + bounds.height

        const display =
            screen.getDisplayMatching(bounds)

        const workArea =
            display.workArea

        const dominantDelta =
            Math.abs(deltaX) > Math.abs(deltaY)
                ? deltaX
                : deltaY

        const maxOverlaySize =
            Math.min(
                right - workArea.x,
                bottom - workArea.y,
                workArea.width,
                workArea.height
            )

        const nextSize =
            clamp(
                Math.round(bounds.width - dominantDelta),
                MIN_OVERLAY_SIZE,
                maxOverlaySize
            )

        win.setBounds(
            {
                x: right - nextSize,
                y: bottom - nextSize,
                width: nextSize,
                height: nextSize
            },
            false
        )
    }

    win.loadFile(path.join(__dirname, '../../renderer/index.html'))

    win.webContents.once('did-finish-load', () => {

        win.webContents.send(
            'settings:load',
            settings
        )

        if (settings.overlay?.clickThrough) {
            win.setClickThrough(true)

            win.webContents.send(
                'overlay:click-through-change',
                {
                    enabled: true
                }
            )
        }

    })

    return win
}

module.exports = createOverlayWindow
