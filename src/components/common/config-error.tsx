import { TriangleAlert, ExternalLink } from 'lucide-react'
import { getMissingFirebaseKeys } from '@/lib/env'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function ConfigErrorScreen() {
  const missing = getMissingFirebaseKeys()
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2 text-warning">
            <TriangleAlert className="size-5" />
            <CardTitle>Falta configurar Firebase</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            La aplicación necesita las credenciales del proyecto de Firebase para funcionar.
            Copiá <code className="rounded bg-muted px-1">.env.example</code> a{' '}
            <code className="rounded bg-muted px-1">.env.local</code> y completá los valores de la
            consola de Firebase.
          </p>
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
            <p className="font-medium">Variables ausentes</p>
            <ul className="mt-1 list-inside list-disc font-mono text-xs text-muted-foreground">
              {missing.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          </div>
          <p className="text-muted-foreground">
            Después de guardar el archivo, reiniciá el servidor de desarrollo (
            <code className="rounded bg-muted px-1">npm run dev</code>). En Vercel, cargá las mismas
            variables en <em>Settings → Environment Variables</em>.
          </p>
          <a
            href="https://console.firebase.google.com/"
            target="_blank"
            rel="noreferrer noopener"
            className={buttonVariants({ variant: 'outline' })}
          >
            Abrir consola de Firebase
            <ExternalLink />
          </a>
        </CardContent>
      </Card>
    </div>
  )
}
