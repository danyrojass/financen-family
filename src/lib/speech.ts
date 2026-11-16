import * as React from 'react'

interface SpeechAlternative {
  transcript: string
  confidence: number
}

interface SpeechResult {
  readonly isFinal: boolean
  readonly length: number
  readonly 0: SpeechAlternative
}

interface SpeechResultList {
  readonly length: number
  readonly [index: number]: SpeechResult
}

interface SpeechResultEvent {
  resultIndex: number
  results: SpeechResultList
}

interface SpeechErrorEvent {
  error: string
  message?: string
}

interface SpeechRecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechErrorEvent) => void) | null
  onresult: ((event: SpeechResultEvent) => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

function getConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const speechWindow = window as unknown as SpeechWindow
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

const SPEECH_ERRORS: Record<string, string> = {
  'not-allowed':
    'El navegador bloqueó el micrófono. Habilitá el permiso del micrófono para este sitio.',
  'service-not-allowed':
    'El servicio de reconocimiento de voz no está disponible. Probá con Chrome o Edge.',
  'no-speech': 'No se escuchó nada. Acercate al micrófono e intentá de nuevo.',
  'audio-capture': 'No se encontró un micrófono disponible.',
  network: 'El reconocimiento de voz necesita conexión a internet en este navegador.',
  aborted: 'La grabación se canceló.',
}

export interface UseSpeechRecognition {
  supported: boolean
  listening: boolean
  transcript: string
  interim: string
  error: string | null
  start: () => void
  stop: () => void
  reset: () => void
  setTranscript: (value: string) => void
}

/**
 * Captura de voz del navegador (Web Speech API). No envía audio a nuestros
 * servidores ni usa claves: si el navegador no lo soporta, se escribe a mano.
 */
export function useSpeechRecognition(lang = 'es-PY'): UseSpeechRecognition {
  const [supported] = React.useState(() => Boolean(getConstructor()))
  const [listening, setListening] = React.useState(false)
  const [transcript, setTranscript] = React.useState('')
  const [interim, setInterim] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const recognitionRef = React.useRef<SpeechRecognitionInstance | null>(null)

  const stop = React.useCallback(() => {
    try {
      recognitionRef.current?.stop()
    } catch {
      // ignorar si ya estaba detenido
    }
  }, [])

  const start = React.useCallback(() => {
    const Constructor = getConstructor()
    if (!Constructor) {
      setError('Este navegador no soporta dictado por voz. Podés describir el movimiento a mano.')
      return
    }

    try {
      recognitionRef.current?.abort()
    } catch {
      // ignorar
    }

    const recognition = new Constructor()
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setListening(true)
      setError(null)
    }

    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const text = result?.[0]?.transcript ?? ''
        if (result?.isFinal) finalText += `${text} `
        else interimText += `${text} `
      }
      if (finalText.trim()) {
        setTranscript((current) => `${current} ${finalText}`.replace(/\s+/g, ' ').trim())
      }
      setInterim(interimText.trim())
    }

    recognition.onerror = (event) => {
      setError(SPEECH_ERRORS[event.error] ?? `Error de micrófono: ${event.error}`)
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
      setInterim('')
    }

    recognitionRef.current = recognition
    setTranscript('')
    setInterim('')
    setError(null)

    try {
      recognition.start()
    } catch {
      setError('No se pudo iniciar el micrófono. Intentá de nuevo.')
      setListening(false)
    }
  }, [lang])

  React.useEffect(
    () => () => {
      try {
        recognitionRef.current?.abort()
      } catch {
        // ignorar
      }
    },
    [],
  )

  return {
    supported,
    listening,
    transcript,
    interim,
    error,
    start,
    stop,
    reset: () => {
      setTranscript('')
      setInterim('')
      setError(null)
    },
    setTranscript,
  }
}
