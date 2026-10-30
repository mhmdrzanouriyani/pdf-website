import { useId } from 'react'
import type { Anchor } from '../../lib/pdf/stamp'

const ALL: Anchor[] = ['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']

/** 3×3 (or 2×3) position picker built from real radio inputs. */
export function AnchorPicker<T extends Anchor>({
  value,
  onChange,
  options = ALL as T[],
  label = 'Position',
}: {
  value: T
  onChange: (value: T) => void
  options?: T[]
  label?: string
}) {
  const name = useId()
  const rows = options.length === 6 ? 2 : 3
  return (
    <fieldset className="anchor-picker">
      <legend>{label}</legend>
      <div className="anchor-grid" style={{ gridTemplateRows: `repeat(${rows}, 26px)` }}>
        {options.map((anchor) => (
          <label key={anchor} className={value === anchor ? 'is-on' : ''} title={anchor.replace('-', ' ')}>
            <input type="radio" name={name} checked={value === anchor} onChange={() => onChange(anchor)} />
            <span className="sr-only">{anchor.replace('-', ' ')}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
