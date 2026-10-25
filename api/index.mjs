// Vercel function: every /v1/* request is rewritten here (vercel.json) and handled by apps/api.
import { handlerFromEnv } from '../apps/api/src/main.js';

let handler;
export default function stellarSplitApi(req, res) {
  handler ??= handlerFromEnv().handler; // built once per warm instance; config errors surface as a 500 per request
  return handler(req, res);
}
