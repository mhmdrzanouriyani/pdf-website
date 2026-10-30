import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { Footer } from '../components/layout/Footer'
import { Pricing } from '../components/landing/Pricing'
import { FAQ } from '../components/landing/FAQ'

function Page({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} — PDFLY`
  }, [title])
  return (
    <>
      <Navbar />
      <main id="main">{children}</main>
      <Footer />
    </>
  )
}

export function PricingPage() {
  return (
    <Page title="Pricing">
      <Pricing standalone />
    </Page>
  )
}

export function FaqPage() {
  return (
    <Page title="FAQ">
      <FAQ standalone />
    </Page>
  )
}

export function PrivacyPage() {
  return (
    <Page title="Privacy">
      <article className="prose-page">
        <p className="section-kicker">Privacy</p>
        <h1>How PDFLY handles your documents</h1>
        <p className="muted">This describes how this build of PDFLY works. Whoever operates a PDFLY server is responsible for its own hosting and AI provider choices.</p>
        <h2>Tools that run in your browser</h2>
        <p>
          Merge, split, organize, extract, remove, rotate, crop, compress, repair, PDF → images/text/Word/Excel, images → PDF, edit, watermark, page numbers, sign, compare, redact,
          protect, unlock and metadata run on your device. Your files are not uploaded.
        </p>
        <h2>OCR</h2>
        <p>OCR runs on your device with the open-source Tesseract engine, which PDFLY serves itself. The language data (several MB per language) is downloaded once from cdn.jsdelivr.net. No document content is sent.</p>
        <h2>Office and HTML conversion</h2>
        <p>
          Word, PowerPoint, Excel and HTML → PDF upload the file to the PDFLY server. It is written to a private temporary folder, converted with LibreOffice and deleted immediately after
          the PDF is returned. HTML is sanitized first; remote resources are never fetched.
        </p>
        <h2>AI features</h2>
        <p>
          Text is extracted in your browser. When you use an AI feature, the relevant extracted text — never the PDF file — is sent to the PDFLY server and forwarded to the AI provider
          configured on that server (for example Anthropic or an OpenAI-compatible service). PDFLY does not store the text or the answers. The provider’s own data policy applies.
        </p>
        <h2>Recent documents</h2>
        <p>Recent documents are stored in your browser (IndexedDB) on this device only. Clear them in the workspace at any time.</p>
        <h2>Accounts</h2>
        <p>
          If you create an account, the server stores your email, name, a salted scrypt hash of your password and your AI preferences. Sessions use an HTTP-only cookie. You can delete
          your account from the Account page.
        </p>
      </article>
    </Page>
  )
}

export function TermsPage() {
  return (
    <Page title="Terms">
      <article className="prose-page">
        <p className="section-kicker">Terms</p>
        <h1>Terms of use</h1>
        <p>PDFLY is provided as-is, without warranty. Keep a copy of your original files — operations like redaction and compression are permanent in their outputs.</p>
        <p>
          Only process documents you have the right to process. Unlock PDF requires the document’s password and does not bypass protection. AI output can be wrong; verify important
          information against the source document.
        </p>
        <p>
          Visual signatures created with Sign PDF are images, not certificate-based digital signatures. Check whether they meet your legal requirements.
        </p>
        <p>
          Questions? See the <Link to="/faq">FAQ</Link>.
        </p>
      </article>
    </Page>
  )
}

export function NotFoundPage() {
  return (
    <Page title="Page not found">
      <section className="prose-page not-found">
        <h1>This page doesn’t exist.</h1>
        <p>
          Go to the <Link to="/">home page</Link>, browse <Link to="/tools">all PDF tools</Link>, or press Ctrl K to search.
        </p>
      </section>
    </Page>
  )
}
