import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

import { describe, expect, it } from 'vitest'

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'scripts',
  'smoke-packaged.cjs'
)
const script = fs.readFileSync(scriptPath, 'utf8')

// The script launches the packaged exe, so it cannot run here; these checks only keep it from
// drifting away from the behaviour the app has (it is not part of any CI step).
describe('scripts/smoke-packaged.cjs', () => {
  it('is syntactically valid', () => {
    expect(() => new vm.Script(script, { filename: scriptPath })).not.toThrow()
  })

  it('does not expect close-to-tray to hide the ball, which stays on screen', () => {
    expect(script).not.toMatch(
      /getAllWindows\(\)\.every\(\(window\) => !window\.isVisible\(\)\)/
    )
  })

  it('waits for the panel to be gone and the ball to be the only visible window', () => {
    const afterClose = script.slice(
      script.indexOf("getByTestId('close-window')")
    )
    expect(afterClose).toMatch(
      /filter\(\(window\) => window\.isVisible\(\)\)\s*\.map\(\(window\) => window\.isResizable\(\)\)/
    )
    expect(afterClose).toMatch(/\.toEqual\(\[false\]\)/)
    expect(script).toMatch(/ballStays: true/)
  })
})
