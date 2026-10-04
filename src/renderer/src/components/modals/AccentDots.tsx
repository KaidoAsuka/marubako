import type { CSSProperties } from 'react'

import {
  BACKGROUNDS,
  type BackgroundKey,
  type Theme,
} from '../../../../shared/types'
import { useI18n } from '../../hooks/use-i18n'
import { useRadioKeys } from '../../hooks/use-radio-keys'
import { getAccentSolid } from '../../styles/background-theme'
import { IconDone } from '../common/icons'

type Props = {
  value: BackgroundKey
  /** The theme being edited: each dot shows the solid fill that choice has in it. */
  theme: Theme
  label: string
  onChange: (value: BackgroundKey) => void
}

/**
 * The accent colour setting: one solid dot per choice, in the colour you get. A radio group, so
 * the chosen dot is also the one in the tab order and the arrow keys walk the others. The chosen
 * dot has a ring and a check mark, never just a colour; every dot has a name for the pointer
 * (title) and for screen readers (aria-label).
 */
export default function AccentDots({
  value,
  theme,
  label,
  onChange,
}: Props): JSX.Element {
  const { t } = useI18n()
  const { setRef, onKeyDown } = useRadioKeys(BACKGROUNDS, onChange)

  return (
    <div className="accent-dots" role="radiogroup" aria-label={label}>
      {BACKGROUNDS.map((entry, index) => {
        const selected = entry === value
        const name = t(`bg_${entry}`)

        return (
          <button
            key={entry}
            ref={setRef(index)}
            className={`accent-dot${selected ? ' active' : ''}`}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={name}
            title={name}
            tabIndex={selected ? 0 : -1}
            data-testid={`background-${entry}`}
            style={{ '--dot': getAccentSolid(theme, entry) } as CSSProperties}
            onClick={() => onChange(entry)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className="accent-dot-fill">
              {selected ? <IconDone size={14} weight="bold" /> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
