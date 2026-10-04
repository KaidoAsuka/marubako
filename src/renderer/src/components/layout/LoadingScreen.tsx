import { useI18n } from '../../hooks/use-i18n'
import brandIcon from '../../assets/marubako.svg'

export default function LoadingScreen(): JSX.Element {
  const { t } = useI18n()
  return (
    <div
      className="startup-shell"
      data-testid="loading-screen"
      role="status"
      aria-label={t('loading_workspace')}
    >
      <div className="startup-stack">
        <div className="startup-visual" aria-hidden="true">
          <img className="startup-logo" src={brandIcon} alt="" />
          {[0, 1, 2].map((index) => (
            <span className="startup-shortcut" key={index}>
              <i />
              <i />
              <i />
            </span>
          ))}
        </div>
        <div className="startup-title">Marubako</div>
        <div className="startup-track" aria-hidden="true" />
      </div>
    </div>
  )
}
