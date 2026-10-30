/**
 * Fictional sample content used ONLY for the static product illustration on the
 * landing page. It is never presented as analysis of a user's document.
 */
export type DocumentItem = {
  id: string
  name: string
  pages: number
  updated: string
  kind: 'recent' | 'favorite' | 'shared'
}

export type DocPage = {
  kicker: string
  title: string
  subtitle: string
  byline?: string
  paragraphs: string[]
  callout?: string
  figure?: string
}

export const SAMPLE_DOCUMENT_NAME = 'The Science Behind Modern Telescopes.pdf'

export const documents: DocumentItem[] = [
  {
    id: 'telescopes',
    name: SAMPLE_DOCUMENT_NAME,
    pages: 12,
    updated: 'Opened just now',
    kind: 'recent',
  },
  {
    id: 'strategy',
    name: 'Q3 Product Strategy.pdf',
    pages: 18,
    updated: '2 hours ago',
    kind: 'recent',
  },
  {
    id: 'trial',
    name: 'Clinical Trial Notes.pdf',
    pages: 34,
    updated: 'Yesterday',
    kind: 'favorite',
  },
  {
    id: 'lease',
    name: 'Lease Agreement — Harbor Lofts.pdf',
    pages: 9,
    updated: 'Mar 12',
    kind: 'shared',
  },
]

export const documentPages: DocPage[] = [
  {
    kicker: 'Chapter 1 · Optics',
    title: 'The Science Behind Modern Telescopes',
    subtitle: 'How glass, sensors and software now share the work of seeing farther.',
    byline: 'Dr. Elena Voss · Observatory Review · 2026',
    paragraphs: [
      'For most of astronomy’s history, a telescope was judged by the size of its primary mirror. Collect more light, and fainter objects appear. That rule still holds — but it is no longer the whole story. The telescopes being commissioned today are systems: optics, mechanics, detectors and algorithms working as one instrument.',
      'Earth’s atmosphere remains the first obstacle. Warm and cool pockets of air continuously distort incoming wavefronts, turning a sharp point of starlight into a trembling blur. Adaptive optics measure that distortion thousands of times per second and deform a thin mirror to cancel it, restoring a near-diffraction-limited image.',
      'At the same time, primary mirrors have outgrown the idea of a single polished disk. Segmented designs assemble dozens of hexagonal pieces into a surface tens of meters across. Each segment is positioned with nanometer precision so the array behaves as one continuous optic.',
    ],
    callout:
      'Resolution is no longer limited by aperture alone. Atmosphere, alignment and computation now decide what a telescope can actually show.',
    figure: 'Fig. 1 — Wavefront correction across a 10-meter-class segmented primary.',
  },
  {
    kicker: 'Chapter 2 · Imaging',
    title: 'From photons to a finished image',
    subtitle: 'Detectors, cooling and computational reconstruction.',
    paragraphs: [
      'Once light is focused, it must be counted. Modern astronomical cameras use large mosaics of charge-coupled devices or CMOS sensors, often cooled below −100 °C so thermal noise does not drown the signal from a distant galaxy.',
      'A single exposure is rarely the final product. Observatories stack, align and denoise hundreds of frames. Software removes satellite streaks, interpolates over dead pixels and reconstructs detail that a raw frame cannot hold.',
      'This is why two telescopes with similar apertures can produce very different science. The instrument that records the light — and the pipeline that reduces it — now contribute as much as the mirror itself.',
    ],
    callout:
      'Computational imaging lets astronomers recover structure that optics alone would leave buried in noise.',
    figure: 'Fig. 2 — A stacked 8-hour exposure after cosmic-ray rejection and flat-field correction.',
  },
  {
    kicker: 'Chapter 3 · Observation',
    title: 'Techniques that change what we can ask',
    subtitle: 'Spectroscopy, interferometry and survey-scale astronomy.',
    paragraphs: [
      'Imaging tells us where something is. Spectroscopy tells us what it is made of, how fast it moves and how it formed. High-resolution spectrographs disperse starlight so finely that the chemical fingerprints of exoplanet atmospheres become measurable.',
      'Interferometry goes further, combining light from separate telescopes as if they were pieces of a much larger one. The effective resolution can rival a mirror the size of the distance between the telescopes.',
      'Meanwhile, survey instruments map the sky on a schedule measured in petabytes. The scientific question is no longer only “what is that object?” but “what changed tonight, across the entire visible sky?”',
    ],
    figure: 'Fig. 3 — A comparison of seeing-limited, AO-corrected and interferometric angular resolution.',
  },
]

export const overviewText =
  'This document explores the science behind modern telescopes, including advances in optical systems, imaging technology and observation techniques.'

export const keyFindings = [
  {
    n: '01',
    title: 'Atmosphere, not glass, limits sharpness',
    text: 'Adaptive optics cancel atmospheric blur in real time, so ground telescopes can rival space.',
  },
  {
    n: '02',
    title: 'Large mirrors are now assembled',
    text: 'Segmented primaries are the scalable path to 30-meter-class light collection.',
  },
  {
    n: '03',
    title: 'Software finishes the image',
    text: 'Stacking, calibration and reconstruction reveal structure a single exposure cannot.',
  },
] as const

export const findingsIntro = 'Here are the three key findings:'
