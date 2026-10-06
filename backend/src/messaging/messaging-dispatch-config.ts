const DEFAULT_MESSAGING_SENDING_STALE_MS=5*60_000;
const MIN_MESSAGING_SENDING_STALE_MS=1_000;
const MAX_MESSAGING_SENDING_STALE_MS=24*60*60_000;

export function messagingSendingStaleMs(env:NodeJS.ProcessEnv=process.env){
  const parsed=Number(env.MESSAGING_SENDING_STALE_MS||DEFAULT_MESSAGING_SENDING_STALE_MS);
  if(!Number.isFinite(parsed)||parsed<MIN_MESSAGING_SENDING_STALE_MS)return DEFAULT_MESSAGING_SENDING_STALE_MS;
  return Math.min(MAX_MESSAGING_SENDING_STALE_MS,Math.trunc(parsed));
}
