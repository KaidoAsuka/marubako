import { useId } from 'react'

type Props = {
  label: string
  required?: boolean
  hint?: string
  /**
   * What is wrong with the value, shown right under the control. The control sets `aria-invalid`
   * and `aria-describedby={errorId}` itself; the message is announced when it appears.
   */
  error?: string | undefined
  errorId?: string | undefined
  /**
   * Id of the one control this field is for. The title then becomes a <label htmlFor>, so clicking
   * it focuses that control. Leave it out for fields holding several controls.
   */
  htmlFor?: string
  /** Several controls share the title: expose them as a group named by it. */
  group?: boolean
  children: React.ReactNode
}

// The root is deliberately not a <label>: a label without `for` forwards every click on its text or
// blank space to the first control inside it (an export button, the dark theme, a wrap toggle...).
export default function FormField({
  label,
  required = false,
  hint,
  error,
  errorId,
  htmlFor,
  group = false,
  children,
}: Props): JSX.Element {
  const titleId = useId()
  const title = (
    <>
      {label}
      {required ? ' *' : ''}
    </>
  )

  return (
    <div
      className="form-field"
      {...(group ? { role: 'group', 'aria-labelledby': titleId } : {})}
    >
      {htmlFor ? (
        <label className="form-field-label" id={titleId} htmlFor={htmlFor}>
          {title}
        </label>
      ) : (
        <span className="form-field-label" id={titleId}>
          {title}
        </span>
      )}
      {children}
      {error && (
        <span id={errorId} className="form-field-error" role="alert">
          {error}
        </span>
      )}
      {hint && <span className="form-field-hint">{hint}</span>}
    </div>
  )
}
