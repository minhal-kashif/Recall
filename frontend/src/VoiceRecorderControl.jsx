import { useEffect, useRef, useState } from 'react'

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12z"
      />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  )
}

// Custom playback bar replacing the browser's native <audio controls> skin,
// which looks jarringly inconsistent against the rest of the ledger design.
function AudioPlayer({ src, durationSeconds }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
  }, [src])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      audio.play()
    }
  }

  const seek = (event) => {
    const audio = audioRef.current
    if (!audio || !durationSeconds) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    audio.currentTime = ratio * durationSeconds
  }

  const progress = durationSeconds > 0 ? Math.min(1, currentTime / durationSeconds) : 0

  return (
    <div className="voice-player">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      />
      <button type="button" className="voice-player-toggle" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="voice-player-track" onClick={seek} role="presentation">
        <div className="voice-player-track-fill" style={{ width: `${progress * 100}%` }} />
      </div>
      <span className="voice-player-time">{formatElapsed(playing || currentTime ? currentTime : durationSeconds)}</span>
    </div>
  )
}

// Shared recording control used by both VoiceNotes (existing contact) and
// ContactForm's add-flow (record now, attach after the contact is created) —
// same three states (idle / recording / preview) either way.
function VoiceRecorderControl({ recorder, onSave, saving, saveLabel = 'Save', hint }) {
  if (!recorder.mediaRecorderSupported && !recorder.preview) {
    return <p className="voice-unsupported">Voice recording is not supported on this device/browser.</p>
  }

  return (
    <div className="voice-recorder">
      {recorder.error && <p style={{ color: 'var(--brick-text)' }}>{recorder.error}</p>}

      {!recorder.recording && !recorder.preview && (
        <button type="button" className="voice-record-btn" onClick={recorder.startRecording}>
          <span className="voice-record-dot" />
          <MicIcon />
          Record voice note
        </button>
      )}

      {recorder.recording && (
        <div className="voice-recording-row">
          <span className="voice-recording-indicator">
            <span className="voice-recording-pulse" />
            Recording
          </span>
          <span className="voice-recording-time">{formatElapsed(recorder.elapsedSeconds)}</span>
          <button type="button" className="voice-stop-btn" onClick={recorder.stopRecording} aria-label="Stop recording">
            <StopIcon />
          </button>
        </div>
      )}

      {recorder.preview && (
        <div className="voice-preview">
          <AudioPlayer src={recorder.preview.url} durationSeconds={recorder.preview.durationSeconds} />
          {hint && <p className="voice-note-hint">{hint}</p>}
          <div className="voice-preview-actions">
            {onSave && (
              <button type="button" className="ledger-btn-outline voice-save-btn" onClick={onSave} disabled={saving}>
                {saving ? 'Saving…' : saveLabel}
              </button>
            )}
            <button type="button" className="voice-discard-btn" onClick={recorder.discardPreview} disabled={saving}>
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default VoiceRecorderControl
