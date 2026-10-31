import React, { useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Compass,
  Cpu,
  ExternalLink,
  Layers,
  Move,
  Network,
  RotateCcw,
  Shield,
  X,
} from 'lucide-react'
import { getGroupBounds } from '../diagramGeometry'
import {
  CANONICAL_ENGINES,
  CANONICAL_PALETTE,
  type ArchitectureManifest,
  type Bounds,
  type DiagramDocument,
  type DiagramEdge,
  type DiagramNode,
  type ExternalReference,
  type Point,
  type Size,
} from '../diagramModel'

interface InspectorPanelProps {
  document: DiagramDocument | null
  manifest: ArchitectureManifest | null
  allDocuments: DiagramDocument[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  selectedGroupId: string | null
  onClose: () => void
  onNavigateToDocument: (documentId: string, nodeId?: string) => void
  onUpdateEdgeRouting: (edgeId: string, routing: 'orthogonal' | 'straight' | 'curved') => void
  onClearWaypoints: (edgeId: string) => void
  onSelectNode: (nodeId: string | null) => void
  onUpdateNodeBounds?: (nodeId: string, position: Point, size: Size) => void
  onUpdateGroupBounds?: (groupId: string, bounds: Bounds) => void
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  document,
  manifest: _manifest,
  allDocuments,
  selectedNodeId,
  selectedEdgeId,
  selectedGroupId,
  onClose,
  onNavigateToDocument,
  onUpdateEdgeRouting,
  onClearWaypoints,
  onSelectNode,
  onUpdateNodeBounds,
  onUpdateGroupBounds,
}) => {
  const [reqFilter, setReqFilter] = useState('')
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const panelRef = React.useRef<HTMLElement>(null)

  // Stop wheel events inside the Inspector from bubbling up to the canvas zoom handler
  React.useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const stop = (e: WheelEvent) => e.stopPropagation()
    el.addEventListener('wheel', stop, { passive: false })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (!document) return null

  // Resolve selected element
  const rawNode = selectedNodeId
    ? document.nodes.find((n) => n.id === selectedNodeId) ?? null
    : null
  const selectedNode = rawNode
    ? {
        ...rawNode,
        metadata: rawNode.metadata ?? {
          engineId: rawNode.engineId ?? null,
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
        },
      }
    : null

  const selectedExternalRef: ExternalReference | null =
    selectedNodeId && !selectedNode
      ? document.externalReferences.find((r) => r.nodeId === selectedNodeId) ?? null
      : null

  const selectedEdge: DiagramEdge | null = selectedEdgeId
    ? document.edges.find((e) => e.id === selectedEdgeId) ?? null
    : null

  const rawGroup = selectedGroupId
    ? document.groups.find((grp) => grp.id === selectedGroupId) ?? null
    : null
  const selectedGroup = rawGroup
    ? {
        ...rawGroup,
        bounds: getGroupBounds(rawGroup, document.nodes),
        description: rawGroup.description ?? '',
        metadata: {
          category: rawGroup.metadata?.category ?? 'subsystem',
          engineIds: Array.isArray(rawGroup.metadata?.engineIds)
            ? rawGroup.metadata.engineIds
            : [],
          notes: rawGroup.metadata?.notes ?? '',
        },
      }
    : null

  // Nodes lookup map for resolving edge endpoints
  const nodesMap = new Map<string, DiagramNode>()
  document.nodes.forEach((n) => nodesMap.set(n.id, n))

  // Find other occurrences of a canonical engine across all loaded documents
  const findEngineOccurrences = (engineId: string | null) => {
    if (!engineId) return []
    const results: Array<{ documentId: string; documentTitle: string; nodeId: string }> = []
    for (const doc of allDocuments) {
      for (const node of doc.nodes) {
        const nodeEngId = node.metadata?.engineId ?? node.engineId
        if (nodeEngId === engineId) {
          results.push({
            documentId: doc.documentId,
            documentTitle: doc.title,
            nodeId: node.id,
          })
        }
      }
      // Also check crossReferences in doc
      for (const cross of doc.crossReferences ?? []) {
        if (cross.canonicalEngineId === engineId) {
          for (const occ of cross.otherOccurrences ?? []) {
            if (
              occ.documentId &&
              !results.some(
                (r) => r.documentId === occ.documentId && r.nodeId === occ.nodeId,
              )
            ) {
              const matchedDoc = allDocuments.find((d) => d.documentId === occ.documentId)
              results.push({
                documentId: occ.documentId,
                documentTitle: matchedDoc?.title ?? occ.documentId,
                nodeId: occ.nodeId,
              })
            }
          }
        }
      }
    }
    return results
  }

  return (
    <aside ref={panelRef} className="inspector-panel" aria-label="Architecture Inspector">
      {/* Inspector Header */}
      <div className="inspector-header">
        <div className="inspector-header-title">
          <Compass size={16} className="inspector-header-icon" />
          <span>
            {selectedNode
              ? 'Node Details'
              : selectedExternalRef
                ? 'External Reference'
                : selectedEdge
                  ? 'Connection Semantic Data'
                  : selectedGroup
                    ? 'Subsystem Group'
                    : 'Diagram Architecture Scope'}
          </span>
        </div>
        <button
          type="button"
          className="inspector-close-btn"
          aria-label="Close Inspector"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>

      <div className="inspector-content">
        {/* CASE 1: NODE SELECTED */}
        {selectedNode && (
          <div className="inspector-section-group">
            <div className="inspector-title-row">
              <div
                className="inspector-category-pill"
                style={{
                  backgroundColor:
                    CANONICAL_PALETTE[selectedNode.style.category]?.nodeColor ?? '#3b82f6',
                }}
              >
                {selectedNode.style.category}
              </div>
              <span className="inspector-type-badge">{selectedNode.type}</span>
            </div>
            <h2 className="inspector-main-title">{selectedNode.label}</h2>
            <div className="inspector-id-code">ID: {selectedNode.id}</div>
            <p className="inspector-description">{selectedNode.description}</p>

            {/* Position & Size Controls */}
            {onUpdateNodeBounds && (
              <div className="inspector-card">
                <div className="inspector-card-header">
                  <Move size={14} />
                  <span>Position &amp; Size (Box)</span>
                </div>
                <div className="inspector-dim-grid">
                  <div className="inspector-dim-field">
                    <label className="dim-label">X (px)</label>
                    <input
                      type="number"
                      className="inspector-dim-input"
                      value={Math.round(selectedNode.position.x)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0
                        onUpdateNodeBounds(
                          selectedNode.id,
                          { ...selectedNode.position, x: val },
                          selectedNode.size,
                        )
                      }}
                    />
                  </div>
                  <div className="inspector-dim-field">
                    <label className="dim-label">Y (px)</label>
                    <input
                      type="number"
                      className="inspector-dim-input"
                      value={Math.round(selectedNode.position.y)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0
                        onUpdateNodeBounds(
                          selectedNode.id,
                          { ...selectedNode.position, y: val },
                          selectedNode.size,
                        )
                      }}
                    />
                  </div>
                  <div className="inspector-dim-field">
                    <label className="dim-label">Width (px)</label>
                    <input
                      type="number"
                      min={100}
                      className="inspector-dim-input"
                      value={Math.round(selectedNode.size.width)}
                      onChange={(e) => {
                        const val = Math.max(80, parseFloat(e.target.value) || 80)
                        onUpdateNodeBounds(
                          selectedNode.id,
                          selectedNode.position,
                          { ...selectedNode.size, width: val },
                        )
                      }}
                    />
                  </div>
                  <div className="inspector-dim-field">
                    <label className="dim-label">Height (px)</label>
                    <input
                      type="number"
                      min={40}
                      className="inspector-dim-input"
                      value={Math.round(selectedNode.size.height)}
                      onChange={(e) => {
                        const val = Math.max(36, parseFloat(e.target.value) || 36)
                        onUpdateNodeBounds(
                          selectedNode.id,
                          selectedNode.position,
                          { ...selectedNode.size, height: val },
                        )
                      }}
                    />
                  </div>
                </div>
                <div className="inspector-quick-resize-row">
                  <button
                    type="button"
                    className="inspector-quick-btn"
                    title="Increase box width by 20px"
                    onClick={() =>
                      onUpdateNodeBounds(
                        selectedNode.id,
                        selectedNode.position,
                        { ...selectedNode.size, width: selectedNode.size.width + 20 },
                      )
                    }
                  >
                    + Width
                  </button>
                  <button
                    type="button"
                    className="inspector-quick-btn"
                    title="Increase box height by 20px"
                    onClick={() =>
                      onUpdateNodeBounds(
                        selectedNode.id,
                        selectedNode.position,
                        { ...selectedNode.size, height: selectedNode.size.height + 20 },
                      )
                    }
                  >
                    + Height
                  </button>
                  <button
                    type="button"
                    className="inspector-quick-btn"
                    title="Increase box width and height by 20px"
                    onClick={() =>
                      onUpdateNodeBounds(
                        selectedNode.id,
                        selectedNode.position,
                        { width: selectedNode.size.width + 20, height: selectedNode.size.height + 20 },
                      )
                    }
                  >
                    + Both
                  </button>
                  <button
                    type="button"
                    className="inspector-quick-btn shrink"
                    title="Decrease box width by 20px"
                    onClick={() =>
                      onUpdateNodeBounds(
                        selectedNode.id,
                        selectedNode.position,
                        { ...selectedNode.size, width: Math.max(100, selectedNode.size.width - 20) },
                      )
                    }
                  >
                    - Width
                  </button>
                  <button
                    type="button"
                    className="inspector-quick-btn shrink"
                    title="Decrease box height by 20px"
                    onClick={() =>
                      onUpdateNodeBounds(
                        selectedNode.id,
                        selectedNode.position,
                        { ...selectedNode.size, height: Math.max(40, selectedNode.size.height - 20) },
                      )
                    }
                  >
                    - Height
                  </button>
                </div>
              </div>
            )}

            {/* Canonical Engine Identification */}
            {(() => {
              const nodeEngId =
                selectedNode.metadata?.engineId ?? selectedNode.engineId
              if (!nodeEngId) return null
              const occurrences = findEngineOccurrences(nodeEngId).filter(
                (o) =>
                  o.documentId !== document.documentId ||
                  o.nodeId !== selectedNode.id,
              )
              return (
                <div className="inspector-card">
                  <div className="inspector-card-header">
                    <Cpu size={14} />
                    <span>Canonical Engine</span>
                  </div>
                  <div className="inspector-engine-id">{nodeEngId}</div>
                  <div className="inspector-engine-name">
                    {CANONICAL_ENGINES[nodeEngId]?.name ??
                      'Canonical Engine Identity'}
                  </div>

                  {/* Cross-diagram occurrences */}
                  {occurrences.length > 0 && (
                    <div className="inspector-occurrences">
                      <div className="inspector-sublabel">
                        Occurrences in Other Diagrams:
                      </div>
                      <div className="inspector-occurrence-list">
                        {occurrences.map((occ, i) => (
                          <button
                            key={i}
                            type="button"
                            className="inspector-nav-pill"
                            onClick={() =>
                              onNavigateToDocument(occ.documentId, occ.nodeId)
                            }
                          >
                            <ExternalLink size={12} />
                            <span>{occ.documentTitle}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Responsibilities */}
            {selectedNode.metadata?.responsibilities?.length > 0 && (
              <div className="inspector-card">
                <div
                  className="inspector-collapsible-header"
                  onClick={() => toggleSection('responsibilities')}
                >
                  <span className="inspector-card-header">
                    <Shield size={14} />
                    <span>Responsibilities ({selectedNode.metadata.responsibilities.length})</span>
                  </span>
                  {collapsedSections['responsibilities'] ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </div>
                {!collapsedSections['responsibilities'] && (
                  <ul className="inspector-bullet-list">
                    {selectedNode.metadata.responsibilities.map((resp, i) => (
                      <li key={i}>{resp}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Requirements Covered */}
            {selectedNode.metadata?.requirementIds?.length > 0 && (
              <div className="inspector-card">
                <div
                  className="inspector-collapsible-header"
                  onClick={() => toggleSection('requirements')}
                >
                  <span className="inspector-card-header">
                    <CheckCircle2 size={14} />
                    <span>Covered Requirements ({selectedNode.metadata.requirementIds.length})</span>
                  </span>
                  {collapsedSections['requirements'] ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </div>
                {!collapsedSections['requirements'] && (
                  <div className="inspector-pill-cluster">
                    {selectedNode.metadata.requirementIds.map((reqId, i) => (
                      <span key={i} className="inspector-req-pill">
                        {reqId}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Inputs & Outputs */}
            {(selectedNode.metadata?.inputs?.length > 0 ||
              selectedNode.metadata?.outputs?.length > 0) && (
              <div className="inspector-card">
                <div
                  className="inspector-collapsible-header"
                  onClick={() => toggleSection('io')}
                >
                  <span className="inspector-card-header">
                    <Network size={14} />
                    <span>Inputs &amp; Outputs</span>
                  </span>
                  {collapsedSections['io'] ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </div>
                {!collapsedSections['io'] && (
                  <div className="inspector-io-grid">
                    <div>
                      <div className="inspector-sublabel">Inputs</div>
                      <ul className="inspector-bullet-list compact">
                        {(selectedNode.metadata.inputs ?? []).map((inp, i) => (
                          <li key={i}>{inp}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="inspector-sublabel">Outputs</div>
                      <ul className="inspector-bullet-list compact">
                        {(selectedNode.metadata.outputs ?? []).map((out, i) => (
                          <li key={i}>{out}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Constraints & Failure Modes */}
            {(selectedNode.metadata?.constraints?.length > 0 ||
              selectedNode.metadata?.failureModes?.length > 0) && (
              <div className="inspector-card">
                <div
                  className="inspector-collapsible-header"
                  onClick={() => toggleSection('constraints')}
                >
                  <span className="inspector-card-header">
                    <AlertCircle size={14} />
                    <span>Constraints &amp; Failure Modes</span>
                  </span>
                  {collapsedSections['constraints'] ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </div>
                {!collapsedSections['constraints'] && (
                  <>
                    {selectedNode.metadata.constraints?.length > 0 && (
                      <div className="inspector-sub-block">
                        <div className="inspector-sublabel">Constraints</div>
                        <ul className="inspector-bullet-list compact">
                          {selectedNode.metadata.constraints.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedNode.metadata.failureModes?.length > 0 && (
                      <div className="inspector-sub-block">
                        <div className="inspector-sublabel">Failure Modes</div>
                        <ul className="inspector-bullet-list compact">
                          {selectedNode.metadata.failureModes.map((fm, i) => (
                            <li key={i}>{fm}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Ports */}
            {selectedNode.ports?.length > 0 && (
              <div className="inspector-card">
                <div className="inspector-card-header">
                  <Network size={14} />
                  <span>Ports ({selectedNode.ports.length})</span>
                </div>
                <div className="inspector-ports-list">
                  {selectedNode.ports.map((port) => (
                    <div key={port.id} className="inspector-port-row">
                      <span className={`inspector-port-dir ${port.direction}`}>
                        {port.direction}
                      </span>
                      <div className="inspector-port-detail">
                        <div className="inspector-port-label">{port.label}</div>
                        <div className="inspector-port-sub">
                          {port.side} side · {port.dataType ?? 'generic data'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CASE 2: EXTERNAL REFERENCE GHOST NODE SELECTED */}
        {selectedExternalRef && (
          <div className="inspector-section-group">
            <div className="inspector-title-row">
              <span className="inspector-type-badge external">External Reference</span>
              <span className="inspector-type-badge">{selectedExternalRef.type}</span>
            </div>
            <h2 className="inspector-main-title">{selectedExternalRef.label}</h2>
            <div className="inspector-id-code">Node ID: {selectedExternalRef.nodeId}</div>
            <p className="inspector-description">
              {selectedExternalRef.description ??
                'External architectural entity defined in another subsystem diagram.'}
            </p>

            <div className="inspector-card">
              <div className="inspector-card-header">
                <ExternalLink size={14} />
                <span>Source Document</span>
              </div>
              <div className="inspector-engine-id">
                {selectedExternalRef.sourceDocumentId}
              </div>
              <button
                type="button"
                className="inspector-action-btn primary"
                onClick={() =>
                  onNavigateToDocument(
                    selectedExternalRef.sourceDocumentId,
                    selectedExternalRef.nodeId,
                  )
                }
              >
                <ArrowRight size={14} />
                <span>Jump to Source Diagram</span>
              </button>
            </div>

            {selectedExternalRef.engineId && (
              <div className="inspector-card">
                <div className="inspector-card-header">
                  <Cpu size={14} />
                  <span>Canonical Engine</span>
                </div>
                <div className="inspector-engine-id">
                  {selectedExternalRef.engineId}
                </div>
                <div className="inspector-engine-name">
                  {CANONICAL_ENGINES[selectedExternalRef.engineId]?.name ??
                    'Canonical Engine Identity'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CASE 3: EDGE SELECTED */}
        {selectedEdge && (
          <div className="inspector-section-group">
            <div className="inspector-title-row">
              <span className={`inspector-type-badge edge-${selectedEdge.semantic?.type}`}>
                {selectedEdge.semantic?.type}
              </span>
              <span className="inspector-type-badge">
                {selectedEdge.semantic?.direction}
              </span>
            </div>
            <h2 className="inspector-main-title">
              {selectedEdge.semantic?.label || selectedEdge.id}
            </h2>
            <div className="inspector-id-code">Edge ID: {selectedEdge.id}</div>
            <p className="inspector-description">
              {selectedEdge.semantic?.description || 'No description provided.'}
            </p>

            {/* Endpoints */}
            <div className="inspector-card">
              <div className="inspector-card-header">
                <ArrowRight size={14} />
                <span>Endpoints</span>
              </div>
              <div className="inspector-endpoint-row">
                <div className="inspector-endpoint-node">
                  <div className="inspector-sublabel">Source</div>
                  <button
                    type="button"
                    className="inspector-node-link"
                    onClick={() => onSelectNode(selectedEdge.source)}
                  >
                    {nodesMap.get(selectedEdge.source)?.label ?? selectedEdge.source}
                  </button>
                  {selectedEdge.sourcePort && (
                    <div className="inspector-port-code">{selectedEdge.sourcePort}</div>
                  )}
                </div>
                <ArrowRight size={16} className="inspector-arrow-icon" />
                <div className="inspector-endpoint-node">
                  <div className="inspector-sublabel">Target</div>
                  <button
                    type="button"
                    className="inspector-node-link"
                    onClick={() => onSelectNode(selectedEdge.target)}
                  >
                    {nodesMap.get(selectedEdge.target)?.label ?? selectedEdge.target}
                  </button>
                  {selectedEdge.targetPort && (
                    <div className="inspector-port-code">{selectedEdge.targetPort}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Semantic Details */}
            <div className="inspector-card">
              <div className="inspector-card-header">
                <Layers size={14} />
                <span>Semantic Properties</span>
              </div>
              <div className="inspector-prop-table">
                <div className="inspector-prop-row">
                  <span className="prop-name">Protocol:</span>
                  <span className="prop-val">
                    {selectedEdge.semantic?.protocol ?? 'Not prescribed by requirements'}
                  </span>
                </div>
                <div className="inspector-prop-row">
                  <span className="prop-name">Data Type:</span>
                  <span className="prop-val">
                    {selectedEdge.semantic?.dataType ?? 'Generic'}
                  </span>
                </div>
                <div className="inspector-prop-row">
                  <span className="prop-name">Trigger:</span>
                  <span className="prop-val">
                    {selectedEdge.semantic?.trigger ?? 'Continuous / On demand'}
                  </span>
                </div>
                <div className="inspector-prop-row">
                  <span className="prop-name">Synchronous:</span>
                  <span className="prop-val">
                    {selectedEdge.semantic?.synchronous === null
                      ? 'Unspecified'
                      : selectedEdge.semantic?.synchronous
                        ? 'Yes'
                        : 'No (Async)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Visual Route Controls */}
            <div className="inspector-card">
              <div className="inspector-card-header">
                <Compass size={14} />
                <span>Visual Routing</span>
              </div>
              <p className="inspector-info-note">
                Visual routing hints can be adjusted. Semantic data is strictly preserved.
              </p>
              <div className="inspector-route-buttons">
                {(['orthogonal', 'straight', 'curved'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`inspector-route-btn${(selectedEdge.visual?.routing ?? 'orthogonal') === mode ? ' is-active' : ''}`}
                    onClick={() => onUpdateEdgeRouting(selectedEdge.id, mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              {(selectedEdge.visual?.waypoints?.length ?? 0) > 0 && (
                <div className="inspector-waypoint-actions">
                  <span className="inspector-sublabel">
                    {selectedEdge.visual.waypoints.length} waypoint(s)
                  </span>
                  <button
                    type="button"
                    className="inspector-action-btn"
                    onClick={() => onClearWaypoints(selectedEdge.id)}
                  >
                    <RotateCcw size={12} />
                    <span>Clear Waypoints</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CASE 4: GROUP SELECTED */}
        {selectedGroup && (
          <div className="inspector-section-group">
            <div className="inspector-title-row">
              <span className="inspector-type-badge group">Subsystem Group</span>
              <span className="inspector-type-badge">
                {selectedGroup.metadata?.category}
              </span>
            </div>
            <h2 className="inspector-main-title">{selectedGroup.label}</h2>
            <div className="inspector-id-code">Group ID: {selectedGroup.id}</div>
            <p className="inspector-description">{selectedGroup.description}</p>

            {/* Position & Size Controls for Group */}
            {onUpdateGroupBounds && (
              <div className="inspector-card">
                <div className="inspector-card-header">
                  <Move size={14} />
                  <span>Position &amp; Size (Container)</span>
                </div>
                <div className="inspector-dim-grid">
                  <div className="inspector-dim-field">
                    <label className="dim-label">X (px)</label>
                    <input
                      type="number"
                      className="inspector-dim-input"
                      value={Math.round(selectedGroup.bounds.x)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0
                        onUpdateGroupBounds(selectedGroup.id, {
                          ...selectedGroup.bounds,
                          x: val,
                        })
                      }}
                    />
                  </div>
                  <div className="inspector-dim-field">
                    <label className="dim-label">Y (px)</label>
                    <input
                      type="number"
                      className="inspector-dim-input"
                      value={Math.round(selectedGroup.bounds.y)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0
                        onUpdateGroupBounds(selectedGroup.id, {
                          ...selectedGroup.bounds,
                          y: val,
                        })
                      }}
                    />
                  </div>
                  <div className="inspector-dim-field">
                    <label className="dim-label">Width (px)</label>
                    <input
                      type="number"
                      min={180}
                      className="inspector-dim-input"
                      value={Math.round(selectedGroup.bounds.width)}
                      onChange={(e) => {
                        const val = Math.max(120, parseFloat(e.target.value) || 120)
                        onUpdateGroupBounds(selectedGroup.id, {
                          ...selectedGroup.bounds,
                          width: val,
                        })
                      }}
                    />
                  </div>
                  <div className="inspector-dim-field">
                    <label className="dim-label">Height (px)</label>
                    <input
                      type="number"
                      min={100}
                      className="inspector-dim-input"
                      value={Math.round(selectedGroup.bounds.height)}
                      onChange={(e) => {
                        const val = Math.max(80, parseFloat(e.target.value) || 80)
                        onUpdateGroupBounds(selectedGroup.id, {
                          ...selectedGroup.bounds,
                          height: val,
                        })
                      }}
                    />
                  </div>
                </div>
                <div className="inspector-quick-resize-row">
                  <button
                    type="button"
                    className="inspector-quick-btn"
                    title="Increase container width by 40px"
                    onClick={() =>
                      onUpdateGroupBounds(selectedGroup.id, {
                        ...selectedGroup.bounds,
                        width: selectedGroup.bounds.width + 40,
                      })
                    }
                  >
                    + Width
                  </button>
                  <button
                    type="button"
                    className="inspector-quick-btn"
                    title="Increase container height by 40px"
                    onClick={() =>
                      onUpdateGroupBounds(selectedGroup.id, {
                        ...selectedGroup.bounds,
                        height: selectedGroup.bounds.height + 40,
                      })
                    }
                  >
                    + Height
                  </button>
                  <button
                    type="button"
                    className="inspector-quick-btn"
                    title="Increase container width and height by 40px"
                    onClick={() =>
                      onUpdateGroupBounds(selectedGroup.id, {
                        ...selectedGroup.bounds,
                        width: selectedGroup.bounds.width + 40,
                        height: selectedGroup.bounds.height + 40,
                      })
                    }
                  >
                    + Both
                  </button>
                  <button
                    type="button"
                    className="inspector-quick-btn shrink"
                    title="Decrease container width by 40px"
                    onClick={() =>
                      onUpdateGroupBounds(selectedGroup.id, {
                        ...selectedGroup.bounds,
                        width: Math.max(180, selectedGroup.bounds.width - 40),
                      })
                    }
                  >
                    - Width
                  </button>
                  <button
                    type="button"
                    className="inspector-quick-btn shrink"
                    title="Decrease container height by 40px"
                    onClick={() =>
                      onUpdateGroupBounds(selectedGroup.id, {
                        ...selectedGroup.bounds,
                        height: Math.max(100, selectedGroup.bounds.height - 40),
                      })
                    }
                  >
                    - Height
                  </button>
                </div>
              </div>
            )}

            {/* Engine IDs in group */}
            {selectedGroup.metadata.engineIds.length > 0 && (
              <div className="inspector-card">
                <div className="inspector-card-header">
                  <Cpu size={14} />
                  <span>
                    Engines in Subsystem ({selectedGroup.metadata.engineIds.length})
                  </span>
                </div>
                <div className="inspector-group-engines">
                  {selectedGroup.metadata.engineIds.map((engId) => {
                    const info = CANONICAL_ENGINES[engId]
                    return (
                      <div key={engId} className="inspector-engine-tag">
                        <div className="inspector-tag-id">{engId}</div>
                        <div className="inspector-tag-name">
                          {info?.name ?? 'Canonical Engine'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CASE 5: NO ELEMENT SELECTED -> DIAGRAM ARCHITECTURE SCOPE & REQUIREMENTS */}
        {!selectedNode && !selectedExternalRef && !selectedEdge && !selectedGroup && (
          <div className="inspector-section-group">
            <div className="inspector-title-row">
              <span className="inspector-type-badge diagram">
                {document.diagramType}
              </span>
              <span className="inspector-type-badge category">
                Category: {document.category}
              </span>
            </div>
            <h2 className="inspector-main-title">{document.title}</h2>
            <div className="inspector-id-code">Doc ID: {document.documentId}</div>
            <p className="inspector-description">{document.description}</p>

            <div className="inspector-stat-grid">
              <div className="inspector-stat-card">
                <div className="stat-num">{document.nodes.length}</div>
                <div className="stat-label">Nodes</div>
              </div>
              <div className="inspector-stat-card">
                <div className="stat-num">{document.edges.length}</div>
                <div className="stat-label">Connections</div>
              </div>
              <div className="inspector-stat-card">
                <div className="stat-num">{document.groups.length}</div>
                <div className="stat-label">Groups</div>
              </div>
              <div className="inspector-stat-card">
                <div className="stat-num">{document.requirementsCoverage.length}</div>
                <div className="stat-label">Requirements</div>
              </div>
            </div>

            {/* Requirements Coverage Matrix */}
            <div className="inspector-card">
              <div className="inspector-card-header">
                <CheckCircle2 size={14} />
                <span>Requirements Coverage ({document.requirementsCoverage.length})</span>
              </div>
              <input
                type="text"
                className="inspector-search-input"
                placeholder="Filter requirements..."
                value={reqFilter}
                onChange={(e) => setReqFilter(e.target.value)}
              />
              <div className="inspector-req-list">
                {document.requirementsCoverage
                  .filter(
                    (req) =>
                      !reqFilter ||
                      req.requirementId.toLowerCase().includes(reqFilter.toLowerCase()) ||
                      req.description.toLowerCase().includes(reqFilter.toLowerCase()),
                  )
                  .map((req) => (
                    <div key={req.requirementId} className="inspector-req-item">
                      <div className="inspector-req-header">
                        <span className="inspector-req-id">{req.requirementId}</span>
                        <span
                          className={`inspector-status-badge ${req.coverageStatus}`}
                        >
                          {req.coverageStatus}
                        </span>
                      </div>
                      <div className="inspector-req-desc">{req.description}</div>
                      {req.coveredByNodes?.length > 0 && (
                        <div className="inspector-req-nodes">
                          Covered by:{' '}
                          {req.coveredByNodes.map((nId) => (
                            <button
                              key={nId}
                              type="button"
                              className="inspector-text-btn"
                              onClick={() => onSelectNode(nId)}
                            >
                              {nodesMap.get(nId)?.label ?? nId}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {/* Assumptions & Decisions */}
            {document.assumptions?.length > 0 && (
              <div className="inspector-card">
                <div
                  className="inspector-collapsible-header"
                  onClick={() => toggleSection('assumptions')}
                >
                  <span className="inspector-card-header">
                    <BookOpen size={14} />
                    <span>Assumptions ({document.assumptions.length})</span>
                  </span>
                  {collapsedSections['assumptions'] ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </div>
                {!collapsedSections['assumptions'] && (
                  <ul className="inspector-bullet-list">
                    {document.assumptions.map((item) => (
                      <li key={item.id}>
                        <strong>{item.id}:</strong> {item.description}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {document.unresolvedDecisions?.length > 0 && (
              <div className="inspector-card">
                <div
                  className="inspector-collapsible-header"
                  onClick={() => toggleSection('decisions')}
                >
                  <span className="inspector-card-header">
                    <AlertCircle size={14} />
                    <span>Open Decisions ({document.unresolvedDecisions.length})</span>
                  </span>
                  {collapsedSections['decisions'] ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </div>
                {!collapsedSections['decisions'] && (
                  <ul className="inspector-bullet-list">
                    {document.unresolvedDecisions.map((item) => (
                      <li key={item.id}>
                        <strong>{item.id}:</strong> {item.description}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

