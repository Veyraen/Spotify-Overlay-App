const fs = require('fs/promises')
const path = require('path')

const DEFAULT_SETTINGS = {
    window: {
        size: 400,
        x: null,
        y: null
    },
    overlay: {
        clickThrough: false,
        clickThroughOpacity: 0.5,
        backgroundMode: "kawarp",
        lyricAnimation: "smooth"
    },
    spotify: {
        clientId: ''
    },
    shortcuts: {
        clickThrough: 'Ctrl+Shift+C',
        spotifyLogin: 'Ctrl+Shift+S',
        playbackRefresh: 'Ctrl+Shift+O',
        quit: 'Ctrl+Shift+D',
        quitAlternate: 'CommandOrControl+Delete',
        nudgeUp: 'CommandOrControl+Shift+Up',
        nudgeDown: 'CommandOrControl+Shift+Down',
        nudgeLeft: 'CommandOrControl+Shift+Left',
        nudgeRight: 'CommandOrControl+Shift+Right'
    }
}

function cloneSettings(settings) {

    return JSON.parse(JSON.stringify(settings))
}

function mergeSettings(defaults, settings) {

    return {
        window: {
            ...defaults.window,
            ...(settings.window || {})
        },
        overlay: {
            ...defaults.overlay,
            ...(settings.overlay || {})
        },
        spotify: {
            ...defaults.spotify,
            ...(settings.spotify || {})
        },
        shortcuts: {
            ...defaults.shortcuts,
            ...(settings.shortcuts || {})
        }
    }
}

class SettingsStore {

    constructor({
        userDataPath
    }) {

        this.settingsPath =
            path.join(userDataPath, 'settings.json')

        this.settings =
            cloneSettings(DEFAULT_SETTINGS)
    }

    async load() {

        try {

            const settingsJson =
                await fs.readFile(this.settingsPath, 'utf8')

            this.settings =
                mergeSettings(
                    DEFAULT_SETTINGS,
                    JSON.parse(settingsJson)
                )

        } catch {

            this.settings =
                cloneSettings(DEFAULT_SETTINGS)
        }

        return this.settings
    }

    get() {

        return this.settings
    }

    async save(nextSettings = this.settings) {

        this.settings =
            mergeSettings(DEFAULT_SETTINGS, nextSettings)

        await fs.mkdir(
            path.dirname(this.settingsPath),
            {
                recursive: true
            }
        )

        await fs.writeFile(
            this.settingsPath,
            JSON.stringify(this.settings, null, 2)
        )

        return this.settings
    }

    async update(updater) {

        const nextSettings =
            updater(cloneSettings(this.settings))

        return this.save(nextSettings)
    }
}

module.exports = SettingsStore
module.exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS
