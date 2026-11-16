import * as React from 'react'
import { Mic, MicOff, Sparkles, Square } from 'lucide-react'
import type { TransactionDraft } from '@/domain/models'
import { interpretVoiceCommand } from '@/domain/voice-parser'
import { formatMoney } from '@/domain/money'
import { formatDate } from '@/lib/date'
import { TRANSACTION_TYPE_LABELS } from '@/lib/labels'
import { useSpeechRecognition } from '@/lib/speech'
import { useHousehold } from '@/providers/household-provider'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

const EXAMPLES = [
  'Gasté 150 mil en el supermercado con la tarjeta Visa',
  'Pagué la tarjeta Itaú 850 mil desde la cuenta del banco',
  'Me entraron 4.500.000 de sueldo en la cuenta principal',
  'Transferí 200 mil de la cuenta banco al ahorro',
  'Retiré 500 mil de la tarjeta en efectivo',
]

export function VoiceDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (draft: TransactionDraft) => void
}) {
  const { accounts, cards, categories, loans, ctx } = useHousehold()
  const speech = useSpeechRecognition()
  const [draft, setDraft] = React.useState<TransactionDraft | null>(null)

  React.useEffect(() => {
    if (!open) return
    setDraft(null)
    speech.reset()
    // solo al abrir; speech se recrea en cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const interpret = () => {
    const text = speech.transcript.trim()
    if (!text) return
    const result = interpretVoiceCommand(text, {
      baseCurrency: ctx.baseCurrency,
      accounts,
      cards,
      categories,
      loans,
    })
    setDraft(result)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      variant="sheet"
      title="Registrar por voz"
      description="Hablá natural: “gasté 150 mil en el súper con la tarjeta Visa”."
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!draft} onClick={() => draft && onConfirm(draft)}>
            <Sparkles />
            Revisar y confirmar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!speech.supported ? (
          <Alert variant="warning" title="Este navegador no soporta dictado">
            Podés escribir la frase a mano. Para dictar, usá Chrome o Edge en HTTPS.
          </Alert>
        ) : null}

        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/30 p-5">
          <button
            type="button"
            disabled={!speech.supported}
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            className={
              speech.listening
                ? 'flex size-20 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg'
                : 'flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg disabled:opacity-50'
            }
            aria-label={speech.listening ? 'Detener grabación' : 'Iniciar grabación'}
          >
            {speech.listening ? <Square className="size-7" /> : <Mic className="size-8" />}
          </button>
          <p className="text-sm font-medium">
            {speech.listening ? 'Escuchando…' : speech.supported ? 'Tocá y hablá' : 'Dictado no disponible'}
          </p>
          {speech.listening && speech.interim ? (
            <p className="text-center text-sm italic text-muted-foreground">{speech.interim}</p>
          ) : null}
          {speech.listening ? (
            <Button type="button" size="sm" variant="outline" onClick={speech.stop}>
              <MicOff />
              Detener
            </Button>
          ) : null}
        </div>

        {speech.error ? (
          <Alert variant="warning" title="Micrófono">
            {speech.error}
          </Alert>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="voice-transcript">Frase</Label>
          <Textarea
            id="voice-transcript"
            value={speech.transcript}
            onChange={(event) => speech.setTranscript(event.target.value)}
            placeholder="Escribí o dictá el movimiento"
            rows={3}
          />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => {
                  speech.setTranscript(example)
                  setDraft(null)
                }}
              >
                {example.length > 42 ? `${example.slice(0, 42)}…` : example}
              </button>
            ))}
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={!speech.transcript.trim()}
          onClick={interpret}
        >
          <Sparkles />
          Interpretar frase
        </Button>

        {draft ? (
          <div className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Vista previa</p>
              <Badge variant={draft.confidence >= 0.7 ? 'success' : 'warning'}>
                Confianza {Math.round(draft.confidence * 100)}%
              </Badge>
            </div>
            <Progress value={draft.confidence * 100} />

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Tipo</dt>
                <dd className="font-medium">{TRANSACTION_TYPE_LABELS[draft.type]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Importe</dt>
                <dd className="font-medium tabular-nums">
                  {draft.amountMinor != null
                    ? formatMoney(draft.amountMinor, draft.currency)
                    : 'No detectado'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Fecha</dt>
                <dd className="font-medium">{formatDate(draft.date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Categoría</dt>
                <dd className="font-medium">{draft.categoryName ?? 'Sin categoría'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Cuenta</dt>
                <dd className="font-medium">{draft.accountName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Tarjeta</dt>
                <dd className="font-medium">{draft.cardName ?? '—'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Descripción</dt>
                <dd className="font-medium">{draft.description}</dd>
              </div>
            </dl>

            {draft.missing.length > 0 ? (
              <Alert variant="warning" title="Faltan datos">
                Completá en el formulario: {draft.missing.join(', ')}.
              </Alert>
            ) : null}

            {draft.warnings.length > 0 ? (
              <div className="space-y-1">
                {draft.warnings.map((warning) => (
                  <p key={warning} className="text-xs text-muted-foreground">
                    · {warning}
                  </p>
                ))}
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Nada se guarda todavía: el botón “Revisar y confirmar” abre el formulario completo para
              que valides los datos.
            </p>
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
