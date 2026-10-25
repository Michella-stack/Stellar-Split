import { useEffect, useRef, useState } from 'react';
import { ASSIST_PREVIEW, assist } from '../client/api.js';
import { PreviewNote } from '../features/assist/PreviewNote.jsx';
import { Amount } from '../components/Amount.jsx';
import { AgentAvatar } from '../components/Avatar.jsx';
import { Button, ButtonLink } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { Chip } from '../components/Chip.jsx';
import { IconAlert, IconCheck } from '../components/icons.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { ApprovalCard } from '../features/assist/ApprovalCard.jsx';
import { TelegramCheck } from '../features/assist/TelegramCheck.jsx';
import { decide, parseIntent } from '../features/assist/script.js';
import { useT } from '../hooks/useT.js';
import { useToast } from '../hooks/useToast.js';
import { tNow } from '../i18n/state.js';
import { formatUsd } from '../lib/format.js';

// Scripted demo: Stellar Assist acts on Casa Alfama, the group it belongs to.
const GROUP_ID = 'casa-alfama';
const SUGGESTIONS = ['chat.suggestOwe', 'chat.suggestInternet', 'chat.suggestTelegram'];

// A pending approval for the internet bill, from its `bill` tag (sample data) or, for a real API, its wording.
const isInternet = (a) => a.bill === 'internet' || /internet/i.test(a.description);

/** @typedef {{ id: number, from: 'me' | 'assist', text?: string, card?: any }} Message */

export default function AssistChat() {
  const { t } = useT();
  const [messages, setMessages] = useState(/** @type {Message[]} */ ([{ id: 0, from: 'assist', text: tNow('chat.greeting') }]));
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const nextId = useRef(1);
  const endRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, thinking]);

  const push = (message) => setMessages((all) => [...all, { id: nextId.current++, ...message }]);

  async function send(raw) {
    const input = raw.trim();
    if (!input || thinking) return;
    setText('');
    const intent = parseIntent(input);
    // Never echo something that looks like a secret key back into the conversation.
    push({ from: 'me', text: intent.kind === 'secret' ? tNow('chat.hidden') : input });
    setThinking(true);
    try {
      push(await reply(intent));
    } catch {
      push({ from: 'assist', text: tNow('chat.offline') });
    } finally {
      setThinking(false);
    }
  }

  return (
    <>
      <TopBar title={t('chat.title')} backTo="/assist" backLabel={t('chat.back')} />
      <h1 className="sr-only">{t('chat.srHeading')}</h1>
      <PreviewNote />
      <div role="log" aria-live="polite" aria-label={t('chat.conversation')} className="flex flex-1 flex-col gap-4 pt-2 pb-48">
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}
        {thinking && (
          <p className="flex items-center gap-2 text-muted">
            <AgentAvatar size="sm" /> {t('chat.thinking')}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[480px] flex-col gap-3 border-t border-line bg-bg px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('chat.suggestions')}>
          {SUGGESTIONS.map((s) => (
            <Chip key={s} onClick={() => send(t(s))} disabled={thinking}>
              {t(s)}
            </Chip>
          ))}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            {t('chat.input')}
          </label>
          <input
            id="chat-input"
            autoComplete="off"
            placeholder={t('chat.input')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-14 flex-1 rounded-full border-2 border-line bg-surface px-5 text-base focus:border-text"
          />
          <Button type="submit" disabled={!text.trim() || thinking} className="px-5">
            {t('chat.send')}
          </Button>
        </form>
      </div>
    </>
  );
}

/** Builds Stellar Assist's answer to one message. @param {import('../features/assist/script.js').Intent} intent */
async function reply(intent) {
  if (intent.kind === 'secret') {
    return { from: 'assist', text: tNow('chat.secret') };
  }
  const { agent, pendingApprovals } = await assist.getAgent('assist');
  if (agent.status !== 'active') return { from: 'assist', text: tNow('chat.paused') };

  if (intent.kind === 'add-expense') {
    const detail = await assist.getGroup(GROUP_ID);
    const humans = detail.members.filter((m) => m.kind === 'human').map((m) => m.id);
    const participants = intent.ways ? humans.slice(0, intent.ways) : humans;
    return { from: 'assist', text: tNow('chat.expenseAsk'), card: { type: 'expense', ...intent, participants, paidBy: detail.me } };
  }

  if (intent.kind === 'what-owe') {
    const { groups } = await assist.listGroups();
    const lines = [];
    for (const g of groups) {
      const detail = await assist.getGroup(g.id);
      const name = (id) => detail.members.find((m) => m.id === id)?.displayName ?? tNow('chat.someone');
      for (const d of detail.myPosition.owes) lines.push(tNow('chat.owes', { group: g.name, name: name(d.to), amount: formatUsd(d.amount) }));
      for (const d of detail.myPosition.owed) lines.push(tNow('chat.owed', { group: g.name, name: name(d.from), amount: formatUsd(d.amount) }));
    }
    return { from: 'assist', text: lines.length ? lines.join(' ') : tNow('chat.allSquare') };
  }

  if (intent.kind === 'telegram-check') {
    const approval = pendingApprovals.find(isInternet) ?? pendingApprovals[0];
    if (!approval) return { from: 'assist', text: tNow('chat.nothingWaiting') };
    const detail = await assist.getGroup(approval.groupId);
    const recipientName = detail.members.find((m) => m.id === approval.to)?.displayName ?? tNow('chat.them');
    return { from: 'assist', text: tNow('chat.telegramIntro'), card: { type: 'telegram-check', approval, recipientName } };
  }

  if (intent.kind === 'pay-internet') {
    const approval = pendingApprovals.find(isInternet);
    if (!approval) return { from: 'assist', text: tNow('chat.internetDone') };
    const outcome = decide(approval.amount, agent.policy, agent.spentToday);
    if (outcome === 'auto') return { from: 'assist', text: tNow('chat.autoPaid', { amount: formatUsd(approval.amount) }) };
    const detail = await assist.getGroup(approval.groupId);
    const recipientName = detail.members.find((m) => m.id === approval.to)?.displayName ?? tNow('chat.them');
    return { from: 'assist', text: tNow('chat.needsOk'), card: { type: 'approval', approval, recipientName, policy: agent.policy } };
  }

  if (intent.kind === 'pay') {
    const detail = await assist.getGroup(GROUP_ID);
    const recipient = detail.members.find((m) => m.displayName?.toLowerCase() === intent.to);
    if (!recipient) return { from: 'assist', text: tNow('chat.unknownMember', { name: intent.to }) };
    const outcome = decide(intent.amount, agent.policy, agent.spentToday);
    if (outcome === 'over-limit' || outcome === 'over-daily-cap') {
      return {
        from: 'assist',
        card: { type: 'over-limit', amount: intent.amount, recipient, groupId: GROUP_ID, limit: outcome === 'over-limit' ? agent.policy.maxPerPayment : agent.policy.dailyCap, daily: outcome === 'over-daily-cap' },
      };
    }
    return { from: 'assist', text: tNow('chat.withinRules', { name: recipient.displayName, amount: formatUsd(intent.amount) }) };
  }

  return { from: 'assist', text: tNow('chat.dontGetIt') };
}

/** @param {{ message: Message }} props */
function ChatMessage({ message }) {
  const { t } = useT();
  const mine = message.from === 'me';
  return (
    <div className={`flex flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
      {message.text && (
        <p className={`max-w-[85%] rounded-3xl px-4 py-3 ${mine ? 'rounded-br-md bg-text text-bg' : 'rounded-bl-md bg-surface'}`}>
          <span className="sr-only">{mine ? t('chat.srYou') : t('chat.srAssist')}</span>
          {message.text}
        </p>
      )}
      {message.card?.type === 'expense' && <ExpenseCard card={message.card} />}
      {message.card?.type === 'approval' && (
        <div className="w-full">
          <ApprovalCard approval={message.card.approval} recipientName={message.card.recipientName} approvalAbove={message.card.policy.approvalAbove} />
        </div>
      )}
      {message.card?.type === 'telegram-check' && (
        <div className="w-full">
          <TelegramCheck approval={message.card.approval} recipientName={message.card.recipientName} />
        </div>
      )}
      {message.card?.type === 'over-limit' && <OverLimitCard card={message.card} />}
    </div>
  );
}

/** @param {{ card: any }} props */
function ExpenseCard({ card }) {
  const { t } = useT();
  const toast = useToast();
  const [state, setState] = useState(/** @type {'idle' | 'saving' | 'added'} */ ('idle'));

  async function add() {
    setState('saving');
    try {
      await assist.createExpense(GROUP_ID, {
        description: card.description,
        amount: card.amount,
        paidBy: card.paidBy,
        split: { type: 'equal', participants: card.participants },
        source: 'agent',
      });
      setState('added');
    } catch {
      toast(t('chat.addError'), { tone: 'error' });
      setState('idle');
    }
  }

  return (
    <Card className="flex w-full flex-col gap-3">
      <span className="text-sm text-muted">{t('chat.expenseCard')}</span>
      <span className="text-lg font-semibold">{card.description}</span>
      <Amount value={card.amount} size="md" />
      <span className="text-sm text-muted">{t('chat.expenseSplit', { count: card.participants.length })}</span>
      {state === 'added' ? (
        <p role="status" className="flex items-center gap-2 font-semibold">
          <IconCheck size={18} /> {t('chat.addedToGroup')}
        </p>
      ) : (
        <Button loading={state === 'saving'} onClick={add}>
          {t('chat.addToGroup')}
        </Button>
      )}
    </Card>
  );
}

/** @param {{ card: any }} props */
function OverLimitCard({ card }) {
  const { t } = useT();
  return (
    <Card tone="outline" className="flex w-full flex-col gap-3 border-2 border-owe">
      <span className="flex items-center gap-2 font-semibold text-owe">
        <IconAlert size={20} /> {t('chat.overLimit')}
      </span>
      <p>
        {t(card.daily ? 'chat.overLimitDaily' : 'chat.overLimitPer', { name: card.recipient.displayName, amount: formatUsd(card.amount), limit: formatUsd(card.limit) })}
      </p>
      {/* In preview the sample group does not exist in the real API, so send the person to their own groups. */}
      <ButtonLink to={ASSIST_PREVIEW ? '/groups' : `/groups/${card.groupId}/settle/${card.recipient.id}`}>
        {ASSIST_PREVIEW ? t('chat.openGroups') : t('chat.reviewPay')}
      </ButtonLink>
    </Card>
  );
}
