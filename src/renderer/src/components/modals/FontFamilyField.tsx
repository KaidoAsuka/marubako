import { useEffect, useState } from 'react'

import { useI18n } from '../../hooks/use-i18n'
import { listInstalledFonts } from '../../utils/installed-fonts'
import FormField from '../common/FormField'

/**
 * The font of the interface: the default of the language, or one of the installed fonts. A saved
 * font that is not installed here (the data came from another PC) stays selectable, and says so.
 */
export default function FontFamilyField({
  value,
  disabled,
  onChange,
}: {
  value: string
  disabled: boolean
  onChange: (family: string) => void
}): JSX.Element {
  const { t } = useI18n()
  // undefined: still asking. null: the list cannot be had.
  const [fonts, setFonts] = useState<string[] | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    void listInstalledFonts().then((list) => {
      if (active) setFonts(list)
    })
    return () => {
      active = false
    }
  }, [])

  const installed = fonts ?? []
  const unlisted = value !== '' && !installed.includes(value)

  return (
    <FormField
      label={t('font_family')}
      hint={
        fonts === null ? t('font_family_unavailable') : t('font_family_hint')
      }
      htmlFor="settings-font-family"
    >
      <select
        id="settings-font-family"
        data-testid="settings-font-family"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t('font_family_default')}</option>
        {unlisted && (
          <option value={value}>
            {/* Only a list that is there can say that the font is not in it. */}
            {Array.isArray(fonts)
              ? t('font_family_missing').replace('{font}', value)
              : value}
          </option>
        )}
        {installed.map((family) => (
          <option
            key={family}
            value={family}
            // Each name in its own font, where the list is drawn by Chromium.
            style={{ fontFamily: `"${family}"` }}
          >
            {family}
          </option>
        ))}
      </select>
    </FormField>
  )
}
