import { useEffect, useRef, useState } from 'react'
import { apiFetch } from './api'

const CANDIDATE_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']

function pickMimeType() {
  if (typeof window === 'undefined' || !window.MediaRecorder || !MediaRecorder.isTypeSupported) return null
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || null
}

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function VoiceNotes({ session, contactId, onUploaded }) {
  const [notes, setNotes] = useState([])
  const [error, setError] = useState(null)
  const [recording, setRecording] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [preview, setPreview] = useState(null) // { blob, url, durationSeconds }
  const [saving, setSaving] = useState(false)

  const token = session.access_token
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const startTimeRef = useRef(0)
  const timerRef = useRef(null)
  const previewUrlRef = useRef(null)
  const mediaRecorderSupported = typeof window !== 'undefined' && !!window.MediaRecorder

  const loadNotes = (signal) => {
    apiFetch(`/api/voice-notes/${contactId}`, { token, signal })
      .then((data) => (Array.isArray(data) ? setNotes(data) : setError(data.error)))
      .catch((err) => {
        if (err.message !== 'cancelled') setError(err.message)
      })
  }

  useEffect(() => {
    const controller = new AbortController()
    loadNotes(controller.signal)
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId])

  // Cleanup on unmount: stop any active recorder/tracks and revoke object URLs.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop()
        } catch {
          // ignore
        }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  const startRecording = async () => {
    setError(null)
    const mimeType = pickMimeType()

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone access is needed to record. Enable it in your browser/device settings.')
      return
    }

    streamRef.current = stream
    chunksRef.current = []

    let recorder
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    } catch {
      setError('Recording is not supported on this device/browser.')
      stream.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      return
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000)
      const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
      const url = URL.createObjectURL(blob)
      previewUrlRef.current = url
      setPreview({ blob, url, durationSeconds })
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      setRecording(false)
    }

    recorderRef.current = recorder
    startTimeRef.current = Date.now()
    setElapsedSeconds(0)
    setRecording(true)
    recorder.start()

    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 250)
  }

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }

  const discardPreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreview(null)
  }

  const savePreview = async () => {
    if (!preview) return
    setSaving(true)
    setError(null)

    try {
      const form = new FormData()
      form.append('contact_id', contactId)
      if (preview.durationSeconds) form.append('duration_seconds', String(preview.durationSeconds))
      form.append('audio', preview.blob, 'note.webm')

      await apiFetch('/api/voice-notes', {
        token,
        method: 'POST',
        body: form,
        timeoutMs: 30000,
      })

      discardPreview()
      loadNotes()
      onUploaded?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h3>Voice notes</h3>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!mediaRecorderSupported && !preview && <p>Voice recording is not supported on this device/browser.</p>}

      {mediaRecorderSupported && !recording && !preview && (
        <button type="button" onClick={startRecording}>
          Record voice note
        </button>
      )}

      {recording && (
        <p>
          Recording… {formatElapsed(elapsedSeconds)}{' '}
          <button type="button" onClick={stopRecording}>
            Stop
          </button>
        </p>
      )}

      {preview && (
        <div>
          <audio controls src={preview.url}>
            <track kind="captions" />
          </audio>
          <div>
            <button type="button" onClick={savePreview} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>{' '}
            <button type="button" onClick={discardPreview} disabled={saving}>
              Discard
            </button>
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <p>No voice notes yet.</p>
      ) : (
        <ul>
          {notes.map((n) => (
            <li key={n.id}>
              <audio controls src={n.signed_url}>
                <track kind="captions" />
              </audio>
              <div>{new Date(n.created_at).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default VoiceNotes
