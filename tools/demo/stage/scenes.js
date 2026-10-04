// The five films of the README, as scripts: what the staged desktop adds to each recording (the
// windows the real app would have opened, what happens in them) and where the camera looks. Every
// time is relative to a moment the recorder named (`marks`), so a new recording needs no retiming.

// Its own scope: the scripts of the stage are plain page scripts and share one global scope.
;(() => {
  const { fileManager, browser, terminal } = window.stageWindows

  // Camera positions: the centre of the view in the coordinates of the screen, and how close it is.
  const SHOT = {
    // The whole screen, with a little of the room around it.
    screen: { cx: 720, cy: 450, s: 0.58 },
    // The right edge with the ball, before anything is open.
    edge: { cx: 1180, cy: 450, s: 1.25 },
    // The panel and the ball beside it.
    panel: { cx: 1010, cy: 450, s: 0.9 },
    // Close on the ball, the edge of the screen beside it.
    ball: { cx: 1291, cy: 450, s: 1.5 },
  }

  const FOLDER_WINDOW = { x: 110, y: 150, w: 760, h: 470 }
  const FOLDER_SHOT = { cx: 490, cy: 385, s: 1.05 }

  /** A film is a list of camera positions in time; `to` holds the last one until `start`, then moves. */
  function film(first) {
    const shots = [{ t: 0, ...first }]
    let last = first
    return {
      shots,
      to(start, view, time = 800) {
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
        open: folder + 250,
        // It is put away as the camera goes back to the panel.
        close: back - 650,
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
        open: site + 250,
        title: 'Sign in · Acme Portal',
        address: 'test-admin.example.com/login',
      })
      return {
        duration: end,
        windows: [files, page],
        captions: [
          { text: 'One shortcut. One click.', from: 300, to: folder + 900 },
        ],
        camera: film(SHOT.edge)
          .to(marks.summon + 350, SHOT.panel)
          // Straight from the entry that was clicked to the folder it opened.
          .to(folder + 200, FOLDER_SHOT, 900)
          .to(back - 850, SHOT.panel)
          .to(site + 200, { cx: 490, cy: 380, s: 1.05 }, 900).shots,
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
        close: passEnd - 700,
        title: 'Sign in · Acme Portal',
        address: 'test-admin.example.com/login',
        paste: {
          userFocus: user + 1150,
          user: user + 1550,
          passFocus: pass + 1150,
          pass: pass + 1550,
          signIn: pass + 2450,
        },
      })
      const shellWindow = { x: 330, y: 500, w: 560, h: 270 }
      const shell = terminal({
        ...shellWindow,
        open: -1000,
        command: 'kubectl logs -f deploy/backend -n test --tail=200',
        paste: command + 1550,
        run: command + 2300,
        lines: LOG_LINES,
      })
      // The pointer goes to the free end of each field, clear of what is pasted into it.
      const userField = spot(page, '[data-field="user"]', { x: 90, y: 4 })
      const passField = spot(page, '[data-field="pass"]', { x: 90, y: 4 })
      const button = spot(page, 'button', { x: 70, y: 5 })
      const prompt = { x: shellWindow.x + 420, y: shellWindow.y + 215 }
      const card = clickAt('copy-user')
      const cardShot = { cx: card.x - 60, cy: card.y + 40, s: 1.2 }
      const formShot = { cx: 480, cy: 300, s: 1.2 }
      const bothShot = { cx: 883, cy: 470, s: 0.76 }
      return {
        duration: end,
        windows: [page, shell],
        captions: [
          { text: 'Copy here, paste there.', from: 300, to: user + 2300 },
        ],
        // The windows step back while the camera is close on the panel.
        dimmed: [
          [1100, user + 300],
          [userEnd - 700, pass + 300],
        ],
        pointer: [
          {
            start: user + 300,
            end: userEnd,
            stops: [
              { at: user + 1100, ...userField },
              { at: userEnd - 60, back: true, travel: 620 },
            ],
          },
          {
            start: pass + 300,
            end: passEnd,
            stops: [
              { at: pass + 1100, ...passField },
              { at: pass + 2400, ...button, travel: 460 },
              { at: passEnd - 60, back: true, travel: 620 },
            ],
          },
          {
            start: command + 300,
            end,
            stops: [{ at: command + 1100, ...prompt }],
          },
        ],
        clicks: [
          { t: user + 1150, ...userField },
          { t: pass + 1150, ...passField },
          { t: pass + 2450, ...button },
          { t: command + 1150, ...prompt },
        ],
        keys: [
          { t: user + 1400, text: 'Ctrl + V', duration: 800 },
          { t: pass + 1400, text: 'Ctrl + V', duration: 800 },
          { t: command + 1400, text: 'Ctrl + V', duration: 700 },
          { t: command + 2200, text: 'Enter', duration: 700 },
        ],
        camera: film({ cx: 758, cy: 410, s: 0.63 })
          .to(1000, cardShot)
          .to(user + 250, formShot)
          .to(userEnd - 850, cardShot, 750)
          .to(pass + 250, formShot)
          // The panel and the terminal together, for the command.
          .to(passEnd - 850, bothShot, 750)
          .to(command + 250, { cx: 610, cy: 630, s: 1.3 }).shots,
      }
    },

    /** Ctrl+K finds anything; Enter opens it. */
    search({ marks, end }) {
      const result = marks['open-result']
      const files = fileManager({
        ...FOLDER_WINDOW,
        open: result + 250,
        name: 'test-evidence',
        crumbs: ['This PC', 'Data (D:)', 'acme-portal', 'test-evidence'],
        files: EVIDENCE_FILES,
      })
      return {
        duration: end,
        windows: [files],
        captions: [
          { text: 'Find anything.', from: 300, to: marks.typing + 1300 },
        ],
        camera: film(SHOT.panel)
          .to(marks.search + 150, { cx: 1160, cy: 350, s: 1.25 }, 750)
          .to(result + 200, FOLDER_SHOT, 900).shots,
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
            from: 300,
            to: marks.group - 500,
          },
          {
            text: 'A tile opens its group.',
            from: marks.group + 300,
            to: marks.close + 300,
          },
        ],
        camera: film(SHOT.panel)
          // In on the top of the panel for the button, and for the tiles it brings. The camera
          // moves with the pointer, not before it: a pointer at rest would drift into the caption.
          .to(marks.grid - 850, { cx: 1075, cy: 350, s: 1.25 }, 700)
          // Down with the group that opens.
          .to(marks.group + 100, { cx: 1075, cy: 450, s: 1.15 })
          // The whole panel again, to see the list come back.
          .to(marks.close + 150, SHOT.panel, 900).shots,
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
            from: marks.collapse + 900,
            to: marks.expand - 400,
          },
          {
            text: 'Drag it anywhere. The bubble follows.',
            from: marks.drag - 300,
            to: marks['drag-end'] + 900,
          },
          {
            text: 'Out of the way until you need it.',
            from: marks['collapse-again'] + 700,
            to: end + 5000,
          },
        ],
        camera: film(SHOT.panel)
          // The panel is seen going into the ball; then the empty desktop.
          .to(marks.collapse + 1000, SHOT.screen, 900)
          .to(marks.expand - 1700, SHOT.ball)
          .to(marks.expand - 150, SHOT.panel)
          // The whole screen, and the camera still, for the drag.
          .to(marks.drag - 1100, SHOT.screen, 800).shots,
      }
    },
  }
})()
