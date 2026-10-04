import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { ModalState } from '../../../store/store-types'
import { useAppStore } from '../../../store/use-app-store'
import GroupForm from '../GroupForm'
import SubtaskForm from '../SubtaskForm'
import TaskForm from '../TaskForm'

const DATE = '2026-03-10'

const FORMS = [
  [
    'group',
    { kind: 'group', tab: 'folders', groupId: null } as ModalState,
    GroupForm,
    'group-name-input',
    'group-save',
  ],
  [
    'task',
    { kind: 'task', date: DATE, taskId: null } as ModalState,
    TaskForm,
    'task-name-input',
    'task-save',
  ],
  [
    'subtask',
    {
      kind: 'subtask',
      date: DATE,
      taskId: 'task-a',
      subtaskId: null,
    } as ModalState,
    SubtaskForm,
    'subtask-name-input',
    'subtask-save',
  ],
] as const

describe.each(FORMS)(
  'the %s form',
  (_name, modal, Form, nameInput, saveButton) => {
    beforeEach(() => {
      vi.clearAllMocks()
      const data = createDefaultAppData()
      data.tasks[DATE] = [
        {
          id: 'task-a',
          name: 'Write report',
          icon: 'T',
          status: 'todo',
          open: true,
          subtasks: [],
        },
      ]
      useAppStore.setState({
        data,
        loading: false,
        saving: false,
        error: null,
        toast: null,
        selectedDate: DATE,
        modal,
      })
    })

    afterEach(() => {
      cleanup()
    })

    const form = () => screen.getByTestId(nameInput).closest('form')!
    const type = (value: string) =>
      fireEvent.change(screen.getByTestId(nameInput), { target: { value } })

    it('is a real form, so Enter in the name field saves like the button does', async () => {
      render(<Form />)

      expect(form()).toBeInTheDocument()
      expect(screen.getByTestId(saveButton)).toHaveAttribute('type', 'submit')
      type('Something')
      await act(async () => {
        fireEvent.submit(form())
      })

      expect(window.quickLaunch.saveData).toHaveBeenCalledTimes(1)
      expect(useAppStore.getState().modal).toBeNull()
    })

    it('saves from the button as well', async () => {
      render(<Form />)
      type('Something')

      await act(async () => {
        fireEvent.click(screen.getByTestId(saveButton))
      })

      expect(window.quickLaunch.saveData).toHaveBeenCalledTimes(1)
      expect(useAppStore.getState().modal).toBeNull()
    })

    it('saves on Ctrl+S too, like the item editor', async () => {
      render(<Form />)
      type('Something')

      await act(async () => {
        fireEvent.keyDown(screen.getByTestId(nameInput), {
          key: 's',
          ctrlKey: true,
        })
      })

      expect(window.quickLaunch.saveData).toHaveBeenCalledTimes(1)
    })

    it('says so under the name when it is empty, takes the cursor there and writes nothing', async () => {
      render(<Form />)

      await act(async () => {
        fireEvent.submit(form())
      })

      const input = screen.getByTestId(nameInput)
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent('请填写名称')
      expect(alert.closest('.form-field')).toContainElement(input)
      expect(input).toHaveFocus()
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input.getAttribute('aria-describedby')).toBe(alert.id)
      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
      expect(useAppStore.getState().modal).not.toBeNull()
    })

    it('treats a name of spaces as empty, and drops the message once the user types', async () => {
      render(<Form />)
      type('   ')

      await act(async () => {
        fireEvent.submit(form())
      })
      expect(screen.getByRole('alert')).toBeInTheDocument()

      type('Something')
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.getByTestId(nameInput)).not.toHaveAttribute('aria-invalid')
    })

    it('stays open with what was typed when the write fails', async () => {
      vi.mocked(window.quickLaunch.saveData).mockResolvedValueOnce({
        ok: false,
        error: 'disk full',
      })
      render(<Form />)
      type('Something')

      await act(async () => {
        fireEvent.submit(form())
      })

      expect(useAppStore.getState().modal).not.toBeNull()
      expect(screen.getByTestId(nameInput)).toHaveValue('Something')
      expect(useAppStore.getState().toast).toMatchObject({
        message: 'disk full',
        tone: 'danger',
      })

      // And a second try goes through.
      await act(async () => {
        fireEvent.submit(form())
      })
      expect(useAppStore.getState().modal).toBeNull()
    })

    it('ignores a second submit while the first is still being written', async () => {
      render(<Form />)
      type('Something')
      act(() => useAppStore.setState({ saving: true }))

      expect(screen.getByTestId(saveButton)).toBeDisabled()
      await act(async () => {
        fireEvent.submit(form())
      })

      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
    })
  }
)
