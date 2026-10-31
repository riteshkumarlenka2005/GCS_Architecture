import { forwardRef, useEffect, useMemo, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import {
  buildEdgeRoute,
  calculateResizedBounds,
  getGroupBounds,
  getGroupDescendantIds,
  getPortPoint,
  getRenderNodes,
  markerId,
  normalizeDiagramDocument,
  wrapText,
  type ResizeHandle,
} from './diagramGeometry'
import type {
  Bounds,
  DiagramDocument,
  DiagramEdge,
  DiagramGroup,
  DiagramNode,
  DiagramNodeShape,
  Point,
  Size,
} from './diagramModel'

interface DiagramViewProps {
  document: DiagramDocument
  locked: boolean
  scale: number
  selectedNodeId: string | null
  selectedEdgeId: string | null
  selectedGroupId: string | null
  onSelectNode: (id: string | null) => void
  onSelectEdge: (id: string | null) => void
  onSelectGroup: (id: string | null) => void
  onDocumentChange: (document: DiagramDocument) => void
  onVisualEditEnd: () => void
  onNavigateToDocument?: (documentId: string, nodeId?: string) => void
}

type DragState =
  | { kind: 'node-move'; id: string; isGhost: boolean; startX: number; startY: number; origin: Point }
  | { kind: 'node-resize'; id: string; isGhost: boolean; handle: ResizeHandle; startX: number; startY: number; originPos: Point; originSize: Size }
  | {
      kind: 'group-move'
      id: string
      startX: number
      startY: number
      originBounds: Bounds
      originChildPositions: Map<string, Point>
      originNestedGroupBounds: Map<string, Bounds>
      originEdgeWaypoints: Map<string, Point[]>
    }
  | { kind: 'group-resize'; id: string; handle: ResizeHandle; startX: number; startY: number; originBounds: Bounds }
  | { kind: 'waypoint'; edgeId: string; index: number; startX: number; startY: number; origin: Point }

const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function getHandlePoint(bounds: Bounds, handle: ResizeHandle): Point {
  const { x, y, width: w, height: h } = bounds
  switch (handle) {
    case 'nw': return { x, y }
    case 'n': return { x: x + w / 2, y }
    case 'ne': return { x: x + w, y }
    case 'e': return { x: x + w, y: y + h / 2 }
    case 'se': return { x: x + w, y: y + h }
    case 's': return { x: x + w / 2, y: y + h }
    case 'sw': return { x, y: y + h }
    case 'w': return { x, y: y + h / 2 }
  }
}

function groupDepth(group: DiagramGroup, groups: Map<string, DiagramGroup>): number {
  let depth = 0
  let parentId = group.parentGroupId
  const visited = new Set<string>()
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    depth += 1
    parentId = groups.get(parentId)?.parentGroupId ?? null
  }
  return depth
}

function nodeGeometry(shape: DiagramNodeShape, node: DiagramNode): ReactNode {
  const { x, y } = node.position
  const { width: w, height: h } = node.size
  const cx = x + w / 2
  const cy = y + h / 2

  switch (shape) {
    case 'rounded-rectangle':
      return <rect x={x} y={y} width={w} height={h} rx={Math.min(14, h / 4)} />
    case 'rectangle':
      return <rect x={x} y={y} width={w} height={h} />
    case 'circle':
      return <circle cx={cx} cy={cy} r={Math.min(w, h) / 2} />
    case 'ellipse':
      return <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} />
    case 'diamond':
      return <polygon points={`${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`} />
    case 'hexagon': {
      const inset = Math.min(w * 0.18, 30)
      return (
        <polygon
          points={`${x + inset},${y} ${x + w - inset},${y} ${x + w},${cy} ${x + w - inset},${y + h} ${x + inset},${y + h} ${x},${cy}`}
        />
      )
    }
    case 'cylinder': {
      const ry = Math.min(14, h * 0.16)
      return (
        <>
          <path
            d={`M ${x} ${y + ry} L ${x} ${y + h - ry} A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + h - ry} L ${x + w} ${y + ry} A ${w / 2} ${ry} 0 0 0 ${x} ${y + ry} Z`}
          />
          <ellipse cx={cx} cy={y + ry} rx={w / 2} ry={ry} />
          <path
            d={`M ${x} ${y + h - ry} A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + h - ry}`}
            fill="none"
          />
        </>
      )
    }
    case 'cloud':
      return (
        <path
          d={`M ${x + w * 0.2} ${y + h * 0.82} C ${x - w * 0.02} ${y + h * 0.82} ${x - w * 0.02} ${y + h * 0.46} ${x + w * 0.18} ${y + h * 0.43} C ${x + w * 0.12} ${y + h * 0.15} ${x + w * 0.43} ${y + h * 0.04} ${x + w * 0.58} ${y + h * 0.25} C ${x + w * 0.82} ${y + h * 0.08} ${x + w * 1.04} ${y + h * 0.32} ${x + w * 0.88} ${y + h * 0.53} C ${x + w * 1.08} ${y + h * 0.62} ${x + w * 0.96} ${y + h * 0.88} ${x + w * 0.76} ${y + h * 0.82} Z`}
        />
      )
  }
}

function dashArray(dash: 'solid' | 'dashed' | 'dotted'): string | undefined {
  if (dash === 'dashed') return '10 7'
  if (dash === 'dotted') return '2 6'
  return undefined
}

const DiagramView = forwardRef<SVGSVGElement, DiagramViewProps>(function DiagramView(
  {
    document,
    locked,
    scale,
    selectedNodeId,
    selectedEdgeId,
    selectedGroupId,
    onSelectNode,
    onSelectEdge,
    onSelectGroup,
    onDocumentChange,
    onVisualEditEnd,
    onNavigateToDocument,
  },
  ref,
) {
  const dragRef = useRef<DragState | null>(null)
  const documentRef = useRef(document)
  const scaleRef = useRef(scale)
  const onDocumentChangeRef = useRef(onDocumentChange)
  const onVisualEditEndRef = useRef(onVisualEditEnd)

  useEffect(() => {
    documentRef.current = document
    scaleRef.current = scale
    onDocumentChangeRef.current = onDocumentChange
    onVisualEditEndRef.current = onVisualEditEnd
  })

  const handleWindowPointerMoveRef = useRef<(event: PointerEvent) => void>(() => {})
  const handleWindowPointerUpRef = useRef<() => void>(() => {})

  const handleWindowPointerMove = (event: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return

    const s = scaleRef.current || 1
    const dx = (event.clientX - drag.startX) / s
    const dy = (event.clientY - drag.startY) / s
    const doc = documentRef.current

    // 1. Move Single Node
    if (drag.kind === 'node-move') {
      const nextX = Math.round((drag.origin.x + dx) * 10) / 10
      const nextY = Math.round((drag.origin.y + dy) * 10) / 10

      if (drag.isGhost) {
        onDocumentChangeRef.current({
          ...doc,
          externalReferences: doc.externalReferences.map((ref) =>
            ref.nodeId === drag.id ? { ...ref, position: { x: nextX, y: nextY } } : ref,
          ),
        })
        return
      }

      onDocumentChangeRef.current({
        ...doc,
        nodes: doc.nodes.map((node) =>
          node.id === drag.id ? { ...node, position: { x: nextX, y: nextY } } : node,
        ),
      })
      return
    }

    // 2. Resize Node Box (increases / decreases size from any of 8 handles)
    if (drag.kind === 'node-resize') {
      const originBounds: Bounds = {
        x: drag.originPos.x,
        y: drag.originPos.y,
        width: drag.originSize.width,
        height: drag.originSize.height,
      }
      const nextBounds = calculateResizedBounds(originBounds, drag.handle, dx, dy, 100, 40)

      if (drag.isGhost) {
        onDocumentChangeRef.current({
          ...doc,
          externalReferences: doc.externalReferences.map((ref) =>
            ref.nodeId === drag.id
              ? {
                  ...ref,
                  position: { x: nextBounds.x, y: nextBounds.y },
                  size: { width: nextBounds.width, height: nextBounds.height },
                }
              : ref,
          ),
        })
        return
      }

      onDocumentChangeRef.current({
        ...doc,
        nodes: doc.nodes.map((node) =>
          node.id === drag.id
            ? {
                ...node,
                position: { x: nextBounds.x, y: nextBounds.y },
                size: { width: nextBounds.width, height: nextBounds.height },
              }
            : node,
        ),
      })
      return
    }

    // 3. Move Container / Group (moves group bounds AND all contained nodes/subgroups together)
    if (drag.kind === 'group-move') {
      const updatedNodes = doc.nodes.map((node) => {
        const origin = drag.originChildPositions.get(node.id)
        if (!origin) return node
        return {
          ...node,
          position: {
            x: Math.round((origin.x + dx) * 10) / 10,
            y: Math.round((origin.y + dy) * 10) / 10,
          },
        }
      })

      const updatedGroups = doc.groups.map((g) => {
        const origin = drag.originNestedGroupBounds.get(g.id)
        if (!origin) return g
        return {
          ...g,
          bounds: {
            ...origin,
            x: Math.round((origin.x + dx) * 10) / 10,
            y: Math.round((origin.y + dy) * 10) / 10,
          },
        }
      })

      // Shift waypoints of internal edges so intra-group routing moves together
      const updatedEdges = doc.edges.map((edge) => {
        const originWaypoints = drag.originEdgeWaypoints.get(edge.id)
        if (!originWaypoints) return edge
        return {
          ...edge,
          visual: {
            ...edge.visual,
            waypoints: originWaypoints.map((p) => ({
              x: Math.round((p.x + dx) * 10) / 10,
              y: Math.round((p.y + dy) * 10) / 10,
            })),
          },
        }
      })

      onDocumentChangeRef.current({
        ...doc,
        nodes: updatedNodes,
        groups: updatedGroups,
        edges: updatedEdges,
      })
      return
    }

    // 4. Resize Container / Group
    if (drag.kind === 'group-resize') {
      const nextBounds = calculateResizedBounds(drag.originBounds, drag.handle, dx, dy, 180, 100)
      onDocumentChangeRef.current({
        ...doc,
        groups: doc.groups.map((g) =>
          g.id === drag.id ? { ...g, bounds: nextBounds } : g,
        ),
      })
      return
    }

    // 5. Waypoint Drag
    if (drag.kind === 'waypoint') {
      const nextPoint = {
        x: Math.round((drag.origin.x + dx) * 10) / 10,
        y: Math.round((drag.origin.y + dy) * 10) / 10,
      }
      onDocumentChangeRef.current({
        ...doc,
        edges: doc.edges.map((edge) => {
          if (edge.id !== drag.edgeId) return edge
          const waypoints = (edge.visual?.waypoints ?? []).map((point, index) =>
            index === drag.index ? nextPoint : point,
          )
          return { ...edge, visual: { ...edge.visual, waypoints } }
        }),
      })
      return
    }
  }

  const handleWindowPointerUp = () => {
    window.removeEventListener('pointermove', handleWindowPointerMoveRef.current)
    window.removeEventListener('pointerup', handleWindowPointerUpRef.current)
    window.removeEventListener('pointercancel', handleWindowPointerUpRef.current)
    if (dragRef.current) {
      dragRef.current = null
      onVisualEditEndRef.current()
    }
  }

  useEffect(() => {
    handleWindowPointerMoveRef.current = handleWindowPointerMove
    handleWindowPointerUpRef.current = handleWindowPointerUp
  })

  const startDrag = (state: DragState) => {
    dragRef.current = state
    window.addEventListener('pointermove', handleWindowPointerMoveRef.current)
    window.addEventListener('pointerup', handleWindowPointerUpRef.current)
    window.addEventListener('pointercancel', handleWindowPointerUpRef.current)
  }

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMoveRef.current)
      window.removeEventListener('pointerup', handleWindowPointerUpRef.current)
      window.removeEventListener('pointercancel', handleWindowPointerUpRef.current)
    }
  }, [])

  const normalizedDoc = useMemo(() => normalizeDiagramDocument(document), [document])

  const renderNodes = useMemo(() => getRenderNodes(normalizedDoc), [normalizedDoc])
  const nodesById = useMemo(
    () => new Map(renderNodes.map(({ node }) => [node.id, node])),
    [renderNodes],
  )
  const groupsById = useMemo(
    () => new Map(normalizedDoc.groups.map((group) => [group.id, group])),
    [normalizedDoc.groups],
  )
  const sortedGroups = useMemo(
    () =>
      normalizedDoc.groups
        .map((group) => ({
          ...group,
          bounds: getGroupBounds(group, normalizedDoc.nodes),
        }))
        .sort((a, b) => groupDepth(a, groupsById) - groupDepth(b, groupsById)),
    [normalizedDoc.groups, normalizedDoc.nodes, groupsById],
  )
  const routes = useMemo(
    () => new Map(normalizedDoc.edges.map((edge) => [edge.id, buildEdgeRoute(edge, nodesById, normalizedDoc.edges)])),
    [normalizedDoc.edges, nodesById],
  )
  const sortedEdges = useMemo(
    () => [...normalizedDoc.edges].sort((a, b) => (a.visual?.zIndex ?? 0) - (b.visual?.zIndex ?? 0)),
    [normalizedDoc.edges],
  )

  // --------------------------------------------------------------------------
  // Drag Starters
  // --------------------------------------------------------------------------
  const startNodeDrag = (event: ReactPointerEvent<SVGGElement>, node: DiagramNode, ghost: boolean) => {
    event.stopPropagation()
    onSelectNode(node.id)
    onSelectEdge(null)
    onSelectGroup(null)
    if (locked || event.button !== 0) return
    startDrag({
      kind: 'node-move',
      id: node.id,
      isGhost: ghost,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...node.position },
    })
  }

  const startNodeResize = (
    event: ReactPointerEvent<SVGRectElement>,
    node: DiagramNode,
    handle: ResizeHandle,
    ghost: boolean,
  ) => {
    event.stopPropagation()
    if (locked || event.button !== 0) return
    startDrag({
      kind: 'node-resize',
      id: node.id,
      isGhost: ghost,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      originPos: { ...node.position },
      originSize: { ...node.size },
    })
  }

  const startGroupDrag = (event: ReactPointerEvent<SVGGElement>, group: DiagramGroup) => {
    event.stopPropagation()
    onSelectGroup(group.id)
    onSelectNode(null)
    onSelectEdge(null)
    if (locked || event.button !== 0) return

    // Find all descendant nodes and nested groups that belong to this container
    const { nodeIds, groupIds } = getGroupDescendantIds(group.id, document.groups, document.nodes)

    const originChildPositions = new Map<string, Point>()
    for (const node of document.nodes) {
      if (nodeIds.has(node.id)) {
        originChildPositions.set(node.id, { ...node.position })
      }
    }

    const originNestedGroupBounds = new Map<string, Bounds>()
    for (const g of document.groups) {
      if (groupIds.has(g.id)) {
        originNestedGroupBounds.set(g.id, { ...getGroupBounds(g, document.nodes) })
      }
    }

    // Save waypoints of edges where BOTH endpoints are inside this container
    const originEdgeWaypoints = new Map<string, Point[]>()
    for (const edge of document.edges) {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.visual?.waypoints?.length) {
        originEdgeWaypoints.set(edge.id, edge.visual.waypoints.map((p) => ({ ...p })))
      }
    }

    const currentBounds = getGroupBounds(group, document.nodes)

    startDrag({
      kind: 'group-move',
      id: group.id,
      startX: event.clientX,
      startY: event.clientY,
      originBounds: { ...currentBounds },
      originChildPositions,
      originNestedGroupBounds,
      originEdgeWaypoints,
    })
  }

  const startGroupResize = (
    event: ReactPointerEvent<SVGRectElement>,
    group: DiagramGroup,
    handle: ResizeHandle,
  ) => {
    event.stopPropagation()
    if (locked || event.button !== 0) return
    const currentBounds = getGroupBounds(group, document.nodes)
    startDrag({
      kind: 'group-resize',
      id: group.id,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      originBounds: { ...currentBounds },
    })
  }

  const startWaypointDrag = (
    event: ReactPointerEvent<SVGCircleElement>,
    edgeId: string,
    index: number,
    point: Point,
  ) => {
    event.stopPropagation()
    if (locked || event.button !== 0) return
    startDrag({
      kind: 'waypoint',
      edgeId,
      index,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...point },
    })
  }

  // Double-clicking an edge adds a new visual waypoint at the clicked point
  const handleEdgeDoubleClick = (event: ReactMouseEvent<SVGPathElement>, edge: DiagramEdge) => {
    if (locked) return
    event.stopPropagation()
    const svgRect = ref && 'current' in ref && ref.current ? ref.current.getBoundingClientRect() : null
    if (!svgRect) return
    const clickPoint: Point = {
      x: Math.round(((event.clientX - svgRect.left) / scale) * 10) / 10,
      y: Math.round(((event.clientY - svgRect.top) / scale) * 10) / 10,
    }
    const currentWaypoints = edge.visual?.waypoints ?? []
    const updatedEdges = document.edges.map((e) => {
      if (e.id !== edge.id) return e
      return {
        ...e,
        visual: {
          ...e.visual,
          waypoints: [...currentWaypoints, clickPoint],
        },
      }
    })
    onDocumentChange({ ...document, edges: updatedEdges })
    onVisualEditEnd()
  }

  // Right-clicking a waypoint deletes that waypoint
  const handleWaypointContextMenu = (
    event: ReactMouseEvent<SVGCircleElement>,
    edgeId: string,
    index: number,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    if (locked) return
    const updatedEdges = document.edges.map((e) => {
      if (e.id !== edgeId) return e
      const waypoints = (e.visual?.waypoints ?? []).filter((_, i) => i !== index)
      return { ...e, visual: { ...e.visual, waypoints } }
    })
    onDocumentChange({ ...document, edges: updatedEdges })
    onVisualEditEnd()
  }

  const handleSize = Math.max(7, Math.min(14, 9 / Math.max(0.3, scale)))

  return (
    <svg
      ref={ref}
      className="diagram-layer"
      width="1"
      height="1"
      aria-label={normalizedDoc.title}
      data-document-id={normalizedDoc.documentId}
    >
      <defs>
        {normalizedDoc.nodes.map((node) => (
          <clipPath key={`clip-${node.id}`} id={`clip-node-${node.id}`}>
            <rect
              x={node.position.x + 4}
              y={node.position.y + 4}
              width={Math.max(0, node.size.width - 8)}
              height={Math.max(0, node.size.height - 8)}
            />
          </clipPath>
        ))}
        {normalizedDoc.edges.map((edge) => (
          <marker
            key={edge.id}
            id={markerId(normalizedDoc.documentId, edge.id)}
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={edge.visual?.stroke ?? '#64748b'} />
          </marker>
        ))}
      </defs>

      {/* ------------------------------------------------------------------ */}
      {/* Groups / Containers Layer                                          */}
      {/* ------------------------------------------------------------------ */}
      <g className="diagram-groups">
        {sortedGroups.map((group) => {
          const { bounds, style } = group
          const centered = style?.labelPosition === 'top-center'
          const isSelected = selectedGroupId === group.id
          return (
            <g
              key={group.id}
              className={`diagram-group${isSelected ? ' is-selected' : ''}`}
              data-group-id={group.id}
              pointerEvents="visiblePainted"
              onPointerDown={(e) => startGroupDrag(e, group)}
            >
              <rect
                x={bounds.x}
                y={bounds.y}
                width={bounds.width}
                height={bounds.height}
                rx={10}
                fill={style?.backgroundColor ?? '#1e293b'}
                fillOpacity={style?.opacity ?? 0.12}
                stroke={isSelected ? 'var(--accent)' : (style?.borderColor ?? '#475569')}
                strokeWidth={isSelected ? 2 : (style?.borderWidth ?? 1)}
                strokeDasharray={style?.borderStyle === 'dashed' ? '12 8' : undefined}
                className="diagram-group-rect"
              />
              <text
                x={centered ? bounds.x + bounds.width / 2 : bounds.x + 16}
                y={bounds.y + 28}
                fill={style?.textColor ?? '#94a3b8'}
                fontSize={style?.fontSize ?? 15}
                textAnchor={centered ? 'middle' : 'start'}
                className="diagram-group-label"
                pointerEvents="none"
              >
                {group.label}
              </text>
              <title>{`${group.id}\n${group.description}\nDrag container to move with contents. Drag handles to resize.`}</title>

              {/* Group Selection Indicator & 8 Resize Handles */}
              {isSelected && !locked && (
                <>
                  <rect
                    className="diagram-group-selection"
                    data-export-remove="true"
                    x={bounds.x - 3}
                    y={bounds.y - 3}
                    width={bounds.width + 6}
                    height={bounds.height + 6}
                    rx={12}
                  />
                  {RESIZE_HANDLES.map((handle) => {
                    const pt = getHandlePoint(bounds, handle)
                    return (
                      <rect
                        key={`grp-${group.id}-${handle}`}
                        className={`diagram-resize-handle handle-${handle}`}
                        data-resize-handle="true"
                        data-export-remove="true"
                        x={pt.x - handleSize / 2}
                        y={pt.y - handleSize / 2}
                        width={handleSize}
                        height={handleSize}
                        rx={2}
                        onPointerDown={(e) => startGroupResize(e, group, handle)}
                      >
                        <title>Drag to resize container</title>
                      </rect>
                    )
                  })}
                </>
              )}
            </g>
          )
        })}
      </g>

      {/* ------------------------------------------------------------------ */}
      {/* Connections / Edges Layer                                          */}
      {/* ------------------------------------------------------------------ */}
      <g className="diagram-edges">
        {sortedEdges.map((edge) => {
          const route = routes.get(edge.id)
          if (!route) return null
          const id = markerId(normalizedDoc.documentId, edge.id)
          const arrow = edge.visual?.arrow ?? 'end'
          const isSelected = selectedEdgeId === edge.id
          const labels = wrapText(edge.semantic?.label || '', 38, 2)
          const labelWidth = Math.max(40, ...labels.map((line) => line.length * 6.4)) + 16
          const labelHeight = labels.length * 15 + 8
          const stroke = edge.visual?.stroke ?? '#64748b'
          const strokeWidth = edge.visual?.strokeWidth ?? 2
          const dash = edge.visual?.dash ?? 'solid'

          return (
            <g
              key={edge.id}
              className={`diagram-edge${isSelected ? ' is-selected' : ''}`}
              data-edge-id={edge.id}
            >
              {/* Visible edge line */}
              <path
                d={route.path}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeDasharray={dashArray(dash)}
                strokeLinecap="round"
                strokeLinejoin="round"
                markerStart={arrow === 'start' || arrow === 'both' ? `url(#${id})` : undefined}
                markerEnd={arrow === 'end' || arrow === 'both' ? `url(#${id})` : undefined}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />

              {/* Edge Hit Area for clicking and double-click waypoint addition */}
              <path
                className="diagram-edge-hit"
                d={route.path}
                fill="none"
                stroke="transparent"
                strokeWidth="14"
                strokeLinecap="round"
                onPointerDown={(event) => {
                  event.stopPropagation()
                  onSelectEdge(edge.id)
                  onSelectNode(null)
                  onSelectGroup(null)
                }}
                onDoubleClick={(event) => handleEdgeDoubleClick(event, edge)}
              >
                <title>{`${edge.id}\n${edge.semantic?.type} · ${edge.semantic?.direction}\n${edge.semantic?.description}`}</title>
              </path>

              {/* Edge Label */}
              {edge.semantic?.label && (
                <g
                  className="diagram-edge-label"
                  transform={`translate(${route.labelPoint.x} ${route.labelPoint.y})`}
                  pointerEvents="none"
                >
                  <rect
                    x={-labelWidth / 2}
                    y={-labelHeight / 2}
                    width={labelWidth}
                    height={labelHeight}
                    rx={5}
                  />
                  <text textAnchor="middle" fontSize="11">
                    {labels.map((line, index) => (
                      <tspan
                        key={index}
                        x="0"
                        y={(index - (labels.length - 1) / 2) * 14 + 4}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              )}

              {/* Waypoint Handles (when edge is selected and not locked) */}
              {isSelected &&
                !locked &&
                (edge.visual?.waypoints ?? []).map((point, index) => (
                  <circle
                    key={`${point.x}-${point.y}-${index}`}
                    className="diagram-waypoint"
                    data-waypoint="true"
                    data-export-remove="true"
                    cx={point.x}
                    cy={point.y}
                    r={6 / Math.max(0.5, scale)}
                    onPointerDown={(event) => startWaypointDrag(event, edge.id, index, point)}
                    onContextMenu={(event) => handleWaypointContextMenu(event, edge.id, index)}
                  >
                    <title>Drag to move waypoint · Right-click to delete</title>
                  </circle>
                ))}
            </g>
          )
        })}
      </g>

      {/* ------------------------------------------------------------------ */}
      {/* Node Boxes Layer                                                   */}
      {/* ------------------------------------------------------------------ */}
      <g className="diagram-nodes">
        {renderNodes.map(({ node, ghost, external }) => {
          const { style } = node
          const cx = node.position.x + node.size.width / 2
          const cy = node.position.y + node.size.height / 2
          const isSelected = selectedNodeId === node.id
          const detail = ghost
            ? external?.sourceDocumentId
            : (node.metadata?.engineId ?? node.engineId)
          const maxCharacters = Math.max(
            8,
            Math.floor((node.size.width - 24) / (style.fontSize * 0.56)),
          )
          const lines = wrapText(node.label, maxCharacters, detail ? 2 : 3)
          const nodeBounds: Bounds = {
            x: node.position.x,
            y: node.position.y,
            width: node.size.width,
            height: node.size.height,
          }

          return (
            <g
              key={`${ghost ? 'ghost' : 'node'}-${node.id}`}
              className={`diagram-node${ghost ? ' is-ghost' : ''}${isSelected ? ' is-selected' : ''}`}
              data-node-id={node.id}
              onPointerDown={(event) => startNodeDrag(event, node, ghost)}
              onClick={(e) => {
                if (ghost && external?.sourceDocumentId && onNavigateToDocument) {
                  if (e.detail >= 2) {
                    onNavigateToDocument(external.sourceDocumentId, external.nodeId)
                  }
                }
              }}
            >
              <title>{`${node.id}\n${node.type}\n${node.description}${detail ? `\n${detail}` : ''}\nDrag to move. Drag handles to increase or decrease size.`}</title>

              <g
                fill={style.color}
                fillOpacity={style.opacity}
                stroke={isSelected ? 'var(--accent)' : (style.borderColor ?? 'none')}
                strokeWidth={isSelected ? 3 : style.borderWidth}
                strokeDasharray={
                  style.borderStyle === 'dashed' || ghost
                    ? '9 6'
                    : style.borderStyle === 'dotted'
                      ? '2 5'
                      : undefined
                }
                strokeLinejoin="round"
              >
                {nodeGeometry(style.shape, node)}
              </g>

              {/* Node Selection Outline */}
              {isSelected && !locked && (
                <rect
                  className="diagram-node-selection"
                  data-export-remove="true"
                  x={node.position.x - 4}
                  y={node.position.y - 4}
                  width={node.size.width + 8}
                  height={node.size.height + 8}
                  rx={8}
                />
              )}

              {/* 8 Resize Handles for increasing or decreasing box size */}
              {isSelected &&
                !locked &&
                RESIZE_HANDLES.map((handle) => {
                  const pt = getHandlePoint(nodeBounds, handle)
                  return (
                    <rect
                      key={`node-${node.id}-${handle}`}
                      className={`diagram-resize-handle handle-${handle}`}
                      data-resize-handle="true"
                      data-export-remove="true"
                      x={pt.x - handleSize / 2}
                      y={pt.y - handleSize / 2}
                      width={handleSize}
                      height={handleSize}
                      rx={2}
                      onPointerDown={(e) => startNodeResize(e, node, handle, ghost)}
                    >
                      <title>Drag to increase or decrease box size</title>
                    </rect>
                  )
                })}

              {/* Node Label Text */}
              <text
                className="diagram-node-label"
                x={cx}
                y={cy}
                fill={style.textColor}
                fontSize={style.fontSize}
                textAnchor="middle"
                pointerEvents="none"
                clipPath={ghost ? undefined : `url(#clip-node-${node.id})`}
              >
                {lines.map((line, index) => (
                  <tspan
                    key={index}
                    x={cx}
                    dy={
                      index === 0
                        ? `${-(lines.length - 1) * 0.58 - (detail ? 0.35 : 0)}em`
                        : '1.16em'
                    }
                  >
                    {line}
                  </tspan>
                ))}
                {detail && (
                  <tspan
                    className="diagram-node-detail"
                    x={cx}
                    dy="1.45em"
                    fontSize={Math.max(9, style.fontSize - 3)}
                  >
                    {ghost ? `↗ ${detail}` : detail}
                  </tspan>
                )}
              </text>

              {style.icon && (
                <text
                  x={node.position.x + 10}
                  y={node.position.y + 17}
                  fill={style.textColor}
                  fontSize="10"
                  pointerEvents="none"
                >
                  {style.icon}
                </text>
              )}

              {/* Ghost node indicator badge */}
              {ghost && (
                <g transform={`translate(${node.position.x + node.size.width - 20}, ${node.position.y + 12})`}>
                  <circle r="6" fill="#475569" stroke="#cbd5e1" strokeWidth="1" />
                  <text
                    fontSize="8"
                    fill="#ffffff"
                    textAnchor="middle"
                    dominantBaseline="central"
                    pointerEvents="none"
                  >
                    ↗
                  </text>
                </g>
              )}

              {/* Ports */}
              {node.ports.map((port) => {
                const anchor = getPortPoint(node, port)
                const labelLeft = anchor.side === 'left'
                const labelRight = anchor.side === 'right'
                return (
                  <g key={port.id} className="diagram-port" data-port-id={port.id}>
                    <circle
                      cx={anchor.point.x}
                      cy={anchor.point.y}
                      r="4"
                      data-direction={port.direction}
                    >
                      <title>{`${port.label}\n${port.direction} · ${port.dataType ?? 'untyped'}`}</title>
                    </circle>
                    <text
                      className="diagram-port-label"
                      x={anchor.point.x + (labelLeft ? -8 : labelRight ? 8 : 0)}
                      y={
                        anchor.point.y +
                        (anchor.side === 'top' ? -9 : anchor.side === 'bottom' ? 15 : 3)
                      }
                      textAnchor={labelLeft ? 'end' : labelRight ? 'start' : 'middle'}
                      fontSize="9"
                      pointerEvents="none"
                    >
                      {port.label}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })}
      </g>
    </svg>
  )
})

export default DiagramView
