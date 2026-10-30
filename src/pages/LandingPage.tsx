import { useEffect } from 'react'
import { Navbar } from '../components/layout/Navbar'
import { Footer } from '../components/layout/Footer'
import { Hero } from '../components/landing/Hero'
import { AIShowcase } from '../components/landing/AIShowcase'
import { FeatureCategories } from '../components/landing/FeatureCategories'
import { Pillars } from '../components/landing/Pillars'
import { HowItWorks } from '../components/landing/HowItWorks'
import { SecuritySection } from '../components/landing/SecuritySection'
import { Pricing } from '../components/landing/Pricing'
import { FAQ } from '../components/landing/FAQ'

export function LandingPage() {
  useEffect(() => {
    document.title = 'PDFLY — Your documents. One intelligent workspace.'
  }, [])

  return (
    <>
      <Navbar />
      <main id="main">
        <Hero />
        <FeatureCategories />
        <AIShowcase />
        <Pillars />
        <HowItWorks />
        <SecuritySection />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </>
  )
}
