import { useState } from 'react'
import { uploadVoiceNote } from './voiceNotesApi'
import { useVoiceRecorder } from './useVoiceRecorder'
import VoiceRecorderControl from './VoiceRecorderControl'
import './VoiceRecorderControl.css'

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

  return (
    <section>
      <p className="section-label">Voice notes</p>
      <VoiceRecorderControl recorder={recorder} onSave={savePreview} saving={saving} />
    </section>
  )
}

export default VoiceNotes
