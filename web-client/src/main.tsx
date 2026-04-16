import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.tsx'
import AdminDashboard from './pages/AdminDashboard.tsx'
import UpdateDevice from './pages/UpdateDevice.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/update" element={<UpdateDevice />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
