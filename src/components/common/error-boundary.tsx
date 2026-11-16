import * as React from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error): void {
    console.error('[ErrorBoundary]', error)
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="size-5" />
              <CardTitle>Algo salió mal</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Ocurrió un error inesperado en la interfaz. Tus datos guardados no se modificaron.
            </p>
            <pre className="max-h-32 overflow-auto rounded-lg bg-muted p-2 text-xs">
              {this.state.error.message}
            </pre>
            <Button onClick={() => window.location.reload()}>
              <RotateCcw />
              Recargar la aplicación
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
}
