// The five films of the README, as scripts: what the staged desktop adds to each recording (the
// windows the real app would have opened, what happens in them) and where the camera looks. Every
// time is relative to a moment the recorder named (`marks`), so a new recording needs no retiming.

// Its own scope: the scripts of the stage are plain page scripts and share one global scope.
;(() => {
  const { fileManager, browser, terminal } = window.stageWindows

  // Camera positions: the centre of the view in the coordinates of the screen, and how close it is.
  // The pictures of the app are taken at twice their size and the film is drawn at one and a half:
  // up to 1.33 the camera shows them pixel for pixel, so the close shots stay near that.
  const SHOT = {
    // The whole screen, with a little of the room around it. At this scale the edges of the screen
    // fall on whole pixels of the film: on a fraction they shimmer from picture to picture.
    screen: { cx: 720, cy: 445, s: 0.6 },
    // The part of the screen the panel is dragged across, as close as it fits.
    drag: { cx: 861, cy: 485, s: 0.76 },
    // Close on the ball, the edge of the screen beside it.
    ball: { cx: 1230, cy: 450, s: 1.5 },
    // Close on the panel, from its title bar down three quarters of it, the ball beside it. The
    // panel stands at the right of the view: the left is free for the caption and the keys.
    panel: { cx: 1073, cy: 375, s: 1.2 },
  }

  const FOLDER_WINDOW = { x: 110, y: 150, w: 760, h: 470 }
  const FOLDER_SHOT = { cx: 490, cy: 385, s: 1.1 }

  /** A film is a list of camera positions in time; `to` holds the last one until `start`, then moves. */
  function film(first) {
    const shots = [{ t: 0, ...first }]
    let last = first
    return {
      shots,
      to(start, view, time = 550) {
        shots.push({ t: start, ...last }, { t: start + time, ...view })
        last = view
        return this
      },
    }
  }

  /** A place in a part of a staged window, on the screen. Measured, so the styles can change. */
  function spot(entry, selector, shift = { x: 0, y: 0 }) {
    const mocks = document.getElementById('mocks')
    const screen = document.getElementById('screen')
    mocks.append(entry.node)
    const shown = entry.node.style.display
    entry.node.style.display = 'flex'
    const target = entry.node.querySelector(selector)
    let x = target.offsetWidth / 2 + shift.x
    let y = target.offsetHeight / 2 + shift.y
    for (let node = target; node && node !== screen; node = node.offsetParent) {
      x += node.offsetLeft
      y += node.offsetTop
    }
    entry.node.style.display = shown
    return { x, y }
  }

  const DESIGN_FILES = [
    ['attachments', 'folder', '2026/09/28 16:12', 'File folder', ''],
    ['01 Overview.docx', 'word', '2026/10/01 09:40', 'Word document', '84 KB'],
    [
      '02 Screen layouts.xlsx',
      'sheet',
      '2026/10/02 14:05',
      'Excel sheet',
      '212 KB',
    ],
    [
      '03 Database design.xlsx',
      'sheet',
      '2026/09/30 11:26',
      'Excel sheet',
      '156 KB',
    ],
    [
      '04 API mapping.docx',
      'word',
      '2026/10/03 18:22',
      'Word document',
      '97 KB',
    ],
    [
      '05 Batch jobs.docx',
      'word',
      '2026/09/25 10:03',
      'Word document',
      '61 KB',
    ],
    ['Review notes.pdf', 'pdf', '2026/10/03 19:10', 'PDF document', '340 KB'],
  ]

  const EVIDENCE_FILES = [
    ['2026-10-03 regression', 'folder', '2026/10/03 17:48', 'File folder', ''],
    [
      'IT-014 order list.png',
      'image',
      '2026/10/03 15:02',
      'PNG image',
      '410 KB',
    ],
    [
      'IT-015 order detail.png',
      'image',
      '2026/10/03 15:09',
      'PNG image',
      '388 KB',
    ],
    ['IT-016 refund.png', 'image', '2026/10/03 15:31', 'PNG image', '402 KB'],
    ['Test cases.xlsx', 'sheet', '2026/10/02 10:15', 'Excel sheet', '128 KB'],
    ['Summary.pdf', 'pdf', '2026/10/03 18:20', 'PDF document', '96 KB'],
  ]

  const LOG_LINES = [
    '<span class="dim">10:24:01</span> INFO  backend  Started in 2.4s',
    '<span class="dim">10:24:07</span> INFO  http     GET  /api/health 200 3ms',
    '<span class="dim">10:24:09</span> <span class="warn">WARN  auth     Token of tester.a expires in 5m</span>',
    '<span class="dim">10:24:12</span> INFO  http     POST /api/login 200 41ms',
    '<span class="dim">10:24:12</span> INFO  http     GET  /api/orders?page=1 200 18ms',
    '<span class="dim">10:24:15</span> INFO  job      nightly-report queued',
  ]

  window.stageScenes = {
    /** The shortcut brings the panel out of the ball; a folder and a page open with one click. */
    open({ marks, end }) {
      const folder = marks['open-folder']
      const back = marks['folder-shown']
      const site = marks['open-site']
      const files = fileManager({
        ...FOLDER_WINDOW,
        open: folder + 200,
        // It is put away as the camera goes back to the panel.
        close: back - 450,
        name: 'detailed-design',
        crumbs: [
          'This PC',
          'Data (D:)',
          'acme-portal',
          'docs',
          'detailed-design',
        ],
        files: DESIGN_FILES,
      })
      const page = browser({
        x: 90,
        y: 130,
        w: 800,
        h: 500,
        open: site + 200,
        title: 'Sign in · Acme Portal',
        address: 'test-admin.example.com/login',
      })
      return {
        duration: end,
        windows: [files, page],
        captions: [
          { text: 'One shortcut. One click.', from: 250, to: folder + 500 },
        ],
        camera: film(SHOT.ball)
          .to(marks.summon + 300, SHOT.panel)
          // Straight from the entry that was clicked to the folder it opened.
          .to(folder + 150, FOLDER_SHOT, 600)
          .to(back - 550, SHOT.panel, 500)
          .to(site + 150, { cx: 490, cy: 380, s: 1.05 }, 600).shots,
      }
    },

    /** The copied user name and password go into the sign-in page, the copied command into a terminal. */
    copy({ marks, end, clickAt }) {
      const user = marks['copy-user']
      const userEnd = marks['copy-user-end']
      const pass = marks['copy-pass']
      const passEnd = marks['copy-pass-end']
      const command = marks['copy-cmd']
      // Both windows are on the desktop from the first picture: the browser above, the terminal below.
      const page = browser({
        x: 80,
        y: 30,
        w: 800,
        h: 450,
        open: -1000,
        // Signed in: the browser has done its part.
        close: passEnd - 450,
        title: 'Sign in · Acme Portal',
        address: 'test-admin.example.com/login',
        paste: {
          userFocus: user + 800,
          user: user + 1100,
          passFocus: pass + 800,
          pass: pass + 1100,
          signIn: pass + 1750,
        },
      })
      const shellWindow = { x: 330, y: 500, w: 560, h: 270 }
      const shell = terminal({
        ...shellWindow,
        open: -1000,
        command: 'kubectl logs -f deploy/backend -n test --tail=200',
        paste: command + 1100,
        run: command + 1600,
        lines: LOG_LINES,
      })
      // The pointer goes to the free end of each field, clear of what is pasted into it.
      const userField = spot(page, '[data-field="user"]', { x: 90, y: 4 })
      const passField = spot(page, '[data-field="pass"]', { x: 90, y: 4 })
      const button = spot(page, 'button', { x: 70, y: 5 })
      const prompt = { x: shellWindow.x + 420, y: shellWindow.y + 215 }
      const card = clickAt('copy-user')
      const cardShot = { cx: 1068, cy: card.y + 30, s: 1.3 }
      const formShot = { cx: 480, cy: 290, s: 1.3 }
      return {
        duration: end,
        windows: [page, shell],
        captions: [
          { text: 'Copy here, paste there.', from: 250, to: user + 1900 },
        ],
        // The windows step back while the camera is close on the panel.
        dimmed: [
          [700, user + 250],
          [userEnd - 450, pass + 250],
        ],
        pointer: [
          {
            start: user + 200,
            end: userEnd,
            stops: [
              { at: user + 750, ...userField },
              { at: userEnd - 60, back: true, travel: 420 },
            ],
          },
          {
            start: pass + 200,
            end: passEnd,
            stops: [
              { at: pass + 750, ...passField },
              { at: pass + 1700, ...button, travel: 360 },
              { at: passEnd - 60, back: true, travel: 420 },
            ],
          },
          {
            start: command + 200,
            end,
            stops: [{ at: command + 750, ...prompt }],
          },
        ],
        clicks: [
          { t: user + 800, ...userField },
          { t: pass + 800, ...passField },
          { t: pass + 1750, ...button },
          { t: command + 800, ...prompt },
        ],
        keys: [
          { t: user + 1000, text: 'Ctrl + V', duration: 800 },
          { t: pass + 1000, text: 'Ctrl + V', duration: 700 },
          { t: command + 1000, text: 'Ctrl + V', duration: 500 },
          { t: command + 1500, text: 'Enter', duration: 600 },
        ],
        // The whole desk for a moment, then always close on what is being done.
        camera: film({ cx: 758, cy: 410, s: 0.63 })
          .to(450, cardShot)
          .to(user + 200, formShot)
          .to(userEnd - 550, cardShot, 500)
          .to(pass + 200, formShot)
          .to(passEnd - 550, SHOT.panel, 500)
          .to(command + 200, { cx: 610, cy: 632, s: 1.3 }).shots,
      }
    },

    /** Ctrl+K finds anything; Enter opens it. */
    search({ marks, end }) {
      const result = marks['open-result']
      const files = fileManager({
        ...FOLDER_WINDOW,
        open: result + 200,
        name: 'test-evidence',
        crumbs: ['This PC', 'Data (D:)', 'acme-portal', 'test-evidence'],
        files: EVIDENCE_FILES,
      })
      return {
        duration: end,
        windows: [files],
        captions: [
          { text: 'Find anything.', from: 250, to: marks.typing + 900 },
        ],
        camera: film(SHOT.panel)
          // In on the search as it opens.
          .to(marks.search + 250, { cx: 1100, cy: 335, s: 1.45 }, 500)
          .to(result + 150, FOLDER_SHOT, 600).shots,
      }
    },

    /** One button turns the list into a grid of tiles and back; a tile opens its group. */
    view({ marks, end }) {
      return {
        duration: end,
        windows: [],
        captions: [
          {
            text: 'List or grid. One click.',
            from: 250,
            to: marks.group - 350,
          },
          {
            text: 'A tile opens its group.',
            from: marks.group + 250,
            to: marks.close + 250,
          },
        ],
        camera: film(SHOT.panel)
          // In on the group that opens, and out again for the list to come back.
          .to(marks.group + 100, { cx: 1068, cy: 440, s: 1.3 }, 500)
          .to(marks.close + 100, SHOT.panel, 500).shots,
      }
    },

    /** The panel folds into the ball and leaves the desktop empty; the two move as one. */
    ball({ marks, end }) {
      return {
        duration: end,
        windows: [],
        captions: [
          {
            text: 'Out of the way until you need it.',
            from: marks.collapse + 500,
            to: marks.expand - 300,
          },
          {
            text: 'Drag it anywhere. The bubble follows.',
            from: marks.drag - 250,
            to: marks['collapse-again'] - 50,
          },
          {
            text: 'Out of the way until you need it.',
            from: marks['collapse-again'] + 450,
            to: end + 5000,
          },
        ],
        camera: film(SHOT.panel)
          // The panel is seen going into the ball; then the empty desktop.
          .to(marks.collapse + 450, SHOT.screen, 600)
          .to(marks.expand - 1150, SHOT.ball)
          .to(marks.expand - 100, SHOT.panel, 500)
          // Back far enough for the whole drag, and the camera still while it lasts.
          .to(marks.drag - 750, SHOT.drag, 600).shots,
      }
    },
  }
})()
