// The engine of the stage. It is given the recording of one scene (record.cjs) and draws any moment
// of it: the real app's windows as the pictures taken of them, the staged windows, the pointer, the
// clicks and keys, and the camera. `stage.renderAt(t)` is a pure function of the time, so the film
// can be taken frame by frame at a steady rate (render.cjs), with no clock involved.

// Its own scope: the scripts of the stage are plain page scripts and share one global scope.
;(() => {
  const VIEW = { w: 880, h: 550 }
  // The screen (the staged desktop) and the dark room around it, which the camera may show a
  // little of: all positions are in the coordinates of the screen.
  const SCREEN = { w: 1440, h: 900 }
  const ROOM = { x: 144, y: 90 }
  // Where the ball stands on the staged desktop: against the right edge, as on a real one.
  const BALL_HOME = { x: 1396, y: 430 }

  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
  const clamp01 = (k) => Math.min(1, Math.max(0, k))
  const lerp = (a, b, k) => a + (b - a) * k

  const nodes = {
    world: document.getElementById('world'),
    mocks: document.getElementById('mocks'),
    panel: document.getElementById('panel'),
    ball: document.getElementById('ball'),
    rings: document.getElementById('rings'),
    cursor: document.getElementById('cursor'),
    keys: document.getElementById('keys'),
    caption: document.getElementById('caption'),
  }

  let current = null

  /** The recorded pointer at `t`, between the two positions written down around it. */
  function recordedPointer(mouse, t) {
    let before = mouse[0]
    for (const sample of mouse) {
      if (sample.t > t) {
        const span = sample.t - before.t
        const share = span <= 0 ? 0 : (t - before.t) / span
        return {
          x: lerp(before.x, sample.x, share),
          y: lerp(before.y, sample.y, share),
        }
      }
      before = sample
    }
    return { x: before.x, y: before.y }
  }

  /**
   * The pointer while the stage has it (to go and paste into a staged window): it rests where the
   * recording left it, travels to each stop so as to arrive at `stop.at`, and is back where the
   * recording continues by `end`.
   */
  function stagedPointer(takeover, t, recorded) {
    let from = recorded(takeover.start)
    for (const stop of takeover.stops) {
      const target = stop.back ? recorded(takeover.end) : stop
      const begin = stop.at - (stop.travel ?? 520)
      if (t < begin) return from
      if (t < stop.at) {
        const k = easeInOut((t - begin) / (stop.at - begin))
        return { x: lerp(from.x, target.x, k), y: lerp(from.y, target.y, k) }
      }
      from = target
    }
    return from
  }

  /** The camera at `t`: what it looks at and how close, eased between the shots of the scene. */
  function cameraAt(shots, t) {
    let from = shots[0]
    for (const shot of shots) {
      if (shot.t > t) {
        const k = easeInOut(clamp01((t - from.t) / (shot.t - from.t)))
        return {
          cx: lerp(from.cx, shot.cx, k),
          cy: lerp(from.cy, shot.cy, k),
          s: lerp(from.s, shot.s, k),
        }
      }
      from = shot
    }
    return from
  }

  function applyCamera({ cx, cy, s }) {
    // The view never leaves the room.
    const halfW = VIEW.w / s / 2
    const halfH = VIEW.h / s / 2
    const x = Math.min(SCREEN.w + ROOM.x - halfW, Math.max(halfW - ROOM.x, cx))
    const y = Math.min(SCREEN.h + ROOM.y - halfH, Math.max(halfH - ROOM.y, cy))
    nodes.world.style.transform = `translate(${VIEW.w / 2 - (x + ROOM.x) * s}px, ${VIEW.h / 2 - (y + ROOM.y) * s}px) scale(${s})`
  }

  async function showPicture(image, window, base, offset) {
    if (!window || !window.visible || !window.file) {
      image.style.display = 'none'
      return
    }
    const source = `${base}/${window.file}`
    if (image.dataset.file !== source) {
      image.dataset.file = source
      image.src = source
      await image.decode().catch(() => {})
    }
    Object.assign(image.style, {
      display: 'block',
      left: `${window.bounds.x + offset.x}px`,
      top: `${window.bounds.y + offset.y}px`,
      width: `${window.bounds.width}px`,
      height: `${window.bounds.height}px`,
      opacity: String(window.opacity),
    })
  }

  const stage = {
    duration: 0,

    /** Takes the recording of a scene and builds what the scene adds to it. */
    load(recording, base) {
      const ball = recording.frames
        .flatMap((frame) => frame.windows)
        .find((window) => window.role === 'ball' && window.visible)
      // From the real screen to the staged desktop: the ball goes to its home.
      const offset = {
        x: BALL_HOME.x - ball.bounds.x,
        y: BALL_HOME.y - ball.bounds.y,
      }
      const place = (point) => ({
        x: point.x + offset.x,
        y: point.y + offset.y,
      })
      const recorded = (t) => place(recordedPointer(recording.mouse, t))
      const clicks = recording.clicks.map((click) => ({
        t: click.t,
        ...place(click),
      }))
      const script = window.stageScenes[recording.name]({
        marks: recording.marks,
        end: recording.frames[recording.frames.length - 1].t,
        /** Where the click named by a mark landed, on the staged desktop. */
        clickAt: (mark) =>
          clicks.reduce((best, click) =>
            Math.abs(click.t - recording.marks[mark]) <
            Math.abs(best.t - recording.marks[mark])
              ? click
              : best
          ),
      })
      nodes.mocks.replaceChildren(...script.windows.map((entry) => entry.node))
      current = {
        recording,
        base,
        offset,
        recorded,
        script,
        clicks: [...clicks, ...(script.clicks ?? [])],
        keys: [...recording.keys, ...(script.keys ?? [])],
      }
      stage.duration = script.duration
    },

    async renderAt(t) {
      const { recording, base, offset, recorded, script, clicks, keys } =
        current

      // The real app: the last pictures taken at or before this moment.
      let frame = recording.frames[0]
      for (const candidate of recording.frames) {
        if (candidate.t > t) break
        frame = candidate
      }
      const byRole = (role) =>
        frame.windows.find((window) => window.role === role)
      await Promise.all([
        showPicture(nodes.panel, byRole('panel'), base, offset),
        showPicture(nodes.ball, byRole('ball'), base, offset),
      ])

      for (const entry of script.windows) entry.update(t)

      const takeover = (script.pointer ?? []).find(
        (entry) => t >= entry.start && t <= entry.end
      )
      const pointer = takeover
        ? stagedPointer(takeover, t, recorded)
        : recorded(t)
      nodes.cursor.style.transform = `translate(${pointer.x}px, ${pointer.y}px)`

      nodes.rings.replaceChildren(
        ...clicks
          .filter((click) => t >= click.t && t <= click.t + 450)
          .map((click) => {
            const age = (t - click.t) / 450
            const radius = 7 + 15 * age
            const ring = document.createElement('i')
            Object.assign(ring.style, {
              left: `${click.x - radius}px`,
              top: `${click.y - radius}px`,
              width: `${radius * 2}px`,
              height: `${radius * 2}px`,
              opacity: String(0.85 * (1 - age)),
            })
            return ring
          })
      )

      const key = keys
        .filter((entry) => t >= entry.t && t <= entry.t + entry.duration)
        .pop()
      nodes.keys.style.display = key ? 'block' : 'none'
      if (key) nodes.keys.textContent = key.text

      const caption = (script.captions ?? []).find(
        (entry) => t >= entry.from && t <= entry.to
      )
      nodes.caption.style.display = caption ? 'block' : 'none'
      if (caption) {
        nodes.caption.textContent = caption.text
        nodes.caption.style.opacity = String(
          Math.min(
            clamp01((t - caption.from) / 250),
            clamp01((caption.to - t) / 250)
          )
        )
      }

      // While the camera is on the panel, the staged windows step back.
      const dim = Math.max(
        0,
        ...(script.dimmed ?? []).map(([from, to]) =>
          Math.min(clamp01((t - from) / 300), clamp01((to - t) / 300))
        )
      )
      nodes.mocks.style.opacity = String(1 - 0.6 * dim)

      applyCamera(cameraAt(script.camera, t))
      // Two frames, so that what was just set is on the screen before the picture is taken.
      await new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
    },
  }

  window.stage = stage
})()
