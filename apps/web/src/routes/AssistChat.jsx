import { useEffect, useRef, useState } from 'react';
import { createExpense, getAgent, getGroup, listGroups } from '../client/api.js';
import { Amount } from '../components/Amount.jsx';
import { AgentAvatar } from '../components/Avatar.jsx';
import { Button, ButtonLink } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { Chip } from '../components/Chip.jsx';
import { IconAlert, IconCheck } from '../components/icons.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { ApprovalCard } from '../features/assist/ApprovalCard.jsx';
import { decide, parseIntent } from '../features/assist/script.js';
import { useToast } from '../hooks/useToast.js';
import { formatUsd } from '../lib/format.js';

// Scripted demo: Stellar Assist acts on Casa Alfama, the group it belongs to.
const GROUP_ID = 'casa-alfama';
const SUGGESTIONS = ['What do I owe?', 'Pay my internet share'];

/** @typedef {{ id: number, from: 'me' | 'assist', text?: string, card?: any }} Message */

export default function AssistChat() {
  const [messages, setMessages] = useState(/** @type {Message[]} */ ([
    { id: 0, from: 'assist', text: 'Hi! I can log bills, tell you what you owe, or pay small amounts within your rules. Try “48 for electricity, split 4 ways”.' },
  ]));
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
    push({ from: 'me', text: intent.kind === 'secret' ? '[hidden: looked like a secret key]' : input });
    setThinking(true);
    try {
      push(await reply(intent));
    } catch {
      push({ from: 'assist', text: 'I could not reach the server. Try again in a moment.' });
    } finally {
      setThinking(false);
    }
  }

  return (
    <>
      <TopBar title="Chat with Assist" backTo="/assist" backLabel="Back to Stellar Assist" />
      <h1 className="sr-only">Chat with Stellar Assist</h1>
      <div role="log" aria-live="polite" aria-label="Conversation" className="flex flex-1 flex-col gap-4 pt-2 pb-48">
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}
        {thinking && (
          <p className="flex items-center gap-2 text-muted">
            <AgentAvatar size="sm" /> Thinking…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[480px] flex-col gap-3 border-t border-line bg-bg px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Suggestions">
          {SUGGESTIONS.map((s) => (
            <Chip key={s} onClick={() => send(s)} disabled={thinking}>
              {s}
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
            Message Stellar Assist
          </label>
          <input
            id="chat-input"
            autoComplete="off"
            placeholder="Message Stellar Assist"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-14 flex-1 rounded-full border-2 border-line bg-surface px-5 text-base focus:border-text"
          />
          <Button type="submit" disabled={!text.trim() || thinking} className="px-5">
            Send
          </Button>
        </form>
      </div>
    </>
  );
}

/** Builds Stellar Assist's answer to one message. @param {import('../features/assist/script.js').Intent} intent */
async function reply(intent) {
  if (intent.kind === 'secret') {
    return { from: 'assist', text: 'That looks like a secret key. I never need it and I did not keep it. Please don’t share it with anyone.' };
  }
  const { agent, pendingApprovals } = await getAgent('assist');
  if (agent.status !== 'active') return { from: 'assist', text: 'I’m paused right now. Resume me from the Stellar Assist screen.' };

  if (intent.kind === 'add-expense') {
    const detail = await getGroup(GROUP_ID);
    const humans = detail.members.filter((m) => m.kind === 'human').map((m) => m.id);
    const participants = intent.ways ? humans.slice(0, intent.ways) : humans;
    return { from: 'assist', text: 'Here is the expense. Add it to Casa Alfama?', card: { type: 'expense', ...intent, participants, paidBy: detail.me } };
  }

  if (intent.kind === 'what-owe') {
    const { groups } = await listGroups();
    const lines = [];
    for (const g of groups) {
      const detail = await getGroup(g.id);
      const name = (id) => detail.members.find((m) => m.id === id)?.displayName ?? 'someone';
      for (const t of detail.myPosition.owes) lines.push(`In ${g.name} you owe ${name(t.to)} ${formatUsd(t.amount)}.`);
      for (const t of detail.myPosition.owed) lines.push(`In ${g.name}, ${name(t.from)} owes you ${formatUsd(t.amount)}.`);
    }
    return { from: 'assist', text: lines.length ? lines.join(' ') : 'You’re all square in every group.' };
  }

  if (intent.kind === 'pay-internet') {
    const approval = pendingApprovals.find((a) => /internet/i.test(a.description));
    if (!approval) return { from: 'assist', text: 'Your internet share is already taken care of.' };
    const outcome = decide(approval.amount, agent.policy, agent.spentToday);
    if (outcome === 'auto') return { from: 'assist', text: `That is within your limits, so I paid ${formatUsd(approval.amount)}.` };
    const detail = await getGroup(approval.groupId);
    const recipientName = detail.members.find((m) => m.id === approval.to)?.displayName ?? 'them';
    return { from: 'assist', text: 'That is above your ask-me-first limit, so I need your OK.', card: { type: 'approval', approval, recipientName, policy: agent.policy } };
  }

  if (intent.kind === 'pay') {
    const detail = await getGroup(GROUP_ID);
    const recipient = detail.members.find((m) => m.displayName?.toLowerCase() === intent.to);
    if (!recipient) return { from: 'assist', text: `I can only pay members of Casa Alfama. I don’t know “${intent.to}”.` };
    const outcome = decide(intent.amount, agent.policy, agent.spentToday);
    if (outcome === 'over-limit' || outcome === 'over-daily-cap') {
      return {
        from: 'assist',
        card: { type: 'over-limit', amount: intent.amount, recipient, groupId: GROUP_ID, limit: outcome === 'over-limit' ? agent.policy.maxPerPayment : agent.policy.dailyCap, daily: outcome === 'over-daily-cap' },
      };
    }
    return { from: 'assist', text: `That is within your rules. In this demo I don’t move money yet; the real agent would pay ${recipient.displayName} ${formatUsd(intent.amount)} from its own wallet.` };
  }

  return { from: 'assist', text: 'I didn’t get that. I can log a bill (“30 for internet, split 4 ways”), tell you what you owe, or pay small amounts within your rules.' };
}

/** @param {{ message: Message }} props */
function ChatMessage({ message }) {
  const mine = message.from === 'me';
  return (
    <div className={`flex flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
      {message.text && (
        <p className={`max-w-[85%] rounded-3xl px-4 py-3 ${mine ? 'rounded-br-md bg-text text-bg' : 'rounded-bl-md bg-surface'}`}>
          <span className="sr-only">{mine ? 'You: ' : 'Stellar Assist: '}</span>
          {message.text}
        </p>
      )}
      {message.card?.type === 'expense' && <ExpenseCard card={message.card} />}
      {message.card?.type === 'approval' && (
        <div className="w-full">
          <ApprovalCard approval={message.card.approval} recipientName={message.card.recipientName} approvalAbove={message.card.policy.approvalAbove} />
        </div>
      )}
      {message.card?.type === 'over-limit' && <OverLimitCard card={message.card} />}
    </div>
  );
}

/** @param {{ card: any }} props */
function ExpenseCard({ card }) {
  const toast = useToast();
  const [state, setState] = useState(/** @type {'idle' | 'saving' | 'added'} */ ('idle'));

  async function add() {
    setState('saving');
    try {
      await createExpense(GROUP_ID, {
        description: card.description,
        amount: card.amount,
        paidBy: card.paidBy,
        split: { type: 'equal', participants: card.participants },
        source: 'agent',
      });
      setState('added');
    } catch {
      toast('Could not add the expense. Try again.', { tone: 'error' });
      setState('idle');
    }
  }

  return (
    <Card className="flex w-full flex-col gap-3">
      <span className="text-sm text-muted">New expense · Casa Alfama</span>
      <span className="text-lg font-semibold">{card.description}</span>
      <Amount value={card.amount} size="md" />
      <span className="text-sm text-muted">Paid by you · split equally between {card.participants.length} people</span>
      {state === 'added' ? (
        <p role="status" className="flex items-center gap-2 font-semibold">
          <IconCheck size={18} /> Added to Casa Alfama
        </p>
      ) : (
        <Button loading={state === 'saving'} onClick={add}>
          Add to Casa Alfama
        </Button>
      )}
    </Card>
  );
}

/** @param {{ card: any }} props */
function OverLimitCard({ card }) {
  return (
    <Card tone="outline" className="flex w-full flex-col gap-3 border-2 border-owe">
      <span className="flex items-center gap-2 font-semibold text-owe">
        <IconAlert size={20} /> Over my limit
      </span>
      <p>
        Paying {card.recipient.displayName} {formatUsd(card.amount)} is more than your {formatUsd(card.limit)} {card.daily ? 'daily cap' : 'limit per payment'}, so I
        won’t do it. You can review it and pay from your own wallet.
      </p>
      <ButtonLink to={`/groups/${card.groupId}/settle/${card.recipient.id}`}>Review and pay myself</ButtonLink>
    </Card>
  );
}
