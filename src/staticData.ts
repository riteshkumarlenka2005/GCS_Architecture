import type { CanvasMeta, CanvasStoreState } from './api'
import type { ArchitectureManifest, DiagramDocument } from './diagramModel'

interface RawDiagram {
  documentId?: string
  title?: string
  diagramType?: string
  category?: string
  [key: string]: unknown
}

const orderPriority: Record<string, number> = {
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
}

// Import all GRAVITAS-HLD JSON files as raw strings so that empty placeholder
// files (filled in later) are skipped gracefully without crashing the build.
const rawJsonModules = import.meta.glob<string>(
  '../GRAVITAS-HLD/**/*.json',
  { eager: true, query: '?raw', import: 'default' },
)

export function getStaticArchitectureStore(): CanvasStoreState {
  let manifest: ArchitectureManifest | null = null
  const canvases: CanvasMeta[] = []

  for (const [filePath, rawContent] of Object.entries(rawJsonModules)) {
    // Skip empty placeholder files — they will be picked up once filled in
    if (!rawContent || !rawContent.trim()) continue

    let content: RawDiagram
    try {
      content = JSON.parse(rawContent) as RawDiagram
    } catch {
      // Skip malformed JSON silently
      continue
    }

    if (!content || typeof content !== 'object') continue

    if (filePath.includes('00_manifest.json')) {
      manifest = content as unknown as ArchitectureManifest
      continue
    }

    if (content.documentId) {
      canvases.push({
        id: content.documentId,
        name: content.title || content.documentId,
        shapes: [],
        diagram: content as unknown as DiagramDocument,
      })
    }
  }

  canvases.sort((a, b) => {
    const prioA = orderPriority[a.id] ?? 999
    const prioB = orderPriority[b.id] ?? 999
    if (prioA !== prioB) return prioA - prioB
    return a.id.localeCompare(b.id)
  })

  canvases.push({
    id: 'scratchpad',
    name: 'Free Scratchpad',
    shapes: [],
    diagram: null,
  })

  const activeId = canvases.length > 0 ? canvases[0].id : 'scratchpad'

  return {
    canvases,
    activeId,
    manifest,
  }
}

