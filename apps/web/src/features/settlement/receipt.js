// Draws a payment receipt as a PNG in the browser (canvas, no dependencies). Nothing is uploaded.

import { currentLocale } from '../../i18n/state.js';
import { tNow } from '../../i18n/state.js';
import { formatUsd } from '../../lib/format.js';

const W = 1080;
const H = 1350;

/**
 * @typedef {{ amount: string, toName: string, toAddress: string, groupName: string,
 *   txHash: string, explorerUrl: string, date: Date, accent: string, demo?: boolean }} ReceiptData
 */

/**
 * @param {ReceiptData} r
 * @returns {Promise<Blob>}
 */
export async function renderReceiptPng(r) {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');

  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, W, H);

  // Accent card with the amount.
  roundRect(ctx, 64, 160, W - 128, 460, 48);
  ctx.fillStyle = r.accent;
  ctx.fill();
  ctx.fillStyle = '#0b0b0d';
  ctx.font = '600 36px Geist, system-ui, sans-serif';
  ctx.fillText(tNow('receipt.paid', { to: r.toName }), 112, 250);
  ctx.font = '800 150px Archivo, system-ui, sans-serif';
  ctx.fillText(formatUsd(r.amount), 104, 440);
  ctx.font = '600 34px "Geist Mono", ui-monospace, monospace';
  ctx.fillText(r.demo ? tNow('receipt.usdcDemo') : tNow('receipt.usdcTestnet'), 112, 540);

  ctx.fillStyle = '#f5f5f2';
  ctx.font = '800 48px Archivo, system-ui, sans-serif';
  ctx.fillText('Stellar Split', 64, 104);

  const rows = [
    [tNow('receipt.group'), r.groupName],
    [tNow('receipt.to'), `${r.toName} · ${r.toAddress.slice(0, 6)}…${r.toAddress.slice(-6)}`],
    [tNow('receipt.date'), r.date.toLocaleString(currentLocale(), { dateStyle: 'medium', timeStyle: 'short' })],
    [r.demo ? tNow('receipt.demoRef') : tNow('receipt.transaction'), `${r.txHash.slice(0, 16)}…${r.txHash.slice(-8)}`],
  ];
  let y = 720;
  for (const [label, value] of rows) {
    ctx.fillStyle = '#a3a3ad';
    ctx.font = '400 32px Geist, system-ui, sans-serif';
    ctx.fillText(label, 64, y);
    ctx.fillStyle = '#f5f5f2';
    ctx.font = label === tNow('receipt.transaction') || label === tNow('receipt.demoRef') ? '500 34px "Geist Mono", ui-monospace, monospace' : '500 36px Geist, system-ui, sans-serif';
    ctx.fillText(value, 64, y + 48);
    y += 130;
  }

  ctx.fillStyle = '#a3a3ad';
  ctx.font = '400 26px Geist, system-ui, sans-serif';
  if (!r.demo) ctx.fillText(tNow('receipt.verify') + ' ' + r.explorerUrl.replace(/^https:\/\//, '').slice(0, 64) + '…', 64, H - 96);
  ctx.fillText(r.demo ? tNow('receipt.demoNote') : tNow('receipt.testNote'), 64, H - 56);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/png'));
}

/** @param {CanvasRenderingContext2D} ctx */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Saves a blob as a file download.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
