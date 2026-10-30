// Interactive view of a single canvas shape: resizable geometry
// primitives (rectangle, oval, circle, triangle) and flexible paths
// (arrow, line) with draggable endpoints and an optional bend control
// point. Shapes carry optional text (edit inline by double-clicking)
// and border/fill colors. The shape model and drag math live in
// shapeModel.ts.
//
// Hit-testing is done by the browser on the painted SVG geometry
// itself (`pointer-events: visiblePainted`), so a shape only reacts
// when the cursor is exactly on it: inside its painted area for
// geometry shapes, and right on the stroke for paths. The wrapper
// box around a shape stays transparent to the pointer, so clicks
// near a shape fall through to the canvas and pan it instead.

import { useEffect, useRef } from 'react'
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import type { HitKind, Shape } from './shapeModel'
import { isPathShape } from './shapeModel'

export interface ShapeViewProps {
  shape: Shape
  selected: boolean
  locked: boolean
  editing: boolean
  onPointerDown: (
    event: ReactPointerEvent<Element>,
    shape: Shape,
    hit: HitKind,
  ) => void
  onPointerMove: (event: ReactPointerEvent<Element>) => void
  onPointerUp: (event: ReactPointerEvent<Element>) => void
  onStartTextEdit: (shape: Shape) => void
  onCommitText: (shape: Shape, text: string) => void
  onCancelTextEdit: () => void
  onContextMenu: (
    event: ReactMouseEvent<Element>,
    shape: Shape,
  ) => void
}

const PATH_PAD = 16
// Width of the invisible hit strip drawn over a path: grabbing a bit
// off the line still catches it
const PATH_GRAB_WIDTH = 12

interface TextEditorProps {
  initial: string
  className: string
  style?: CSSProperties
  onCommit: (text: string) => void
  onCancel: () => void
}

// Borderless inline editor: the text is typed directly inside the shape.
// Enter commits, Escape cancels, clicking away commits.
function TextEditor({
  initial,
  className,
  style,
  onCommit,
  onCancel,
}: TextEditorProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [])

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      contentEditable
      suppressContentEditableWarning
      onBlur={(event) => onCommit(event.currentTarget.textContent ?? '')}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {initial}
    </div>
  )
}

export function ShapeView({
  shape,
  selected,
  locked,
  editing,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onStartTextEdit,
  onCommitText,
  onCancelTextEdit,
  onContextMenu,
}: ShapeViewProps) {
  const shapeClass = `shape${selected ? ' selected' : ''}`

  if (isPathShape(shape)) {
    const x1 = shape.x1
    const y1 = shape.y1
    const x2 = shape.x2
    const y2 = shape.y2
    const bx = shape.bend?.x
    const by = shape.bend?.y
    const minX = Math.min(x1, x2, bx ?? x1)
    const minY = Math.min(y1, y2, by ?? y1)
    const maxX = Math.max(x1, x2, bx ?? x1)
    const maxY = Math.max(y1, y2, by ?? y1)
    const left = minX - PATH_PAD
    const top = minY - PATH_PAD
    const width = maxX - minX + PATH_PAD * 2
    const height = maxY - minY + PATH_PAD * 2
    const markerId = `arrow-head-${shape.id}`
    const mid = shape.bend ?? { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
    const stroke = shape.stroke ?? 'currentColor'
    const d = shape.bend
      ? `M ${x1 - left} ${y1 - top} Q ${shape.bend.x - left} ${shape.bend.y - top} ${x2 - left} ${y2 - top}`
      : `M ${x1 - left} ${y1 - top} L ${x2 - left} ${y2 - top}`
    const textStyle = { left: mid.x - left, top: mid.y - top }
    return (
      <div
        className={shapeClass}
        style={{ left, top, width, height }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg className="shape-svg" width={width} height={height}>
          {shape.type === 'arrow' && (
            <defs>
              <marker
                id={markerId}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
              </marker>
            </defs>
          )}
          <path
            d={d}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            markerEnd={shape.type === 'arrow' ? `url(#${markerId})` : undefined}
          />
          <path
            className="path-grab"
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={PATH_GRAB_WIDTH}
            strokeLinecap="round"
            onPointerDown={(event) => onPointerDown(event, shape, 'body')}
            onDoubleClick={() => onStartTextEdit(shape)}
            onContextMenu={(event) => onContextMenu(event, shape)}
          />
        </svg>
        {!editing && shape.text && (
          <div className="shape-text shape-text-path" style={textStyle}>
            {shape.text}
          </div>
        )}
        {editing && (
          <TextEditor
            initial={shape.text ?? ''}
            className="shape-text-input shape-text-input-path"
            style={textStyle}
            onCommit={(text) => onCommitText(shape, text)}
            onCancel={onCancelTextEdit}
          />
        )}
        {selected && !locked && !editing && (
          <>
            <div
              className="path-handle"
              style={{ left: x1 - left, top: y1 - top }}
              onPointerDown={(event) => onPointerDown(event, shape, 'p1')}
              onContextMenu={(event) => onContextMenu(event, shape)}
            />
            <div
              className="path-handle"
              style={{ left: x2 - left, top: y2 - top }}
              onPointerDown={(event) => onPointerDown(event, shape, 'p2')}
              onContextMenu={(event) => onContextMenu(event, shape)}
            />
            <div
              className="path-handle path-handle-bend"
              title="Drag to bend"
              style={{ left: mid.x - left, top: mid.y - top }}
              onPointerDown={(event) => onPointerDown(event, shape, 'bend')}
              onContextMenu={(event) => onContextMenu(event, shape)}
            />
          </>
        )}
      </div>
    )
  }

  // Rectangle, oval, circle and triangle: resizable primitives
  let left = 0
  let top = 0
  let width = 0
  let height = 0
  let svg: ReactNode
  if (shape.type === 'rect') {
    left = shape.x
    top = shape.y
    width = shape.w
    height = shape.h
    svg = <rect x={1} y={1} width={width - 2} height={height - 2} />
  } else if (shape.type === 'oval') {
    left = shape.x
    top = shape.y
    width = shape.w
    height = shape.h
    svg = (
      <ellipse
        cx={width / 2}
        cy={height / 2}
        rx={width / 2 - 1}
        ry={height / 2 - 1}
      />
    )
  } else if (shape.type === 'circle') {
    left = shape.cx - shape.r
    top = shape.cy - shape.r
    width = shape.r * 2
    height = shape.r * 2
    svg = <circle cx={shape.r} cy={shape.r} r={shape.r - 1} />
  } else {
    left = shape.x
    top = shape.y
    width = shape.w
    height = shape.h
    svg = (
      <polygon points={`${width / 2},1 ${width - 1},${height - 1} 1,${height - 1}`} />
    )
  }
  const stroke = shape.stroke ?? 'currentColor'
  // A transparent fill keeps the interior hit-testable, so an unfilled
  // shape can still be grabbed from inside its boundary
  const fill = shape.fill ?? (selected ? 'currentColor' : 'transparent')
  const fillOpacity = shape.fill ? 1 : selected ? 0.12 : 1
  return (
    <div
      className={shapeClass}
      style={{ left, top, width, height }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg className="shape-svg" width={width} height={height}>
        <g
          className="shape-hit"
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={2}
          onPointerDown={(event) => onPointerDown(event, shape, 'body')}
          onDoubleClick={() => onStartTextEdit(shape)}
          onContextMenu={(event) => onContextMenu(event, shape)}
        >
          {svg}
        </g>
      </svg>
      {!editing && shape.text && (
        <div className="shape-text shape-text-area">{shape.text}</div>
      )}
      {editing && (
        <TextEditor
          initial={shape.text ?? ''}
          className="shape-text-input shape-text-input-area"
          onCommit={(text) => onCommitText(shape, text)}
          onCancel={onCancelTextEdit}
        />
      )}
      {selected && !locked && !editing && (
        <div
          className="resize-handle"
          title="Drag to resize"
          style={{ left: width - 5, top: height - 5 }}
          onPointerDown={(event) => onPointerDown(event, shape, 'resize')}
          onContextMenu={(event) => onContextMenu(event, shape)}
        />
      )}
    </div>
  )
}
