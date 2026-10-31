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

export function getNodeCenter(node: DiagramNode): Point {
  return {
    x: node.position.x + node.size.width / 2,
    y: node.position.y + node.size.height / 2,
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
  const memberNodes = nodes.filter(
    (n) => nodeIds.has(n.id) || n.groupId === group.id,
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
    const headerHeight = 28
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

// External references intentionally have no required layout in the schema.
// Their render-only position is derived without adding anything to the JSON.
function createGhostNode(
  reference: ExternalReference,
  document: DiagramDocument,
  index: number,
): DiagramNode {
  const bounds = getDiagramBounds(document)
  const relatedEdge = document.edges.find(
    (edge) => edge.source === reference.nodeId || edge.target === reference.nodeId,
  )
  const otherId = relatedEdge
    ? relatedEdge.source === reference.nodeId
      ? relatedEdge.target
      : relatedEdge.source
    : null
  const otherNode = document.nodes.find((node) => node.id === otherId)
  const otherCenter = otherNode ? getNodeCenter(otherNode) : null
  const stack = Math.floor(index / 2)
  const x =
    reference.position?.x ??
    (reference.role === 'target'
      ? bounds.x + bounds.width + 120
      : Math.max(40, bounds.x - 260))
  const y =
    reference.position?.y ??
    (otherCenter
      ? Math.max(40, otherCenter.y - 44 + (index % 2) * 104)
      : Math.max(40, bounds.y + stack * 104))

  return {
    id: reference.nodeId,
    type: reference.type,
    label: reference.label,
    description:
      reference.description ??
      `External reference defined in ${reference.sourceDocumentId}`,
    groupId: null,
    position: { x, y },
    size: reference.size ?? { width: 220, height: 90 },
    style: {
      shape: reference.style.shape,
      category: reference.style.category,
      color: reference.style.color,
      borderColor: reference.style.borderColor ?? '#64748b',
      borderWidth: reference.style.borderWidth ?? 2,
      opacity: reference.style.opacity ?? 0.72,
      icon: reference.style.icon ?? null,
      fontSize: reference.style.fontSize ?? 13,
      textColor: reference.style.textColor ?? '#cbd5e1',
      borderStyle: reference.style.borderStyle ?? 'dashed',
    },
    ports: reference.ports ?? [],
    metadata: reference.metadata ?? {
      ...EMPTY_METADATA,
      engineId: reference.engineId,
    },
  }
}

export function getRenderNodes(document: DiagramDocument): RenderNode[] {
  return [
    ...document.nodes.map((node) => ({ node, ghost: false })),
    ...document.externalReferences.map((reference, index) => ({
      node: createGhostNode(reference, document, index),
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

export function buildEdgeRoute(
  edge: DiagramEdge,
  nodesById: Map<string, DiagramNode>,
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

  const fraction =
    edge.visual?.labelPosition === 'source'
      ? 0.25
      : edge.visual?.labelPosition === 'target'
        ? 0.75
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
