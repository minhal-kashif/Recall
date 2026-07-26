import { useEffect, useState } from 'react'
import { apiFetch } from './api'
import './ActivityTimeline.css'

const KIND_LABELS = {
  manual: 'Note',
  call: 'Call',
  whatsapp: 'WhatsApp',
  voice: 'Voice note',
  done: 'Follow-up done',
}

function formatDuration(seconds) {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Merges interactions (excluding 'voice' — those come from voice_notes
// instead, so playback works), voice notes, and completed follow-ups into
// one chronological feed. Pending/upcoming follow-ups deliberately stay out
// of this list — they're still open work, not history yet; they live in
// FollowUpList's own actionable section.
function buildTimeline({ interactions, voiceNotes, followUps }) {
  const entries = []

  interactions
    .filter((i) => i.source !== 'voice')
    .forEach((i) => {
      entries.push({
        id: `interaction-${i.id}`,
        date: i.interaction_date,
        kind: i.source === 'manual' ? 'manual' : i.source,
        text: i.note_text,
      })
    })

  voiceNotes.forEach((n) => {
    const duration = formatDuration(n.duration_seconds)
    entries.push({
      id: `voice-${n.id}`,
      date: n.created_at,
      kind: 'voice',
      text: duration ? `${duration} recording` : 'Recording',
      audioUrl: n.signed_url,
    })
  })

  followUps
    .filter((f) => f.status === 'done')
    .forEach((f) => {
      entries.push({
        id: `followup-${f.id}`,
        date: f.due_date,
        kind: 'done',
        text: f.description,
      })
    })

  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

function ActivityTimeline({ session, contactId, refreshKey }) {
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState(null)

  const token = session.access_token

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      apiFetch(`/api/interactions/${contactId}`, { token, signal: controller.signal }),
      apiFetch(`/api/voice-notes/${contactId}`, { token, signal: controller.signal }),
      apiFetch(`/api/follow-ups/${contactId}`, { token, signal: controller.signal }),
    ])
      .then(([interactions, voiceNotes, followUps]) => {
        setEntries(buildTimeline({ interactions, voiceNotes, followUps }))
      })
      .catch((err) => {
        if (err.message !== 'cancelled') setError(err.message)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, refreshKey])

  return (
    <section>
      <p className="section-label">Activity</p>
      {error && <p style={{ color: 'var(--brick-text)' }}>{error}</p>}

      {entries === null ? (
        <p>Loading...</p>
      ) : entries.length === 0 ? (
        <p>Nothing logged yet.</p>
      ) : (
        <ul>
          {entries.map((entry) => (
            <li key={entry.id} className="tl-row">
              <span className={`tl-dot tl-dot-${entry.kind}`}></span>
              <div className="tl-body">
                <div className="tl-top">
                  <span className="tl-kind">{KIND_LABELS[entry.kind] || entry.kind}</span>
                  <span className="tl-date">{new Date(entry.date).toLocaleDateString()}</span>
                </div>
                <p className="tl-text">{entry.text}</p>
                {entry.audioUrl && (
                  <audio controls src={entry.audioUrl} className="tl-audio">
                    <track kind="captions" />
                  </audio>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default ActivityTimeline
