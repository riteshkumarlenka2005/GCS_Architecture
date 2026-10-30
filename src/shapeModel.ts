// Canvas shape data model and pure drag math. Kept separate from the
// component file so both the app and the export generator can use it
// without hurting fast refresh.

export type ShapeType = 'rect' | 'oval' | 'circle' | 'triangle' | 'arrow' | 'line'

export type HitKind = 'body' | 'resize' | 'p1' | 'p2' | 'bend'

export interface RectShape {
  id: string
  type: 'rect'
  x: number
  y: number
  w: number
  h: number
  stroke?: string
  fill?: string
  text?: string
}

export interface OvalShape {
  id: string
  type: 'oval'
  x: number
  y: number
  w: number
  h: number
  stroke?: string
  fill?: string
  text?: string
}

export interface CircleShape {
  id: string
  type: 'circle'
  cx: number
  cy: number
  r: number
  stroke?: string
  fill?: string
  text?: string
}

export interface TriangleShape {
  id: string
  type: 'triangle'
  x: number
  y: number
  w: number
  h: number
  stroke?: string
  fill?: string
  text?: string
}

export interface PathShape {
  id: string
  type: 'arrow' | 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  bend: { x: number; y: number } | null
  stroke?: string
  text?: string
}

export type Shape =
  | RectShape
  | OvalShape
  | CircleShape
  | TriangleShape
  | PathShape

export function isPathShape(shape: Shape): shape is PathShape {
  return shape.type === 'arrow' || shape.type === 'line'
}

const MIN_SIZE = 10
const MIN_RADIUS = 5

// Default geometry for a freshly added shape, centered on a canvas point
export function createShape(type: ShapeType, cx: number, cy: number): Shape {
  const id = `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  switch (type) {
    case 'rect':
      return { id, type, x: cx - 60, y: cy - 40, w: 120, h: 80 }
    case 'oval':
      return { id, type, x: cx - 70, y: cy - 40, w: 140, h: 80 }
    case 'circle':
      return { id, type, cx, cy, r: 50 }
    case 'triangle':
      return { id, type, x: cx - 60, y: cy - 40, w: 120, h: 80 }
    case 'arrow':
    case 'line':
      return { id, type, x1: cx - 80, y1: cy, x2: cx + 80, y2: cy, bend: null }
  }
}

// Apply a drag delta (in canvas units) to a shape, depending on which
// part of the shape was grabbed. `origin` is the shape as it was when
// the gesture started, so each move is computed from the same base.
export function applyShapeDrag(
  origin: Shape,
  hit: HitKind,
  dx: number,
  dy: number,
): Shape {
  switch (origin.type) {
    case 'rect':
    case 'oval':
      if (hit === 'resize') {
        return {
          ...origin,
          w: Math.max(MIN_SIZE, origin.w + dx),
          h: Math.max(MIN_SIZE, origin.h + dy),
        }
      }
      return { ...origin, x: origin.x + dx, y: origin.y + dy }
    case 'circle':
      if (hit === 'resize') {
        return { ...origin, r: Math.max(MIN_RADIUS, origin.r + (dx + dy) / 2) }
      }
      return { ...origin, cx: origin.cx + dx, cy: origin.cy + dy }
    case 'triangle':
      if (hit === 'resize') {
        return {
          ...origin,
          w: Math.max(MIN_SIZE, origin.w + dx),
          h: Math.max(MIN_SIZE, origin.h + dy),
        }
      }
      return { ...origin, x: origin.x + dx, y: origin.y + dy }
    case 'arrow':
    case 'line': {
      if (hit === 'p1') {
        return { ...origin, x1: origin.x1 + dx, y1: origin.y1 + dy }
      }
      if (hit === 'p2') {
        return { ...origin, x2: origin.x2 + dx, y2: origin.y2 + dy }
      }
      if (hit === 'bend') {
        // A path without a bend yet starts bending from its midpoint
        const mid = origin.bend ?? {
          x: (origin.x1 + origin.x2) / 2,
          y: (origin.y1 + origin.y2) / 2,
        }
        return { ...origin, bend: { x: mid.x + dx, y: mid.y + dy } }
      }
      return {
        ...origin,
        x1: origin.x1 + dx,
        y1: origin.y1 + dy,
        x2: origin.x2 + dx,
        y2: origin.y2 + dy,
        bend: origin.bend
          ? { x: origin.bend.x + dx, y: origin.bend.y + dy }
          : null,
      }
    }
  }
}
