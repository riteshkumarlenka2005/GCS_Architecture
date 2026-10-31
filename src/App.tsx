import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  CheckCheck,
  Circle,
  Compass,
  Download,
  Ellipse,
  FileCheck,
  FileUp,
  GripVertical,
  Hand,
  Layers,
  Lock,
  LockOpen,
  Moon,
  Move,
  MoveUpRight,
  MoveVertical,
  PanelBottom,
  PanelTop,
  Pencil,
  Plus,
  RotateCcw,
  Slash,
  Square,
  Sun,
  Trash,
  Triangle,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type {
  ChangeEvent as ReactChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import {
  createCanvas,
  fetchCanvasStore,
  reloadBatch1,
  renameCanvas,
  saveArchitectureManifest,
  saveCanvasDiagram,
  saveCanvasShapes,
  setActiveCanvas,
} from './api'
import type { CanvasMeta } from './api'
import DiagramView from './DiagramView'
import { isArchitectureManifest } from './diagramModel'
import type { ArchitectureManifest, DiagramDocument } from './diagramModel'
import { validateArchitectureJson } from './diagramValidation'
import type { ValidationReport } from './diagramValidation'
import { InspectorPanel } from './components/InspectorPanel'
import { getDiagramBounds } from './diagramGeometry'
import { buildStandaloneHtml } from './exportHtml'
import type { ExportNode } from './exportHtml'
import { applyShapeDrag, createShape, isPathShape } from './shapeModel'
import type { HitKind, Shape, ShapeType } from './shapeModel'
import { ShapeView } from './shapes'
import './App.css'

const GRID_SIZE = 24
const MIN_SCALE = 0.08
const MAX_SCALE = 8
const ZOOM_FACTOR = 1.25
const THEME_KEY = 'canvas-theme'
const DEFAULT_CANVAS_ID = 'doc-master-01'

type Theme = 'light' | 'dark'

type ToolbarMode = 'vertical' | 'top' | 'bottom'

interface Transform {
  x: number
  y: number
  scale: number
}

const DEFAULT_NODES: ExportNode[] = [
  { x: 0, y: 0, w: 240, title: 'Ground Control Station', sub: 'Command & control' },
  { x: 320, y: 0, w: 220, title: 'Drone 1', sub: 'Live telemetry feed' },
  { x: 0, y: 150, w: 220, title: 'Mission Planner', sub: 'Waypoint editor' },
  { x: 320, y: 150, w: 240, title: 'Flight Logs', sub: 'Session history' },
]

const IDENTITY: Transform = { x: 0, y: 0, scale: 1 }
const FALLBACK_CANVASES: CanvasMeta[] = []
const EMPTY_SHAPES: Shape[] = []

const COLOR_PALETTE = [
  '#ffffff',
  '#9ca3af',
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
]

function getInitialTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
}

function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

function calculateFitTransform(
  document?: DiagramDocument | null,
  shapes?: Shape[] | null,
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200,
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800,
  inspectorOpen = false,
): Transform {
  // 1. Center architecture diagram
  if (document && document.nodes && document.nodes.length > 0) {
    const bounds = getDiagramBounds(document)
    if (bounds.width > 0 && bounds.height > 0) {
      const leftMargin = 96
      const rightMargin = inspectorOpen ? 430 : 48
      const topMargin = 72
      const bottomMargin = 48

      const availableW = Math.max(300, viewportWidth - leftMargin - rightMargin)
      const availableH = Math.max(300, viewportHeight - topMargin - bottomMargin)

      const scaleX = availableW / (bounds.width + 60)
      const scaleY = availableH / (bounds.height + 60)
      let scale = Math.min(scaleX, scaleY)

      const docZoom =
        typeof document.viewport?.zoom === 'number' && document.viewport.zoom > 0
          ? document.viewport.zoom
          : 0.85

      scale = clampScale(Math.min(docZoom, scale))

      const centerScreenX = leftMargin + availableW / 2
      const centerScreenY = topMargin + availableH / 2

      const diagCenterX = bounds.x + bounds.width / 2
      const diagCenterY = bounds.y + bounds.height / 2

      return {
        scale,
        x: Math.round(centerScreenX - diagCenterX * scale),
        y: Math.round(centerScreenY - diagCenterY * scale),
      }
    }
  }

  // 2. Center custom canvas with shapes
  if (shapes && shapes.length > 0) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    for (const s of shapes) {
      if (s.type === 'circle') {
        minX = Math.min(minX, s.cx - s.r)
        minY = Math.min(minY, s.cy - s.r)
        maxX = Math.max(maxX, s.cx + s.r)
        maxY = Math.max(maxY, s.cy + s.r)
      } else if (isPathShape(s)) {
        minX = Math.min(minX, s.x1, s.x2, s.bend?.x ?? s.x1)
        minY = Math.min(minY, s.y1, s.y2, s.bend?.y ?? s.y1)
        maxX = Math.max(maxX, s.x1, s.x2, s.bend?.x ?? s.x1)
        maxY = Math.max(maxY, s.y1, s.y2, s.bend?.y ?? s.y1)
      } else {
        minX = Math.min(minX, s.x)
        minY = Math.min(minY, s.y)
        maxX = Math.max(maxX, s.x + s.w)
        maxY = Math.max(maxY, s.y + s.h)
      }
    }
    if (minX !== Infinity && maxX > minX) {
      const w = maxX - minX
      const h = maxY - minY
      const leftMargin = 96
      const rightMargin = inspectorOpen ? 430 : 48
      const topMargin = 72
      const bottomMargin = 48
      const availableW = Math.max(300, viewportWidth - leftMargin - rightMargin)
      const availableH = Math.max(300, viewportHeight - topMargin - bottomMargin)
      const scale = clampScale(Math.min(1, availableW / (w + 60), availableH / (h + 60)))
      const centerScreenX = leftMargin + availableW / 2
      const centerScreenY = topMargin + availableH / 2
      const shapeCenterX = minX + w / 2
      const shapeCenterY = minY + h / 2
      return {
        scale,
        x: Math.round(centerScreenX - shapeCenterX * scale),
        y: Math.round(centerScreenY - shapeCenterY * scale),
      }
    }
  }

  // 3. Default empty canvas centering
  const leftMargin = 96
  const rightMargin = inspectorOpen ? 430 : 48
  const availableW = Math.max(300, viewportWidth - leftMargin - rightMargin)
  const availableH = Math.max(300, viewportHeight - 120)
  return {
    scale: 1,
    x: Math.round(leftMargin + availableW / 2 - 200),
    y: Math.round(72 + availableH / 2 - 150),
  }
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [transform, setTransform] = useState<Transform>(IDENTITY)
  const [locked, setLocked] = useState(false)
  const [panMode, setPanMode] = useState(true)

  const [canvases, setCanvases] = useState<CanvasMeta[]>(FALLBACK_CANVASES)
  const [activeId, setActiveId] = useState(DEFAULT_CANVAS_ID)
  const [manifest, setManifest] = useState<ArchitectureManifest | null>(null)
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null)
  const [importing, setImporting] = useState(false)
  const [isReloading, setIsReloading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Inspector & Selection State
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  const [toolbarMode, setToolbarMode] = useState<ToolbarMode>('vertical')
  const [toolbarPos, setToolbarPos] = useState({ x: 16, y: 16 })
  const [posMenuOpen, setPosMenuOpen] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [textEditId, setTextEditId] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{
    x: number
    y: number
    shapeId: string
  } | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)
  const diagramSvgRef = useRef<SVGSVGElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const switcherRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const posSwitcherRef = useRef<HTMLDivElement>(null)
  const posMenuRef = useRef<HTMLDivElement>(null)
  const ctxMenuRef = useRef<HTMLDivElement>(null)

  const shapeDragRef = useRef<{
    shapeId: string
    hit: HitKind
    startX: number
    startY: number
    origin: Shape
  } | null>(null)

  const gripDragRef = useRef<{
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const dragRef = useRef<{
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const viewsRef = useRef<Record<string, Transform>>({})
  const renameCommittedRef = useRef(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  // Load session store from server on start
  useEffect(() => {
    let cancelled = false
    fetchCanvasStore()
      .then((state) => {
        if (cancelled) return
        setCanvases(state.canvases)
        setActiveId(state.activeId)
        setManifest(state.manifest ?? null)
        const activeCanvas = state.canvases.find(
          (canvas) => canvas.id === state.activeId,
        )
        const nextTransform = calculateFitTransform(
          activeCanvas?.diagram,
          activeCanvas?.shapes,
          window.innerWidth,
          window.innerHeight,
          inspectorOpen,
        )
        setTransform(nextTransform)
        viewsRef.current[state.activeId] = nextTransform
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [inspectorOpen])

  // Close menus on outside click or escape
  useEffect(() => {
    if (!menuOpen && !posMenuOpen && !ctxMenu) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      const insideCanvasMenu =
        menuRef.current?.contains(target) ||
        switcherRef.current?.contains(target)
      const insidePosMenu =
        posMenuRef.current?.contains(target) ||
        posSwitcherRef.current?.contains(target)
      const insideCtxMenu = ctxMenuRef.current?.contains(target)
      if (insideCanvasMenu || insidePosMenu || insideCtxMenu) return
      setMenuOpen(false)
      setPosMenuOpen(false)
      setEditingId(null)
      setCtxMenu(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        setPosMenuOpen(false)
        setEditingId(null)
        setCtxMenu(null)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen, posMenuOpen, ctxMenu])

  const zoomAt = useCallback(
    (factor: number, anchor?: { x: number; y: number }) => {
      setTransform((t) => {
        const scale = clampScale(t.scale * factor)
        if (scale === t.scale) return t
        const rect = canvasRef.current?.getBoundingClientRect()
        const w = rect?.width ?? window.innerWidth
        const h = rect?.height ?? window.innerHeight
        const ax = anchor ? anchor.x - (rect?.left ?? 0) : w / 2
        const ay = anchor ? anchor.y - (rect?.top ?? 0) : h / 2
        const cx = ax - t.x
        const cy = ay - t.y
        const ratio = scale / t.scale
        return { scale, x: ax - cx * ratio, y: ay - cy * ratio }
      })
    },
    [],
  )

  useEffect(() => {
    const handleNativeWheel = (event: WheelEvent) => {
      if (locked) return
      const target = event.target as Element | null
      if (!target) return
      // If wheel occurs inside any UI panel (Inspector, Validation, Toolbar, Menus),
      // allow native browser scrolling and do NOT zoom or preventDefault.
      if (
        toolbarRef.current?.contains(target as Node) ||
        target.closest?.(
          '.inspector-panel, .validation-panel, .toolbar, .canvas-menu, .pos-menu, .ctx-menu, .canvas-header-bar, aside, [role="menu"]',
        )
      ) {
        return
      }
      if (canvasRef.current && !canvasRef.current.contains(target as Node)) {
        return
      }
      event.preventDefault()
      const delta = Math.max(-300, Math.min(300, event.deltaY))
      const factor = Math.pow(ZOOM_FACTOR, delta / 100)
      zoomAt(factor, { x: event.clientX, y: event.clientY })
    }
    window.addEventListener('wheel', handleNativeWheel, { passive: false })
    return () => {
      window.removeEventListener('wheel', handleNativeWheel)
    }
  }, [locked, zoomAt])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // If the pointer went down on a diagram interactive element (node, group, edge,
      // resize handle, or waypoint), let DiagramView own that event exclusively —
      // do NOT deselect or start a canvas pan.
      const target = event.target as Element | null
      const isDiagramInteractive =
        target?.closest(
          '[data-node-id],[data-group-id],[data-edge-id],[data-port-id],[data-resize-handle],[data-waypoint],.shape,.path-handle,.resize-handle',
        ) !== null || Boolean(diagramSvgRef.current && target && diagramSvgRef.current.contains(target) && target !== diagramSvgRef.current)
      if (isDiagramInteractive) return

      if (event.button === 0) {
        setSelectedId(null)
        setSelectedNodeId(null)
        setSelectedEdgeId(null)
        setSelectedGroupId(null)
      }
      if (locked || !panMode || event.button !== 0) return
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        originX: transform.x,
        originY: transform.y,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [locked, panMode, transform],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      setTransform((t) => ({
        ...t,
        x: drag.originX + (event.clientX - drag.startX),
        y: drag.originY + (event.clientY - drag.startY),
      }))
    },
    [],
  )

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const resetView = useCallback(() => {
    const activeCanvas = canvases.find((canvas) => canvas.id === activeId)
    const nextTransform = calculateFitTransform(
      activeCanvas?.diagram,
      activeCanvas?.shapes,
      window.innerWidth,
      window.innerHeight,
      inspectorOpen,
    )
    viewsRef.current[activeId] = nextTransform
    setTransform(nextTransform)
  }, [activeId, canvases, inspectorOpen])

  const switchCanvas = useCallback(
    (id: string) => {
      setMenuOpen(false)
      setEditingId(null)
      setSelectedId(null)
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setSelectedGroupId(null)
      setTextEditId(null)
      setCtxMenu(null)
      if (id === activeId) return
      viewsRef.current[activeId] = transform
      setActiveId(id)
      const targetCanvas = canvases.find((canvas) => canvas.id === id)
      const nextTransform = calculateFitTransform(
        targetCanvas?.diagram,
        targetCanvas?.shapes,
        window.innerWidth,
        window.innerHeight,
        inspectorOpen,
      )
      viewsRef.current[id] = nextTransform
      setTransform(nextTransform)
      void setActiveCanvas(id).catch(() => {})
    },
    [activeId, transform, canvases, inspectorOpen],
  )

  // Cross-diagram navigation: jump to another document and focus on a node
  const handleNavigateToDocument = useCallback(
    (targetDocId: string, nodeId?: string) => {
      const targetCanvas = canvases.find(
        (c) => c.diagram?.documentId === targetDocId || c.id === targetDocId,
      )
      if (!targetCanvas) return
      switchCanvas(targetCanvas.id)
      if (nodeId && targetCanvas.diagram) {
        setSelectedNodeId(nodeId)
        setSelectedEdgeId(null)
        setSelectedGroupId(null)
        const targetNode = targetCanvas.diagram.nodes.find((n) => n.id === nodeId)
        if (targetNode) {
          const w = window.innerWidth
          const h = window.innerHeight
          const scale = clampScale(targetCanvas.diagram.viewport?.zoom ?? 0.8)
          setTransform({
            scale,
            x: w / 2 - (targetNode.position.x + targetNode.size.width / 2) * scale,
            y: h / 2 - (targetNode.position.y + targetNode.size.height / 2) * scale,
          })
        }
      }
    },
    [canvases, switchCanvas],
  )

  const handleNewCanvas = useCallback(async () => {
    viewsRef.current[activeId] = transform
    setMenuOpen(false)
    setEditingId(null)
    setSelectedId(null)
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setSelectedGroupId(null)
    setTextEditId(null)
    setCtxMenu(null)
    try {
      const state = await createCanvas()
      setCanvases(state.canvases)
      setActiveId(state.activeId)
      const nextTransform = calculateFitTransform(
        null,
        [],
        window.innerWidth,
        window.innerHeight,
        inspectorOpen,
      )
      viewsRef.current[state.activeId] = nextTransform
      setTransform(nextTransform)
    } catch {
      const local: CanvasMeta = {
        id: `local-${Date.now()}`,
        name: `Canvas ${canvases.length + 1}`,
        shapes: [],
        diagram: null,
      }
      setCanvases((list) => [...list, local])
      setActiveId(local.id)
      const nextTransform = calculateFitTransform(
        null,
        [],
        window.innerWidth,
        window.innerHeight,
        inspectorOpen,
      )
      viewsRef.current[local.id] = nextTransform
      setTransform(nextTransform)
    }
  }, [activeId, transform, canvases.length, inspectorOpen])

  const startRename = useCallback((id: string) => {
    renameCommittedRef.current = false
    setEditingId(id)
  }, [])

  const commitRename = useCallback(async (id: string, name: string) => {
    if (renameCommittedRef.current) return
    renameCommittedRef.current = true
    const trimmed = name.trim()
    setEditingId(null)
    if (!trimmed) return
    try {
      const state = await renameCanvas(id, trimmed)
      setCanvases(state.canvases)
    } catch {
      setCanvases((list) =>
        list.map((canvas) =>
          canvas.id === id ? { ...canvas, name: trimmed } : canvas,
        ),
      )
    }
  }, [])

  const handleRenameKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>, id: string) => {
      if (event.key === 'Enter') {
        commitRename(id, event.currentTarget.value)
      } else if (event.key === 'Escape') {
        event.stopPropagation()
        renameCommittedRef.current = false
        setEditingId(null)
      }
    },
    [commitRename],
  )

  const selectToolbarMode = useCallback((mode: ToolbarMode) => {
    setToolbarMode(mode)
    setPosMenuOpen(false)
  }, [])

  const activeShapes = useMemo(
    () =>
      canvases.find((canvas) => canvas.id === activeId)?.shapes ?? EMPTY_SHAPES,
    [canvases, activeId],
  )

  const activeDiagram = useMemo(
    () => canvases.find((canvas) => canvas.id === activeId)?.diagram ?? null,
    [canvases, activeId],
  )

  const allDiagrams = useMemo(
    () => canvases.flatMap((c) => (c.diagram ? [c.diagram] : [])),
    [canvases],
  )

  const activeDiagramRef = useRef<DiagramDocument | null>(null)
  const shapesRef = useRef<Shape[]>([])

  useEffect(() => {
    shapesRef.current = activeShapes
  }, [activeShapes])

  useEffect(() => {
    activeDiagramRef.current = activeDiagram
  }, [activeDiagram])

  const handleDiagramChange = useCallback(
    (next: DiagramDocument) => {
      activeDiagramRef.current = next
      setCanvases((list) =>
        list.map((canvas) =>
          canvas.id === activeId ? { ...canvas, diagram: next } : canvas,
        ),
      )
    },
    [activeId],
  )

  const persistDiagram = useCallback(() => {
    const next = activeDiagramRef.current
    if (next) void saveCanvasDiagram(activeId, next).catch(() => {})
  }, [activeId])

  const persistShapes = useCallback(
    (shapes: Shape[]) => {
      void saveCanvasShapes(activeId, shapes).catch(() => {})
    },
    [activeId],
  )

  const updateShapes = useCallback(
    (updater: (list: Shape[]) => Shape[]) => {
      setCanvases((list) =>
        list.map((canvas) =>
          canvas.id === activeId
            ? { ...canvas, shapes: updater(canvas.shapes) }
            : canvas,
        ),
      )
    },
    [activeId],
  )

  // Visual routing updates strictly preserve all semantic metadata
  const handleUpdateEdgeRouting = useCallback(
    (edgeId: string, routing: 'orthogonal' | 'straight' | 'curved') => {
      if (!activeDiagram) return
      const updated = {
        ...activeDiagram,
        edges: activeDiagram.edges.map((e) =>
          e.id === edgeId ? { ...e, visual: { ...e.visual, routing } } : e,
        ),
      }
      handleDiagramChange(updated)
      persistDiagram()
    },
    [activeDiagram, handleDiagramChange, persistDiagram],
  )

  const handleClearWaypoints = useCallback(
    (edgeId: string) => {
      if (!activeDiagram) return
      const updated = {
        ...activeDiagram,
        edges: activeDiagram.edges.map((e) =>
          e.id === edgeId ? { ...e, visual: { ...e.visual, waypoints: [] } } : e,
        ),
      }
      handleDiagramChange(updated)
      persistDiagram()
    },
    [activeDiagram, handleDiagramChange, persistDiagram],
  )

  // Update a node's position and/or size from the Inspector — preserves all semantic data
  const handleUpdateNodeBounds = useCallback(
    (nodeId: string, position: { x: number; y: number }, size: { width: number; height: number }) => {
      if (!activeDiagram) return
      const updated = {
        ...activeDiagram,
        nodes: activeDiagram.nodes.map((n) =>
          n.id === nodeId ? { ...n, position, size } : n,
        ),
      }
      handleDiagramChange(updated)
      persistDiagram()
    },
    [activeDiagram, handleDiagramChange, persistDiagram],
  )

  // Update a group's bounds from the Inspector — preserves all semantic data
  const handleUpdateGroupBounds = useCallback(
    (groupId: string, bounds: { x: number; y: number; width: number; height: number }) => {
      if (!activeDiagram) return
      const updated = {
        ...activeDiagram,
        groups: activeDiagram.groups.map((g) =>
          g.id === groupId ? { ...g, bounds } : g,
        ),
      }
      handleDiagramChange(updated)
      persistDiagram()
    },
    [activeDiagram, handleDiagramChange, persistDiagram],
  )

  const handleSelectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id)
    if (id) {
      setSelectedEdgeId(null)
      setSelectedGroupId(null)
      setInspectorOpen(true)
    }
  }, [])

  const handleSelectEdge = useCallback((id: string | null) => {
    setSelectedEdgeId(id)
    if (id) {
      setSelectedNodeId(null)
      setSelectedGroupId(null)
      setInspectorOpen(true)
    }
  }, [])

  const handleSelectGroup = useCallback((id: string | null) => {
    setSelectedGroupId(id)
    if (id) {
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setInspectorOpen(true)
    }
  }, [])

  const addShape = useCallback(
    (type: ShapeType) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      const w = rect?.width ?? window.innerWidth
      const h = rect?.height ?? window.innerHeight
      const cx = (w / 2 - transform.x) / transform.scale
      const cy = (h / 2 - transform.y) / transform.scale
      const shape = createShape(type, cx, cy)
      const next = [...shapesRef.current, shape]
      shapesRef.current = next
      updateShapes(() => next)
      setSelectedId(shape.id)
      persistShapes(next)
    },
    [transform, updateShapes, persistShapes],
  )

  const transformRef = useRef(transform)
  useEffect(() => {
    transformRef.current = transform
  }, [transform])

  const handleWindowShapePointerMoveRef = useRef<(event: PointerEvent) => void>(() => {})
  const handleWindowShapePointerUpRef = useRef<() => void>(() => {})

  const handleWindowShapePointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = shapeDragRef.current
      if (!drag) return
      const s = transformRef.current.scale || 1
      const dx = (event.clientX - drag.startX) / s
      const dy = (event.clientY - drag.startY) / s
      const updated = applyShapeDrag(drag.origin, drag.hit, dx, dy)
      updateShapes((list) =>
        list.map((shape) => (shape.id === drag.shapeId ? updated : shape)),
      )
    },
    [updateShapes],
  )

  const handleWindowShapePointerUp = useCallback(() => {
    window.removeEventListener('pointermove', handleWindowShapePointerMoveRef.current)
    window.removeEventListener('pointerup', handleWindowShapePointerUpRef.current)
    window.removeEventListener('pointercancel', handleWindowShapePointerUpRef.current)
    if (shapeDragRef.current) {
      shapeDragRef.current = null
      persistShapes(shapesRef.current)
    }
  }, [persistShapes])

  useEffect(() => {
    handleWindowShapePointerMoveRef.current = handleWindowShapePointerMove
    handleWindowShapePointerUpRef.current = handleWindowShapePointerUp
  })

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handleWindowShapePointerMoveRef.current)
      window.removeEventListener('pointerup', handleWindowShapePointerUpRef.current)
      window.removeEventListener('pointercancel', handleWindowShapePointerUpRef.current)
    }
  }, [])

  const handleShapePointerDown = useCallback(
    (event: ReactPointerEvent<Element>, shape: Shape, hit: HitKind) => {
      if (locked) return
      event.stopPropagation()
      if (event.button !== 0) return
      if (event.detail >= 2) {
        setSelectedId(shape.id)
        return
      }
      setSelectedId(shape.id)
      shapeDragRef.current = {
        shapeId: shape.id,
        hit,
        startX: event.clientX,
        startY: event.clientY,
        origin: shape,
      }
      window.addEventListener('pointermove', handleWindowShapePointerMoveRef.current)
      window.addEventListener('pointerup', handleWindowShapePointerUpRef.current)
      window.addEventListener('pointercancel', handleWindowShapePointerUpRef.current)
    },
    [locked],
  )

  const handleShapePointerMove = useCallback(
    (event: ReactPointerEvent<Element>) => {
      const drag = shapeDragRef.current
      if (!drag) return
      const dx = (event.clientX - drag.startX) / transform.scale
      const dy = (event.clientY - drag.startY) / transform.scale
      const updated = applyShapeDrag(drag.origin, drag.hit, dx, dy)
      updateShapes((list) =>
        list.map((shape) => (shape.id === drag.shapeId ? updated : shape)),
      )
    },
    [transform.scale, updateShapes],
  )

  const handleShapePointerUp = useCallback(() => {
    handleWindowShapePointerUp()
  }, [handleWindowShapePointerUp])

  const handleShapeContextMenu = useCallback(
    (event: ReactMouseEvent<Element>, shape: Shape) => {
      event.preventDefault()
      event.stopPropagation()
      setSelectedId(shape.id)
      setCtxMenu({
        x: Math.min(event.clientX, window.innerWidth - 240),
        y: Math.min(event.clientY, window.innerHeight - 280),
        shapeId: shape.id,
      })
    },
    [],
  )

  const startTextEdit = useCallback(
    (shape: Shape) => {
      if (locked) return
      setSelectedId(shape.id)
      setTextEditId(shape.id)
    },
    [locked],
  )

  const cancelTextEdit = useCallback(() => {
    setTextEditId(null)
  }, [])

  const commitShapeText = useCallback(
    (shape: Shape, text: string) => {
      setTextEditId(null)
      const trimmed = text.trim()
      const next: Shape[] = shapesRef.current.map((s) => {
        if (s.id !== shape.id) return s
        if (trimmed) return { ...s, text: trimmed }
        const { text: _text, ...rest } = s
        return rest
      })
      shapesRef.current = next
      updateShapes(() => next)
      persistShapes(next)
    },
    [updateShapes, persistShapes],
  )

  const applyShapeColor = useCallback(
    (mode: 'stroke' | 'fill', color: string) => {
      if (!ctxMenu) return
      const shapeId = ctxMenu.shapeId
      const next: Shape[] = shapesRef.current.map((s) => {
        if (s.id !== shapeId) return s
        if (mode === 'stroke') return { ...s, stroke: color }
        if (isPathShape(s)) return s
        return { ...s, fill: color }
      })
      shapesRef.current = next
      updateShapes(() => next)
      persistShapes(next)
    },
    [ctxMenu, updateShapes, persistShapes],
  )

  const handleDeleteShape = useCallback(() => {
    if (!ctxMenu) return
    const next = shapesRef.current.filter(
      (shape) => shape.id !== ctxMenu.shapeId,
    )
    shapesRef.current = next
    updateShapes(() => next)
    setCtxMenu(null)
    setSelectedId((id) => (id === ctxMenu.shapeId ? null : id))
    setTextEditId((id) => (id === ctxMenu.shapeId ? null : id))
    persistShapes(next)
  }, [ctxMenu, updateShapes, persistShapes])

  // Independent and multi-file JSON import
  const handleImport = useCallback(
    async (event: ReactChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget
      const files = Array.from(input.files ?? [])
      input.value = ''
      if (!files.length) return
      setImporting(true)

      try {
        let lastReport: ValidationReport | null = null
        let currentCanvases = [...canvases]
        let currentManifest = manifest

        for (const file of files) {
          const documents = currentCanvases.flatMap((canvas) =>
            canvas.diagram ? [canvas.diagram] : [],
          )
          const text = await file.text()
          const { value, report } = validateArchitectureJson(text, {
            fileName: file.name,
            manifest: currentManifest,
            documents,
          })
          lastReport = report

          if (!value) continue

          if (isArchitectureManifest(value)) {
            currentManifest = value
            setManifest(value)
            void saveArchitectureManifest(value)
              .then((state) => {
                setCanvases(state.canvases)
                setManifest(state.manifest)
              })
              .catch(() => {})
            continue
          }

          // Diagram document import
          try {
            const created = await createCanvas(value.title)
            currentCanvases = created.canvases.map((canvas) =>
              canvas.id === created.activeId ? { ...canvas, diagram: value } : canvas,
            )
            setCanvases(currentCanvases)
            setActiveId(created.activeId)
            void saveCanvasDiagram(created.activeId, value)
              .then((state) => setCanvases(state.canvases))
              .catch(() => {})
          } catch {
            const local: CanvasMeta = {
              id: value.documentId || `diagram-${Date.now().toString(36)}`,
              name: value.title,
              shapes: [],
              diagram: value,
            }
            currentCanvases = [...currentCanvases, local]
            setCanvases(currentCanvases)
            setActiveId(local.id)
          }
          const nextTransform = calculateFitTransform(
            value,
            [],
            window.innerWidth,
            window.innerHeight,
            inspectorOpen,
          )
          setTransform(nextTransform)
        }

        setValidationReport(lastReport)
      } finally {
        setImporting(false)
      }
    },
    [canvases, manifest, inspectorOpen],
  )

  // Validate active diagram on demand
  const handleValidateActiveDiagram = useCallback(() => {
    if (!activeDiagram) return
    const documents = canvases.flatMap((c) => (c.diagram ? [c.diagram] : []))
    const { report } = validateArchitectureJson(JSON.stringify(activeDiagram), {
      fileName: `${activeDiagram.documentId}.json`,
      manifest,
      documents,
    })
    setValidationReport(report)
  }, [activeDiagram, canvases, manifest])

  // Reload architecture files from disk
  const handleReloadBatch1 = useCallback(async () => {
    setIsReloading(true)
    try {
      const state = await reloadBatch1()
      setCanvases(state.canvases)
      setActiveId(state.activeId)
      setManifest(state.manifest)
      const activeCanvas = state.canvases.find((c) => c.id === state.activeId)
      const doc = activeCanvas?.diagram
      const nextTransform = calculateFitTransform(
        doc,
        activeCanvas?.shapes,
        window.innerWidth,
        window.innerHeight,
        inspectorOpen,
      )
      setTransform(nextTransform)
      viewsRef.current[state.activeId] = nextTransform
      setMenuOpen(false)
    } catch {
      // API fallback
    } finally {
      setTimeout(() => setIsReloading(false), 600)
    }
  }, [inspectorOpen])

  const toggleLock = useCallback(() => {
    if (!locked) setSelectedId(null)
    setLocked((value) => !value)
  }, [locked])

  const handleGripPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      gripDragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        originX: toolbarPos.x,
        originY: toolbarPos.y,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [toolbarPos],
  )

  const handleGripPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = gripDragRef.current
      if (!drag) return
      const rect = toolbarRef.current?.getBoundingClientRect()
      const maxX = Math.max(8, window.innerWidth - (rect?.width ?? 0) - 8)
      const maxY = Math.max(8, window.innerHeight - (rect?.height ?? 0) - 8)
      setToolbarPos({
        x: Math.min(maxX, Math.max(8, drag.originX + (event.clientX - drag.startX))),
        y: Math.min(maxY, Math.max(8, drag.originY + (event.clientY - drag.startY))),
      })
    },
    [],
  )

  const handleGripPointerUp = useCallback(() => {
    gripDragRef.current = null
  }, [])

  const pannable = panMode && !locked
  const activeCanvasName =
    canvases.find((canvas) => canvas.id === activeId)?.name ?? activeId
  const ctxShape = ctxMenu
    ? activeShapes.find((shape) => shape.id === ctxMenu.shapeId)
    : undefined
  const visibleValidationResults = validationReport?.results.filter(
    (result) => result.status !== 'pass',
  ) ?? []

  const handleDownload = useCallback(() => {
    const nodes = activeId === DEFAULT_CANVAS_ID && !activeDiagram ? DEFAULT_NODES : []
    const diagramClone = diagramSvgRef.current?.cloneNode(true) as SVGSVGElement | undefined
    diagramClone?.querySelectorAll('[data-export-remove]').forEach((element) => element.remove())
    const html = buildStandaloneHtml(activeCanvasName, nodes, activeShapes, {
      diagramSvg: diagramClone?.outerHTML,
      initialTransform: transform,
    })
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeCanvasName.replace(/[\\/:*?"<>|]/g, '-')}.html`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [activeId, activeCanvasName, activeShapes, activeDiagram, transform])

  // Center on affected node or edge when clicked in validation report
  const handleFocusAffectedId = (id: string) => {
    if (!activeDiagram) return
    const node = activeDiagram.nodes.find((n) => n.id === id)
    if (node) {
      setSelectedNodeId(node.id)
      setSelectedEdgeId(null)
      setSelectedGroupId(null)
      const w = window.innerWidth
      const h = window.innerHeight
      const scale = transform.scale
      setTransform({
        scale,
        x: w / 2 - (node.position.x + node.size.width / 2) * scale,
        y: h / 2 - (node.position.y + node.size.height / 2) * scale,
      })
      return
    }
    const edge = activeDiagram.edges.find((e) => e.id === id)
    if (edge) {
      setSelectedEdgeId(edge.id)
      setSelectedNodeId(null)
      setSelectedGroupId(null)
    }
  }

  return (
    <div className="app">
      <div
        ref={canvasRef}
        className={`canvas${pannable ? ' is-pannable' : ''}`}
        style={{
          backgroundPosition: `${transform.x}px ${transform.y}px`,
          backgroundSize: `${GRID_SIZE * transform.scale}px ${GRID_SIZE * transform.scale}px`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="canvas-content"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
        >
          {activeDiagram && (
            <DiagramView
              ref={diagramSvgRef}
              document={activeDiagram}
              locked={locked}
              scale={transform.scale}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              selectedGroupId={selectedGroupId}
              onSelectNode={handleSelectNode}
              onSelectEdge={handleSelectEdge}
              onSelectGroup={handleSelectGroup}
              onDocumentChange={handleDiagramChange}
              onVisualEditEnd={persistDiagram}
              onNavigateToDocument={handleNavigateToDocument}
            />
          )}

          {activeId === DEFAULT_CANVAS_ID && !activeDiagram &&
            DEFAULT_NODES.map((node) => (
              <div
                key={node.title}
                className="node-card"
                style={{ left: node.x, top: node.y, width: node.w }}
              >
                <div className="node-card-title">{node.title}</div>
                <div className="node-card-sub">{node.sub}</div>
              </div>
            ))}

          {activeShapes.map((shape) => (
            <ShapeView
              key={shape.id}
              shape={shape}
              selected={selectedId === shape.id}
              locked={locked}
              editing={textEditId === shape.id}
              onPointerDown={handleShapePointerDown}
              onPointerMove={handleShapePointerMove}
              onPointerUp={handleShapePointerUp}
              onStartTextEdit={startTextEdit}
              onCommitText={commitShapeText}
              onCancelTextEdit={cancelTextEdit}
              onContextMenu={handleShapeContextMenu}
            />
          ))}
        </div>
      </div>

      <input
        ref={importInputRef}
        className="import-input"
        type="file"
        multiple
        accept=".json,application/json"
        aria-label="Import GRAVITAS JSON"
        onChange={(event) => void handleImport(event)}
      />

      {/* Main Toolbar */}
      <div
        className={`toolbar mode-${toolbarMode}`}
        ref={toolbarRef}
        style={
          toolbarMode === 'vertical'
            ? { left: toolbarPos.x, top: toolbarPos.y }
            : undefined
        }
      >
        {toolbarMode === 'vertical' && (
          <div
            className="toolbar-grip"
            title="Drag to move"
            aria-label="Drag to move toolbar"
            onPointerDown={handleGripPointerDown}
            onPointerMove={handleGripPointerMove}
            onPointerUp={handleGripPointerUp}
            onPointerCancel={handleGripPointerUp}
          >
            <GripVertical size={14} />
          </div>
        )}

        {/* Canvas Switcher Menu */}
        <div className="canvas-switcher" ref={switcherRef}>
          <button
            type="button"
            className={`tool${menuOpen ? ' is-active' : ''}`}
            title="Diagrams & Canvases"
            aria-label="Open canvas list"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpen((open) => !open)
              setPosMenuOpen(false)
            }}
          >
            <Layers size={20} />
          </button>
          {menuOpen && (
            <div className="canvas-menu" role="menu" ref={menuRef}>
              <div className="canvas-menu-title">Diagrams &amp; Canvases</div>
              {canvases.map((canvas) => (
                <div key={canvas.id} className="canvas-item">
                  {editingId === canvas.id ? (
                    <input
                      className="canvas-rename-input"
                      autoFocus
                      defaultValue={canvas.name}
                      onKeyDown={(event) =>
                        handleRenameKeyDown(event, canvas.id)
                      }
                      onBlur={(event) =>
                        commitRename(canvas.id, event.currentTarget.value)
                      }
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        className={`canvas-item-name${canvas.id === activeId ? ' is-active' : ''}`}
                        onClick={() => switchCanvas(canvas.id)}
                      >
                        <span className="canvas-item-icon">
                          {canvas.id === activeId ? <Check size={14} /> : null}
                        </span>
                        <span className="canvas-item-label">{canvas.name}</span>
                        {canvas.diagram && (
                          <span className={`canvas-item-badge category-${canvas.diagram.category || 'other'}`}>
                            {canvas.diagram.diagramType === 'system-context'
                              ? 'L0'
                              : canvas.diagram.diagramType === 'master-architecture'
                                ? 'L1'
                                : canvas.diagram.diagramType === 'deployment-architecture'
                                  ? 'Deploy'
                                  : canvas.diagram.category
                                    ? canvas.diagram.category.toUpperCase()
                                    : 'Subsystem'}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="canvas-item-rename"
                        title={`Rename ${canvas.name}`}
                        aria-label={`Rename ${canvas.name}`}
                        onClick={() => startRename(canvas.id)}
                      >
                        <Pencil size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
              <div className="canvas-menu-sep" />
              <button
                type="button"
                role="menuitem"
                className="canvas-item-new"
                onClick={() => void handleReloadBatch1()}
                title="Reload all architecture files from disk"
              >
                <RotateCcw size={15} />
                Reload Architecture Files
              </button>
              <button
                type="button"
                role="menuitem"
                className="canvas-item-new"
                onClick={() => void handleNewCanvas()}
              >
                <Plus size={16} />
                New Canvas
              </button>
            </div>
          )}
        </div>

        <div className="toolbar-sep" role="separator" />

        {/* Freeform Annotation Tools */}
        <button
          type="button"
          className="tool"
          title="Add rectangle"
          aria-label="Add rectangle"
          onClick={() => addShape('rect')}
        >
          <Square size={20} />
        </button>
        <button
          type="button"
          className="tool"
          title="Add oval"
          aria-label="Add oval"
          onClick={() => addShape('oval')}
        >
          <Ellipse size={20} />
        </button>
        <button
          type="button"
          className="tool"
          title="Add circle"
          aria-label="Add circle"
          onClick={() => addShape('circle')}
        >
          <Circle size={20} />
        </button>
        <button
          type="button"
          className="tool"
          title="Add triangle"
          aria-label="Add triangle"
          onClick={() => addShape('triangle')}
        >
          <Triangle size={20} />
        </button>
        <button
          type="button"
          className="tool"
          title="Add arrow"
          aria-label="Add arrow"
          onClick={() => addShape('arrow')}
        >
          <MoveUpRight size={20} />
        </button>
        <button
          type="button"
          className="tool"
          title="Add line"
          aria-label="Add line"
          onClick={() => addShape('line')}
        >
          <Slash size={20} />
        </button>

        {/* Import JSON File */}
        <button
          type="button"
          className="tool"
          title="Import GRAVITAS JSON (supports multi-select)"
          aria-label="Import GRAVITAS JSON file"
          disabled={importing}
          onClick={() => importInputRef.current?.click()}
        >
          <FileUp size={20} />
        </button>

        {/* Validate Active Diagram */}
        {activeDiagram && (
          <button
            type="button"
            className="tool"
            title="Validate Diagram Rules (V-001 to V-036)"
            aria-label="Validate Diagram Rules"
            onClick={handleValidateActiveDiagram}
          >
            <FileCheck size={20} />
          </button>
        )}

        {/* Toggle Inspector Panel */}
        <button
          type="button"
          className={`tool${inspectorOpen ? ' is-active' : ''}`}
          title={inspectorOpen ? 'Hide Architecture Inspector' : 'Open Architecture Inspector'}
          aria-label="Toggle Architecture Inspector"
          onClick={() => setInspectorOpen((o) => !o)}
        >
          <Compass size={20} />
        </button>

        <div className="toolbar-sep" role="separator" />

        {/* Viewport Zoom & Pan */}
        <button
          type="button"
          className="tool"
          title="Zoom in"
          aria-label="Zoom in"
          disabled={locked}
          onClick={() => zoomAt(ZOOM_FACTOR)}
        >
          <ZoomIn size={20} />
        </button>
        <button
          type="button"
          className="tool"
          title="Zoom out"
          aria-label="Zoom out"
          disabled={locked}
          onClick={() => zoomAt(1 / ZOOM_FACTOR)}
        >
          <ZoomOut size={20} />
        </button>
        <button
          type="button"
          className={`tool${locked ? ' is-active' : ''}`}
          title={locked ? 'Unlock' : 'Lock'}
          aria-label="Toggle lock"
          aria-pressed={locked}
          onClick={toggleLock}
        >
          {locked ? <Lock size={20} /> : <LockOpen size={20} />}
        </button>
        <button
          type="button"
          className={`tool${panMode ? ' is-active' : ''}`}
          title="Pan"
          aria-label="Toggle pan"
          aria-pressed={panMode}
          disabled={locked}
          onClick={() => setPanMode((v) => !v)}
        >
          <Hand size={20} />
        </button>
        <button
          type="button"
          className="tool"
          title="Reset to Viewport Default"
          aria-label="Reset Viewport"
          onClick={resetView}
        >
          <CheckCheck size={20} />
        </button>
        <button
          type="button"
          className="tool"
          title="Export Standalone HTML"
          aria-label="Export Standalone HTML"
          onClick={handleDownload}
        >
          <Download size={20} />
        </button>

        <div className="toolbar-sep" role="separator" />

        <div className="toolbar-position" ref={posSwitcherRef}>
          <button
            type="button"
            className={`tool${posMenuOpen ? ' is-active' : ''}`}
            title="Toolbar position"
            aria-label="Toolbar position"
            aria-haspopup="menu"
            aria-expanded={posMenuOpen}
            onClick={() => {
              setPosMenuOpen((open) => !open)
              setMenuOpen(false)
            }}
          >
            <Move size={20} />
          </button>
          {posMenuOpen && (
            <div className="canvas-menu" role="menu" ref={posMenuRef}>
              <div className="canvas-menu-title">Position</div>
              <button
                type="button"
                role="menuitem"
                className={`canvas-item-new${toolbarMode === 'vertical' ? ' is-active' : ''}`}
                onClick={() => selectToolbarMode('vertical')}
              >
                <MoveVertical size={16} />
                Vertical (free)
              </button>
              <button
                type="button"
                role="menuitem"
                className={`canvas-item-new${toolbarMode === 'top' ? ' is-active' : ''}`}
                onClick={() => selectToolbarMode('top')}
              >
                <PanelTop size={16} />
                Top
              </button>
              <button
                type="button"
                role="menuitem"
                className={`canvas-item-new${toolbarMode === 'bottom' ? ' is-active' : ''}`}
                onClick={() => selectToolbarMode('bottom')}
              >
                <PanelBottom size={16} />
                Bottom
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="tool"
          title="Toggle theme"
          aria-label="Toggle theme"
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        >
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
      </div>

      {/* Top-Left Canvas Title & Quick Reload Bar */}
      <div className="canvas-header-bar">
        {activeDiagram?.category ? (
          <span className={`canvas-header-badge category-${activeDiagram.category}`}>
            {activeDiagram.diagramType === 'system-context'
              ? 'L0'
              : activeDiagram.diagramType === 'master-architecture'
                ? 'L1'
                : activeDiagram.diagramType === 'deployment-architecture'
                  ? 'DEPLOY'
                  : activeDiagram.category.toUpperCase()}
          </span>
        ) : (
          <span className="canvas-header-badge">CANVAS</span>
        )}
        <div className="canvas-header-info">
          <div className="canvas-header-title" title={activeCanvasName}>
            {activeCanvasName}
          </div>
          {activeDiagram && (
            <div className="canvas-header-sub">
              {activeDiagram.documentId} · {activeDiagram.nodes.length} nodes · {activeDiagram.edges.length} connections
            </div>
          )}
        </div>
        <div className="canvas-header-divider" />
        <button
          type="button"
          className="canvas-header-reload-btn"
          title="Reload architecture files from disk"
          aria-label="Reload architecture files from disk"
          onClick={() => void handleReloadBatch1()}
        >
          <RotateCcw size={14} className={isReloading ? 'spin-icon' : ''} />
          <span>Reload</span>
        </button>
      </div>

      {/* Inspector Panel Sidebar */}
      {inspectorOpen && activeDiagram && (
        <InspectorPanel
          document={activeDiagram}
          manifest={manifest}
          allDocuments={allDiagrams}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          selectedGroupId={selectedGroupId}
          onClose={() => setInspectorOpen(false)}
          onNavigateToDocument={handleNavigateToDocument}
          onUpdateEdgeRouting={handleUpdateEdgeRouting}
          onClearWaypoints={handleClearWaypoints}
          onSelectNode={handleSelectNode}
          onUpdateNodeBounds={handleUpdateNodeBounds}
          onUpdateGroupBounds={handleUpdateGroupBounds}
        />
      )}

      {/* Validation Report Panel */}
      {validationReport && (
        <section className="validation-panel" aria-label="JSON validation report">
          <div className="validation-header">
            <div>
              <div className="validation-title">
                {validationReport.failed
                  ? 'Imported with validation issues'
                  : 'JSON validated'}
              </div>
              <div className="validation-summary">
                {validationReport.totalChecks} checks · {validationReport.passed} passed · {validationReport.failed} failed · {validationReport.warnings} warnings
              </div>
            </div>
            <button
              type="button"
              className="validation-close"
              aria-label="Close validation report"
              onClick={() => setValidationReport(null)}
            >
              <X size={16} />
            </button>
          </div>
          {visibleValidationResults.length ? (
            <div className="validation-results">
              {visibleValidationResults.map((result, index) => (
                <div key={`${result.ruleId}-${index}`} className={`validation-result ${result.status}`}>
                  <span className="validation-result-rule">{result.ruleId}</span>
                  {result.details}
                  {result.affectedIds.length > 0 && (
                    <div className="validation-affected">
                      {result.affectedIds.map((id) => (
                        <button
                          key={id}
                          type="button"
                          className="validation-affected-btn"
                          onClick={() => handleFocusAffectedId(id)}
                          title="Click to focus on canvas"
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="validation-success">All applicable checks passed.</div>
          )}
        </section>
      )}

      {/* Context Menu for Shapes */}
      {ctxMenu && (
        <div
          className="context-menu"
          ref={ctxMenuRef}
          role="menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="context-menu-item"
            onClick={handleDeleteShape}
          >
            <Trash size={15} />
            Delete
          </button>
          <div className="context-menu-sep" role="separator" />
          <div className="context-color-block">
            <div className="context-color-label">Only border</div>
            <div className="color-swatches">
              {COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="color-swatch"
                  title={color}
                  aria-label={`Border ${color}`}
                  style={{ backgroundColor: color }}
                  onClick={() => applyShapeColor('stroke', color)}
                />
              ))}
            </div>
          </div>
          {ctxShape && !isPathShape(ctxShape) && (
            <div className="context-color-block">
              <div className="context-color-label">Complete shape</div>
              <div className="color-swatches">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="color-swatch"
                    title={color}
                    aria-label={`Fill ${color}`}
                    style={{ backgroundColor: color }}
                    onClick={() => applyShapeColor('fill', color)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
