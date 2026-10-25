import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiError, scanReceipt, USING_MOCKS } from '../client/api.js';
import { Amount } from '../components/Amount.jsx';
import { Button } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { IconCamera, IconReceipt } from '../components/icons.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { mockReceiptDraft } from '../features/expenses/mockReceipt.js';
import { draftToPrefill, warningMessages } from '../features/expenses/receiptDraft.js';
import { PhotoError, prepareReceiptPhoto } from '../features/expenses/receiptPhoto.js';
import { formatDate } from '../lib/format.js';

// Errors that mean the reader itself could not be used. The demo then shows a labelled sample instead of failing.
const READER_DOWN = new Set(['SCAN_UNAVAILABLE', 'NETWORK', 'TIMEOUT', 'UNKNOWN']);

/** @param {unknown} error */
function describeFailure(error) {
  if (error instanceof PhotoError) return 'We could not open that image. Try another photo or a screenshot.';
  if (error instanceof ApiError && error.code === 'NOT_A_RECEIPT') return 'That does not look like a receipt. Try another photo.';
  if (error instanceof ApiError && error.code === 'SCAN_UNREADABLE') return 'We could not read the total on that receipt. Try a clearer photo, or enter the expense by hand.';
  if (error instanceof ApiError && error.code === 'UNAUTHORIZED') return 'Your session ended. Sign in again to scan a receipt.';
  return 'Something went wrong while reading the receipt. Try again, or enter the expense by hand.';
}

export default function ExpenseScan() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cameraRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const uploadRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [step, setStep] = useState(/** @type {'choose' | 'scanning' | 'result' | 'error'} */ ('choose'));
  const [result, setResult] = useState(/** @type {import('../features/expenses/receiptDraft.js').ReceiptDraft | null} */ (null));
  // True when the result is a sample, not a reading of the photo: mock mode, or the reader could not be reached.
  const [sample, setSample] = useState(false);
  const [failure, setFailure] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    setStep('scanning');
    try {
      // In mock mode the photo is never read or sent. Otherwise it is made small and upright first, which also drops its GPS data.
      const photo = USING_MOCKS ? { mimeType: 'image/jpeg', imageBase64: '' } : await prepareReceiptPhoto(file);
      const { draft } = await scanReceipt(id, photo);
      if (!mounted.current) return;
      setResult(draft);
      setSample(USING_MOCKS);
      setStep('result');
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiError && (READER_DOWN.has(error.code) || error.status >= 500)) {
        setResult(mockReceiptDraft());
        setSample(true);
        setStep('result');
        return;
      }
      setFailure(describeFailure(error));
      setStep('error');
    }
  }

  function applyDetails() {
    navigate(`/groups/${id}/expenses/new`, { replace: true, state: { prefill: draftToPrefill(result) } });
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
            {!USING_MOCKS && (
              <p role="note" className="rounded-2xl bg-surface-2 px-4 py-3 text-sm">
                Demo: use sample receipts only. The photo is sent to Google Gemini to read it, and on Google’s free tier Google may use it to improve its products.
              </p>
            )}
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
            <div className="relative flex h-72 w-56 items-center justify-center overflow-hidden rounded-card bg-surface text-muted">
              <IconReceipt size={96} />
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 animate-[scan_1.8s_ease-in-out_infinite] bg-accent shadow-[0_0_24px_var(--accent)]" />
            </div>
            <p className="text-lg font-semibold">Reading your receipt…</p>
          </div>
        )}

        {step === 'error' && (
          <>
            <h1 className="font-display-wide text-4xl">We couldn’t read it</h1>
            <p role="alert" className="text-muted">
              {failure}
            </p>
            <Button block onClick={() => setStep('choose')}>
              Try another photo
            </Button>
            <Button block variant="outline" onClick={() => navigate(`/groups/${id}/expenses/new`, { replace: true })}>
              Enter it by hand
            </Button>
          </>
        )}

        {step === 'result' && result && (
          <>
            <h1 className="font-display-wide text-4xl">{sample ? 'Sample result' : 'Here’s what we found'}</h1>
            {sample && (
              <p role="note" className="rounded-2xl bg-surface-2 px-4 py-3 text-sm">
                {USING_MOCKS
                  ? 'This is a sample result. The photo was not read.'
                  : 'The receipt reader is not available right now, so this is a sample result and not your photo. Enter the expense by hand to use your receipt.'}
              </p>
            )}
            <Card className="flex flex-col gap-4">
              <div className="flex flex-col">
                <span className="text-lg font-semibold">{result.merchant ?? 'Unknown merchant'}</span>
                <span className="text-sm text-muted">{result.date ? formatDate(result.date) : 'Date not found'}</span>
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-sm text-muted">Total on receipt</dt>
                  <dd className="font-mono text-lg">{[result.currency, result.total].filter(Boolean).join(' ')}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">In USDC</dt>
                  <dd>{result.usdc ? <Amount value={result.usdc} size="md" /> : <span className="text-sm text-muted">You enter it next</span>}</dd>
                </div>
              </dl>
              {warningMessages(result).map((message) => (
                <p key={message} role="note" className="text-sm">
                  {message}
                </p>
              ))}
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-medium">Items found</h2>
                <ul className="flex flex-col divide-y divide-line text-sm">
                  {result.items.map((item, index) => (
                    <li key={`${index}-${item.name}`} className="flex justify-between py-2">
                      <span>{item.name}</span>
                      <span className="font-mono">{[result.currency, item.amount].filter(Boolean).join(' ')}</span>
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
          {USING_MOCKS
            ? 'Your photo stays on your device in this preview.'
            : 'We do not store the photo. Nothing is saved until you review the details and save the expense.'}
        </p>
      </div>
    </>
  );
}
