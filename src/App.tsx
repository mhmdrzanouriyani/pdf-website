import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { CommandPalette } from './components/command/CommandPalette'
import { LandingPage } from './pages/LandingPage'
import { DocumentsProvider } from './state/DocumentsContext'
import { ToastProvider } from './state/ToastContext'
import { AuthProvider } from './state/AuthContext'
import { ScrollManager } from './components/layout/ScrollManager'

// Route-level code splitting keeps the landing page light; pdf.js loads only where needed.
const WorkspacePage = lazy(() => import('./pages/WorkspacePage').then((m) => ({ default: m.WorkspacePage })))
const ToolsIndexPage = lazy(() => import('./pages/ToolsIndexPage').then((m) => ({ default: m.ToolsIndexPage })))
const ToolPage = lazy(() => import('./pages/ToolPage').then((m) => ({ default: m.ToolPage })))
const AuthPage = lazy(() => import('./pages/AuthPages').then((m) => ({ default: m.AuthPage })))
const ForgotPasswordPage = lazy(() => import('./pages/AuthPages').then((m) => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('./pages/AuthPages').then((m) => ({ default: m.ResetPasswordPage })))
const AccountPage = lazy(() => import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })))
const PricingPage = lazy(() => import('./pages/InfoPages').then((m) => ({ default: m.PricingPage })))
const FaqPage = lazy(() => import('./pages/InfoPages').then((m) => ({ default: m.FaqPage })))
const PrivacyPage = lazy(() => import('./pages/InfoPages').then((m) => ({ default: m.PrivacyPage })))
const TermsPage = lazy(() => import('./pages/InfoPages').then((m) => ({ default: m.TermsPage })))
const NotFoundPage = lazy(() => import('./pages/InfoPages').then((m) => ({ default: m.NotFoundPage })))

function PageFallback() {
  return <div className="page-loading" role="status" aria-label="Loading" />
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <DocumentsProvider>
            <ScrollManager />
            <CommandPalette />
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/workspace" element={<WorkspacePage />} />
                <Route path="/tools" element={<ToolsIndexPage mode="pdf" />} />
                <Route path="/tools/:slug" element={<ToolPage />} />
                <Route path="/ai" element={<ToolsIndexPage mode="ai" />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/faq" element={<FaqPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/login" element={<AuthPage mode="login" />} />
                <Route path="/signup" element={<AuthPage mode="signup" />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/account" element={<AccountPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </DocumentsProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
