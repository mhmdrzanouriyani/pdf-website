// Starts the API server and the Vite dev server together (cross-platform, no extra deps).
import { spawn } from 'node:child_process'

const isWin = process.platform === 'win32'
const npx = isWin ? 'npx.cmd' : 'npx'
const procs = [
  spawn(npx, ['tsx', 'watch', '--clear-screen=false', 'server/index.ts'], { stdio: 'inherit', shell: isWin }),
  spawn(npx, ['vite'], { stdio: 'inherit', shell: isWin }),
]
const stop = () => {
  for (const p of procs) if (!p.killed) p.kill()
  process.exit()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const p of procs) p.on('exit', (code) => { if (code && code !== 0) stop() })
