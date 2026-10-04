// The windows of the staged desktop: a file manager, a browser with a sign-in page and a terminal.
// They stand in for what the real app opens (it opens nothing while it is recorded). Each one is
// built once and then shown as a function of the time: `update(t)` sets everything, so that any
// frame of the film can be drawn on its own.

// Its own scope: the scripts of the stage are plain page scripts and share one global scope.
;(() => {
  function element(tag, className, html) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (html !== undefined) node.innerHTML = html
    return node
  }

  const WIN_BUTTONS =
    '<div class="win-buttons"><span>&#8211;</span><span>&#9633;</span><span>&#215;</span></div>'

  /** The frame every staged window shares, and its way of appearing. */
  function frame({ x, y, w, h, open = 0, close = Infinity, dark = false }) {
    const node = element('div', dark ? 'win dark' : 'win')
    Object.assign(node.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
    })
    return {
      node,
      /** Grows out a little and fades in over 260 ms from `open`; leaves the same way at `close`. */
      appear(t) {
        const progress = Math.min(
          1,
          Math.max(0, (t - open) / 260),
          Math.max(0, (close + 220 - t) / 220)
        )
        const eased = 1 - (1 - progress) ** 3
        node.style.display = t >= open && t < close + 220 ? 'flex' : 'none'
        node.style.opacity = String(eased)
        node.style.transform = `scale(${0.94 + 0.06 * eased})`
      },
    }
  }

  const FILE_KINDS = {
    folder: { colour: '#f2b33a', label: '' },
    word: { colour: '#2b62c8', label: 'W' },
    sheet: { colour: '#1f8a55', label: 'X' },
    pdf: { colour: '#d0453a', label: 'P' },
    image: { colour: '#8b5cf0', label: '' },
  }

  /** A file manager showing one folder. `files`: [name, kind, date, type, size]. */
  function fileManager({ x, y, w, h, open, close, name, crumbs, files }) {
    const win = frame({ x, y, w, h, open, close })
    const rows = files
      .map(([file, kind, date, type, size]) => {
        const look = FILE_KINDS[kind]
        const icon = `<i class="file-icon${kind === 'folder' ? ' folder' : ''}" style="--c: ${look.colour}">${look.label}</i>`
        return `<div class="files-row"><span>${icon}${file}</span><span>${date}</span><span>${type}</span><span>${size}</span></div>`
      })
      .join('')
    win.node.innerHTML = `
    <div class="win-bar">
      <div class="win-tab"><i class="dot"></i>${name}</div>
      <span class="win-plus">+</span>
      ${WIN_BUTTONS}
    </div>
    <div class="win-tools">
      <span>&#8592;</span><span>&#8594;</span><span>&#8593;</span>
      <div class="win-address">${crumbs.map((crumb) => `<span>${crumb}</span>`).join('<em>&#8250;</em>')}</div>
      <div class="win-search">Search ${name}</div>
    </div>
    <div class="files-commands"><b>+ New</b><span>Cut</span><span>Copy</span><span>Paste</span><span>Rename</span><span>Sort</span><span>View</span></div>
    <div class="files-body">
      <div class="files-nav">
        <span><i class="dot" style="--c: #4f8ef7"></i>Home</span>
        <span><i class="dot" style="--c: #35b37e"></i>Desktop</span>
        <span><i class="dot" style="--c: #4f8ef7"></i>Documents</span>
        <span><i class="dot" style="--c: #35b37e"></i>Downloads</span>
        <span><i class="dot" style="--c: #8a94a6"></i>This PC</span>
        <span class="here"><i class="dot" style="--c: #8a94a6"></i>Data (D:)</span>
      </div>
      <div class="files-list">
        <div class="files-row head"><span>Name</span><span>Date modified</span><span>Type</span><span>Size</span></div>
        ${rows}
      </div>
    </div>
    <div class="files-status">${files.length} items</div>`
    return { node: win.node, update: (t) => win.appear(t) }
  }

  /**
   * A browser on the sign-in page of a test environment. `paste` says when the copied user name and
   * password arrive in their fields and when the button is pressed; the page then shows a dashboard.
   */
  function browser({ x, y, w, h, open, close, title, address, paste = {} }) {
    const win = frame({ x, y, w, h, open, close })
    win.node.innerHTML = `
    <div class="win-bar">
      <div class="win-tab"><i class="dot" style="--c: #f08a24; border-radius: 50%"></i>${title}</div>
      <span class="win-plus">+</span>
      ${WIN_BUTTONS}
    </div>
    <div class="win-tools">
      <span>&#8592;</span><span>&#8594;</span><span>&#8635;</span>
      <div class="win-address"><em>https://</em>${address}</div>
    </div>
    <div class="page">
      <div class="page-ribbon">TEST ENVIRONMENT</div>
      <div class="login">
        <h3><i></i>Acme Portal</h3>
        <label>User name</label>
        <div class="field" data-field="user"></div>
        <label>Password</label>
        <div class="field" data-field="pass"></div>
        <button type="button">Sign in</button>
      </div>
      <div class="dash">
        <h3>Dashboard</h3>
        <p>Signed in as admin@test.example.com</p>
        <div class="dash-cards">
          <div>Orders today<b>128</b></div>
          <div>Open tickets<b>7</b></div>
          <div>Last deploy<b>10:02</b></div>
        </div>
      </div>
    </div>`
    const user = win.node.querySelector('[data-field="user"]')
    const pass = win.node.querySelector('[data-field="pass"]')
    const button = win.node.querySelector('button')
    const login = win.node.querySelector('.login')
    const dash = win.node.querySelector('.dash')
    const after = (moment) => moment !== undefined
    return {
      node: win.node,
      update(t) {
        win.appear(t)
        const userIn = after(paste.user) && t >= paste.user
        const passIn = after(paste.pass) && t >= paste.pass
        const signedIn = after(paste.signIn) && t >= paste.signIn + 260
        user.textContent = userIn ? 'admin@test.example.com' : ''
        pass.textContent = passIn ? '••••••••••••' : ''
        user.className = `field${userIn ? ' filled' : ''}${after(paste.userFocus) && t >= paste.userFocus && !passIn && !(after(paste.passFocus) && t >= paste.passFocus) ? ' focus' : ''}`
        pass.className = `field${passIn ? ' filled' : ''}${after(paste.passFocus) && t >= paste.passFocus && !signedIn ? ' focus' : ''}`
        button.className =
          after(paste.signIn) && t >= paste.signIn && !signedIn ? 'pressed' : ''
        login.style.display = signedIn ? 'none' : 'block'
        dash.style.display = signedIn ? 'block' : 'none'
      },
    }
  }

  /** A terminal: the copied command is pasted at `paste`, run at `run`, and its output scrolls in. */
  function terminal({ x, y, w, h, open, command, paste, run, lines }) {
    const win = frame({ x, y, w, h, open, dark: true })
    win.node.innerHTML = `
    <div class="win-bar">
      <div class="win-tab"><i class="dot" style="--c: #4f8ef7"></i>PowerShell</div>
      <span class="win-plus">+</span>
      ${WIN_BUTTONS}
    </div>
    <div class="term"></div>`
    const body = win.node.querySelector('.term')
    return {
      node: win.node,
      update(t) {
        win.appear(t)
        const prompt = '<span class="prompt">PS C:\\Users\\dev&gt;</span> '
        const typed = t >= paste ? command : ''
        // The first line comes a quarter of a second after the command was run, then one by one.
        const shown = lines.slice(
          0,
          Math.max(0, Math.floor((t - run - 250) / 230) + 1)
        )
        const caret = t < run ? '<span class="caret"></span>' : ''
        body.innerHTML = `${prompt}${typed}${caret}\n${shown.join('\n')}`
      },
    }
  }

  window.stageWindows = { fileManager, browser, terminal }
})()
