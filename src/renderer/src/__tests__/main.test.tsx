// The entry point dresses the document before React draws anything: the main process puts the saved
// language and theme in the window's URL, so the loading screen does not change colour (or
// language) when the data arrives. React itself is replaced here: only what main.tsx does to the
// document before it hands over is looked at.
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const reactDom = vi.hoisted(() => {
  const render = vi.fn()
  const createRoot = vi.fn(() => ({ render }))

  return { render, createRoot }
})

vi.mock('react-dom/client', () => ({
  default: { createRoot: reactDom.createRoot },
  createRoot: reactDom.createRoot,
}))

interface Dressed {
  html: string[]
  body: string[]
  lang: string
}

/** Loads the entry point as a window opened at `search` does, and reports what React found. */
async function start(search: string): Promise<Dressed> {
  window.history.replaceState(null, '', `/${search}`)
  let found: Dressed | undefined
  reactDom.render.mockImplementation(() => {
    found = {
      html: [...document.documentElement.classList],
      body: [...document.body.classList],
      lang: document.documentElement.lang,
    }
  })
  vi.resetModules()
  await import('../main')

  expect(reactDom.createRoot).toHaveBeenCalledWith(
    document.getElementById('root')
  )
  expect(reactDom.render).toHaveBeenCalledTimes(1)

  return found!
}

describe('main.tsx, before React renders', () => {
  // The entry point pulls in the whole interface. Loading it once here, with room to spare, keeps
  // that cost out of the first test's own time limit.
  beforeAll(async () => {
    await import('../main')
  }, 60_000)

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = '<div id="root"></div>'
    document.documentElement.lang = 'zh-CN'
  })

  afterEach(() => {
    for (const target of [document.documentElement, document.body]) {
      target.classList.remove('theme-light', 'theme-dark')
    }
    document.documentElement.lang = 'zh-CN'
    document.body.innerHTML = ''
    window.history.replaceState(null, '', '/')
  })

  it.each(['light', 'dark'] as const)(
    'puts the %s theme of the URL on html and body',
    async (theme) => {
      const found = await start(`?theme=${theme}`)

      expect(found.html).toEqual([`theme-${theme}`])
      expect(found.body).toEqual([`theme-${theme}`])
    }
  )

  it.each(['', '?theme=sepia', '?theme=system'])(
    'adds no theme class when the URL names no theme it knows (%j)',
    async (search) => {
      const found = await start(search)

      expect(found.html).toEqual([])
      expect(found.body).toEqual([])
    }
  )

  it('sets the language and the theme together', async () => {
    const found = await start('?lang=ja&theme=dark')

    expect(found.lang).toBe('ja')
    expect(found.html).toEqual(['theme-dark'])
  })

  it('dresses the window of the ball the same way', async () => {
    const found = await start('?view=dock&lang=en&theme=light')

    expect(found.lang).toBe('en')
    expect(found.html).toEqual(['theme-light'])
    expect(found.body).toEqual(['theme-light'])
  })
})
