import { Sparkle } from '../ui/Sparkle'
import { UploadZone } from '../upload/UploadZone'
import { ProductPreview } from './ProductPreview'

export function Hero() {
  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="hero-eyebrow">
          <Sparkle size={13} />
          AI-native document workspace
        </p>
        <h1>
          Your AI-powered <span className="gradient-text">PDF Workspace</span>
          <Sparkle className="hero-sparkle sparkle-a" size={18} />
          <Sparkle className="hero-sparkle sparkle-b" size={12} />
        </h1>
        <p className="hero-sub">
          Read, edit, convert and understand your documents — all in one place.
        </p>
        <p className="hero-support">Powerful document tools with an intelligent AI Copilot.</p>
        <UploadZone />
      </div>

      <div className="hero-preview" id="product">
        <ProductPreview />
      </div>
    </section>
  )
}
