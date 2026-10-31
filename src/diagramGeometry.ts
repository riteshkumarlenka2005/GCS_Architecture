// Pure layout and SVG path math for imported architecture diagrams.
// Nothing in this module mutates the source document.

import type {
  Bounds,
  DiagramDocument,
  DiagramEdge,
  DiagramGroup,
  DiagramNode,
  DiagramNodeMetadata,
  DiagramPort,
  ExternalReference,
  Point,
} from './diagramModel'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface RenderNode {
  node: DiagramNode
  ghost: boolean
  external?: ExternalReference
}

export interface EdgeAnchor {
  point: Point
  side: DiagramPort['side']
}

export interface EdgeRoute {
  points: Point[]
  path: string
  labelPoint: Point
}

const EMPTY_METADATA: DiagramNodeMetadata = {
  engineId: null,
  requirementIds: [],
  responsibilities: [],
  inputs: [],
  outputs: [],
  constraints: [],
  failureModes: [],
  technologyNotes: null,
  assumptions: [],
  unresolvedDecisions: [],
  notes: '',
}

export function normalizeDiagramDocument(raw: DiagramDocument): DiagramDocument {
  if (!raw || typeof raw !== 'object') return raw

  const nodes: DiagramNode[] = (raw.nodes || []).map((rawNode) => {
    const node = rawNode as Record<string, unknown>
    const id = (node.id as string) || (node.nodeId as string) || ''
    const nodeId = (node.nodeId as string) || (node.id as string) || ''
    const engines = Array.isArray(node.engines)
      ? ([...node.engines] as string[])
      : (typeof node.engineId === 'string' ? [node.engineId] : [])
    const engineId = (node.engineId as string) || (engines.length > 0 ? engines[0] : undefined)

    const rawStyle = (node.style as Record<string, unknown>) || {}
    const style: DiagramNode['style'] = {
      shape: (rawStyle.shape as DiagramNode['style']['shape']) || 'rounded-rectangle',
      category: (rawStyle.category as string) || 'other',
      color: (rawStyle.color as string) || (rawStyle.fill as string) || '#1e293b',
      borderColor: (rawStyle.borderColor as string) || (rawStyle.stroke as string) || '#64748b',
      borderWidth: typeof rawStyle.borderWidth === 'number'
        ? rawStyle.borderWidth
        : (typeof rawStyle.strokeWidth === 'number' ? rawStyle.strokeWidth : 2),
      opacity: typeof rawStyle.opacity === 'number' ? rawStyle.opacity : 1,
      borderStyle: (rawStyle.borderStyle as 'solid' | 'dashed' | 'dotted') || (rawStyle.dash === 'dashed' ? 'dashed' : rawStyle.dash === 'dotted' ? 'dotted' : 'solid'),
      fontSize: (rawStyle.fontSize as number) || 13,
      textColor: (rawStyle.textColor as string) || '#cbd5e1',
      icon: (rawStyle.icon as string) ?? null,
      ...rawStyle,
    }

    const ports: DiagramPort[] = ((node.ports as Array<Record<string, unknown>>) || []).map((rawPort) => {
      const portId = (rawPort.portId as string) || (rawPort.id as string) || ''
      const pid = (rawPort.id as string) || (rawPort.portId as string) || ''
      const rawPos = rawPort.position
      let side: DiagramPort['side'] = rawPort.side as DiagramPort['side']
      if (!side) {
        if (typeof rawPos === 'string' && (rawPos === 'left' || rawPos === 'right' || rawPos === 'top' || rawPos === 'bottom')) {
          side = rawPos
        } else if (rawPos && typeof rawPos === 'object' && 'side' in rawPos && typeof (rawPos as Record<string, unknown>).side === 'string') {
          side = (rawPos as Record<string, unknown>).side as DiagramPort['side']
        } else {
          side = 'right'
        }
      }
      return {
        ...rawPort,
        id: pid,
        portId,
        direction: (rawPort.direction as DiagramPort['direction']) || 'inout',
        side,
        position: rawPort.position ?? { offset: typeof rawPort.offset === 'number' ? rawPort.offset : 0.5 },
      } as DiagramPort
    })

    const rawMeta = (node.metadata as Record<string, unknown>) || {}
    const metadata: DiagramNodeMetadata = {
      ...EMPTY_METADATA,
      ...rawMeta,
      engineId: engineId ?? null,
      engineIds: engines,
    }

    return {
      ...node,
      id,
      nodeId,
      groupId: (node.groupId as string) ?? null,
      engines,
      engineId,
      style,
      ports,
      metadata,
    } as DiagramNode
  })

  const groups: DiagramGroup[] = ((raw.groups as Array<Record<string, unknown>>) || []).map((rawGroup) => {
    const id = (rawGroup.id as string) || (rawGroup.groupId as string) || ''
    const groupId = (rawGroup.groupId as string) || (rawGroup.id as string) || ''
    const rawStyle = (rawGroup.style as Record<string, unknown>) || {}
    const style = {
      backgroundColor: (rawStyle.backgroundColor as string) || (rawStyle.fill as string) || '#1e293b',
      borderColor: (rawStyle.borderColor as string) || (rawStyle.stroke as string) || '#475569',
      borderWidth: typeof rawStyle.borderWidth === 'number'
        ? rawStyle.borderWidth
        : (typeof rawStyle.strokeWidth === 'number' ? rawStyle.strokeWidth : 1),
      borderStyle: (rawStyle.borderStyle as 'solid' | 'dashed' | 'dotted') || (rawStyle.dash === 'dashed' ? 'dashed' : rawStyle.dash === 'dotted' ? 'dotted' : 'solid'),
      opacity: typeof rawStyle.opacity === 'number' ? rawStyle.opacity : 0.12,
      padding: typeof rawStyle.padding === 'number' ? rawStyle.padding : 30,
      ...rawStyle,
    }

    return {
      ...rawGroup,
      id,
      groupId,
      nodeIds: Array.isArray(rawGroup.nodeIds) ? ([...rawGroup.nodeIds] as string[]) : [],
      style,
    } as DiagramGroup
  })

  const edges: DiagramEdge[] = ((raw.edges as Array<Record<string, unknown>>) || []).map((rawEdge) => {
    const id = (rawEdge.id as string) || (rawEdge.edgeId as string) || ''
    const edgeId = (rawEdge.edgeId as string) || (rawEdge.id as string) || ''
    const rawSem = (rawEdge.semantic as Record<string, unknown>) || {}
    const semType = rawSem.type === 'control' ? 'control-flow' : ((rawSem.type as any) || 'data-flow')

    const semantic = {
      type: semType,
      label: (rawSem.label as string) || '',
      direction: (rawSem.direction as 'unidirectional' | 'bidirectional') || 'unidirectional',
      description: (rawSem.description as string) || '',
      ...rawSem,
    }

    const rawVis = (rawEdge.visual as Record<string, unknown>) || {}
    const visual = {
      routing: (rawVis.routing as 'orthogonal' | 'straight' | 'curved') || 'orthogonal',
      stroke: (rawVis.stroke as string) || '#64748b',
      strokeWidth: typeof rawVis.strokeWidth === 'number' ? rawVis.strokeWidth : 2,
      dash: (rawVis.dash as 'solid' | 'dashed' | 'dotted') || 'solid',
      arrow: (rawVis.arrow as 'none' | 'end' | 'start' | 'both') || (semantic.direction === 'bidirectional' ? 'both' : 'end'),
      waypoints: Array.isArray(rawVis.waypoints) ? ([...rawVis.waypoints] as Point[]) : [],
      ...rawVis,
    }

    return {
      ...rawEdge,
      id,
      edgeId,
      source: (rawEdge.source as string) || '',
      target: (rawEdge.target as string) || '',
      sourcePort: (rawEdge.sourcePort as string) || null,
      targetPort: (rawEdge.targetPort as string) || null,
      semantic,
      visual,
    } as DiagramEdge
  })

  const externalReferences: ExternalReference[] = ((raw.externalReferences as Array<Record<string, unknown>>) || []).map((rawRef) => {
    const nodeId = (rawRef.nodeId as string) || (rawRef.id as string) || ''
    const rawStyle = (rawRef.style as Record<string, unknown>) || {}
    const style = {
      shape: (rawStyle.shape as DiagramNode['style']['shape']) || 'rounded-rectangle',
      category: (rawStyle.category as string) || 'external',
      color: (rawStyle.color as string) || (rawStyle.fill as string) || '#1e293b',
      borderColor: (rawStyle.borderColor as string) || (rawStyle.stroke as string) || '#64748b',
      borderWidth: typeof rawStyle.borderWidth === 'number'
        ? rawStyle.borderWidth
        : (typeof rawStyle.strokeWidth === 'number' ? rawStyle.strokeWidth : 2),
      borderStyle: (rawStyle.borderStyle as 'solid' | 'dashed' | 'dotted') || (rawStyle.dash === 'dashed' ? 'dashed' : 'dashed'),
      opacity: typeof rawStyle.opacity === 'number' ? rawStyle.opacity : 0.72,
      fontSize: (rawStyle.fontSize as number) || 13,
      textColor: (rawStyle.textColor as string) || '#cbd5e1',
      icon: (rawStyle.icon as string) ?? null,
      ...rawStyle,
    }

    return {
      ...rawRef,
      nodeId,
      style,
    } as ExternalReference
  })

  return {
    ...raw,
    nodes,
    groups,
    edges,
    externalReferences,
  }
}

export function getNodeCenter(node: DiagramNode): Point {
  const x = node.position?.x ?? 0
  const y = node.position?.y ?? 0
  const width = node.size?.width ?? 0
  const height = node.size?.height ?? 0
  return {
    x: x + width / 2,
    y: y + height / 2,
  }
}

export function getGroupBounds(
  group: DiagramGroup,
  nodes: DiagramNode[] = [],
): Bounds {
  if (
    group.bounds &&
    typeof group.bounds.x === 'number' &&
    typeof group.bounds.y === 'number' &&
    typeof group.bounds.width === 'number' &&
    typeof group.bounds.height === 'number' &&
    !isNaN(group.bounds.x)
  ) {
    return group.bounds
  }

  // Derive bounds from member nodes (matching group.nodeIds or node.groupId)
  const nodeIds = new Set<string>(
    Array.isArray(group.nodeIds) ? group.nodeIds : [],
  )
  const memberNodes = (nodes || []).filter(
    (n) =>
      Boolean(n) &&
      (nodeIds.has(n.id) || n.groupId === group.id) &&
      n.position &&
      typeof n.position.x === 'number' &&
      !isNaN(n.position.x) &&
      typeof n.position.y === 'number' &&
      !isNaN(n.position.y) &&
      n.size &&
      typeof n.size.width === 'number' &&
      typeof n.size.height === 'number',
  )

  if (memberNodes.length > 0) {
    const xs = memberNodes.map((n) => n.position.x)
    const ys = memberNodes.map((n) => n.position.y)
    const rights = memberNodes.map((n) => n.position.x + n.size.width)
    const bottoms = memberNodes.map((n) => n.position.y + n.size.height)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...rights)
    const maxY = Math.max(...bottoms)
    const padding =
      typeof group.style?.padding === 'number' ? group.style.padding : 30
    const headerHeight = 36
    return {
      x: minX - padding,
      y: minY - padding - headerHeight,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2 + headerHeight,
    }
  }

  return { x: 50, y: 50, width: 400, height: 300 }
}

export function getDiagramBounds(document: DiagramDocument): Bounds {
  const groupBoxes: Bounds[] = (document.groups || [])
    .map((group) => getGroupBounds(group, document.nodes))
    .filter(
      (box): box is Bounds =>
        Boolean(box && typeof box.x === 'number' && !isNaN(box.x)),
    )

  const nodeBoxes: Bounds[] = (document.nodes || [])
    .filter(
      (node) =>
        node &&
        node.position &&
        typeof node.position.x === 'number' &&
        !isNaN(node.position.x) &&
        node.size,
    )
    .map((node) => ({
      x: node.position.x,
      y: node.position.y,
      width: node.size.width,
      height: node.size.height,
    }))

  const boxes: Bounds[] = [...groupBoxes, ...nodeBoxes]
  if (!boxes.length) return { x: 0, y: 0, width: 0, height: 0 }
  const minX = Math.min(...boxes.map((box) => box.x))
  const minY = Math.min(...boxes.map((box) => box.y))
  const maxX = Math.max(...boxes.map((box) => box.x + box.width))
  const maxY = Math.max(...boxes.map((box) => box.y + box.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function getGroupDescendantIds(
  groupId: string,
  groups: DiagramGroup[],
  nodes: DiagramNode[],
): { nodeIds: Set<string>; groupIds: Set<string> } {
  const groupIds = new Set<string>([groupId])
  let added = true
  while (added) {
    added = false
    for (const g of groups) {
      if (g.parentGroupId && groupIds.has(g.parentGroupId) && !groupIds.has(g.id)) {
        groupIds.add(g.id)
        added = true
      }
    }
  }
  const nodeIds = new Set<string>()
  for (const n of nodes) {
    if (n.groupId && groupIds.has(n.groupId)) {
      nodeIds.add(n.id)
    }
  }
  // Also include nodes directly listed in group.nodeIds
  for (const g of groups) {
    if (groupIds.has(g.id) && Array.isArray(g.nodeIds)) {
      for (const id of g.nodeIds) {
        nodeIds.add(id)
      }
    }
  }
  return { nodeIds, groupIds }
}

export function calculateResizedBounds(
  origin: Bounds,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  minWidth = 100,
  minHeight = 40,
): Bounds {
  let { x, y, width, height } = origin

  // Horizontal resizing
  if (handle === 'e' || handle === 'ne' || handle === 'se') {
    width = Math.max(minWidth, origin.width + dx)
  } else if (handle === 'w' || handle === 'nw' || handle === 'sw') {
    const rawW = origin.width - dx
    width = Math.max(minWidth, rawW)
    x = origin.x + (origin.width - width)
  }

  // Vertical resizing
  if (handle === 's' || handle === 'se' || handle === 'sw') {
    height = Math.max(minHeight, origin.height + dy)
  } else if (handle === 'n' || handle === 'nw' || handle === 'ne') {
    const rawH = origin.height - dy
    height = Math.max(minHeight, rawH)
    y = origin.y + (origin.height - height)
  }

  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    width: Math.round(width * 10) / 10,
    height: Math.round(height * 10) / 10,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// External Reference Ghost Node Layout (collision-aware, multi-column)
// ─────────────────────────────────────────────────────────────────────────────
const GHOST_CARD_WIDTH = 220
const GHOST_CARD_HEIGHT = 90
const GHOST_COL_GAP = 48
const GHOST_ROW_GAP = 24
const GHOST_EDGE_MARGIN = 60
const GHOST_MAX_PER_COL = 6

interface GhostPlacement {
  nodeId: string
  x: number
  y: number
  width: number
  height: number
}

function ghostOverlaps(a: GhostPlacement, b: GhostPlacement): boolean {
  return (
    a.x < b.x + b.width + 8 &&
    a.x + a.width + 8 > b.x &&
    a.y < b.y + b.height + 8 &&
    a.y + a.height + 8 > b.y
  )
}

export function calculateExternalReferenceLayout(
  document: DiagramDocument,
): Map<string, { x: number; y: number }> {
  const bounds = getDiagramBounds(document)
  const refs = document.externalReferences || []
  const result = new Map<string, { x: number; y: number }>()
  const placed: GhostPlacement[] = []

  // Separate manually positioned from auto-layout
  const manual: ExternalReference[] = []
  const auto: ExternalReference[] = []
  for (const ref of refs) {
    if (ref.position && typeof ref.position.x === 'number' && typeof ref.position.y === 'number') {
      manual.push(ref)
    } else {
      auto.push(ref)
    }
  }

  // Place manual references first (preserve their positions, detect conflicts)
  for (const ref of manual) {
    const pos = ref.position as { x: number; y: number }
    const card: GhostPlacement = { nodeId: ref.nodeId, x: pos.x, y: pos.y, width: GHOST_CARD_WIDTH, height: GHOST_CARD_HEIGHT }
    placed.push(card)
    result.set(ref.nodeId, { x: pos.x, y: pos.y })
  }

  // Divide auto refs into "source" side (left column) and "target" side (right column)
  const leftRefs: ExternalReference[] = []
  const rightRefs: ExternalReference[] = []
  for (const ref of auto) {
    if (ref.role === 'source') {
      leftRefs.push(ref)
    } else {
      rightRefs.push(ref)
    }
  }

  // Layout one side at a time
  function layoutSide(sideRefs: ExternalReference[], side: 'left' | 'right') {
    const anchorX =
      side === 'left'
        ? bounds.x - GHOST_EDGE_MARGIN - GHOST_CARD_WIDTH
        : bounds.x + bounds.width + GHOST_EDGE_MARGIN

    // Try to vertically center each ghost near the node it connects to
    const anchored = sideRefs.map((ref) => {
      const relatedEdges = (document.edges || []).filter(
        (e) => e.source === ref.nodeId || e.target === ref.nodeId,
      )
      let preferredY = bounds.y
      if (relatedEdges.length > 0) {
        const otherId = relatedEdges[0].source === ref.nodeId
          ? relatedEdges[0].target
          : relatedEdges[0].source
        const otherNode = (document.nodes || []).find((n) => n.id === otherId)
        if (otherNode) {
          preferredY = otherNode.position.y + otherNode.size.height / 2 - GHOST_CARD_HEIGHT / 2
        }
      }
      return { ref, preferredY }
    })

    // Sort by preferred Y so column reads top-to-bottom
    anchored.sort((a, b) => a.preferredY - b.preferredY)

    let colIndex = 0
    let rowInCol = 0
    let colStartY = bounds.y

    for (const { ref, preferredY } of anchored) {
      if (rowInCol >= GHOST_MAX_PER_COL) {
        colIndex += 1
        rowInCol = 0
        colStartY = bounds.y
      }

      const colOffset = side === 'left'
        ? -(colIndex * (GHOST_CARD_WIDTH + GHOST_COL_GAP))
        : colIndex * (GHOST_CARD_WIDTH + GHOST_COL_GAP)
      const x = anchorX + colOffset
      // Use preferred Y if not yet occupied, otherwise push down
      let y = rowInCol === 0 ? preferredY : colStartY

      // Check for collisions against all already placed cards
      let attempts = 0
      while (attempts < 100) {
        const candidate: GhostPlacement = { nodeId: ref.nodeId, x, y, width: GHOST_CARD_WIDTH, height: GHOST_CARD_HEIGHT }
        const collides = placed.some((p) => ghostOverlaps(candidate, p))
        if (!collides) break
        y += GHOST_CARD_HEIGHT + GHOST_ROW_GAP
        attempts++
      }

      colStartY = y + GHOST_CARD_HEIGHT + GHOST_ROW_GAP
      rowInCol++
      placed.push({ nodeId: ref.nodeId, x, y, width: GHOST_CARD_WIDTH, height: GHOST_CARD_HEIGHT })
      result.set(ref.nodeId, { x, y })
    }
  }

  layoutSide(leftRefs, 'left')
  layoutSide(rightRefs, 'right')

  // Any remaining auto refs that have neither role: place on right
  const assigned = new Set([...leftRefs, ...rightRefs].map((r) => r.nodeId))
  const unassigned = auto.filter((r) => !assigned.has(r.nodeId))
  layoutSide(unassigned, 'right')

  return result
}

function createGhostNode(
  reference: ExternalReference,
  layout: Map<string, { x: number; y: number }>,
): DiagramNode {
  const pos = layout.get(reference.nodeId)
  const x = pos?.x ?? 0
  const y = pos?.y ?? 0

  return {
    id: reference.nodeId,
    type: reference.type,
    label: reference.label,
    description:
      reference.description ??
      `External reference defined in ${reference.sourceDocumentId}`,
    groupId: null,
    position: { x, y },
    size: reference.size ?? { width: GHOST_CARD_WIDTH, height: GHOST_CARD_HEIGHT },
    style: {
      shape: reference.style?.shape ?? 'rounded-rectangle',
      category: reference.style?.category ?? 'external',
      color: reference.style?.color ?? '#64748b',
      borderColor: reference.style?.borderColor ?? '#64748b',
      borderWidth: reference.style?.borderWidth ?? 2,
      opacity: reference.style?.opacity ?? 0.72,
      icon: reference.style?.icon ?? null,
      fontSize: reference.style?.fontSize ?? 13,
      textColor: reference.style?.textColor ?? '#cbd5e1',
      borderStyle: reference.style?.borderStyle ?? 'dashed',
    },
    ports: reference.ports ?? [],
    metadata: reference.metadata ?? {
      ...EMPTY_METADATA,
      engineId: reference.engineId,
    },
  }
}

export function getRenderNodes(document: DiagramDocument): RenderNode[] {
  const layout = calculateExternalReferenceLayout(document)
  return [
    ...document.nodes.map((node) => ({ node, ghost: false })),
    ...document.externalReferences.map((reference) => ({
      node: createGhostNode(reference, layout),
      ghost: true,
      external: reference,
    })),
  ]
}

export function getPortPoint(node: DiagramNode, port: DiagramPort): EdgeAnchor {
  const { x, y } = node.position
  const { width, height } = node.size

  // Support both schema variations:
  // Variant A: { side: 'left', position: { offset: 0.5 } }
  // Variant B: { position: 'left' }
  const rawSide =
    port.side || (typeof port.position === 'string' ? port.position : undefined)
  const side: NonNullable<DiagramPort['side']> =
    rawSide === 'left' ||
    rawSide === 'right' ||
    rawSide === 'top' ||
    rawSide === 'bottom'
      ? rawSide
      : 'right'

  const rawOffset =
    typeof port.position === 'object' && port.position !== null
      ? (port.position as { offset?: number }).offset
      : 0.5
  const offset =
    typeof rawOffset === 'number' && !isNaN(rawOffset)
      ? Math.min(1, Math.max(0, rawOffset))
      : 0.5

  switch (side) {
    case 'left':
      return { point: { x, y: y + height * offset }, side: 'left' }
    case 'right':
      return { point: { x: x + width, y: y + height * offset }, side: 'right' }
    case 'top':
      return { point: { x: x + width * offset, y }, side: 'top' }
    case 'bottom':
      return { point: { x: x + width * offset, y: y + height }, side: 'bottom' }
  }
}

function getAutomaticAnchor(node: DiagramNode, toward: Point): EdgeAnchor {
  const center = getNodeCenter(node)
  const dx = toward.x - center.x
  const dy = toward.y - center.y
  if (dx === 0 && dy === 0) {
    return {
      point: { x: node.position.x + node.size.width, y: center.y },
      side: 'right',
    }
  }
  const halfWidth = node.size.width / 2
  const halfHeight = node.size.height / 2
  const xScale = dx === 0 ? Infinity : halfWidth / Math.abs(dx)
  const yScale = dy === 0 ? Infinity : halfHeight / Math.abs(dy)
  const scale = Math.min(xScale, yScale)
  const point = { x: center.x + dx * scale, y: center.y + dy * scale }
  const side: DiagramPort['side'] =
    xScale < yScale ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'top' : 'bottom'
  return { point, side }
}

function getEdgeAnchor(
  node: DiagramNode,
  portId: string | null,
  toward: Point,
): EdgeAnchor {
  const port = portId ? node.ports.find((item) => item.id === portId) : undefined
  return port ? getPortPoint(node, port) : getAutomaticAnchor(node, toward)
}

export function deduplicatePoints(points: Point[]): Point[] {
  return points.filter(
    (point, index) =>
      index === 0 ||
      point.x !== points[index - 1].x ||
      point.y !== points[index - 1].y,
  )
}

function orthogonalPoints(
  source: EdgeAnchor,
  target: EdgeAnchor,
  waypoints: Point[],
): Point[] {
  const start = source.point
  const end = target.point
  if (waypoints.length) return deduplicatePoints([start, ...waypoints, end])

  const sourceHorizontal = source.side === 'left' || source.side === 'right'
  const targetHorizontal = target.side === 'left' || target.side === 'right'
  let middle: Point[]
  if (sourceHorizontal && targetHorizontal) {
    const sameSide = source.side === target.side
    const midX = sameSide
      ? source.side === 'left'
        ? Math.min(start.x, end.x) - 40
        : Math.max(start.x, end.x) + 40
      : (start.x + end.x) / 2
    middle = [
      { x: midX, y: start.y },
      { x: midX, y: end.y },
    ]
  } else if (!sourceHorizontal && !targetHorizontal) {
    const sameSide = source.side === target.side
    const midY = sameSide
      ? source.side === 'top'
        ? Math.min(start.y, end.y) - 40
        : Math.max(start.y, end.y) + 40
      : (start.y + end.y) / 2
    middle = [
      { x: start.x, y: midY },
      { x: end.x, y: midY },
    ]
  } else if (sourceHorizontal) {
    middle = [{ x: end.x, y: start.y }]
  } else {
    middle = [{ x: start.x, y: end.y }]
  }
  return deduplicatePoints([start, ...middle, end])
}

function roundedPolylinePath(points: Point[], radius: number): string {
  if (points.length < 2) return ''
  if (points.length === 2 || radius <= 0) {
    return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  }
  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const next = points[index + 1]
    const previousLength = Math.hypot(current.x - previous.x, current.y - previous.y)
    const nextLength = Math.hypot(next.x - current.x, next.y - current.y)
    if (!previousLength || !nextLength) continue
    const trim = Math.min(radius, previousLength / 2, nextLength / 2)
    const before = {
      x: current.x + ((previous.x - current.x) / previousLength) * trim,
      y: current.y + ((previous.y - current.y) / previousLength) * trim,
    }
    const after = {
      x: current.x + ((next.x - current.x) / nextLength) * trim,
      y: current.y + ((next.y - current.y) / nextLength) * trim,
    }
    path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`
  }
  const last = points[points.length - 1]
  return `${path} L ${last.x} ${last.y}`
}

function curvedPath(points: Point[]): string {
  if (points.length < 2) return ''
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  }
  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index]
    const start = points[index]
    const end = points[index + 1]
    const next = points[index + 2] ?? end
    const control1 = {
      x: start.x + (end.x - previous.x) / 6,
      y: start.y + (end.y - previous.y) / 6,
    }
    const control2 = {
      x: end.x - (next.x - start.x) / 6,
      y: end.y - (next.y - start.y) / 6,
    }
    path += ` C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${end.x} ${end.y}`
  }
  return path
}

export function pointAlongPolyline(points: Point[], fraction: number): Point {
  if (!points.length) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]
  const lengths = points.slice(1).map((point, index) =>
    Math.hypot(point.x - points[index].x, point.y - points[index].y),
  )
  const total = lengths.reduce((sum, length) => sum + length, 0)
  if (!total) return points[0]
  let remaining = total * fraction
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index]) {
      const start = points[index]
      const end = points[index + 1]
      const ratio = lengths[index] ? remaining / lengths[index] : 0
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      }
    }
    remaining -= lengths[index]
  }
  return points[points.length - 1]
}

// ─────────────────────────────────────────────────────────────────────────────
// Bidirectional / parallel edge lane offset helpers
// ─────────────────────────────────────────────────────────────────────────────
const BIDIR_LANE_OFFSET = 12

function perpOffset(source: EdgeAnchor, target: EdgeAnchor, dist: number): { dx: number; dy: number } {
  const sx = source.point.x; const sy = source.point.y
  const tx = target.point.x; const ty = target.point.y
  const len = Math.hypot(tx - sx, ty - sy)
  if (len < 1) return { dx: 0, dy: dist }
  return { dx: (-(ty - sy) / len) * dist, dy: ((tx - sx) / len) * dist }
}

function offsetPoints(points: Point[], dx: number, dy: number): Point[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}

export function buildEdgeRoute(
  edge: DiagramEdge,
  nodesById: Map<string, DiagramNode>,
  allEdges?: DiagramEdge[],
): EdgeRoute | null {
  const sourceNode = nodesById.get(edge.source)
  const targetNode = nodesById.get(edge.target)
  if (!sourceNode || !targetNode) return null
  const waypoints = edge.visual?.waypoints ?? []
  const sourceToward = waypoints[0] ?? getNodeCenter(targetNode)
  const targetToward = waypoints[waypoints.length - 1] ?? getNodeCenter(sourceNode)
  const source = getEdgeAnchor(sourceNode, edge.sourcePort, sourceToward)
  const target = getEdgeAnchor(targetNode, edge.targetPort, targetToward)

  let points: Point[]
  let path: string
  if (edge.visual?.routing === 'straight') {
    points = deduplicatePoints([source.point, ...waypoints, target.point])
    path = roundedPolylinePath(points, 0)
  } else if (edge.visual?.routing === 'curved') {
    points = deduplicatePoints([source.point, ...waypoints, target.point])
    path = curvedPath(points)
  } else {
    points = orthogonalPoints(source, target, waypoints)
    path = roundedPolylinePath(points, edge.visual?.cornerRadius ?? 8)
  }

  // Apply bidirectional lane offset: if a reverse edge exists between same nodes,
  // shift this edge perpendicularly by ±12px so the two don't overlap.
  if (allEdges && allEdges.length > 0) {
    const isBidirectional = edge.semantic?.direction === 'bidirectional'
    const hasReverseEdge = !isBidirectional && allEdges.some(
      (e) => e.id !== edge.id && e.source === edge.target && e.target === edge.source,
    )
    if (isBidirectional || hasReverseEdge) {
      const { dx, dy } = perpOffset(source, target, BIDIR_LANE_OFFSET)
      points = offsetPoints(points, dx, dy)
      path = roundedPolylinePath(points, edge.visual?.cornerRadius ?? 8)
    }
  }

  // Calculate optimal label position:
  // For bidirectional: bias to 0.35 (source-side) to separate from reverse label.
  // Otherwise use explicit labelPosition or midpoint.
  const isBidirLabel = edge.semantic?.direction === 'bidirectional'
  const fraction =
    edge.visual?.labelPosition === 'source'
      ? 0.25
      : edge.visual?.labelPosition === 'target'
        ? 0.75
        : isBidirLabel
          ? 0.35
          : 0.5

  return { points, path, labelPoint: pointAlongPolyline(points, fraction) }
}

export function wrapText(text: string, maxCharacters: number, maxLines = 3): string[] {
  const lines: string[] = []
  for (const sourceLine of text.split('\n')) {
    const words = sourceLine.trim().split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines.push('')
      continue
    }
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (line && candidate.length > maxCharacters) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
    }
    if (line) lines.push(line)
  }
  if (lines.length <= maxLines) return lines
  const clipped = lines.slice(0, maxLines)
  clipped[maxLines - 1] = `${clipped[maxLines - 1].replace(/[.\s]+$/, '')}…`
  return clipped
}

export function markerId(documentId: string, edgeId: string): string {
  return `edge-${documentId}-${edgeId}`.replace(/[^a-zA-Z0-9_-]/g, '-')
}
