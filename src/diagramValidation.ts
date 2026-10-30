import {
  CANONICAL_ENGINES,
  isArchitectureManifest,
  type ArchitectureManifest,
  type DiagramDocument,
} from './diagramModel'

export type ValidationStatus = 'pass' | 'fail' | 'warning'

export interface ValidationResult {
  ruleId: string
  fileId: string
  status: ValidationStatus
  details: string
  affectedIds: string[]
}

export interface ValidationReport {
  validationReportId: string
  timestamp: string
  filesValidated: string[]
  totalChecks: number
  passed: number
  failed: number
  warnings: number
  results: ValidationResult[]
}

export interface ValidationContext {
  fileName?: string
  manifest?: ArchitectureManifest | null
  documents?: DiagramDocument[]
}

export interface ValidatedImport {
  value: DiagramDocument | ArchitectureManifest | null
  report: ValidationReport
}

const DIAGRAM_TYPES = new Set([
  'system-context',
  'master-architecture',
  'deployment-architecture',
  'subsystem-architecture',
  'end-to-end-flow',
  'entity-relationship',
])

const NODE_TYPES = new Set([
  'component', 'system', 'actor', 'subsystem', 'service', 'database',
  'external-system', 'vehicle', 'adapter', 'event-bus', 'queue', 'sensor',
  'payload', 'process', 'document', 'decision', 'start', 'end', 'entity',
])

const NODE_SHAPES = new Set([
  'rounded-rectangle', 'rectangle', 'circle', 'diamond', 'hexagon',
  'cylinder', 'cloud', 'ellipse',
])

const EDGE_TYPES = new Set([
  'data-flow', 'control-flow', 'dependency', 'event', 'command', 'telemetry',
  'network-link', 'persistence', 'association', 'auth-flow', 'sync-flow',
])

const ENVELOPE_FIELDS = [
  'schemaVersion', 'documentId', 'title', 'diagramType', 'description',
  'category', 'coordinateSystem', 'viewport', 'groups', 'nodes', 'edges',
  'externalReferences', 'crossReferences', 'requirementsCoverage',
  'assumptions', 'unresolvedDecisions', 'metadata',
]

const MANIFEST_FIELDS = [
  'schemaVersion', 'documentId', 'projectName', 'projectDescription',
  'generationDate', 'schemaDefinition', 'totalFiles', 'totalEngines',
  'totalRequirements', 'files', 'canonicalEngineIndex', 'requirementIndex',
  'assumptions', 'unresolvedDecisions', 'metadata',
]

const REQUIREMENT_PATTERN = /^req-(?:(?:2\.\d+)|GA|CL)-\d{3}$/

function makeReport(fileId: string, results: ValidationResult[]): ValidationReport {
  return {
    validationReportId: `val-import-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    filesValidated: [fileId],
    totalChecks: results.length,
    passed: results.filter((result) => result.status === 'pass').length,
    failed: results.filter((result) => result.status === 'fail').length,
    warnings: results.filter((result) => result.status === 'warning').length,
    results,
  }
}

function duplicateIds(items: Array<{ id: string }>): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const item of items) {
    if (seen.has(item.id)) duplicates.add(item.id)
    seen.add(item.id)
  }
  return [...duplicates]
}

function structuredIds(items: unknown[]): string[] {
  return items.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [`index ${index}`]
    const id = (item as Record<string, unknown>).id
    return typeof id === 'string' && id.trim() ? [] : [`index ${index}`]
  })
}

function isDocumentEnvelope(value: unknown): value is DiagramDocument {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    ENVELOPE_FIELDS.every((field) => field in record) &&
    ['groups', 'nodes', 'edges', 'externalReferences', 'crossReferences',
      'requirementsCoverage', 'assumptions', 'unresolvedDecisions'].every(
      (field) => Array.isArray(record[field]),
    ) &&
    typeof record.documentId === 'string' &&
    !!record.viewport && typeof record.viewport === 'object'
  )
}

function getEngineRegistry(manifest?: ArchitectureManifest | null): Set<string> {
  const set = new Set(Object.keys(CANONICAL_ENGINES))
  if (manifest?.canonicalEngineIndex) {
    for (const key of Object.keys(manifest.canonicalEngineIndex)) set.add(key)
  }
  if (manifest?.files) {
    for (const file of manifest.files) {
      for (const id of file.engineIds ?? []) set.add(id)
    }
  }
  return set
}

function getRequirementRegistry(manifest?: ArchitectureManifest | null): Set<string> {
  const set = new Set<string>()
  if (manifest?.requirementIndex) {
    for (const key of Object.keys(manifest.requirementIndex)) set.add(key)
  }
  if (manifest?.files) {
    for (const file of manifest.files) {
      for (const id of file.requirementIds ?? []) set.add(id)
    }
  }
  return set
}

function validateManifest(
  manifest: ArchitectureManifest,
  context: ValidationContext,
): ValidationReport {
  const results: ValidationResult[] = []
  const id = manifest.documentId || context.fileName || 'manifest'
  const add = (
    ruleId: string,
    status: ValidationStatus,
    details: string,
    affectedIds: string[] = [],
  ) => results.push({ ruleId, fileId: id, status, details, affectedIds })

  const missing = MANIFEST_FIELDS.filter(
    (field) => !((manifest as unknown as Record<string, unknown>)[field] !== undefined),
  )

  add('V-001', 'pass', 'Valid JSON syntax.')
  add('V-002', missing.length ? 'fail' : 'pass', missing.length
    ? `Missing manifest fields: ${missing.join(', ')}.`
    : 'All required manifest fields are present.', missing)

  const registered = manifest.files?.some((file) => file.documentId === manifest.documentId)
  add('V-003', registered ? 'pass' : 'fail', registered
    ? 'Manifest document ID is registered.'
    : 'Manifest document ID is not present in its file registry.',
  registered ? [] : [manifest.documentId])

  add('V-004', 'pass', 'Not applicable to the manifest registry.')
  add('V-005', manifest.schemaVersion === '1.0.0' ? 'pass' : 'fail',
    `schemaVersion is ${String(manifest.schemaVersion)}; expected 1.0.0.`)

  const allIds = (context.documents ?? []).flatMap((document) => [
    ...document.nodes.map((node) => node.id),
    ...document.groups.map((group) => group.id),
    ...document.edges.map((edge) => edge.id),
  ])
  const duplicates = duplicateIds(allIds.map((item) => ({ id: item })))
  add('V-009', duplicates.length ? 'fail' : 'pass', duplicates.length
    ? 'Duplicate IDs occur across loaded documents.'
    : 'No duplicate node, group, or edge IDs across loaded documents.', duplicates)

  const delivered = new Set([
    manifest.documentId,
    ...(context.documents ?? []).map((document) => document.documentId),
  ])
  add('V-028', delivered.size === manifest.totalFiles ? 'pass' : 'warning',
    `${delivered.size} of ${manifest.totalFiles} registered files are loaded. Independent imports are allowed.`)

  for (const [rule, field] of [['V-029', 'assumptions'], ['V-030', 'unresolvedDecisions']] as const) {
    const invalid = structuredIds(manifest[field] ?? [])
    add(rule, invalid.length ? 'fail' : 'pass', invalid.length
      ? `${field} contains entries without a structured ID.`
      : `All ${field} entries use structured IDs.`, invalid)
  }

  return makeReport(id, results)
}

function validateDocument(
  document: DiagramDocument,
  context: ValidationContext,
): ValidationReport {
  const results: ValidationResult[] = []
  const id = document.documentId || context.fileName || 'document'
  const manifest = context.manifest ?? null

  const add = (
    ruleId: string,
    status: ValidationStatus,
    details: string,
    affectedIds: string[] = [],
  ) => results.push({ ruleId, fileId: id, status, details, affectedIds })

  const check = (ruleId: string, invalid: string[], success: string, failure: string) => {
    add(ruleId, invalid.length ? 'fail' : 'pass', invalid.length ? failure : success, invalid)
  }
  const unavailable = (ruleId: string, detail: string) => add(ruleId, 'warning', detail)

  // V-001: Valid JSON syntax (Per file)
  add('V-001', 'pass', 'Valid JSON syntax.')

  // V-002: All required envelope fields present (Per file)
  add('V-002', 'pass', 'All required document envelope fields are present.')

  // V-003: documentId matches manifest registration (Per file)
  if (!manifest) {
    unavailable('V-003', 'Import a manifest to verify document registration.')
  } else {
    const registration = manifest.files.find((file) => file.documentId === id)
    const matches = registration !== undefined
    add('V-003', matches ? 'pass' : 'fail', matches
      ? `Document ID '${id}' is registered in manifest.`
      : `Document ID '${id}' is not registered in manifest files list.`, matches ? [] : [id])
  }

  // V-004: diagramType is a valid enum value (Per file)
  check('V-004', DIAGRAM_TYPES.has(document.diagramType) ? [] : [String(document.diagramType)],
    'Diagram type is valid.', 'Diagram type is not a valid enum value.')

  // V-005: schemaVersion is "1.0.0" (Per file)
  check('V-005', document.schemaVersion === '1.0.0' ? [] : [document.schemaVersion],
    'Schema version is 1.0.0.', 'Schema version must be 1.0.0.')

  // V-006: Every node has a unique id within the file (Per file)
  check('V-006', duplicateIds(document.nodes), 'Node IDs are unique.', 'Duplicate node IDs found.')

  // V-007: Every edge has a unique id within the file (Per file)
  check('V-007', duplicateIds(document.edges), 'Edge IDs are unique.', 'Duplicate edge IDs found.')

  // V-008: Every group has a unique id within the file (Per file)
  check('V-008', duplicateIds(document.groups), 'Group IDs are unique.', 'Duplicate group IDs found.')

  // V-009: No duplicate IDs across all files in the same namespace (Global)
  const loaded = [...(context.documents ?? []).filter((item) => item.documentId !== id), document]
  const globalIds = loaded.flatMap((item) => [
    ...item.nodes.map((node) => node.id),
    ...item.groups.map((group) => group.id),
    ...item.edges.map((edge) => edge.id),
  ])
  check('V-009', duplicateIds(globalIds.map((item) => ({ id: item }))),
    'No duplicate IDs across loaded documents.', 'Duplicate IDs occur across loaded documents.')

  // V-010: Every edge.source exists as a node.id or externalRef.nodeId (Per file)
  const localIds = new Set(document.nodes.map((node) => node.id))
  const externalIds = new Set(document.externalReferences.map((reference) => reference.nodeId))
  const endpointExists = (endpoint: string) => localIds.has(endpoint) || externalIds.has(endpoint)
  check('V-010', document.edges.filter((edge) => !endpointExists(edge.source)).map((edge) => edge.id),
    'Every edge source resolves.', 'One or more edge sources are dangling.')

  // V-011: Every edge.target exists as a node.id or externalRef.nodeId (Per file)
  check('V-011', document.edges.filter((edge) => !endpointExists(edge.target)).map((edge) => edge.id),
    'Every edge target resolves.', 'One or more edge targets are dangling.')

  // V-012 & V-013: Ports exist on endpoints
  const nodesById = new Map(document.nodes.map((node) => [node.id, node]))
  const externalById = new Map(document.externalReferences.map((reference) => [reference.nodeId, reference]))
  const portExists = (nodeId: string, portId: string | null) => {
    if (!portId) return true
    const localPorts = nodesById.get(nodeId)?.ports
    if (localPorts) return localPorts.some((port) => port.id === portId)
    const extRef = externalById.get(nodeId)
    if (extRef) {
      if (extRef.ports && extRef.ports.length > 0) {
        return extRef.ports.some((port) => port.id === portId)
      }
      const sourceDoc = (context.documents ?? []).find((d) => d.documentId === extRef.sourceDocumentId)
      const sourceNode = sourceDoc?.nodes.find((n) => n.id === nodeId)
      if (sourceNode?.ports && sourceNode.ports.length > 0) {
        return sourceNode.ports.some((port) => port.id === portId)
      }
      return true
    }
    return false
  }
  check('V-012', document.edges.filter((edge) => !portExists(edge.source, edge.sourcePort)).map((edge) => edge.id),
    'Every source port resolves.', 'One or more source ports are invalid.')
  check('V-013', document.edges.filter((edge) => !portExists(edge.target, edge.targetPort)).map((edge) => edge.id),
    'Every target port resolves.', 'One or more target ports are invalid.')

  // V-014: Every node.groupId references a valid group.id or is null (Per file)
  const groupIds = new Set(document.groups.map((group) => group.id))
  check('V-014', document.nodes.filter((node) => node.groupId !== null && node.groupId !== undefined && !groupIds.has(node.groupId)).map((node) => node.id),
    'Every node group resolves.', 'One or more nodes reference an invalid group.')

  // V-015: Every group.parentGroupId references a valid group or null (Per file)
  check('V-015', document.groups.filter((group) => group.parentGroupId !== null && group.parentGroupId !== undefined && !groupIds.has(group.parentGroupId)).map((group) => group.id),
    'Every parent group resolves.', 'One or more groups reference an invalid parent.')

  // V-016: Every externalRef.sourceDocumentId exists in manifest (Global)
  if (!manifest) {
    unavailable('V-016', 'Import a manifest to verify external source document IDs.')
  } else {
    const documentIds = new Set(manifest.files.map((file) => file.documentId))
    check('V-016', document.externalReferences.filter((reference) => !documentIds.has(reference.sourceDocumentId)).map((reference) => reference.nodeId),
      'Every external source document is registered.', 'Unregistered external source documents found.')
  }

  // V-017: Every externalRef.nodeId exists in the referenced document (Global)
  const missingExternalDocuments = new Set<string>()
  const missingExternalNodes: string[] = []
  for (const reference of document.externalReferences) {
    const source = (context.documents ?? []).find((item) => item.documentId === reference.sourceDocumentId)
    if (!source) missingExternalDocuments.add(reference.sourceDocumentId)
    else if (!source.nodes.some((node) => node.id === reference.nodeId)) missingExternalNodes.push(reference.nodeId)
  }
  if (missingExternalNodes.length) add('V-017', 'fail', 'External nodes are absent from their loaded source documents.', missingExternalNodes)
  else if (missingExternalDocuments.size) unavailable('V-017', `External source documents not loaded yet: ${[...missingExternalDocuments].join(', ')}.`)
  else add('V-017', 'pass', 'Every external node resolves in its source document.')

  // V-018: Every crossRef.canonicalEngineId exists in engine registry (Global)
  const engineSet = getEngineRegistry(manifest)
  check('V-018', document.crossReferences.filter((reference) => !engineSet.has(reference.canonicalEngineId)).map((reference) => reference.canonicalEngineId),
    'Cross-reference engine IDs exist in canonical engine registry.', 'Unregistered cross-reference engine IDs found.')

  // V-019: Every node.metadata.engineId exists in engine registry (Global)
  check('V-019', document.nodes.filter((node) => {
    const eng = node.metadata?.engineId ?? node.engineId
    return eng && !engineSet.has(eng)
  }).map((node) => node.id),
  'Node engine IDs exist in canonical engine registry.', 'Unregistered node engine IDs found.')

  // V-020: Every requirement ID in requirementsCoverage is registered (Global)
  const registeredReqs = getRequirementRegistry(manifest)
  check('V-020', document.requirementsCoverage.filter((coverage) =>
    !registeredReqs.has(coverage.requirementId) && !REQUIREMENT_PATTERN.test(coverage.requirementId),
  ).map((coverage) => coverage.requirementId),
  'Requirement IDs match the canonical pattern or manifest registry.', 'Unregistered requirement IDs found.')

  // V-021: Every engine appears in at least one file (Global)
  const complete = !!manifest && loaded.length + 1 >= manifest.totalFiles
  const coveredEngines = new Set([
    ...loaded.flatMap((item) => item.nodes.map((node) => node.metadata?.engineId ?? node.engineId).filter(Boolean)),
    ...loaded.flatMap((item) => item.crossReferences.map((cross) => cross.canonicalEngineId)),
    ...loaded.flatMap((item) => item.groups.flatMap((grp) => grp.metadata?.engineIds || [])),
  ])
  const coveredRequirements = new Set(loaded.flatMap((item) => item.requirementsCoverage.map((coverage) => coverage.requirementId)))
  if (complete && engineSet.size) {
    check('V-021', [...engineSet].filter((engine) => !coveredEngines.has(engine)),
      'Every registered engine appears in a document.', 'Registered engines have no document occurrence.')
  } else {
    unavailable('V-021', `File-set coverage check deferred: ${coveredEngines.size} of 152 canonical engines present in current batch.`)
  }

  // V-022: Every requirement has coverage status in at least one file (Global)
  if (complete && registeredReqs.size) {
    check('V-022', [...registeredReqs].filter((requirement) => !coveredRequirements.has(requirement)),
      'Every registered requirement has coverage.', 'Registered requirements have no coverage record.')
  } else {
    unavailable('V-022', `Requirement coverage check deferred: ${coveredRequirements.size} requirements mapped in current batch.`)
  }

  // V-023: No node has position with negative coordinates (Per file)
  check('V-023', document.nodes.filter((node) => !node.position || node.position.x < 0 || node.position.y < 0).map((node) => node.id),
    'All node coordinates are non-negative.', 'Negative or invalid node coordinates found.')

  // V-024: No two nodes in same file have identical positions (Per file)
  const positions = new Map<string, string[]>()
  for (const node of document.nodes) {
    if (!node.position) continue
    const key = `${node.position.x},${node.position.y}`
    positions.set(key, [...(positions.get(key) ?? []), node.id])
  }
  check('V-024', [...positions.values()].filter((ids) => ids.length > 1).flat(),
    'No two nodes share an identical position.', 'Two or more nodes share an identical position.')

  // V-025: edge.semantic.type is a valid enum value (Per file)
  check('V-025', document.edges.filter((edge) => !EDGE_TYPES.has(edge.semantic?.type)).map((edge) => edge.id),
    'Every edge semantic type is valid.', 'Invalid edge semantic types found.')

  // V-026: node.type is a valid enum value (Per file)
  check('V-026', document.nodes.filter((node) => !NODE_TYPES.has(node.type)).map((node) => node.id),
    'Every node type is valid.', 'Invalid node types found.')

  // V-027: node.style.shape is a valid enum value (Per file)
  check('V-027', document.nodes.filter((node) => !NODE_SHAPES.has(node.style?.shape)).map((node) => node.id),
    'Every node shape is valid.', 'Invalid node shapes found.')

  // V-028: Manifest file count matches delivered file count (Global)
  if (!manifest) {
    unavailable('V-028', 'Import a manifest to compare registered and delivered file counts.')
  } else {
    const delivered = new Set([manifest.documentId, ...loaded.map((item) => item.documentId)])
    add('V-028', delivered.size === manifest.totalFiles ? 'pass' : 'warning',
      `${delivered.size} of ${manifest.totalFiles} registered files are loaded. Independent batch imports are allowed.`)
  }

  // V-029: All assumptions[] use structured format with ID (Per file)
  for (const [rule, field] of [['V-029', 'assumptions'], ['V-030', 'unresolvedDecisions']] as const) {
    const invalid = structuredIds(document[field])
    add(rule, invalid.length ? 'fail' : 'pass', invalid.length
      ? `${field} contains entries without a structured ID.`
      : `All ${field} entries use structured IDs.`, invalid)
  }

  // V-031: Port direction compatibility: out→in or inout→inout (Per file)
  const incompatible = document.edges.filter((edge) => {
    if (!edge.sourcePort || !edge.targetPort) return false
    const source = nodesById.get(edge.source)?.ports.find((port) => port.id === edge.sourcePort)
    const target = nodesById.get(edge.target)?.ports.find((port) => port.id === edge.targetPort)
    if (!source || !target) return false
    return !((source.direction === 'out' && target.direction === 'in') ||
      (source.direction === 'inout' && target.direction === 'inout'))
  }).map((edge) => edge.id)
  check('V-031', incompatible, 'Port directions are compatible (out→in or inout→inout).',
    'Port directions are incompatible with V-031 rule (out→in or inout→inout).')

  // V-032: No self-referencing edges (source === target) (Per file)
  check('V-032', document.edges.filter((edge) => edge.source === edge.target).map((edge) => edge.id),
    'No self-referencing edges found.', 'Self-referencing edges found.')

  // V-033: ER entity nodes have attributes array (ER files)
  const isEr = document.diagramType === 'entity-relationship'
  const isFlow = document.diagramType === 'end-to-end-flow'
  check('V-033', isEr ? document.nodes.filter((node) => node.type === 'entity' && !Array.isArray(node.attributes)).map((node) => node.id) : [],
    isEr ? 'Every ER entity has an attributes array.' : 'Not applicable outside ER diagrams.',
    'ER entity nodes are missing attributes arrays.')

  // V-034: ER relationship edges have cardinality metadata (ER files)
  check('V-034', isEr ? document.edges.filter((edge) => edge.semantic?.cardinality === undefined &&
    edge.semantic?.sourceCardinality === undefined && edge.semantic?.targetCardinality === undefined).map((edge) => edge.id) : [],
    isEr ? 'Every ER relationship has cardinality metadata.' : 'Not applicable outside ER diagrams.',
    'ER relationship edges are missing cardinality metadata.')

  // V-035: Flow diagrams have at least one start and one end node (Flow files)
  const missingTerminals = isFlow ? [
    ...(document.nodes.some((node) => node.type === 'start') ? [] : ['start']),
    ...(document.nodes.some((node) => node.type === 'end') ? [] : ['end']),
  ] : []
  check('V-035', missingTerminals, isFlow ? 'Flow has start and end nodes.' : 'Not applicable outside flow diagrams.',
    'Flow diagrams require at least one start and one end node.')

  // V-036: Decision nodes have ≥2 outgoing edges (Flow files)
  const decisionIds = isFlow ? document.nodes.filter((node) => node.type === 'decision' &&
    document.edges.filter((edge) => edge.source === node.id).length < 2).map((node) => node.id) : []
  check('V-036', decisionIds, isFlow ? 'Every decision has at least two outgoing edges.' : 'Not applicable outside flow diagrams.',
    'Decision nodes require at least two outgoing edges.')

  return makeReport(id, results)
}

export function validateArchitectureJson(
  text: string,
  context: ValidationContext = {},
): ValidatedImport {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    const id = context.fileName ?? 'import'
    return {
      value: null,
      report: makeReport(id, [{
        ruleId: 'V-001', fileId: id, status: 'fail',
        details: error instanceof Error ? error.message : 'Invalid JSON syntax.', affectedIds: [],
      }]),
    }
  }

  if (isArchitectureManifest(value)) {
    return { value, report: validateManifest(value, context) }
  }
  if (!isDocumentEnvelope(value)) {
    const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    const id = typeof record.documentId === 'string' ? record.documentId : context.fileName ?? 'document'
    const missing = ENVELOPE_FIELDS.filter((field) => !(field in record))
    return {
      value: null,
      report: makeReport(id, [
        { ruleId: 'V-001', fileId: id, status: 'pass', details: 'Valid JSON syntax.', affectedIds: [] },
        { ruleId: 'V-002', fileId: id, status: 'fail', details: `Missing or invalid envelope fields: ${missing.join(', ') || 'array/object field types'}.`, affectedIds: missing },
      ]),
    }
  }
  return { value, report: validateDocument(value, context) }
}
