import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

interface CanvasRecord {
  id: string
  name: string
  shapes: unknown[]
  diagram: unknown | null
}

const ORDER_PRIORITY: Record<string, number> = {
  'doc-master-01': 1,
  'doc-master-02': 2,
  'doc-master-03': 3,
  'doc-core-01': 10,
  'doc-core-02': 11,
  'doc-core-03': 12,
  'doc-core-04': 13,
  'doc-core-05': 14,
  'doc-comm-01': 20,
  'doc-comm-02': 21,
  'doc-comm-03': 22,
  'doc-comm-04': 23,
  'doc-comm-05': 24,
  'doc-cop-01': 30,
  'doc-cop-02': 31,
  'doc-cop-03': 32,
  'doc-cop-04': 33,
  'doc-plan-01': 40,
  'doc-plan-02': 41,
  'doc-plan-03': 42,
  'doc-plan-04': 43,
  'doc-plan-05': 44,
  'doc-ops-01': 50,
  'doc-ops-02': 51,
  'doc-ops-03': 52,
  'doc-ops-04': 53,
  'doc-ops-05': 54,
  'doc-sensor-01': 60,
  'doc-sensor-02': 61,
  'doc-sensor-03': 62,
  'doc-payload-01': 63,
}

function loadArchitectureData() {
  const root = process.cwd()
  let loadedManifest: unknown | null = null
  const loadedCanvases: CanvasRecord[] = []
  const hldDir = path.join(root, 'GRAVITAS-HLD')

  const manifestPath = path.join(hldDir, 'manifest', '00_manifest.json')
  if (fs.existsSync(manifestPath)) {
    try {
      loadedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    } catch (e) {
      console.error('Failed to read manifest:', e)
    }
  }

  // Scan all directories in GRAVITAS-HLD for valid, non-empty diagram JSON files
  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        scanDir(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.includes('manifest')) {
        try {
          const stats = fs.statSync(fullPath)
          if (stats.size === 0) continue // Skip empty template files
          const raw = fs.readFileSync(fullPath, 'utf8')
          if (!raw.trim()) continue
          const parsed = JSON.parse(raw) as {
            documentId?: string
            title?: string
            diagramType?: string
            category?: string
          }
          if (parsed && typeof parsed === 'object' && parsed.documentId) {
            loadedCanvases.push({
              id: parsed.documentId,
              name: parsed.title || parsed.documentId,
              shapes: [],
              diagram: parsed,
            })
          }
        } catch (e) {
          console.error(`Failed to read ${entry.name}:`, e)
        }
      }
    }
  }

  scanDir(hldDir)

  loadedCanvases.sort((a, b) => {
    const prioA = ORDER_PRIORITY[a.id] ?? 999
    const prioB = ORDER_PRIORITY[b.id] ?? 999
    if (prioA !== prioB) return prioA - prioB
    return a.id.localeCompare(b.id)
  })

  return { loadedManifest, loadedCanvases }
}

const initial = loadArchitectureData()
const canvases: CanvasRecord[] = [
  ...initial.loadedCanvases,
]
let activeId = initial.loadedCanvases.length > 0 ? initial.loadedCanvases[0].id : 'canvas-1'
let manifest: unknown | null = initial.loadedManifest
let counter = 1

function storeState() {
  return { canvases, activeId, manifest }
}

function readJsonBody(
  req: IncomingMessage,
  done: (body: Record<string, unknown> | null) => void,
) {
  const chunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => {
    chunks.push(chunk)
  })
  req.on('end', () => {
    try {
      const text = Buffer.concat(chunks).toString('utf8')
      done(text ? (JSON.parse(text) as Record<string, unknown>) : null)
    } catch {
      done(null)
    }
  })
}

function handleCanvasApi(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json')
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname

  // GET /api/canvases
  if (req.method === 'GET' && path === '/') {
    res.end(JSON.stringify(storeState()))
    return
  }

  // POST /api/canvases/reload-batch-1 or /api/canvases/reload-all
  if (req.method === 'POST' && (path === '/reload-batch-1' || path === '/reload-all')) {
    const fresh = loadArchitectureData()
    manifest = fresh.loadedManifest
    for (const c of fresh.loadedCanvases) {
      const idx = canvases.findIndex((x) => x.id === c.id)
      if (idx >= 0) canvases[idx] = c
      else canvases.push(c)
    }
    // Sort canvases to maintain order
    canvases.sort((a, b) => {
      if (a.id === 'scratchpad') return 1
      if (b.id === 'scratchpad') return -1
      const prioA = ORDER_PRIORITY[a.id] ?? 999
      const prioB = ORDER_PRIORITY[b.id] ?? 999
      if (prioA !== prioB) return prioA - prioB
      return a.id.localeCompare(b.id)
    })
    res.end(JSON.stringify(storeState()))
    return
  }

  // POST /api/canvases
  if (req.method === 'POST' && path === '/') {
    readJsonBody(req, (body) => {
      const rawName = body?.name
      const name =
        typeof rawName === 'string' && rawName.trim()
          ? rawName.trim()
          : `Canvas ${++counter}`
      const canvas: CanvasRecord = {
        id: `canvas-${Date.now().toString(36)}-${counter}`,
        name,
        shapes: [],
        diagram: null,
      }
      canvases.push(canvas)
      activeId = canvas.id
      res.end(JSON.stringify(storeState()))
    })
    return
  }

  // POST /api/canvases/active
  if (req.method === 'POST' && path === '/active') {
    readJsonBody(req, (body) => {
      const id = body?.id
      if (typeof id === 'string' && canvases.some((c) => c.id === id)) {
        activeId = id
      }
      res.end(JSON.stringify(storeState()))
    })
    return
  }

  // POST /api/canvases/manifest
  if (req.method === 'POST' && path === '/manifest') {
    readJsonBody(req, (body) => {
      if (body && 'manifest' in body) manifest = body.manifest
      res.end(JSON.stringify(storeState()))
    })
    return
  }

  // PUT /api/canvases/:id/diagram
  if (
    req.method === 'PUT' &&
    path.endsWith('/diagram') &&
    path.length > '/diagram'.length
  ) {
    const id = decodeURIComponent(path.slice(1, path.length - '/diagram'.length))
    readJsonBody(req, (body) => {
      const canvas = canvases.find((c) => c.id === id)
      if (canvas && body && 'diagram' in body) canvas.diagram = body.diagram
      res.end(JSON.stringify(storeState()))
    })
    return
  }

  // PUT /api/canvases/:id/shapes
  if (
    req.method === 'PUT' &&
    path.endsWith('/shapes') &&
    path.length > '/shapes'.length
  ) {
    const id = decodeURIComponent(path.slice(1, path.length - '/shapes'.length))
    readJsonBody(req, (body) => {
      const canvas = canvases.find((c) => c.id === id)
      if (canvas && Array.isArray(body?.shapes)) {
        canvas.shapes = body.shapes
      }
      res.end(JSON.stringify(storeState()))
    })
    return
  }

  // PATCH /api/canvases/:id
  if (req.method === 'PATCH' && path.length > 1) {
    const id = decodeURIComponent(path.slice(1))
    readJsonBody(req, (body) => {
      const canvas = canvases.find((c) => c.id === id)
      const rawName = body?.name
      if (canvas && typeof rawName === 'string' && rawName.trim()) {
        canvas.name = rawName.trim()
      }
      res.end(JSON.stringify(storeState()))
    })
    return
  }

  res.statusCode = 404
  res.end(JSON.stringify({ error: 'Not found' }))
}

function canvasStorePlugin(): Plugin {
  return {
    name: 'canvas-session-store',
    configureServer(server) {
      server.middlewares.use('/api/canvases', handleCanvasApi)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/canvases', handleCanvasApi)
    },
  }
}

export default defineConfig({
  plugins: [react(), canvasStorePlugin()],
})
