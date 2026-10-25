import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Amount } from '../components/Amount.jsx';
import { Button } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { IconCamera, IconReceipt } from '../components/icons.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { mockReceiptResult } from '../features/expenses/mockReceipt.js';
import { formatDate } from '../lib/format.js';

const SCAN_MS = 1800;

export default function ExpenseScan() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cameraRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const uploadRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [step, setStep] = useState(/** @type {'choose' | 'scanning' | 'result'} */ ('choose'));
  const [preview, setPreview] = useState(/** @type {string | null} */ (null));
  const [result, setResult] = useState(/** @type {ReturnType<typeof mockReceiptResult> | null} */ (null));

  // Release the local preview URL when it changes or the screen closes.
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  useEffect(() => {
    if (step !== 'scanning') return undefined;
    const timer = setTimeout(() => {
      setResult(mockReceiptResult());
      setStep('result');
    }, SCAN_MS);
    return () => clearTimeout(timer);
  }, [step]);

  function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    setPreview(URL.createObjectURL(file));
    setStep('scanning');
  }

  function applyDetails() {
    navigate(`/groups/${id}/expenses/new`, {
      replace: true,
      state: { prefill: { amount: result.usdc, description: `Groceries · ${result.merchant.split(',')[0]}`, source: 'scan' } },
    });
  }

  return (
    <>
      <TopBar backTo={`/groups/${id}`} title="Scan a receipt" />
      <div className="flex flex-1 flex-col gap-6 pt-2 pb-8">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} />
        <input ref={uploadRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} />

        {step === 'choose' && (
          <>
            <h1 className="font-display-wide text-4xl">Scan a receipt</h1>
            <p className="text-muted">Take a photo of a paper receipt or upload a screenshot. We read the total and the items.</p>
            <div className="flex flex-col gap-3">
              <Button block icon={<IconCamera size={20} />} onClick={() => cameraRef.current?.click()}>
                Take photo
              </Button>
              <Button block variant="secondary" icon={<IconReceipt size={20} />} onClick={() => uploadRef.current?.click()}>
                Upload screenshot
              </Button>
            </div>
          </>
        )}

        {step === 'scanning' && (
          <div className="flex flex-col items-center gap-6 py-6" role="status" aria-live="polite">
            <div className="relative h-72 w-56 overflow-hidden rounded-card bg-surface">
              {preview && <img src={preview} alt="Your receipt" className="h-full w-full object-cover opacity-70" />}
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 animate-[scan_1.8s_ease-in-out_infinite] bg-accent shadow-[0_0_24px_var(--accent)]" />
            </div>
            <p className="text-lg font-semibold">Reading your receipt…</p>
          </div>
        )}

        {step === 'result' && result && (
          <>
            <h1 className="font-display-wide text-4xl">Here’s what we found</h1>
            <Card className="flex flex-col gap-4">
              <div className="flex flex-col">
                <span className="text-lg font-semibold">{result.merchant}</span>
                <span className="text-sm text-muted">{formatDate(result.date)}</span>
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-sm text-muted">Total on receipt</dt>
                  <dd className="font-mono text-lg">
                    {result.localCurrency} {result.localTotal}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">In USDC</dt>
                  <dd>
                    <Amount value={result.usdc} size="md" />
                  </dd>
                </div>
              </dl>
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-medium">Items found</h2>
                <ul className="flex flex-col divide-y divide-line text-sm">
                  {result.items.map((item) => (
                    <li key={item.name} className="flex justify-between py-2">
                      <span>{item.name}</span>
                      <span className="font-mono">€{item.amount}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
            <Button block onClick={applyDetails}>
              Use these details
            </Button>
            <Button block variant="outline" onClick={() => setStep('choose')}>
              Scan another
            </Button>
          </>
        )}

        <p className="mt-auto text-sm text-muted">
          Your photo stays private and off-chain. The USDC amount uses an estimated exchange rate; check it before saving.
        </p>
      </div>
    </>
  );
}
