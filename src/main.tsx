import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { ThemeProvider } from '@/providers/theme-provider'
import { ToastProvider } from '@/components/ui/toast'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('No se encontró el elemento #root')

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
