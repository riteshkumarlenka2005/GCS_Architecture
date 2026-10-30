import type { ArchitectureManifest, DiagramDocument } from './diagramModel'
import type { Shape } from './shapeModel'

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) {
    throw new Error(`Canvas API request failed: ${response.status} ${path}`)
  }
  return (await response.json()) as T
}

export function fetchCanvasStore(): Promise<CanvasStoreState> {
  return request<CanvasStoreState>('/api/canvases')
}

export function reloadArchitectureFiles(): Promise<CanvasStoreState> {
  return request<CanvasStoreState>('/api/canvases/reload-all', {
    method: 'POST',
  })
}

export function reloadBatch1(): Promise<CanvasStoreState> {
  return reloadArchitectureFiles()
}

export function createCanvas(name?: string): Promise<CanvasStoreState> {
  return request<CanvasStoreState>('/api/canvases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(name ? { name } : {}),
  })
}

export function setActiveCanvas(id: string): Promise<CanvasStoreState> {
  return request<CanvasStoreState>('/api/canvases/active', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
}

export function renameCanvas(id: string, name: string): Promise<CanvasStoreState> {
  return request<CanvasStoreState>(`/api/canvases/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export function saveCanvasShapes(
  id: string,
  shapes: Shape[],
): Promise<CanvasStoreState> {
  return request<CanvasStoreState>(
    `/api/canvases/${encodeURIComponent(id)}/shapes`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shapes }),
    },
  )
}

export function saveCanvasDiagram(
  id: string,
  diagram: DiagramDocument | null,
): Promise<CanvasStoreState> {
  return request<CanvasStoreState>(
    `/api/canvases/${encodeURIComponent(id)}/diagram`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diagram }),
    },
  )
}

export function saveArchitectureManifest(
  manifest: ArchitectureManifest,
): Promise<CanvasStoreState> {
  return request<CanvasStoreState>('/api/canvases/manifest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ manifest }),
  })
}
