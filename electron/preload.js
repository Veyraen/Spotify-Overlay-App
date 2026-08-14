const {
    contextBridge,
    ipcRenderer
} = require('electron')

contextBridge.exposeInMainWorld(
    'electronAPI',
    {

        onLyricsLoad: (callback) => {

            const listener =
                (_, data) => callback(data)

            ipcRenderer.on('lyrics:load', listener)

            return () => {
                ipcRenderer.removeListener('lyrics:load', listener)
            }

        },

        onLyricsUpdate: (callback) => {

            const listener =
                (_, data) => callback(data)

            ipcRenderer.on('lyrics:update', listener)

            return () => {
                ipcRenderer.removeListener('lyrics:update', listener)
            }

        },

        onLyricsUnavailable: (callback) => {

            const listener =
                (_, data) => callback(data)

            ipcRenderer.on('lyrics:unavailable', listener)

            return () => {
                ipcRenderer.removeListener('lyrics:unavailable', listener)
            }

        },

        onClickThroughChange: (callback) => {

            const listener =
                (_, data) => callback(data)

            ipcRenderer.on('overlay:click-through-change', listener)

            return () => {
                ipcRenderer.removeListener(
                    'overlay:click-through-change',
                    listener
                )
            }

        },

        onSettingsLoad: (callback) => {

            const listener =
                (_, data) => callback(data)

            ipcRenderer.on('settings:load', listener)

            return () => {
                ipcRenderer.removeListener('settings:load', listener)
            }

        },

        saveSettings: (settings) => (
            ipcRenderer.invoke('settings:save', settings)
        ),

        getSettingsDefaults: () => (
            ipcRenderer.invoke('settings:get-defaults')
        ),

        minimizeWindow: () => {
            ipcRenderer.send('window:minimize')
        },

        closeWindow: () => {
            ipcRenderer.send('window:close')
        },

        startWindowResize: () => (
            ipcRenderer.invoke('window:resize-start')
        ),

        resizeWindowFromTopLeft: (payload) => {
            ipcRenderer.send('window:resize-top-left', payload)
        },

        finishWindowResize: () => {
            ipcRenderer.send('window:resize-end')
        },

        onSpotifyAuthChange: (callback) => {

            const listener =
                (_, data) => callback(data)

            ipcRenderer.on('spotify:auth-change', listener)

            return () => {
                ipcRenderer.removeListener('spotify:auth-change', listener)
            }

        },

        onSpotifyPlaybackState: (callback) => {

            const listener =
                (_, data) => callback(data)

            ipcRenderer.on('spotify:playback-state', listener)

            return () => {
                ipcRenderer.removeListener('spotify:playback-state', listener)
            }

        }

    }
)
