import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { containsSecretKey } from '@shared/validation.js';
import { Button } from '../components/Button.jsx';
import { SelectField, TextField } from '../components/TextField.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { useWallet } from '../hooks/useWallet.js';
import { HOME_CURRENCIES } from '../lib/rates.js';

const CURRENCY_NAMES = { EUR: 'Euro', USD: 'US dollar', MXN: 'Mexican peso', COP: 'Colombian peso', BRL: 'Brazilian real', GBP: 'British pound' };
const SECRET_WARNING = 'This looks like a secret key. Never share it: Stellar Split will never ask for it.';

export default function Onboarding() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const location = useLocation();
  const [displayName, setDisplayName] = useState(wallet.profile?.displayName ?? '');
  const [homeCurrency, setHomeCurrency] = useState(wallet.profile?.homeCurrency ?? 'EUR');
  const [email, setEmail] = useState(wallet.profile?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState(/** @type {string | null} */ (null));

  const nameError = containsSecretKey(displayName) ? SECRET_WARNING : null;
  const emailError = containsSecretKey(email) ? SECRET_WARNING : null;
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
      setSubmitError('Could not save your profile. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <TopBar />
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-6 py-6" noValidate>
        <div className="flex flex-col gap-2">
          <h1 className="font-display-wide text-4xl">About you</h1>
          <p className="text-muted">Your friends see your name. No passwords, no bank details.</p>
        </div>
        <TextField
          label="Display name"
          autoComplete="nickname"
          maxLength={40}
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={nameError}
        />
        <SelectField
          label="Home currency"
          hint="We show estimates in this currency next to USDC amounts."
          value={homeCurrency}
          onChange={(e) => setHomeCurrency(e.target.value)}
          options={HOME_CURRENCIES.map((code) => ({ value: code, label: `${code} · ${CURRENCY_NAMES[code] ?? code}` }))}
        />
        <TextField
          label="Email"
          optional
          type="email"
          autoComplete="email"
          hint="Only to tell you when Stellar Assist needs your OK."
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
          Continue
        </Button>
      </form>
    </>
  );
}
