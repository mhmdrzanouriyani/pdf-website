/** Per-browser UI preferences (convenience only — never required for correctness). */
const PREFIX = 'pdfly:'

export function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(PREFIX + key) as T | null) ?? fallback
  } catch {
    return fallback
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(PREFIX + key, value)
  } catch {
    // Storage blocked (private mode): the preference just isn't remembered.
  }
}
