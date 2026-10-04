import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CodeEditor from '../CodeEditor'

function Editor({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  return <CodeEditor value={value} onChange={setValue} />
}

describe('CodeEditor', () => {
  it('restores the caret before the next indentation keypress', () => {
    render(<Editor initial={'echo hi\n'} />)
    const editor = screen.getByTestId(
      'command-code-input'
    ) as HTMLTextAreaElement
    editor.focus()
    editor.setSelectionRange(0, 0)
    fireEvent.keyDown(editor, { key: 'Tab' })
    expect(editor.value).toBe('  echo hi\n')
    expect(editor.selectionStart).toBe(2)
    fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })
    expect(editor.value).toBe('echo hi\n')
    expect(editor.selectionStart).toBe(0)
  })
  it('retains indentation after a newline', () => {
    render(<Editor initial={'  print(1)'} />)
    const editor = screen.getByTestId(
      'command-code-input'
    ) as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(editor.value).toBe('  print(1)\n  ')
    expect(editor.selectionStart).toBe(editor.value.length)
  })
})
