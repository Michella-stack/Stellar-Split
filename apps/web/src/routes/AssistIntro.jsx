import { AgentAvatar } from '../components/Avatar.jsx';
import { ButtonLink } from '../components/Button.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { PreviewNote } from '../features/assist/PreviewNote.jsx';

const STEPS = [
  { title: 'Tracks recurring bills', body: 'Electricity, internet, water: it adds them to your group and splits them for you.' },
  { title: 'Pays from its own small wallet', body: 'You top it up with a little USDC. It never touches your Freighter wallet.' },
  { title: 'Bigger payments need your OK', body: 'You set the limits. Anything above them waits for you to approve.' },
];

export default function AssistIntro() {
  return (
    <>
      <TopBar backTo="/groups" />
      <div className="flex flex-1 flex-col gap-6 pt-2 pb-8">
        <PreviewNote />
        <AgentAvatar size="lg" />
        <h1 className="font-display-wide text-4xl">Meet Stellar Assist</h1>
        <p className="text-lg text-muted">An AI helper for your shared bills, within rules you set.</p>
        <ol className="flex flex-col gap-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4 rounded-card bg-surface p-5">
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent font-mono font-bold text-on-accent">
                {i + 1}
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-semibold">{step.title}</span>
                <span className="text-muted">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-auto flex flex-col gap-3">
          <ButtonLink to="/assist/setup" block>
            Set up Stellar Assist
          </ButtonLink>
          <ButtonLink to="/groups" variant="ghost" block>
            Maybe later
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
