import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { AppContext } from './test-utils'

export async function moveNativeMouse(
  context: AppContext,
  point: { x: number; y: number }
): Promise<void> {
  const physical = await context.electronApp.evaluate(
    ({ screen }, point) => screen.dipToScreenPoint(point),
    point
  )
  await promisify(execFile)(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.resolve('e2e/native-mouse.ps1'),
      '-MoveOnly',
      '-EndX',
      String(physical.x),
      '-EndY',
      String(physical.y),
    ],
    { windowsHide: true }
  )
}

export async function dragNativeMouse(
  context: AppContext,
  start: { x: number; y: number },
  end: { x: number; y: number }
): Promise<void> {
  const points = await context.electronApp.evaluate(
    ({ screen }, { start, end }) => ({
      start: screen.dipToScreenPoint(start),
      end: screen.dipToScreenPoint(end),
    }),
    { start, end }
  )
  await promisify(execFile)(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.resolve('e2e/native-mouse.ps1'),
      '-StartX',
      String(points.start.x),
      '-StartY',
      String(points.start.y),
      '-EndX',
      String(points.end.x),
      '-EndY',
      String(points.end.y),
    ],
    { windowsHide: true }
  )
}
