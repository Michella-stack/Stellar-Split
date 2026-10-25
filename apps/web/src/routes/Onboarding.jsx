import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { containsSecretKey } from '@shared/validation.js';
import { Button } from '../components/Button.jsx';
import { SelectField, TextField } from '../components/TextField.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { useT } from '../hooks/useT.js';
import { useWallet } from '../hooks/useWallet.js';
import { HOME_CURRENCIES } from '../lib/rates.js';

export default function Onboarding() {
  const { t } = useT();
  const wallet = useWallet();
  const navigate = useNavigate();
  const location = useLocation();
  const [displayName, setDisplayName] = useState(wallet.profile?.displayName ?? '');
  const [homeCurrency, setHomeCurrency] = useState(wallet.profile?.homeCurrency ?? 'EUR');
  const [email, setEmail] = useState(wallet.profile?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState(/** @type {string | null} */ (null));

  const nameError = containsSecretKey(displayName) ? t('secret.warning') : null;
  const emailError = containsSecretKey(email) ? t('secret.warning') : null;
  const canSave = displayName.trim().length > 0 && !nameError && !emailError;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setSubmitError(null);
    try {
      await wallet.saveProfile({ displayName: displayName.trim(), homeCurrency, email: email.trim() || null });
      navigate(location.state?.from ?? '/groups', { replace: true });
    } catch {
      setSubmitError(t('onboarding.saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <TopBar />
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-6 py-6" noValidate>
        <div className="flex flex-col gap-2">
          <h1 className="font-display-wide text-4xl">{t('onboarding.title')}</h1>
          <p className="text-muted">{t('onboarding.intro')}</p>
        </div>
        <TextField
          label={t('onboarding.displayName')}
          autoComplete="nickname"
          maxLength={40}
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={nameError}
        />
        <SelectField
          label={t('onboarding.homeCurrency')}
          hint={t('onboarding.homeCurrencyHint')}
          value={homeCurrency}
          onChange={(e) => setHomeCurrency(e.target.value)}
          options={HOME_CURRENCIES.map((code) => ({ value: code, label: `${code} · ${t(`currency.${code}`)}` }))}
        />
        <TextField
          label={t('onboarding.email')}
          optional
          type="email"
          autoComplete="email"
          hint={t('onboarding.emailHint')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
        />
        {submitError && (
          <p role="alert" className="font-medium text-owe">
            {submitError}
          </p>
        )}
        <Button type="submit" block loading={saving} disabled={!canSave} className="mt-auto">
          {t('onboarding.continue')}
        </Button>
      </form>
    </>
  );
}
