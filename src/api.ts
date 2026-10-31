import type { ArchitectureManifest, DiagramDocument } from './diagramModel'
import type { Shape } from './shapeModel'
import { getStaticArchitectureStore } from './staticData'

export interface CanvasMeta {
  id: string
  name: string
  shapes: Shape[]
  diagram: DiagramDocument | null
}

export interface CanvasStoreState {
  canvases: CanvasMeta[]
  activeId: string
  manifest: ArchitectureManifest | null
}

const STORAGE_KEY = 'gcs_canvas_store_v3'

let memoryState: CanvasStoreState | null = null

function getLocalState(): CanvasStoreState {
  if (memoryState) return memoryState

  const fresh = getStaticArchitectureStore()

  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem('gcs_canvas_store_v2') ??
      localStorage.getItem('gcs_canvas_store_v1')

    if (raw) {
      const parsed = JSON.parse(raw) as CanvasStoreState
      if (parsed && Array.isArray(parsed.canvases) && parsed.canvases.length > 0) {
        const existingMap = new Map(parsed.canvases.map((c) => [c.id, c]))

        // Merge fresh static architecture files with cached visual state
        const mergedArchitecture = fresh.canvases.map((freshCanvas) => {
          const existing = existingMap.get(freshCanvas.id)
          if (!existing) return freshCanvas
          return {
            ...existing,
            name: freshCanvas.name || existing.name,
            diagram: existing.diagram ?? freshCanvas.diagram,
          }
        })

        // Retain any user-created custom canvases (such as Canvas 13 or custom scratchpads)
        const customCanvases = parsed.canvases.filter(
          (c) => !fresh.canvases.some((f) => f.id === c.id),
        )

        memoryState = {
          canvases: [...mergedArchitecture, ...customCanvases],
          activeId: existingMap.has(parsed.activeId)
            ? parsed.activeId
            : fresh.activeId,
          manifest: fresh.manifest || parsed.manifest,
        }
        persistLocalState(memoryState)
        return memoryState
      }
    }
  } catch {
    // Ignore localStorage read errors
  }

  memoryState = fresh
  persistLocalState(memoryState)
  return memoryState
}

function persistLocalState(state: CanvasStoreState) {
  memoryState = state
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore localStorage write quota errors
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) {
    throw new Error(`Canvas API request failed: ${response.status} ${path}`)
  }
  return (await response.json()) as T
}

export async function fetchCanvasStore(): Promise<CanvasStoreState> {
  try {
    const remote = await request<CanvasStoreState>('/api/canvases')
    persistLocalState(remote)
    return remote
  } catch {
    return getLocalState()
  }
}

export async function reloadArchitectureFiles(): Promise<CanvasStoreState> {
  try {
    const remote = await request<CanvasStoreState>('/api/canvases/reload-all', {
      method: 'POST',
    })
    persistLocalState(remote)
    return remote
  } catch {
    memoryState = null
    const fresh = getStaticArchitectureStore()
    const current = getLocalState()
    // Retain user's custom canvases (such as scratchpad or custom canvases)
    const customCanvases = current.canvases.filter(
      (c) => !fresh.canvases.some((f) => f.id === c.id),
    )
    const merged: CanvasStoreState = {
      canvases: [...fresh.canvases, ...customCanvases],
      activeId: fresh.activeId || current.activeId,
      manifest: fresh.manifest || current.manifest,
    }
    persistLocalState(merged)
    return merged
  }
}

export function reloadBatch1(): Promise<CanvasStoreState> {
  return reloadArchitectureFiles()
}

export async function createCanvas(name?: string): Promise<CanvasStoreState> {
  try {
    const remote = await request<CanvasStoreState>('/api/canvases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(name ? { name } : {}),
    })
    persistLocalState(remote)
    return remote
  } catch {
    const state = getLocalState()
    const canvasName = name?.trim() || `Canvas ${state.canvases.length + 1}`
    const newCanvas: CanvasMeta = {
      id: `canvas-${Date.now().toString(36)}-${state.canvases.length + 1}`,
      name: canvasName,
      shapes: [],
      diagram: null,
    }
    const updated: CanvasStoreState = {
      ...state,
      canvases: [...state.canvases, newCanvas],
      activeId: newCanvas.id,
    }
    persistLocalState(updated)
    return updated
  }
}

export async function setActiveCanvas(id: string): Promise<CanvasStoreState> {
  try {
    const remote = await request<CanvasStoreState>('/api/canvases/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    persistLocalState(remote)
    return remote
  } catch {
    const state = getLocalState()
    if (state.canvases.some((c) => c.id === id)) {
      const updated: CanvasStoreState = { ...state, activeId: id }
      persistLocalState(updated)
      return updated
    }
    return state
  }
}

export async function renameCanvas(id: string, name: string): Promise<CanvasStoreState> {
  try {
    const remote = await request<CanvasStoreState>(`/api/canvases/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    persistLocalState(remote)
    return remote
  } catch {
    const state = getLocalState()
    const trimmed = name.trim()
    if (!trimmed) return state
    const updated: CanvasStoreState = {
      ...state,
      canvases: state.canvases.map((c) => (c.id === id ? { ...c, name: trimmed } : c)),
    }
    persistLocalState(updated)
    return updated
  }
}

export async function saveCanvasShapes(
  id: string,
  shapes: Shape[],
): Promise<CanvasStoreState> {
  try {
    const remote = await request<CanvasStoreState>(
      `/api/canvases/${encodeURIComponent(id)}/shapes`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shapes }),
      },
    )
    persistLocalState(remote)
    return remote
  } catch {
    const state = getLocalState()
    const updated: CanvasStoreState = {
      ...state,
      canvases: state.canvases.map((c) => (c.id === id ? { ...c, shapes } : c)),
    }
    persistLocalState(updated)
    return updated
  }
}

export async function saveCanvasDiagram(
  id: string,
  diagram: DiagramDocument | null,
): Promise<CanvasStoreState> {
  try {
    const remote = await request<CanvasStoreState>(
      `/api/canvases/${encodeURIComponent(id)}/diagram`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diagram }),
      },
    )
    persistLocalState(remote)
    return remote
  } catch {
    const state = getLocalState()
    const updated: CanvasStoreState = {
      ...state,
      canvases: state.canvases.map((c) => (c.id === id ? { ...c, diagram } : c)),
    }
    persistLocalState(updated)
    return updated
  }
}

export async function saveArchitectureManifest(
  manifest: ArchitectureManifest,
): Promise<CanvasStoreState> {
  try {
    const remote = await request<CanvasStoreState>('/api/canvases/manifest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manifest }),
    })
    persistLocalState(remote)
    return remote
  } catch {
    const state = getLocalState()
    const updated: CanvasStoreState = { ...state, manifest }
    persistLocalState(updated)
    return updated
  }
}
