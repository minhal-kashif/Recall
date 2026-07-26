import { useEffect, useRef, useState } from 'react'

const CANDIDATE_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']

function pickMimeType() {
  if (typeof window === 'undefined' || !window.MediaRecorder || !MediaRecorder.isTypeSupported) return null
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || null
}

// Shared recording state machine behind VoiceNotes (record → attach to an
// existing contact immediately) and ContactForm's add-flow (record → hold
// the blob → attach once the new contact's id exists, right after save).
export function useVoiceRecorder() {
  const [error, setError] = useState(null)
  const [recording, setRecording] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [preview, setPreview] = useState(null) // { blob, url, durationSeconds }

  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const startTimeRef = useRef(0)
  const timerRef = useRef(null)
  const previewUrlRef = useRef(null)
  const mediaRecorderSupported = typeof window !== 'undefined' && !!window.MediaRecorder

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

  return {
    error,
    setError,
    recording,
    elapsedSeconds,
    preview,
    mediaRecorderSupported,
    startRecording,
    stopRecording,
    discardPreview,
  }
}
