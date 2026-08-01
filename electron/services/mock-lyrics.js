const {
    parseLrc
} = require('./lrc-parser')

const mockLrc = `
[00:00.00]Cause all my kindness
[00:02.50]is taken for weakness
[00:05.00]Now I'm four-five seconds from wildin'
[00:07.50]and we got three more days
[00:10.00]I just need time
[00:12.50]snapping one, two
[00:15.00]Where are you now
[00:17.50]Atlantis
`

const lyrics =
    parseLrc(mockLrc)

module.exports = lyrics
