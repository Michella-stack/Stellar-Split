import { useState } from 'react';
import { Amount } from '../components/Amount.jsx';
import { AgentAvatar, Avatar } from '../components/Avatar.jsx';
import { BottomNav } from '../components/BottomNav.jsx';
import { Button, ButtonLink } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { Chip } from '../components/Chip.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { IconButton } from '../components/IconButton.jsx';
import { IconCamera, IconCopy, IconInbox, IconPencil, IconRobot, IconShare } from '../components/icons.jsx';
import { ListRow } from '../components/ListRow.jsx';
import { Pill } from '../components/Pill.jsx';
import { Segmented } from '../components/Segmented.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { Stepper } from '../components/Stepper.jsx';
import { Switch } from '../components/Switch.jsx';
import { TestnetBadge } from '../components/TestnetBadge.jsx';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { useTheme } from '../hooks/useTheme.js';
import { useToast } from '../hooks/useToast.js';
import { ACCENTS } from '../lib/theme.js';

// Development page: every UI primitive, rendered in the dark and the light theme side by side.
export default function UiKit() {
  const { accent, setAccent } = useTheme();
  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto flex max-w-[1040px] flex-col gap-6 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display-wide text-3xl">UI kit</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Accent colour">
          {ACCENTS.map((a) => (
            <Chip key={a} selected={a === accent} onClick={() => setAccent(a)}>
              {a}
            </Chip>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <KitPanel theme="dark" />
          <KitPanel theme="light" />
        </div>
      </div>
    </div>
  );
}

/** @param {{ theme: 'dark' | 'light' }} props */
function KitPanel({ theme }) {
  const toast = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [split, setSplit] = useState('equal');
  const [bills, setBills] = useState(['Electricity']);
  const [pay, setPay] = useState(true);
  const [addBills, setAddBills] = useState(false);
  const [maxPayment, setMaxPayment] = useState(25);

  const toggleBill = (bill) => setBills((all) => (all.includes(bill) ? all.filter((b) => b !== bill) : [...all, bill]));

  return (
    <section data-theme={theme} aria-label={`${theme} theme`} className="flex flex-col gap-8 rounded-[28px] border border-line bg-bg p-4">
      <TopBar title={`${theme} theme`} backTo="/" backLabel="Back to start" />

      <Group title="Buttons">
        <Button block>Connect Freighter wallet</Button>
        <Button variant="accent" block>
          Settle up
        </Button>
        <Button variant="secondary" block icon={<IconShare size={20} />}>
          Share receipt
        </Button>
        <Button variant="outline" block>
          Pay a different amount
        </Button>
        <div className="flex flex-wrap gap-3">
          <Button loading>Confirming</Button>
          <Button disabled>Disabled</Button>
          <ButtonLink to="/groups" variant="ghost">
            Link styled as button
          </ButtonLink>
        </div>
        <div className="flex gap-2">
          <IconButton label="Copy address">
            <IconCopy size={20} />
          </IconButton>
          <IconButton label="Edit" variant="plain">
            <IconPencil size={20} />
          </IconButton>
        </div>
      </Group>

      <Group title="Balance card and amounts">
        <Card tone="accent" className="flex flex-col gap-4">
          <p className="text-sm font-semibold">Casa Alfama</p>
          <p className="font-display-wide text-3xl">You owe Mateo</p>
          <Amount value="364.60" size="lg" tone="inherit" estimate="€335" />
          <Button variant="onAccent">
            Settle up
          </Button>
        </Card>
        <Card className="flex flex-col gap-1">
          <ListRow
            leading={<Avatar name="Mateo" />}
            title="Mateo"
            subtitle="MXN"
            trailing={
              <span className="flex flex-col items-end">
                <span className="text-sm text-muted">owes you</span>
                <Amount value="1172.20" size="sm" tone="owed" />
              </span>
            }
          />
          <ListRow
            leading={<Avatar name="Valentina" />}
            title="Valentina"
            subtitle="COP"
            trailing={
              <span className="flex flex-col items-end">
                <span className="text-sm text-muted">you owe</span>
                <Amount value="-427.80" size="sm" tone="owe" />
              </span>
            }
          />
          <ListRow leading={<AgentAvatar />} title="Stellar Assist" subtitle="Agent" to="/assist" />
        </Card>
      </Group>

      <Group title="Pills, badge and avatars">
        <div className="flex flex-wrap gap-2">
          <TestnetBadge />
          <Pill>USDC</Pill>
          <Pill tone="solid">Flat</Pill>
          <Pill tone="owe">You owe</Pill>
          <Pill tone="owed">Owes you</Pill>
          <Pill tone="accent">Active</Pill>
        </div>
        <div className="flex items-center gap-2">
          <Avatar name="You" size="lg" />
          <Avatar name="Mateo" />
          <Avatar name="Valentina" />
          <Avatar name="Jake" size="sm" />
          <AgentAvatar size="lg" label="Stellar Assist" />
        </div>
      </Group>

      <Group title="Chips and segmented control">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Bills">
          {['Electricity', 'Internet', 'Water', 'Streaming'].map((bill) => (
            <Chip key={bill} selected={bills.includes(bill)} onClick={() => toggleBill(bill)}>
              {bill}
            </Chip>
          ))}
        </div>
        <Segmented
          label="Split"
          value={split}
          onChange={setSplit}
          options={[
            { value: 'equal', label: 'Equally' },
            { value: 'exact', label: 'Exact amounts' },
          ]}
        />
      </Group>

      <Group title="Switches and stepper">
        <Card className="flex flex-col divide-y divide-line py-2">
          <Switch label="Add bills to the group" checked={addBills} onChange={setAddBills} />
          <Switch label="Pay bills and debts" description="Up to your limits" checked={pay} onChange={setPay} />
          <Stepper
            label="Max per payment"
            value={maxPayment}
            onChange={setMaxPayment}
            min={5}
            max={100}
            step={5}
            format={(v) => `$${v}`}
          />
        </Card>
      </Group>

      <Group title="Sheet and toast">
        <Button variant="secondary" onClick={() => setSheetOpen(true)}>
          Open add-expense sheet
        </Button>
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Add an expense">
          <ListRow leading={<IconCamera />} title="Scan a receipt" subtitle="Recommended" to="#" />
          <ListRow leading={<IconPencil />} title="Enter it yourself" to="#" />
          <ListRow leading={<IconRobot />} title="Tell Stellar Assist" to="#" />
        </Sheet>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => toast('Address copied')}>
            Info toast
          </Button>
          <Button variant="outline" onClick={() => toast('Payment sent', { tone: 'success' })}>
            Success toast
          </Button>
          <Button variant="outline" onClick={() => toast('Freighter is locked', { tone: 'error' })}>
            Error toast
          </Button>
        </div>
      </Group>

      <Group title="Empty state">
        <EmptyState icon={<IconInbox />} title="No groups yet" action={<Button>New group</Button>}>
          Create a group for your flat or trip and invite your friends.
        </EmptyState>
      </Group>

      <Group title="Bottom navigation">
        <div className="px-4">
          <BottomNav />
        </div>
      </Group>
    </section>
  );
}

/** @param {{ title: string, children: import('react').ReactNode }} props */
function Group({ title, children }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-mono text-xs uppercase tracking-widest text-muted">{title}</h2>
      {children}
    </div>
  );
}
