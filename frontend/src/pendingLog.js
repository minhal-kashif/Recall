// A web app can't read the phone's call log or WhatsApp messages — there's
// no such browser API. This is the closest honest approximation: remember
// that the agent tapped Call/WhatsApp on a contact, then when they switch
// back to Recall, prompt them to log what happened. It's a nudge triggered
// by "you left to do something, now log it," not a verified record.
const KEY = 'recall_pending_log';

export function startPendingLog({ contactId, contactName, source }) {
  sessionStorage.setItem(KEY, JSON.stringify({ contactId, contactName, source, startedAt: Date.now() }));
}

export function readPendingLog() {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearPendingLog() {
  sessionStorage.removeItem(KEY);
}
