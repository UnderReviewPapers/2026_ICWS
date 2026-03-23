import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { MCPClientProvider } from './context/MCPClientProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MCPClientProvider>
      <App />
    </MCPClientProvider>
  </StrictMode>,
)
