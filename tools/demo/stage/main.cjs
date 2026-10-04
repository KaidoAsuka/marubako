// The window the stage is filmed in: exactly the size of the film, at one device pixel per pixel.
const path = require('node:path')

const { app, BrowserWindow } = require('electron')

app.commandLine.appendSwitch('force-device-scale-factor', '1')

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
