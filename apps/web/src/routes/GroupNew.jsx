import { useState } from 'react';
import { useNavigate } from 'react-router';
import { containsSecretKey } from '@shared/validation.js';
import { createGroup } from '../client/api.js';
import { Button } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { Segmented } from '../components/Segmented.jsx';
import { TextField } from '../components/TextField.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { useT } from '../hooks/useT.js';
import { useToast } from '../hooks/useToast.js';

export default function GroupNew() {
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useT();
  const [name, setName] = useState('');
  const [type, setType] = useState('flat');
  const [saving, setSaving] = useState(false);
  const nameError = containsSecretKey(name) ? t('secret.warningShort') : null;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!name.trim() || nameError) return;
    setSaving(true);
    try {
      const detail = await createGroup({ name: name.trim(), type });
      navigate(`/groups/${detail.group.id}/invite`, { replace: true });
    } catch {
      toast(t('groupNew.error'), { tone: 'error' });
      setSaving(false);
    }
  }

  return (
    <>
      <TopBar backTo="/groups" title={t('groupNew.title')} />
      <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col gap-6 py-4">
        <h1 className="font-display-wide text-4xl">{t('groupNew.heading')}</h1>
        <TextField label={t('groupNew.name')} placeholder={t('groupNew.namePlaceholder')} maxLength={60} required value={name} onChange={(e) => setName(e.target.value)} error={nameError} />
        <Segmented
          label={t('groupNew.type')}
          value={type}
          onChange={setType}
          options={[
            { value: 'flat', label: t('groupType.flat') },
            { value: 'trip', label: t('groupType.trip') },
            { value: 'other', label: t('groupNew.typeOther') },
          ]}
        />
        <Card className="flex flex-col divide-y divide-line py-2">
          <FixedRow label={t('groupNew.settleIn')} value="USDC" note={t('groupNew.settleInNote')} />
          <FixedRow label={t('groupNew.network')} value={t('common.stellarTestnet')} note={t('groupNew.networkNote')} />
        </Card>
        <Button type="submit" block loading={saving} disabled={!name.trim() || Boolean(nameError)} className="mt-auto">
          {t('groupNew.create')}
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
