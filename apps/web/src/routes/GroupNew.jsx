import { useState } from 'react';
import { useNavigate } from 'react-router';
import { containsSecretKey } from '@shared/validation.js';
import { createGroup } from '../client/api.js';
import { Button } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { Segmented } from '../components/Segmented.jsx';
import { TextField } from '../components/TextField.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { useToast } from '../hooks/useToast.js';

export default function GroupNew() {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState('flat');
  const [saving, setSaving] = useState(false);
  const nameError = containsSecretKey(name) ? 'This looks like a secret key. Never share it.' : null;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!name.trim() || nameError) return;
    setSaving(true);
    try {
      const detail = await createGroup({ name: name.trim(), type });
      navigate(`/groups/${detail.group.id}/invite`, { replace: true });
    } catch {
      toast('Could not create the group. Try again.', { tone: 'error' });
      setSaving(false);
    }
  }

  return (
    <>
      <TopBar backTo="/groups" title="New group" />
      <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col gap-6 py-4">
        <h1 className="font-display-wide text-4xl">Create a group</h1>
        <TextField label="Group name" placeholder="Casa Alfama" maxLength={60} required value={name} onChange={(e) => setName(e.target.value)} error={nameError} />
        <Segmented
          label="Type"
          value={type}
          onChange={setType}
          options={[
            { value: 'flat', label: 'Flat' },
            { value: 'trip', label: 'Trip' },
            { value: 'other', label: 'Other' },
          ]}
        />
        <Card className="flex flex-col divide-y divide-line py-2">
          <FixedRow label="Settle up in" value="USDC" note="Digital dollars. Fixed for every group." />
          <FixedRow label="Network" value="Stellar Testnet" note="Test money only. Fixed." />
        </Card>
        <Button type="submit" block loading={saving} disabled={!name.trim() || Boolean(nameError)} className="mt-auto">
          Create group
        </Button>
      </form>
    </>
  );
}

/** @param {{ label: string, value: string, note: string }} props */
function FixedRow({ label, value, note }) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 py-2">
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-sm text-muted">{note}</span>
      </span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  );
}
