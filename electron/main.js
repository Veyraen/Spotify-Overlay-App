const {
    app,
    BrowserWindow,
    globalShortcut,
    ipcMain
} = require('electron')

app.setAppUserModelId('com.elvan.spotifylyricsoverlay')

app.commandLine.appendSwitch('enable-transparent-visuals')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

const createOverlayWindow = require('./windows/overlay-window')
const startLyricsIPC = require('./ipc/lyrics-ipc')
const startSpotifyIPC = require('./ipc/spotify-ipc')
const SettingsStore = require('./services/settings-store')

const hasSingleInstanceLock =
    app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
    app.exit(0)
}

let overlayWindow
let spotifyController
let lyricsController
let settingsStore
let resizeStartBounds = null
let isWindowFullscreen = false
let preFullscreenBounds = null

process.on('uncaughtException', (error) => {
    console.error('Uncaught main process error:', error)
})

process.on('unhandledRejection', (error) => {
    console.error('Unhandled main process rejection:', error)
})

async function saveWindowPosition() {

    if (!settingsStore || !overlayWindow || overlayWindow.isDestroyed()) return
    if (isWindowFullscreen) return

    const bounds =
        overlayWindow.getBounds()

    await settingsStore.update((settings) => {

        settings.window.x = bounds.x
        settings.window.y = bounds.y
        settings.window.size = bounds.width

        return settings
    })
}

async function persistPreFullscreenBounds() {

    if (!settingsStore || !preFullscreenBounds) return

    const bounds = preFullscreenBounds

    await settingsStore.update((settings) => {

        settings.window.x = bounds.x
        settings.window.y = bounds.y
        settings.window.size = bounds.width

        return settings
    })
}

function notifyFullscreenChange(isFullscreen) {

    overlayWindow?.webContents.send(
        'window:fullscreen-change',
        { isFullscreen }
    )
}

function restorePreFullscreenBounds() {

    if (!overlayWindow || overlayWindow.isDestroyed()) return
    if (!preFullscreenBounds) return

    overlayWindow.setBounds(preFullscreenBounds)
    preFullscreenBounds = null
}

function refreshWindowInputRegion(win) {

    if (!win || win.isDestroyed()) return

    win.setShape([])

    if (!isWindowFullscreen) {
        win.setBounds(win.getBounds())
    }

    win.setAlwaysOnTop(!isWindowFullscreen, 'screen-saver')
    win.focus()
}

function enterWindowFullscreen() {

    if (!overlayWindow || overlayWindow.isDestroyed()) return false
    if (isWindowFullscreen) return true

    preFullscreenBounds =
        overlayWindow.getBounds()

    isWindowFullscreen = true

    overlayWindow.setFullScreen(true)
    notifyFullscreenChange(true)

    setTimeout(() => {
        refreshWindowInputRegion(overlayWindow)
    }, 50)

    return true
}

function exitWindowFullscreen() {

    if (!overlayWindow || overlayWindow.isDestroyed()) return false
    if (!isWindowFullscreen) return false

    overlayWindow.setFullScreen(false)

    setTimeout(() => {

        if (!isWindowFullscreen) return

        isWindowFullscreen = false
        restorePreFullscreenBounds()
        notifyFullscreenChange(false)
        refreshWindowInputRegion(overlayWindow)

    }, 250)

    return false
}

async function saveClickThrough(enabled) {

    if (!settingsStore) return

    await settingsStore.update((settings) => {

        settings.overlay.clickThrough = enabled

        return settings
    })
}

function registerShortcuts() {
    const settings =
        settingsStore.get()

    const shortcuts =
        settings.shortcuts

    globalShortcut.unregisterAll()

    const registerShortcut = (shortcut, callback) => {

        if (!shortcut || typeof shortcut !== 'string') return

        let registered = false

        try {
            registered =
                globalShortcut.register(shortcut, callback)
        } catch (error) {
            console.warn(
                'Shortcut registration failed:',
                shortcut,
                error
            )
            return
        }

        if (!registered) {
            console.warn('Shortcut registration failed:', shortcut)
        }
    }

    registerShortcut(shortcuts.clickThrough, () => {

        if (!overlayWindow || overlayWindow.isDestroyed()) return

        const isClickThrough =
            overlayWindow.toggleClickThrough()

        overlayWindow.webContents.send(
            'overlay:click-through-change',
            {
                enabled: isClickThrough
            }
        )

        saveClickThrough(isClickThrough).catch((error) => {
            console.error(error)
        })

    })

    const nudgeShortcuts = {
        [shortcuts.nudgeUp]: 'up',
        [shortcuts.nudgeDown]: 'down',
        [shortcuts.nudgeLeft]: 'left',
        [shortcuts.nudgeRight]: 'right'
    }

    Object.entries(nudgeShortcuts).forEach(([shortcut, direction]) => {

        registerShortcut(shortcut, () => {

            if (!overlayWindow || overlayWindow.isDestroyed()) return

            overlayWindow.nudge(direction)

            saveWindowPosition().catch((error) => {
                console.error(error)
            })

        })

    })

    registerShortcut(shortcuts.quitAlternate, () => {

        app.quit()

    })

    registerShortcut(shortcuts.quit, () => {

        app.quit()

    })

    registerShortcut(shortcuts.spotifyLogin, () => {

        spotifyController
            ?.authenticate()
            .catch((error) => {
                console.error(error)
            })

    })

    registerShortcut(shortcuts.playbackRefresh, () => {

        spotifyController
            ?.sendPlaybackState()
            .catch((error) => {
                console.error(error)
            })

    })
}

async function createAppWindow() {

    const settings =
        await settingsStore.load()

    overlayWindow = createOverlayWindow(settings)

    overlayWindow.on('enter-full-screen', () => {
        isWindowFullscreen = true

        setTimeout(() => {
            refreshWindowInputRegion(overlayWindow)
        }, 50)
    })

    overlayWindow.on('leave-full-screen', () => {
        isWindowFullscreen = false
        restorePreFullscreenBounds()
        notifyFullscreenChange(false)

        setTimeout(() => {
            refreshWindowInputRegion(overlayWindow)
        }, 50)
    })

    lyricsController = startLyricsIPC(overlayWindow)
    spotifyController = startSpotifyIPC(overlayWindow, app, lyricsController, settings)

    let isResizingFromHandle = false

    overlayWindow.on('moved', () => {
        if (isResizingFromHandle) return
        saveWindowPosition().catch((error) => { console.error(error) })
    })

    overlayWindow.on('resized', () => {
        saveWindowPosition().catch((error) => { console.error(error) })
    })
}

app.whenReady().then(async () => {

    settingsStore =
        new SettingsStore({
            userDataPath: app.getPath('userData')
        })

    await createAppWindow()
    registerShortcuts()

    ipcMain.handle('settings:save', async (_, nextSettings) => {

        const settings =
            await settingsStore.save(nextSettings)

        registerShortcuts()

        spotifyController?.stopPlaybackMonitor?.()
        spotifyController = startSpotifyIPC(
            overlayWindow,
            app,
            lyricsController,
            settings
        )

        overlayWindow?.webContents.send('settings:load', settings)

        return settings
    })

    ipcMain.handle('settings:get-defaults', () => {
        return SettingsStore.DEFAULT_SETTINGS
    })

    ipcMain.on('window:minimize', () => {
        overlayWindow?.minimize()
    })

    ipcMain.on('window:close', () => {
        app.quit()
    })

    ipcMain.handle('window:toggle-fullscreen', () => {

        if (!overlayWindow || overlayWindow.isDestroyed()) return false

        if (isWindowFullscreen) {
            return exitWindowFullscreen()
        }

        return enterWindowFullscreen()
    })

    ipcMain.handle('window:resize-start', () => {

        isResizingFromHandle = true

        if (!overlayWindow || overlayWindow.isDestroyed()) return null

        resizeStartBounds =
            overlayWindow.getBounds()

        return resizeStartBounds
    })

    ipcMain.on('window:resize-top-left', (_, payload = {}) => {

        if (!overlayWindow || overlayWindow.isDestroyed()) return
        if (!resizeStartBounds) return

        overlayWindow.resizeFromTopLeft({
            deltaX: Number(payload.deltaX) || 0,
            deltaY: Number(payload.deltaY) || 0,
            startBounds: resizeStartBounds
        })
    })

    ipcMain.on('window:resize-end', () => {

        isResizingFromHandle = false

        resizeStartBounds = null

        saveWindowPosition().catch((error) => {
            console.error(error)
        })
    })

    app.on('second-instance', () => {

        if (!overlayWindow || overlayWindow.isDestroyed()) return

        if (overlayWindow.isMinimized()) {
            overlayWindow.restore()
        }

        overlayWindow.focus()
    })

    app.on('activate', () => {

        if (BrowserWindow.getAllWindows().length === 0) {
            createAppWindow().catch((error) => {
                console.error(error)
            })
        }

    })

}).catch((error) => {
    console.error('App startup failed:', error)
})

app.on('will-quit', () => {

    spotifyController?.stopPlaybackMonitor?.()
    globalShortcut.unregisterAll()

})

let isPersistingBoundsOnQuit = false

app.on('before-quit', (event) => {

    if (!isWindowFullscreen || !preFullscreenBounds || isPersistingBoundsOnQuit) return

    event.preventDefault()
    isPersistingBoundsOnQuit = true

    persistPreFullscreenBounds()
        .catch((error) => {
            console.error(error)
        })
        .finally(() => {
            app.quit()
        })

})

app.on('window-all-closed', () => {

    if (process.platform !== 'darwin') {
        app.quit()
    }

})
