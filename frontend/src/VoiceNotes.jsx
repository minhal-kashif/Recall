import { useState } from 'react'
import { uploadVoiceNote } from './voiceNotesApi'
import { useVoiceRecorder } from './useVoiceRecorder'
import './VoiceNotes.css'

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function VoiceNotes({ session, contactId, onUploaded }) {
  const [saving, setSaving] = useState(false)

  const token = session.access_token
  const recorder = useVoiceRecorder()

  const savePreview = async () => {
    if (!recorder.preview) return
    setSaving(true)
    recorder.setError(null)

    try {
      await uploadVoiceNote({
        contactId,
        blob: recorder.preview.blob,
        durationSeconds: recorder.preview.durationSeconds,
        token,
      })
      recorder.discardPreview()
      onUploaded?.()
    } catch (err) {
      recorder.setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const error = recorder.error

  return (
    <section>
      <p className="section-label">Voice notes</p>
      {error && <p style={{ color: 'var(--brick-text)' }}>{error}</p>}

      {!recorder.mediaRecorderSupported && !recorder.preview && (
        <p>Voice recording is not supported on this device/browser.</p>
      )}

      {recorder.mediaRecorderSupported && !recorder.recording && !recorder.preview && (
        <button type="button" onClick={recorder.startRecording}>
          Record voice note
        </button>
      )}

      {recorder.recording && (
        <p className="recording-status">
          Recording… {formatElapsed(recorder.elapsedSeconds)}{' '}
          <button type="button" onClick={recorder.stopRecording}>
            Stop
          </button>
        </p>
      )}

      {recorder.preview && (
        <div className="voice-preview">
          <audio controls src={recorder.preview.url}>
            <track kind="captions" />
          </audio>
          <div className="voice-preview-actions">
            <button type="button" className="btn-primary" onClick={savePreview} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={recorder.discardPreview} disabled={saving}>
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export default VoiceNotes
