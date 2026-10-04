// The window the stage is filmed in: the size of the film in the README (880 by 550), drawn at one
// and a half device pixels per pixel, so that the film is still sharp on a scaled display.
const path = require('node:path')

const { app, BrowserWindow } = require('electron')

app.commandLine.appendSwitch('force-device-scale-factor', '1.5')
// Grey antialiasing for the text the stage draws itself. The coloured edges of ClearType are only
// right pixel for pixel on the screen they were made for; the film is always shown scaled.
app.commandLine.appendSwitch('disable-lcd-text')

app.whenReady().then(() => {
  const window = new BrowserWindow({
    width: 880,
    height: 550,
    useContentSize: true,
    frame: false,
    resizable: false,
    backgroundColor: '#d9e0ec',
    webPreferences: { backgroundThrottling: false },
  })
  void window.loadFile(path.join(__dirname, 'index.html'))
})

app.on('window-all-closed', () => app.quit())
