import { AgentAvatar } from '../components/Avatar.jsx';
import { ButtonLink } from '../components/Button.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { PreviewNote } from '../features/assist/PreviewNote.jsx';
import { useT } from '../hooks/useT.js';

const STEPS = [1, 2, 3];

export default function AssistIntro() {
  const { t } = useT();
  return (
    <>
      <TopBar backTo="/groups" />
      <div className="flex flex-1 flex-col gap-6 pt-2 pb-8">
        <PreviewNote />
        <AgentAvatar size="lg" />
        <h1 className="font-display-wide text-4xl">{t('agent.intro.title')}</h1>
        <p className="text-lg text-muted">{t('agent.intro.subtitle')}</p>
        <ol className="flex flex-col gap-4">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-4 rounded-card bg-surface p-5">
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent font-mono font-bold text-on-accent">
                {i + 1}
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-semibold">{t(`agent.intro.step${step}`)}</span>
                <span className="text-muted">{t(`agent.intro.step${step}Body`)}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-auto flex flex-col gap-3">
          <ButtonLink to="/assist/setup" block>
            {t('agent.intro.setUp')}
          </ButtonLink>
          <ButtonLink to="/groups" variant="ghost" block>
            {t('agent.intro.later')}
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
