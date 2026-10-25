import { useState } from 'react';
import { useNavigate } from 'react-router';
import { getAgent, updateAgent } from '../client/api.js';
import { Button } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { Chip } from '../components/Chip.jsx';
import { LoadError, Loading } from '../components/LoadState.jsx';
import { Stepper } from '../components/Stepper.jsx';
import { Switch } from '../components/Switch.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../hooks/useToast.js';

const BILLS = ['Electricity', 'Internet', 'Water', 'Streaming'];
const dollars = (v) => `$${v}`;
const whole = (decimal) => Number.parseInt(decimal, 10);

export default function AssistSetup() {
  const agent = useApi(() => getAgent('assist'), 'agent');
  return (
    <>
      <TopBar backTo="/assist" title="Stellar Assist" />
      {agent.loading && <Loading label="Loading rules" />}
      {agent.error && <LoadError title="Could not load Stellar Assist" error={agent.error} onRetry={agent.reload} />}
      {agent.data && <RulesForm agent={agent.data.agent} />}
    </>
  );
}

/** @param {{ agent: any }} props */
function RulesForm({ agent }) {
  const navigate = useNavigate();
  const toast = useToast();
  const p = agent.policy;
  const [addBills, setAddBills] = useState(p.addBills);
  const [payBills, setPayBills] = useState(p.payBills);
  const [bills, setBills] = useState(p.bills);
  const [maxPerPayment, setMaxPerPayment] = useState(whole(p.maxPerPayment));
  const [approvalAbove, setApprovalAbove] = useState(whole(p.approvalAbove));
  const [dailyCap, setDailyCap] = useState(whole(p.dailyCap));
  const [saving, setSaving] = useState(false);

  const problems = [
    approvalAbove > maxPerPayment && '“Ask me first above” cannot be higher than the maximum per payment.',
    maxPerPayment > dailyCap && 'The maximum per payment cannot be higher than the daily cap.',
  ].filter(Boolean);
  const isSetUp = agent.status !== 'inactive';

  async function save(event) {
    event.preventDefault();
    if (problems.length > 0) return;
    setSaving(true);
    try {
      await updateAgent(agent.id, {
        status: isSetUp ? agent.status : 'active',
        policy: { addBills, payBills, bills, maxPerPayment: `${maxPerPayment}.00`, approvalAbove: `${approvalAbove}.00`, dailyCap: `${dailyCap}.00` },
      });
      toast(isSetUp ? 'Rules saved' : 'Stellar Assist is active', { tone: 'success' });
      navigate('/assist', { replace: true });
    } catch {
      toast('Could not save the rules. Try again.', { tone: 'error' });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6 pt-2 pb-8">
      <h1 className="font-display-wide text-4xl">Set your rules</h1>

      <Card className="flex flex-col divide-y divide-line py-2">
        <Switch label="Add bills to the group" description="Logs recurring bills and splits them" checked={addBills} onChange={setAddBills} />
        <Switch label="Pay bills and debts" description="From its own wallet, within your limits" checked={payBills} onChange={setPayBills} />
      </Card>

      <div role="group" aria-labelledby="bills-label" className="flex flex-col gap-2">
        <span id="bills-label" className="text-sm font-medium">
          Bills it looks after
        </span>
        <div className="flex flex-wrap gap-2">
          {BILLS.map((bill) => (
            <Chip
              key={bill}
              selected={bills.includes(bill)}
              onClick={() => setBills((all) => (all.includes(bill) ? all.filter((b) => b !== bill) : [...all, bill]))}
            >
              {bill}
            </Chip>
          ))}
        </div>
      </div>

      <Card className="flex flex-col divide-y divide-line py-2">
        <Stepper label="Max per payment" value={maxPerPayment} onChange={setMaxPerPayment} min={5} max={100} step={5} format={dollars} />
        <Stepper label="Ask me first above" value={approvalAbove} onChange={setApprovalAbove} min={0} max={50} step={1} format={dollars} />
        <Stepper label="Daily cap" value={dailyCap} onChange={setDailyCap} min={10} max={200} step={10} format={dollars} />
      </Card>
      {problems.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1 font-medium text-owe">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <p className="rounded-2xl bg-surface-2 px-4 py-3">
        You’ll top it up with <strong>${dailyCap} USDC</strong> from Freighter, never more than one day’s cap. Nothing is sent until you confirm a top-up.
      </p>

      <Button type="submit" block loading={saving} disabled={problems.length > 0}>
        {isSetUp ? 'Save rules' : 'Activate'}
      </Button>
    </form>
  );
}
