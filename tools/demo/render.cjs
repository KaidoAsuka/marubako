// Step 2 of the README demos: films the stage.
//
// For every scene record.cjs recorded, the stage (tools/demo/stage) is given the recording and is
// drawn at a steady 20 pictures a second, each one saved as a PNG. The stage draws a moment purely
// from its time, so the film is as smooth as the script, whatever this computer is busy with.
//
//   node tools/demo/render.cjs artifacts/demo [scene]
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const { _electron: electron } = require('@playwright/test')

const FPS = 20

async function main() {
  const root = path.resolve(process.argv[2] ?? 'artifacts/demo')
  const only = process.argv[3]
  const recorded = path.join(root, 'recorded')
  const scenes = (await fs.readdir(recorded)).filter(
    (name) => !only || name === only
  )
  const app = await electron.launch({
    args: [path.join(__dirname, 'stage/main.cjs')],
  })
  try {
    const page = await app.firstWindow()
    await page.waitForFunction(() => globalThis.stage !== undefined)
    for (const name of scenes) {
      const dir = path.join(recorded, name)
      const recording = JSON.parse(
        await fs.readFile(path.join(dir, 'timeline.json'), 'utf8')
      )
      const out = path.join(root, 'rendered', name)
      await fs.rm(out, { recursive: true, force: true })
      await fs.mkdir(out, { recursive: true })
      await page.evaluate(
        ([data, base]) => globalThis.stage.load(data, base),
        [recording, pathToFileURL(dir).href]
      )
      const duration = await page.evaluate(() => globalThis.stage.duration)
      const count = Math.floor((duration / 1000) * FPS)
      for (let index = 0; index <= count; index += 1) {
        await page.evaluate(
          (t) => globalThis.stage.renderAt(t),
          (index * 1000) / FPS
        )
        await page.screenshot({
          path: path.join(out, `${String(index).padStart(4, '0')}.png`),
        })
      }
      console.log(`${name}: ${count + 1} pictures`)
    }
  } finally {
    await app.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
