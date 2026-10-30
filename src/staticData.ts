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
}

// Only eagerly import JSON files that are known-populated (non-empty).
// Empty stub files cause build-time EOF parse errors with eager glob imports.
const populatedJsonModules = import.meta.glob<RawDiagram>(
  [
    '../GRAVITAS-HLD/manifest/*.json',
    '../GRAVITAS-HLD/master/*.json',
    '../GRAVITAS-HLD/core/*.json',
    '../GRAVITAS-HLD/communications/comm-01-transport-connectivity.json',
    '../GRAVITAS-HLD/communications/comm-02-multi-network.json',
    '../GRAVITAS-HLD/communications/comm-03-link-monitoring.json',
  ],
  { eager: true },
)

export function getStaticArchitectureStore(): CanvasStoreState {
  let manifest: ArchitectureManifest | null = null
  const canvases: CanvasMeta[] = []

  for (const [filePath, content] of Object.entries(populatedJsonModules)) {
    if (!content || typeof content !== 'object') continue

    if (filePath.includes('00_manifest.json')) {
      manifest = content as unknown as ArchitectureManifest
      continue
    }

    const doc = content as RawDiagram
    if (doc.documentId) {
      canvases.push({
        id: doc.documentId,
        name: doc.title || doc.documentId,
        shapes: [],
        diagram: doc as unknown as DiagramDocument,
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

