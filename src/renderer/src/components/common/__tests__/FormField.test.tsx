import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import FormField from '../FormField'

describe('FormField', () => {
  afterEach(() => {
    cleanup()
  })

  it('is a plain container, not a label that forwards clicks to its first control', () => {
    const { container } = render(
      <FormField label="Theme" group>
        <button type="button">Dark</button>
      </FormField>
    )

    const root = container.querySelector('.form-field')!
    expect(root.tagName).toBe('DIV')
    expect(container.querySelector('label')).toBeNull()
  })

  it('does not click the first button when the title or blank space is clicked', () => {
    const onClick = vi.fn()
    const { container } = render(
      <FormField label="Data" hint="Importing overwrites everything" group>
        <button type="button" onClick={onClick}>
          Export
        </button>
        <button type="button">Import</button>
      </FormField>
    )

    fireEvent.click(screen.getByText('Data'))
    fireEvent.click(screen.getByText('Importing overwrites everything'))
    fireEvent.click(container.querySelector('.form-field')!)

    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders the title as a label bound to the control when htmlFor is given', () => {
    const onClick = vi.fn()
    render(
      <FormField label="Name" required htmlFor="name-input">
        <input id="name-input" onClick={onClick} />
      </FormField>
    )

    const label = screen.getByText('Name *')
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveAttribute('for', 'name-input')
    expect((label as HTMLLabelElement).control).toBe(
      document.getElementById('name-input')
    )
    expect(screen.getByLabelText('Name *')).toBe(
      document.getElementById('name-input')
    )

    fireEvent.click(label)

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders the title as a plain span without htmlFor', () => {
    render(
      <FormField label="Theme" group>
        <button type="button">Dark</button>
      </FormField>
    )

    expect(screen.getByText('Theme').tagName).toBe('SPAN')
  })

  it('labels a multi-control field as a group by its title', () => {
    render(
      <FormField label="Theme" group>
        <button type="button">Dark</button>
        <button type="button">Light</button>
      </FormField>
    )

    const group = screen.getByRole('group', { name: 'Theme' })
    expect(group).toContainElement(screen.getByText('Dark'))
    expect(group).toContainElement(screen.getByText('Light'))
  })

  it('keeps the hint inside the field', () => {
    render(
      <FormField label="Path" htmlFor="path-input" hint="Paste a full path">
        <input id="path-input" />
      </FormField>
    )

    expect(screen.getByText('Paste a full path')).toHaveClass('form-field-hint')
  })
})
