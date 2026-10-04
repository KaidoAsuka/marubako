import type { CodeLanguage } from '../../../shared/types'

export const languageLabels: Record<CodeLanguage, string> = {
  powershell: 'PowerShell',
  bash: 'Bash / Shell',
  batch: 'Batch / CMD',
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  sql: 'SQL',
  json: 'JSON',
  yaml: 'YAML',
  plaintext: 'Plain text',
}

export function indentCode(
  value: string,
  start: number,
  end: number,
  outdent = false
) {
  if (start === end && !outdent) {
    return {
      value: value.slice(0, start) + '  ' + value.slice(end),
      start: start + 2,
      end: start + 2,
    }
  }
  const lineStart = value.slice(0, start).lastIndexOf('\n') + 1
  if (start === end) {
    const removed =
      value.slice(lineStart).match(/^(?: {1,2}|\t)/)?.[0].length ?? 0
    const position = Math.max(lineStart, start - removed)
    return {
      value: value.slice(0, lineStart) + value.slice(lineStart + removed),
      start: position,
      end: position,
    }
  }
  const lastPosition = value[end - 1] === '\n' ? end - 1 : end
  const newline = value.indexOf('\n', lastPosition)
  const blockEnd = newline < 0 ? value.length : newline
  const lines = value.slice(lineStart, blockEnd).split('\n')
  let firstChange = 0
  let totalChange = 0
  const next = lines
    .map((line, index) => {
      const removed = outdent
        ? (line.match(/^(?: {1,2}|\t)/)?.[0].length ?? 0)
        : 0
      const change = outdent ? -removed : 2
      if (index === 0) firstChange = change
      totalChange += change
      return outdent ? line.slice(removed) : '  ' + line
    })
    .join('\n')
  return {
    value: value.slice(0, lineStart) + next + value.slice(blockEnd),
    start: Math.max(lineStart, start + firstChange),
    end: Math.max(lineStart, end + totalChange),
  }
}

export type CodeToken = {
  text: string
  kind?: 'comment' | 'string' | 'number' | 'keyword' | 'variable'
}
const keywords = new Set(
  'if else elif then fi for foreach while do done function def class return import from as export const let var async await try catch finally throw new true false null none select insert update delete create from where order by join into values set and or not echo param begin end in public private interface type'.split(
    ' '
  )
)

// A lightweight display lexer. Every character is returned as text, never HTML.
export function highlightCode(
  code: string,
  language: CodeLanguage
): CodeToken[] {
  if (language === 'plaintext') return [{ text: code }]
  const hashComments = ['powershell', 'bash', 'python', 'yaml'].includes(
    language
  )
  const slashComments = ['javascript', 'typescript'].includes(language)
  const sqlComments = language === 'sql'
  const batchComments = language === 'batch'
  const pattern =
    /\/\*[\s\S]*?\*\/|(?:\/\/|#|--)[^\n]*|\b(?:REM)[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\$[\w:]+|\b\d+(?:\.\d+)?\b|\b[a-zA-Z_]\w*\b/g
  const tokens: CodeToken[] = []
  let offset = 0
  for (const match of code.matchAll(pattern)) {
    if (match.index > offset)
      tokens.push({ text: code.slice(offset, match.index) })
    const text = match[0]
    const isComment =
      (text.startsWith('#') && hashComments) ||
      ((text.startsWith('//') || text.startsWith('/*')) && slashComments) ||
      (text.startsWith('--') && sqlComments) ||
      (/^REM\b/i.test(text) && batchComments)
    const kind = isComment
      ? 'comment'
      : /^["'`]/.test(text)
        ? 'string'
        : /^\d/.test(text)
          ? 'number'
          : text.startsWith('$')
            ? 'variable'
            : keywords.has(text.toLowerCase())
              ? 'keyword'
              : undefined
    tokens.push(kind ? { text, kind } : { text })
    offset = match.index + text.length
  }
  if (offset < code.length) tokens.push({ text: code.slice(offset) })
  return tokens
}
