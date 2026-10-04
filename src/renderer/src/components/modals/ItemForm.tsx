import { useEffect, useState } from 'react'

import {
  IconBrowse,
  IconHide,
  IconSave,
  IconShortcuts,
  IconShow,
} from '../common/icons'

import {
  CODE_LANGUAGES,
  type AnyGroupItem,
  type CodeLanguage,
  type GroupItemMap,
  type GroupTab,
} from '../../../../shared/types'
import { DEFAULT_ITEM_ICONS } from '../../../../shared/default-icons'
import { cleanPathInput } from '../../../../shared/user-path'
import { useI18n } from '../../hooks/use-i18n'
import { announceAdded, announceMoved } from '../../store/entry-actions'
import { useAppStore } from '../../store/use-app-store'
import type { ModalState } from '../../store/store-types'
import IconPicker from '../common/IconPicker'
import FormField from '../common/FormField'
import CodeEditor from '../common/CodeEditor'
import { languageLabels } from '../../utils/code'
import {
  inferName,
  isWindowsPath,
  normalizeWebAddress,
  stripQuotes,
} from '../../utils/normalize-target'
import ModalActions from './ModalActions'
import { useUnsavedGuard } from './modal-frame'
import { isSaveShortcut } from './use-field-error'

type ItemShape = {
  path?: string
  url?: string
  username?: string
  password?: string
  passwordLost?: boolean
  note?: string
  content?: string
  language?: CodeLanguage
  description?: string
}

type FieldName = 'name' | 'path' | 'url' | 'code'
type FieldErrors = Partial<Record<FieldName, string>>

// The fields in the order a person meets them, which is the order the first wrong one gets the
// cursor. A folder, a program and a website start with where they point, then name it.
const TARGET_TABS: readonly GroupTab[] = ['folders', 'websites', 'apps']
const FIELD_ORDER: FieldName[] = ['name', 'path', 'url', 'code']
const TARGET_FIELD_ORDER: FieldName[] = ['path', 'url', 'name', 'code']
const FIELD_ID: Record<FieldName, string> = {
  name: 'item-form-name',
  path: 'item-form-path',
  url: 'item-form-url',
  code: 'item-form-code',
}
const errorId = (field: FieldName) => `${FIELD_ID[field]}-error`

function focusField(field: FieldName): void {
  document.getElementById(FIELD_ID[field])?.focus()
}

export default function ItemForm({
  modalSnapshot,
}: {
  modalSnapshot?: ModalState
}): JSX.Element | null {
  const { t } = useI18n()
  const activeModal = useAppStore((state) => state.modal)
  const modal = modalSnapshot ?? activeModal
  const data = useAppStore((state) => state.data)
  const updateData = useAppStore((state) => state.updateData)
  const setModal = useAppStore((state) => state.setModal)
  const saving = useAppStore((state) => state.saving)
  const showToast = useAppStore((state) => state.showToast)

  const active = modal?.kind === 'item' ? modal : null
  const group =
    active?.groupId !== null && active && data
      ? (data[active.tab].find((entry) => entry.id === active.groupId) ?? null)
      : null
  const existing =
    active?.itemId !== null && active && data
      ? group
        ? (group.items.find((entry) => entry.id === active.itemId) ?? null)
        : (data.loose[active.tab].find((entry) => entry.id === active.itemId) ??
          null)
      : null

  const shape = existing as
    | (ItemShape & { id: string; name: string; icon: string })
    | null
  const defaultIcon = DEFAULT_ITEM_ICONS[active?.tab ?? 'folders']
  // What the form opened with, to tell later whether there is anything worth asking about on close.
  // "Save and add another" starts it over.
  const [initial, setInitial] = useState(() => ({
    name: existing?.name ?? '',
    icon: existing?.icon ?? defaultIcon,
    path: shape?.path ?? '',
    url: shape?.url ?? '',
    username: shape?.username ?? '',
    password: shape?.password ?? '',
    note: shape?.note ?? '',
    content: shape?.content ?? '',
    language: shape?.language ?? ('powershell' as CodeLanguage),
    description: shape?.description ?? '',
    // Where it is saved: the one it was opened for, until changed here.
    destination: (active?.groupId ?? null) as string | null,
  }))
  const [name, setName] = useState(initial.name)
  // The name the form made from the target itself. Only a name that is still empty or still this
  // one is replaced when the target changes: what the user typed is never overwritten.
  const [autoName, setAutoName] = useState('')
  const [icon, setIcon] = useState(initial.icon)
  const [path, setPath] = useState(initial.path)
  const [url, setUrl] = useState(initial.url)
  const [username, setUsername] = useState(initial.username)
  const [password, setPassword] = useState(initial.password)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [note, setNote] = useState(initial.note)
  const [content, setContent] = useState(initial.content)
  const [language, setLanguage] = useState<CodeLanguage>(initial.language)
  const [description, setDescription] = useState(initial.description)
  // Where it is saved: the one it was opened for (a group's "+" or the toolbar), until changed here.
  const [destination, setDestination] = useState<string | null>(
    active?.groupId ?? null
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [browsing, setBrowsing] = useState(false)
  const { requestClose } = useUnsavedGuard(
    name !== initial.name ||
      icon !== initial.icon ||
      path !== initial.path ||
      url !== initial.url ||
      username !== initial.username ||
      password !== initial.password ||
      note !== initial.note ||
      content !== initial.content ||
      language !== initial.language ||
      description !== initial.description ||
      destination !== initial.destination
  )
  // The field gets the cursor (which scrolls it into view); the message under it is brought into view
  // too, because under a tall field such as the code editor it can still be below the fold.
  useEffect(() => {
    const first = FIELD_ORDER.find((field) => errors[field])
    if (first) {
      document
        .getElementById(errorId(first))
        ?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [errors])

  if (!active || !data) {
    return null
  }

  const tab = active.tab
  const isTarget = TARGET_TABS.includes(tab)
  const isNew = existing === null
  // Only a new entry can be saved "and another": the form empties and waits for the next target.
  const canContinue = isTarget && isNew
  const groups = data[tab]
  const order = isTarget ? TARGET_FIELD_ORDER : FIELD_ORDER

  // A field's message goes as soon as the field is edited, not only when the next save passes.
  const clearError = (field: FieldName) =>
    setErrors((current) => {
      if (!(field in current)) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  // What a field needs to be read as invalid by a screen reader, and found again by a sighted user.
  const invalid = (field: FieldName) => ({
    'aria-invalid': errors[field] ? (true as const) : undefined,
    'aria-describedby': errors[field] ? errorId(field) : undefined,
  })

  const nameFor = (target: string) =>
    isTarget ? inferName(tab as 'folders' | 'websites' | 'apps', target) : ''
  // Fill the name from a target, unless the user has a name of their own.
  const nameFromTarget = (target: string) => {
    const inferred = nameFor(target)
    if (inferred && (name === '' || name === autoName)) {
      setName(inferred)
      setAutoName(inferred)
      clearError('name')
    }
  }
  const targetValue = tab === 'websites' ? url : path
  const setTarget = tab === 'websites' ? setUrl : setPath
  const cleanTarget = (raw: string) =>
    tab === 'websites'
      ? (normalizeWebAddress(raw) ?? stripQuotes(raw))
      : cleanPathInput(raw)

  const handleSubmit = async (options?: { keepOpen?: boolean }) => {
    if (saving) return
    const cleanedPath = cleanPathInput(path)
    const address = tab === 'websites' ? normalizeWebAddress(url) : null
    // A folder, a program or a website does not have to be named: the target names it.
    const finalName =
      name.trim() ||
      nameFor(tab === 'websites' ? (address ?? url) : cleanedPath)
    const found: FieldErrors = {}
    if (!finalName) found.name = t('invalid_name')
    if (tab === 'apps' || tab === 'folders') {
      if (!cleanedPath) found.path = t('invalid_path')
      // A path that was already saved keeps saving as it is; only a changed one has to look like a path.
      else if (path !== initial.path && !isWindowsPath(cleanedPath))
        found.path = t('invalid_path_format')
    }
    if (tab === 'websites' && !address) found.url = t('invalid_url')
    if (tab === 'commands' && !content.trim())
      found.code = t('cmd_invalid_code')

    const first = order.find((field) => found[field])
    if (first) {
      // What was pasted may be only quotes and spaces: show the path as it is read.
      if (cleanedPath !== path) setPath(cleanedPath)
      setErrors(found)
      focusField(first)
      return
    }
    setErrors({})
    const normalizedUrl = address ?? ''
    const id = existing?.id ?? crypto.randomUUID()
    const itemIcon = icon.trim() || defaultIcon
    // Where it is now, to say where it went and to put it back.
    const fromGroupId = active.groupId
    const fromList = (group ? group.items : data.loose[tab]) as AnyGroupItem[]
    const fromIndex = existing ? fromList.findIndex((e) => e.id === id) : -1
    const moved = existing !== null && destination !== fromGroupId

    await updateData((draft) => {
      let nextItem: GroupItemMap[keyof GroupItemMap]

      switch (tab) {
        case 'folders':
          nextItem = {
            id,
            kind: 'folder',
            name: finalName,
            icon: itemIcon,
            path: cleanedPath,
          }
          break
        case 'websites':
          nextItem = {
            id,
            kind: 'website',
            name: finalName,
            icon: itemIcon,
            url: normalizedUrl,
          }
          break
        case 'apps':
          nextItem = {
            id,
            kind: 'app',
            name: finalName,
            icon: itemIcon,
            path: cleanedPath,
          }
          break
        case 'passwords':
          nextItem = {
            id,
            kind: 'password',
            name: finalName,
            icon: itemIcon,
            username: username.trim(),
            password,
            note: note.trim(),
            // Saving without a new password must not mark the lost one as recovered.
            ...(shape?.passwordLost && !password ? { passwordLost: true } : {}),
          }
          break
        case 'notes':
          nextItem = {
            id,
            kind: 'note',
            name: finalName,
            icon: itemIcon,
            content,
          }
          break
        case 'commands':
          nextItem = {
            id,
            kind: 'command',
            name: finalName,
            icon: itemIcon,
            content,
            language,
            description: description.trim(),
          }
          break
      }

      const listOf = (groupId: string | null) =>
        (groupId === null
          ? draft.loose[tab]
          : draft[tab].find((entry) => entry.id === groupId)?.items) as
          | AnyGroupItem[]
          | undefined
      // A group that has disappeared since the form opened leaves the entry loose.
      const target = listOf(destination) ?? listOf(null)!

      if (existing) {
        const source = listOf(fromGroupId)
        const at = source ? source.findIndex((entry) => entry.id === id) : -1
        if (source === target && at >= 0) {
          // Same place: replace in place so the entry keeps its position.
          source[at] = nextItem
          return
        }
        if (source && at >= 0) source.splice(at, 1)
      }
      target.push(nextItem)
    })

    if (useAppStore.getState().error) return

    if (isNew) {
      announceAdded(t, [{ tab, id, name: finalName }])
    } else if (moved) {
      announceMoved(t, {
        tab,
        id,
        name: finalName,
        fromGroupId,
        fromIndex,
        place:
          groups.find((entry) => entry.id === destination)?.name ??
          t('item_loose'),
      })
    }

    if (!options?.keepOpen) {
      setModal(null)
      return
    }

    // Save and add another: the form empties, keeps the place and the icon, and waits for the next
    // target.
    setInitial({ ...initial, name: '', icon, path: '', url: '', destination })
    setName('')
    setAutoName('')
    setPath('')
    setUrl('')
    setErrors({})
    focusField(tab === 'websites' ? 'url' : 'path')
  }

  const browse = async () => {
    setBrowsing(true)
    try {
      const result = await window.quickLaunch.selectPath(
        tab === 'folders' ? 'folder' : 'app'
      )
      if (!result.ok) {
        showToast(result.error, 'danger')
        return
      }
      if (result.data) {
        setPath(result.data)
        clearError('path')
        nameFromTarget(result.data)
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        'danger'
      )
    } finally {
      setBrowsing(false)
    }
  }

  // A target pasted over the whole field is cleaned on the spot (quotes off, https:// on) and names
  // the entry. A paste into the middle of what is typed is left alone: leaving the field cleans up.
  const pasteTarget = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text').trim()
    const input = event.currentTarget
    const replacesAll =
      input.value === '' ||
      (input.selectionStart === 0 && input.selectionEnd === input.value.length)
    if (!text || /[\r\n]/.test(text) || !replacesAll) return

    event.preventDefault()
    const cleaned = cleanTarget(text)
    setTarget(cleaned)
    clearError(tab === 'websites' ? 'url' : 'path')
    nameFromTarget(cleaned)
  }
  const leaveTarget = () => {
    if (!targetValue.trim()) return
    const cleaned = cleanTarget(targetValue)
    if (cleaned !== targetValue) setTarget(cleaned)
    nameFromTarget(cleaned)
  }

  // The name and the icon. Folders, programs and websites put them after the target.
  const primaryFields = (
    <div className="item-primary-fields">
      <FormField
        label={t('f_name')}
        required={!isTarget}
        htmlFor={FIELD_ID.name}
        error={errors.name}
        errorId={errorId('name')}
      >
        <input
          id={FIELD_ID.name}
          data-testid="item-name-input"
          placeholder={
            isTarget
              ? nameFor(targetValue) || t('item_name_auto_placeholder')
              : t('item_name_placeholder')
          }
          autoComplete="off"
          value={name}
          data-autofocus={active.focus === 'name' ? '' : undefined}
          {...invalid('name')}
          onChange={(event) => {
            setName(event.target.value)
            clearError('name')
          }}
        />
      </FormField>
      <FormField label={t('f_icon')} group>
        <IconPicker value={icon} onChange={setIcon} />
      </FormField>
    </div>
  )

  return (
    <form
      className="item-form"
      onKeyDown={(event) => {
        if (isSaveShortcut(event)) {
          event.preventDefault()
          void handleSubmit()
        } else if (
          canContinue &&
          (event.ctrlKey || event.metaKey) &&
          event.key === 'Enter' &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault()
          void handleSubmit({ keepOpen: true })
        }
      }}
      onSubmit={(event) => {
        event.preventDefault()
        void handleSubmit()
      }}
    >
      <div className="item-modal-location">
        <label htmlFor="item-destination">{t('item_location')}</label>
        {groups.length > 0 ? (
          <select
            id="item-destination"
            data-testid="item-destination"
            value={destination ?? ''}
            onChange={(event) => setDestination(event.target.value || null)}
          >
            <option value="">{t('item_loose')}</option>
            {groups.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        ) : (
          <strong data-testid="item-destination">{t('item_loose')}</strong>
        )}
      </div>
      <div className="item-form-body">
        {!isTarget && primaryFields}
        <div className="item-field-panel">
          <div className="item-field-panel-title">
            {t(tab === 'passwords' ? 'item_credentials' : 'item_details')}
          </div>
          {(tab === 'folders' || tab === 'apps') && (
            <FormField
              label={t('f_path')}
              required
              hint={t('item_path_hint')}
              htmlFor={FIELD_ID.path}
              error={errors.path}
              errorId={errorId('path')}
            >
              <div className="path-field">
                <input
                  id={FIELD_ID.path}
                  data-testid="item-path-input"
                  placeholder={
                    tab === 'folders' ? 'C:\\Work' : 'C:\\Tools\\App.exe'
                  }
                  autoComplete="off"
                  value={path}
                  data-autofocus={active.focus === 'path' ? '' : undefined}
                  {...invalid('path')}
                  onChange={(event) => {
                    setPath(event.target.value)
                    clearError('path')
                  }}
                  onPaste={pasteTarget}
                  onBlur={leaveTarget}
                />
                <button
                  className="secondary-button"
                  type="button"
                  data-testid="item-browse"
                  disabled={browsing}
                  onClick={() => void browse()}
                >
                  <IconBrowse size={14} />
                  {t('browse')}
                </button>
              </div>
            </FormField>
          )}
          {tab === 'websites' && (
            <FormField
              label={t('f_url')}
              required
              hint={t('item_url_hint')}
              htmlFor={FIELD_ID.url}
              error={errors.url}
              errorId={errorId('url')}
            >
              <input
                id={FIELD_ID.url}
                data-testid="item-url-input"
                placeholder="https://example.com"
                autoComplete="off"
                value={url}
                data-autofocus={active.focus === 'url' ? '' : undefined}
                {...invalid('url')}
                onChange={(event) => {
                  setUrl(event.target.value)
                  clearError('url')
                }}
                onPaste={pasteTarget}
                onBlur={leaveTarget}
              />
            </FormField>
          )}
          {tab === 'passwords' && (
            <>
              <div className="item-credential-inputs">
                <FormField label={t('f_username')} htmlFor="item-form-username">
                  <input
                    id="item-form-username"
                    data-testid="item-username-input"
                    placeholder={t('item_username_placeholder')}
                    autoComplete="off"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </FormField>
                <FormField label={t('f_password')} htmlFor="item-form-password">
                  <div className="input-with-action">
                    <input
                      id="item-form-password"
                      data-testid="item-password-input"
                      placeholder={t('item_password_placeholder')}
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      type={passwordVisible ? 'text' : 'password'}
                    />
                    <button
                      className={`icon-button input-action-button ${passwordVisible ? 'active' : ''}`.trim()}
                      type="button"
                      aria-label={
                        passwordVisible ? t('pwd_hide') : t('pwd_show')
                      }
                      title={passwordVisible ? t('pwd_hide') : t('pwd_show')}
                      onClick={() => setPasswordVisible((current) => !current)}
                    >
                      {passwordVisible ? (
                        <IconHide size={14} />
                      ) : (
                        <IconShow size={14} />
                      )}
                    </button>
                  </div>
                </FormField>
              </div>
              {shape?.passwordLost && !password ? (
                <p
                  className="form-note form-note-warning"
                  role="note"
                  data-testid="item-password-lost-note"
                >
                  {t('pwd_lost_hint')}
                </p>
              ) : null}
              <FormField label={t('f_note')} htmlFor="item-form-note">
                <textarea
                  id="item-form-note"
                  data-testid="item-note-input"
                  rows={2}
                  placeholder={t('item_note_placeholder')}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </FormField>
              <p className="item-panel-hint">{t('item_password_hint')}</p>
            </>
          )}
          {tab === 'notes' && (
            <FormField label={t('f_content')} htmlFor="item-form-content">
              <textarea
                id="item-form-content"
                data-testid="item-content-input"
                className="item-note-editor"
                placeholder={t('item_content_placeholder')}
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </FormField>
          )}
          {tab === 'commands' && (
            <>
              <div className="command-metadata">
                <FormField
                  label={t('cmd_language')}
                  htmlFor="item-form-language"
                >
                  <select
                    id="item-form-language"
                    data-testid="command-language"
                    value={language}
                    onChange={(event) =>
                      setLanguage(event.target.value as CodeLanguage)
                    }
                  >
                    {CODE_LANGUAGES.map((value) => (
                      <option key={value} value={value}>
                        {languageLabels[value]}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField
                  label={t('cmd_description')}
                  htmlFor="item-form-description"
                >
                  <input
                    id="item-form-description"
                    data-testid="command-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={t('cmd_description_placeholder')}
                  />
                </FormField>
              </div>
              <FormField
                label={t('cmd_code')}
                required
                group
                error={errors.code}
                errorId={errorId('code')}
              >
                <CodeEditor
                  id={FIELD_ID.code}
                  value={content}
                  invalid={Boolean(errors.code)}
                  describedBy={errors.code ? errorId('code') : undefined}
                  onChange={(next) => {
                    setContent(next)
                    clearError('code')
                  }}
                />
              </FormField>
            </>
          )}
        </div>
        {isTarget && primaryFields}
      </div>
      <ModalActions>
        <span className="item-save-hint">
          <IconShortcuts size={14} />
          {t(canContinue ? 'item_save_hint_continue' : 'item_save_hint')}
        </span>
        <button
          className="secondary-button"
          type="button"
          onClick={requestClose}
        >
          {t('btn_cancel')}
        </button>
        <button
          className="primary-button"
          type="submit"
          data-testid="item-save"
          disabled={saving || browsing}
        >
          <IconSave size={14} />
          {t('btn_save')}
        </button>
      </ModalActions>
    </form>
  )
}
