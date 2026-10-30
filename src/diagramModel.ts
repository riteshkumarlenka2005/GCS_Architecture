// GRAVITAS canvas schema and canonical registries. These structures retain
// the complete imported JSON, including extension fields used by future ER
// and flow diagrams.

export type DiagramType =
  | 'system-context'
  | 'master-architecture'
  | 'deployment-architecture'
  | 'subsystem-architecture'
  | 'end-to-end-flow'
  | 'entity-relationship'

export type DiagramNodeType =
  | 'component'
  | 'system'
  | 'actor'
  | 'subsystem'
  | 'service'
  | 'database'
  | 'external-system'
  | 'vehicle'
  | 'adapter'
  | 'event-bus'
  | 'queue'
  | 'sensor'
  | 'payload'
  | 'process'
  | 'document'
  | 'decision'
  | 'start'
  | 'end'
  | 'entity'

export type DiagramNodeShape =
  | 'rounded-rectangle'
  | 'rectangle'
  | 'circle'
  | 'diamond'
  | 'hexagon'
  | 'cylinder'
  | 'cloud'
  | 'ellipse'

export type EdgeSemanticType =
  | 'data-flow'
  | 'control-flow'
  | 'dependency'
  | 'event'
  | 'command'
  | 'telemetry'
  | 'network-link'
  | 'persistence'
  | 'association'
  | 'auth-flow'
  | 'sync-flow'

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Bounds extends Point, Size {}

export interface DiagramViewport extends Point {
  zoom: number
}

export interface DiagramPort {
  id: string
  direction: 'in' | 'out' | 'inout' | string
  side?: 'top' | 'right' | 'bottom' | 'left'
  label: string
  dataType?:
    | 'telemetry'
    | 'command'
    | 'event'
    | 'data'
    | 'stream'
    | 'config'
    | 'auth'
    | string
    | null
  position?: { offset: number } | string
  [key: string]: unknown
}

export interface DiagramNodeStyle {
  shape: DiagramNodeShape
  category: string
  color: string
  borderColor: string | null
  borderWidth: number
  opacity: number
  icon: string | null
  fontSize: number
  textColor: string
  borderStyle?: 'solid' | 'dashed' | 'dotted'
  [key: string]: unknown
}

export interface DiagramNodeMetadata {
  engineId: string | null
  requirementIds: string[]
  responsibilities: string[]
  inputs: string[]
  outputs: string[]
  constraints: string[]
  failureModes: string[]
  technologyNotes: string | null
  assumptions: string[]
  unresolvedDecisions: string[]
  notes: string
  [key: string]: unknown
}

export interface DiagramNode {
  id: string
  type: DiagramNodeType
  label: string
  description: string
  groupId?: string | null
  position: Point
  size: Size
  style: DiagramNodeStyle
  ports: DiagramPort[]
  metadata?: DiagramNodeMetadata
  engineId?: string
  attributes?: unknown[]
  [key: string]: unknown
}

export interface DiagramGroup {
  id: string
  label: string
  description?: string
  parentGroupId?: string | null
  type?: string
  nodeIds?: string[]
  style?: {
    backgroundColor?: string
    borderColor?: string
    borderWidth?: number
    borderStyle?: 'solid' | 'dashed' | 'dotted' | string
    opacity?: number
    padding?: number
    labelPosition?: 'top-left' | 'top-center' | string
    fontSize?: number
    textColor?: string
    cornerRadius?: number
    [key: string]: unknown
  }
  bounds?: Bounds
  metadata?: {
    category?: string
    engineIds?: string[]
    notes?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface DiagramEdge {
  id: string
  source: string
  target: string
  sourcePort: string | null
  targetPort: string | null
  semantic: {
    type: EdgeSemanticType
    direction: 'unidirectional' | 'bidirectional'
    label: string
    protocol: string | null
    dataType: string | null
    trigger: string | null
    synchronous: boolean | null
    description: string
    requirementIds: string[]
    assumptions: string[]
    cardinality?: unknown
    sourceCardinality?: unknown
    targetCardinality?: unknown
    [key: string]: unknown
  }
  visual: {
    routing: 'orthogonal' | 'straight' | 'curved'
    waypoints: Point[]
    cornerRadius: number
    stroke: string
    strokeWidth: number
    arrow: 'end' | 'start' | 'both' | 'none'
    dash: 'solid' | 'dashed' | 'dotted'
    labelPosition: 'center' | 'source' | 'target'
    zIndex: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface ExternalReference {
  nodeId: string
  sourceDocumentId: string
  engineId: string
  label: string
  type: DiagramNodeType
  role: 'source' | 'target'
  style: {
    shape: DiagramNodeShape
    category: string
    color: string
    borderStyle: 'solid' | 'dashed' | 'dotted'
    borderColor?: string | null
    borderWidth?: number
    opacity?: number
    icon?: string | null
    fontSize?: number
    textColor?: string
    [key: string]: unknown
  }
  position?: Point
  size?: Size
  description?: string
  ports?: DiagramPort[]
  metadata?: DiagramNodeMetadata
  [key: string]: unknown
}

export interface CrossReference {
  canonicalEngineId: string
  localNodeId: string
  otherOccurrences: Array<{
    documentId: string
    nodeId: string
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export interface RequirementCoverage {
  requirementId: string
  description: string
  coveredByNodes: string[]
  coveredByEdges: string[]
  coverageStatus:
    | 'fully-mapped'
    | 'partially-mapped'
    | 'unmapped'
    | 'cross-cutting'
  verificationMethod: 'test' | 'inspection' | 'analysis' | 'demonstration' | null
  notes: string
  [key: string]: unknown
}

export interface StructuredDecision {
  id: string
  description: string
  [key: string]: unknown
}

export interface DiagramDocument {
  schemaVersion: string
  documentId: string
  title: string
  diagramType: DiagramType
  description: string
  category: string
  coordinateSystem: {
    unit: 'canvas-unit'
    origin: 'top-left'
    yAxis: 'down'
    [key: string]: unknown
  }
  viewport: DiagramViewport
  groups: DiagramGroup[]
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  externalReferences: ExternalReference[]
  crossReferences: CrossReference[]
  requirementsCoverage: RequirementCoverage[]
  assumptions: StructuredDecision[]
  unresolvedDecisions: StructuredDecision[]
  metadata: {
    status: string
    revision: number
    createdDate: string
    lastModified: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface ManifestFile {
  documentId: string
  filename: string
  title: string
  diagramType: DiagramType | null
  category: string
  description: string
  engineIds: string[]
  dependsOn: string[]
  requirementIds: string[]
  status: string
  generationBatch: number
  [key: string]: unknown
}

export interface ArchitectureManifest {
  schemaVersion: string
  documentId: string
  projectName: string
  projectDescription: string
  generationDate: string
  schemaDefinition: {
    diagramTypes?: string[]
    nodeTypes?: string[]
    edgeSemanticTypes?: string[]
    [key: string]: unknown
  }
  totalFiles: number
  totalEngines: number
  totalRequirements: number
  files: ManifestFile[]
  canonicalEngineIndex: Record<string, unknown>
  requirementIndex: Record<string, unknown>
  unresolvedDecisions: StructuredDecision[]
  assumptions: StructuredDecision[]
  metadata: Record<string, unknown>
  [key: string]: unknown
}

export function isArchitectureManifest(
  value: unknown,
): value is ArchitectureManifest {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    Array.isArray(record.files) &&
    !!record.canonicalEngineIndex &&
    typeof record.canonicalEngineIndex === 'object' &&
    !Array.isArray(record.nodes)
  )
}

// ----------------------------------------------------------------------------
// Section 2.1 Canonical Engine Registry (All 152 Engines)
// ----------------------------------------------------------------------------
export interface CanonicalEngineInfo {
  id: string
  category: string
  name: string
}

export const CANONICAL_ENGINES: Record<string, CanonicalEngineInfo> = {
  // CATEGORY A — CORE ARCHITECTURE (12 engines)
  'eng-core-vehicle-registry': { id: 'eng-core-vehicle-registry', category: 'core', name: 'Vehicle Registry & Discovery Engine' },
  'eng-core-universal-integration': { id: 'eng-core-universal-integration', category: 'core', name: 'Universal Vehicle Integration Engine' },
  'eng-core-multi-controller': { id: 'eng-core-multi-controller', category: 'core', name: 'Multi-Controller & Firmware Compatibility Engine' },
  'eng-core-protocol-adapter': { id: 'eng-core-protocol-adapter', category: 'core', name: 'Protocol Adapter & Abstraction Engine' },
  'eng-core-capability-discovery': { id: 'eng-core-capability-discovery', category: 'core', name: 'Capability Discovery & Compatibility Engine' },
  'eng-core-vehicle-state': { id: 'eng-core-vehicle-state', category: 'core', name: 'Vehicle State & Normalization Engine' },
  'eng-core-telemetry-ingestion': { id: 'eng-core-telemetry-ingestion', category: 'core', name: 'Telemetry Ingestion & Processing Engine' },
  'eng-core-event-processing': { id: 'eng-core-event-processing', category: 'core', name: 'Real-Time Event Processing & Synchronization Engine' },
  'eng-core-api-gateway': { id: 'eng-core-api-gateway', category: 'core', name: 'API & Real-Time Gateway Engine' },
  'eng-core-plugin-extension': { id: 'eng-core-plugin-extension', category: 'core', name: 'Plugin, Extension & Customization Engine' },
  'eng-core-schema-management': { id: 'eng-core-schema-management', category: 'core', name: 'Versioned Contracts & Schema Management Engine' },
  'eng-core-external-integration': { id: 'eng-core-external-integration', category: 'core', name: 'Integration & External Service Engine' },

  // CATEGORY B — COMMUNICATIONS (11 engines)
  'eng-comm-transport': { id: 'eng-comm-transport', category: 'comm', name: 'Universal Transport & Connectivity Engine' },
  'eng-comm-multi-network': { id: 'eng-comm-multi-network', category: 'comm', name: 'Multi-Network Communication Engine' },
  'eng-comm-network-diagnostics': { id: 'eng-comm-network-diagnostics', category: 'comm', name: 'Network Diagnostics & Monitoring Engine' },
  'eng-comm-link-quality': { id: 'eng-comm-link-quality', category: 'comm', name: 'Link Quality & Performance Analysis Engine' },
  'eng-comm-connection-recovery': { id: 'eng-comm-connection-recovery', category: 'comm', name: 'Connection Recovery & Failover Engine' },
  'eng-comm-routing': { id: 'eng-comm-routing', category: 'comm', name: 'Routing & Communication Path Management Engine' },
  'eng-comm-secure-comms': { id: 'eng-comm-secure-comms', category: 'comm', name: 'Secure Communications & Encryption Engine' },
  'eng-comm-offline-sync': { id: 'eng-comm-offline-sync', category: 'comm', name: 'Offline Operation & Synchronization Engine' },
  'eng-comm-remote-session': { id: 'eng-comm-remote-session', category: 'comm', name: 'Remote Connectivity & Session Management Engine' },
  'eng-comm-network-topology': { id: 'eng-comm-network-topology', category: 'comm', name: 'Network Topology & Link Visualization Engine' },
  'eng-comm-bandwidth-analysis': { id: 'eng-comm-bandwidth-analysis', category: 'comm', name: 'Bandwidth, Latency & Packet-Loss Analysis Engine' },

  // CATEGORY C — CROSS-PLATFORM (10 engines)
  'eng-plat-runtime': { id: 'eng-plat-runtime', category: 'plat', name: 'Cross-Platform Runtime Engine' },
  'eng-plat-os-compat': { id: 'eng-plat-os-compat', category: 'plat', name: 'Operating System Compatibility Engine' },
  'eng-plat-os-diagnostics': { id: 'eng-plat-os-diagnostics', category: 'plat', name: 'Operating System Diagnostics Engine' },
  'eng-plat-dependency-detection': { id: 'eng-plat-dependency-detection', category: 'plat', name: 'Runtime Dependency & Environment Detection Engine' },
  'eng-plat-device-interface': { id: 'eng-plat-device-interface', category: 'plat', name: 'Device Interface & Driver Compatibility Engine' },
  'eng-plat-app-performance': { id: 'eng-plat-app-performance', category: 'plat', name: 'Application Performance Monitoring Engine' },
  'eng-plat-resource-monitoring': { id: 'eng-plat-resource-monitoring', category: 'plat', name: 'Resource & Process Monitoring Engine' },
  'eng-plat-config-environment': { id: 'eng-plat-config-environment', category: 'plat', name: 'Configuration & Environment Management Engine' },
  'eng-plat-update-management': { id: 'eng-plat-update-management', category: 'plat', name: 'Application Update & Version Management Engine' },
  'eng-plat-deployment': { id: 'eng-plat-deployment', category: 'plat', name: 'Installation, Packaging & Deployment Management Engine' },

  // CATEGORY D — COP & GEOSPATIAL (12 engines)
  'eng-cop-core': { id: 'eng-cop-core', category: 'cop', name: 'Common Operational Picture (COP) Engine' },
  'eng-cop-geospatial-viz': { id: 'eng-cop-geospatial-viz', category: 'cop', name: 'Unified Geospatial Visualization Engine' },
  'eng-cop-map-layers': { id: 'eng-cop-map-layers', category: 'cop', name: 'Multi-Layer Map Management Engine' },
  'eng-cop-terrain': { id: 'eng-cop-terrain', category: 'cop', name: 'Terrain, Elevation & Environmental Mapping Engine' },
  'eng-cop-vehicle-tracks': { id: 'eng-cop-vehicle-tracks', category: 'cop', name: 'Vehicle Position, Track & Trajectory Visualization Engine' },
  'eng-cop-geofence': { id: 'eng-cop-geofence', category: 'cop', name: 'Geofence & Restricted-Area Management Engine' },
  'eng-cop-dynamic-obstacles': { id: 'eng-cop-dynamic-obstacles', category: 'cop', name: 'Dynamic Obstacle & Environment Mapping Engine' },
  'eng-cop-geospatial-data': { id: 'eng-cop-geospatial-data', category: 'cop', name: 'Geospatial Data Integration Engine' },
  'eng-cop-historical-playback': { id: 'eng-cop-historical-playback', category: 'cop', name: 'Historical Map Playback & Timeline Engine' },
  'eng-cop-data-fusion-viz': { id: 'eng-cop-data-fusion-viz', category: 'cop', name: 'Operational Data Fusion & Visualization Engine' },
  'eng-cop-configurable-overlays': { id: 'eng-cop-configurable-overlays', category: 'cop', name: 'Configurable Map, Symbol & Overlay Engine' },
  'eng-cop-offline-maps': { id: 'eng-cop-offline-maps', category: 'cop', name: 'Offline Maps & Geospatial Data Engine' },

  // CATEGORY E — PLANNING & NAVIGATION (17 engines)
  'eng-plan-centralized': { id: 'eng-plan-centralized', category: 'plan', name: 'Centralized Path Planning Engine' },
  'eng-plan-decentralized': { id: 'eng-plan-decentralized', category: 'plan', name: 'Decentralized Path Planning Engine' },
  'eng-plan-hybrid': { id: 'eng-plan-hybrid', category: 'plan', name: 'Hybrid Global-Local Path Planning Engine' },
  'eng-plan-motion-model': { id: 'eng-plan-motion-model', category: 'plan', name: 'Vehicle-Specific Motion & Navigation Model Engine' },
  'eng-plan-global-route': { id: 'eng-plan-global-route', category: 'plan', name: 'Global Route Planning Engine' },
  'eng-plan-local-replan': { id: 'eng-plan-local-replan', category: 'plan', name: 'Local Path Planning & Replanning Engine' },
  'eng-plan-reactive-avoidance': { id: 'eng-plan-reactive-avoidance', category: 'plan', name: 'Reactive Obstacle Avoidance Engine' },
  'eng-plan-multi-vehicle-coord': { id: 'eng-plan-multi-vehicle-coord', category: 'plan', name: 'Multi-Vehicle Path Coordination Engine' },
  'eng-plan-deconfliction': { id: 'eng-plan-deconfliction', category: 'plan', name: 'Multi-Vehicle Deconfliction Engine' },
  'eng-plan-fleet-optimization': { id: 'eng-plan-fleet-optimization', category: 'plan', name: 'Mission Allocation & Fleet Optimization Engine' },
  'eng-plan-cost-function': { id: 'eng-plan-cost-function', category: 'plan', name: 'Configurable Planning Objectives & Cost-Function Engine' },
  'eng-plan-feasibility': { id: 'eng-plan-feasibility', category: 'plan', name: 'Route Feasibility & Constraint Validation Engine' },
  'eng-plan-trajectory-analysis': { id: 'eng-plan-trajectory-analysis', category: 'plan', name: 'Planned-versus-Actual Trajectory Analysis Engine' },
  'eng-plan-terrain-traversability': { id: 'eng-plan-terrain-traversability', category: 'plan', name: 'Terrain Traversability & Environmental Cost Engine' },
  'eng-plan-energy-aware': { id: 'eng-plan-energy-aware', category: 'plan', name: 'Energy-Aware Route Planning Engine' },
  'eng-plan-nav-constraints': { id: 'eng-plan-nav-constraints', category: 'plan', name: 'Navigation Constraint & Operational Limit Engine' },
  'eng-plan-plugin-algorithm': { id: 'eng-plan-plugin-algorithm', category: 'plan', name: 'Planner Plugin & Algorithm Selection Engine' },

  // CATEGORY F — VEHICLE OPERATIONS (17 engines)
  'eng-ops-unified': { id: 'eng-ops-unified', category: 'ops', name: 'Unified Vehicle Operations Engine' },
  'eng-ops-mission-planning': { id: 'eng-ops-mission-planning', category: 'ops', name: 'Mission Planning & Route Design Engine' },
  'eng-ops-mission-validation': { id: 'eng-ops-mission-validation', category: 'ops', name: 'Mission Validation & Constraint Checking Engine' },
  'eng-ops-mission-execution': { id: 'eng-ops-mission-execution', category: 'ops', name: 'Mission/Task Execution Lifecycle Engine' },
  'eng-ops-command-control': { id: 'eng-ops-command-control', category: 'ops', name: 'Command & Control Engine' },
  'eng-ops-command-validation': { id: 'eng-ops-command-validation', category: 'ops', name: 'Command Validation & Policy Engine' },
  'eng-ops-command-tracking': { id: 'eng-ops-command-tracking', category: 'ops', name: 'Command Acknowledgement & Outcome Tracking Engine' },
  'eng-ops-vehicle-config': { id: 'eng-ops-vehicle-config', category: 'ops', name: 'Vehicle Parameter & Configuration Engine' },
  'eng-ops-preflight': { id: 'eng-ops-preflight', category: 'ops', name: 'Preflight Readiness Engine' },
  'eng-ops-health-assessment': { id: 'eng-ops-health-assessment', category: 'ops', name: 'Vehicle Health & Status Assessment Engine' },
  'eng-ops-nav-geospatial': { id: 'eng-ops-nav-geospatial', category: 'ops', name: 'Navigation & Geospatial Operations Engine' },
  'eng-ops-manual-control': { id: 'eng-ops-manual-control', category: 'ops', name: 'Manual Control & Operator Input Engine' },
  'eng-ops-fleet-management': { id: 'eng-ops-fleet-management', category: 'ops', name: 'Multi-Vehicle & Fleet Management Engine' },
  'eng-ops-task-coordination': { id: 'eng-ops-task-coordination', category: 'ops', name: 'Multi-Vehicle Task Coordination Engine' },
  'eng-ops-vehicle-recovery': { id: 'eng-ops-vehicle-recovery', category: 'ops', name: 'Vehicle Recovery & Operational State Management Engine' },
  'eng-ops-mission-versioning': { id: 'eng-ops-mission-versioning', category: 'ops', name: 'Mission Versioning & Change Management Engine' },
  'eng-ops-mission-monitoring': { id: 'eng-ops-mission-monitoring', category: 'ops', name: 'Mission Progress & Execution Monitoring Engine' },

  // CATEGORY G — SENSORS & FOV (10 engines)
  'eng-sensor-integration': { id: 'eng-sensor-integration', category: 'sensor', name: 'Sensor Integration & Management Engine' },
  'eng-sensor-fov': { id: 'eng-sensor-fov', category: 'sensor', name: 'Sensor Field-of-View (FOV) Engine' },
  'eng-sensor-pose-calibration': { id: 'eng-sensor-pose-calibration', category: 'sensor', name: 'Sensor Pose, Orientation & Calibration Engine' },
  'eng-sensor-coverage': { id: 'eng-sensor-coverage', category: 'sensor', name: 'Sensor Coverage & Visibility Analysis Engine' },
  'eng-sensor-camera-frustum': { id: 'eng-sensor-camera-frustum', category: 'sensor', name: 'Camera Frustum & Ground-Footprint Engine' },
  'eng-sensor-blind-spot': { id: 'eng-sensor-blind-spot', category: 'sensor', name: 'Sensor Blind-Spot & Coverage-Gap Analysis Engine' },
  'eng-sensor-fusion': { id: 'eng-sensor-fusion', category: 'sensor', name: 'Multi-Sensor Fusion Engine' },
  'eng-sensor-observations': { id: 'eng-sensor-observations', category: 'sensor', name: 'Sensor Observation & Detection Management Engine' },
  'eng-sensor-coverage-planning': { id: 'eng-sensor-coverage-planning', category: 'sensor', name: 'Coverage-Oriented Mission Planning Engine' },
  'eng-sensor-data-quality': { id: 'eng-sensor-data-quality', category: 'sensor', name: 'Sensor Data Quality & Timestamp Management Engine' },

  // CATEGORY H — PAYLOAD, VIDEO & MEDIA (9 engines)
  'eng-payload-management': { id: 'eng-payload-management', category: 'payload', name: 'Payload Integration & Management Engine' },
  'eng-payload-camera': { id: 'eng-payload-camera', category: 'payload', name: 'Camera & Imaging Engine' },
  'eng-payload-gimbal': { id: 'eng-payload-gimbal', category: 'payload', name: 'Gimbal & Sensor Control Engine' },
  'eng-payload-video-streaming': { id: 'eng-payload-video-streaming', category: 'payload', name: 'Video Streaming & Stream Lifecycle Engine' },
  'eng-payload-recording': { id: 'eng-payload-recording', category: 'payload', name: 'Recording & Media Capture Engine' },
  'eng-payload-media-storage': { id: 'eng-payload-media-storage', category: 'payload', name: 'Media/Object Storage & Lifecycle Engine' },
  'eng-payload-telemetry': { id: 'eng-payload-telemetry', category: 'payload', name: 'Payload Telemetry & Health Engine' },
  'eng-payload-media-metadata': { id: 'eng-payload-media-metadata', category: 'payload', name: 'Media Metadata & Mission Association Engine' },
  'eng-payload-review': { id: 'eng-payload-review', category: 'payload', name: 'Image, Video & Observation Review Engine' },

  // CATEGORY I — SECURITY & RELIABILITY (14 engines)
  'eng-sec-authentication': { id: 'eng-sec-authentication', category: 'sec', name: 'Identity & Authentication Engine' },
  'eng-sec-rbac': { id: 'eng-sec-rbac', category: 'sec', name: 'Role-Based Access Control (RBAC) Engine' },
  'eng-sec-authorization': { id: 'eng-sec-authorization', category: 'sec', name: 'Authorization & Permission Enforcement Engine' },
  'eng-sec-credentials': { id: 'eng-sec-credentials', category: 'sec', name: 'Credential & Secret Management Engine' },
  'eng-sec-safety-policy': { id: 'eng-sec-safety-policy', category: 'sec', name: 'Safety Policy & Interlock Engine' },
  'eng-sec-fault-detection': { id: 'eng-sec-fault-detection', category: 'sec', name: 'Fault Detection & Isolation Engine' },
  'eng-sec-retry-recovery': { id: 'eng-sec-retry-recovery', category: 'sec', name: 'Retry, Timeout & Recovery Engine' },
  'eng-sec-watchdog': { id: 'eng-sec-watchdog', category: 'sec', name: 'Watchdog & Service Health Engine' },
  'eng-sec-error-classification': { id: 'eng-sec-error-classification', category: 'sec', name: 'Error Classification & Incident Management Engine' },
  'eng-sec-audit': { id: 'eng-sec-audit', category: 'sec', name: 'Audit & Accountability Engine' },
  'eng-sec-data-integrity': { id: 'eng-sec-data-integrity', category: 'sec', name: 'Data Integrity & Validation Engine' },
  'eng-sec-config-security': { id: 'eng-sec-config-security', category: 'sec', name: 'Configuration Security & Change Control Engine' },
  'eng-sec-command-uncertainty': { id: 'eng-sec-command-uncertainty', category: 'sec', name: 'Command Uncertainty & Reconciliation Engine' },
  'eng-sec-operational-risk': { id: 'eng-sec-operational-risk', category: 'sec', name: 'Operational Risk & Constraint Enforcement Engine' },

  // CATEGORY J — DATA & OBSERVABILITY (12 engines)
  'eng-data-persistence': { id: 'eng-data-persistence', category: 'data', name: 'Persistence & Database Management Engine' },
  'eng-data-telemetry-history': { id: 'eng-data-telemetry-history', category: 'data', name: 'Telemetry History & Time-Series Engine' },
  'eng-data-logging': { id: 'eng-data-logging', category: 'data', name: 'Logging & Event History Engine' },
  'eng-data-replay': { id: 'eng-data-replay', category: 'data', name: 'Operational Replay & Timeline Engine' },
  'eng-data-diagnostics': { id: 'eng-data-diagnostics', category: 'data', name: 'Diagnostics & Troubleshooting Engine' },
  'eng-data-health-dashboard': { id: 'eng-data-health-dashboard', category: 'data', name: 'System Health Dashboard Engine' },
  'eng-data-alerts': { id: 'eng-data-alerts', category: 'data', name: 'Alert & Notification Engine' },
  'eng-data-incident-evidence': { id: 'eng-data-incident-evidence', category: 'data', name: 'Incident Evidence & Export Engine' },
  'eng-data-retention': { id: 'eng-data-retention', category: 'data', name: 'Data Retention & Lifecycle Policy Engine' },
  'eng-data-sync-resolution': { id: 'eng-data-sync-resolution', category: 'data', name: 'Synchronization & Conflict Resolution Engine' },
  'eng-data-provenance': { id: 'eng-data-provenance', category: 'data', name: 'Data Provenance & Quality Management Engine' },
  'eng-data-backup': { id: 'eng-data-backup', category: 'data', name: 'Backup, Recovery & Configuration Restoration Engine' },

  // CATEGORY K — CUSTOMIZATION & INTELLIGENCE (14 engines)
  'eng-cust-workflow-automation': { id: 'eng-cust-workflow-automation', category: 'cust', name: 'Workflow Automation Engine' },
  'eng-cust-rules-engine': { id: 'eng-cust-rules-engine', category: 'cust', name: 'Rules & Event-Driven Action Engine' },
  'eng-cust-scripting': { id: 'eng-cust-scripting', category: 'cust', name: 'Scripting & Operator-Defined Workflow Engine' },
  'eng-cust-ai-diagnostics': { id: 'eng-cust-ai-diagnostics', category: 'cust', name: 'AI-Assisted Diagnostics Engine' },
  'eng-cust-anomaly-detection': { id: 'eng-cust-anomaly-detection', category: 'cust', name: 'Anomaly Detection & Predictive Health Engine' },
  'eng-cust-geospatial-analysis': { id: 'eng-cust-geospatial-analysis', category: 'cust', name: 'Geospatial Analysis & Mission Intelligence Engine' },
  'eng-cust-task-execution': { id: 'eng-cust-task-execution', category: 'cust', name: 'Extensible Task & Service Execution Engine' },
  'eng-cust-scenarios': { id: 'eng-cust-scenarios', category: 'cust', name: 'Configurable Operational Scenario Engine' },
  'eng-cust-dashboards': { id: 'eng-cust-dashboards', category: 'cust', name: 'Custom Dashboard & Workspace Engine' },
  'eng-cust-mission-templates': { id: 'eng-cust-mission-templates', category: 'cust', name: 'Custom Mission Template & Workflow Engine' },
  'eng-cust-alert-config': { id: 'eng-cust-alert-config', category: 'cust', name: 'Configurable Alert, Threshold & Policy Engine' },
  'eng-cust-sdk': { id: 'eng-cust-sdk', category: 'cust', name: 'Integration SDK & Developer Extension Engine' },
  'eng-cust-plugin-lifecycle': { id: 'eng-cust-plugin-lifecycle', category: 'cust', name: 'Plugin Lifecycle, Permission & Compatibility Engine' },
  'eng-cust-operator-preferences': { id: 'eng-cust-operator-preferences', category: 'cust', name: 'Operator Preference & Profile Management Engine' },

  // CATEGORY L — TESTING & SIMULATION (14 engines)
  'eng-test-sitl': { id: 'eng-test-sitl', category: 'test', name: 'Simulation & Software-in-the-Loop (SITL) Integration Engine' },
  'eng-test-hil': { id: 'eng-test-hil', category: 'test', name: 'Hardware-in-the-Loop (HIL) Test Integration Engine' },
  'eng-test-automated': { id: 'eng-test-automated', category: 'test', name: 'Automated Testing & Regression Engine' },
  'eng-test-fault-injection': { id: 'eng-test-fault-injection', category: 'test', name: 'Fault Injection & Resilience Testing Engine' },
  'eng-test-protocol-conformance': { id: 'eng-test-protocol-conformance', category: 'test', name: 'Protocol & Adapter Conformance Testing Engine' },
  'eng-test-cross-platform': { id: 'eng-test-cross-platform', category: 'test', name: 'Cross-Platform Compatibility Testing Engine' },
  'eng-test-performance': { id: 'eng-test-performance', category: 'test', name: 'Performance Profiling & Optimization Engine' },
  'eng-test-latency': { id: 'eng-test-latency', category: 'test', name: 'Latency & Throughput Monitoring Engine' },
  'eng-test-route-benchmark': { id: 'eng-test-route-benchmark', category: 'test', name: 'Route Planning Evaluation & Benchmarking Engine' },
  'eng-test-sensor-validation': { id: 'eng-test-sensor-validation', category: 'test', name: 'Sensor Coverage Validation Engine' },
  'eng-test-fleet-scenarios': { id: 'eng-test-fleet-scenarios', category: 'test', name: 'Fleet Coordination & Scenario Testing Engine' },
  'eng-test-release-validation': { id: 'eng-test-release-validation', category: 'test', name: 'Release Validation & Readiness Engine' },
  'eng-test-config-migration': { id: 'eng-test-config-migration', category: 'test', name: 'Configuration Migration & Upgrade Validation Engine' },
  'eng-test-compat-matrix': { id: 'eng-test-compat-matrix', category: 'test', name: 'Compatibility Matrix & Capability Verification Engine' },
}

// ----------------------------------------------------------------------------
// Section 5.1 Color Palette (Dark Canvas Defaults)
// ----------------------------------------------------------------------------
export interface PaletteEntry {
  nodeColor: string
  borderColor: string
  textColor: string
  groupBg: string
}

export const CANONICAL_PALETTE: Record<string, PaletteEntry> = {
  core:     { nodeColor: '#3b82f6', borderColor: '#2563eb', textColor: '#ffffff', groupBg: 'rgba(59, 130, 246, 0.10)' },
  comm:     { nodeColor: '#06b6d4', borderColor: '#0891b2', textColor: '#ffffff', groupBg: 'rgba(6, 182, 212, 0.10)' },
  cop:      { nodeColor: '#10b981', borderColor: '#059669', textColor: '#ffffff', groupBg: 'rgba(16, 185, 129, 0.10)' },
  plan:     { nodeColor: '#f59e0b', borderColor: '#d97706', textColor: '#ffffff', groupBg: 'rgba(245, 158, 11, 0.10)' },
  ops:      { nodeColor: '#8b5cf6', borderColor: '#7c3aed', textColor: '#ffffff', groupBg: 'rgba(139, 92, 246, 0.10)' },
  sensor:   { nodeColor: '#ec4899', borderColor: '#db2777', textColor: '#ffffff', groupBg: 'rgba(236, 72, 153, 0.10)' },
  payload:  { nodeColor: '#f43f5e', borderColor: '#e11d48', textColor: '#ffffff', groupBg: 'rgba(244, 63, 94, 0.10)' },
  sec:      { nodeColor: '#ef4444', borderColor: '#dc2626', textColor: '#ffffff', groupBg: 'rgba(239, 68, 68, 0.10)' },
  data:     { nodeColor: '#14b8a6', borderColor: '#0d9488', textColor: '#ffffff', groupBg: 'rgba(20, 184, 166, 0.10)' },
  cust:     { nodeColor: '#a855f7', borderColor: '#9333ea', textColor: '#ffffff', groupBg: 'rgba(168, 85, 247, 0.10)' },
  test:     { nodeColor: '#64748b', borderColor: '#475569', textColor: '#ffffff', groupBg: 'rgba(100, 116, 139, 0.10)' },
  actor:    { nodeColor: '#f8fafc', borderColor: '#94a3b8', textColor: '#1e293b', groupBg: 'rgba(248, 250, 252, 0.08)' },
  external: { nodeColor: '#475569', borderColor: '#334155', textColor: '#cbd5e1', groupBg: 'rgba(71, 85, 105, 0.08)' },
  vehicle:  { nodeColor: '#22d3ee', borderColor: '#06b6d4', textColor: '#ffffff', groupBg: 'rgba(34, 211, 238, 0.08)' },
  storage:  { nodeColor: '#0d9488', borderColor: '#0f766e', textColor: '#ffffff', groupBg: 'rgba(13, 148, 136, 0.08)' },
  event:    { nodeColor: '#fbbf24', borderColor: '#f59e0b', textColor: '#1e293b', groupBg: 'rgba(251, 191, 36, 0.08)' },
  decision: { nodeColor: '#fbbf24', borderColor: '#f59e0b', textColor: '#1e293b', groupBg: 'rgba(251, 191, 36, 0.08)' },
  terminal: { nodeColor: '#94a3b8', borderColor: '#64748b', textColor: '#ffffff', groupBg: 'rgba(148, 163, 184, 0.08)' },
}

// ----------------------------------------------------------------------------
// Section 5.2 Edge Styles by Semantic Type
// ----------------------------------------------------------------------------
export interface DefaultEdgeStyle {
  stroke: string
  strokeWidth: number
  dash: 'solid' | 'dashed' | 'dotted'
  arrow: 'end' | 'start' | 'both' | 'none'
}

export const DEFAULT_EDGE_STYLES: Record<EdgeSemanticType, DefaultEdgeStyle> = {
  'data-flow':    { stroke: '#64748b', strokeWidth: 2, dash: 'solid',  arrow: 'end' },
  'control-flow': { stroke: '#8b5cf6', strokeWidth: 2, dash: 'solid',  arrow: 'end' },
  'dependency':   { stroke: '#475569', strokeWidth: 1, dash: 'dashed', arrow: 'end' },
  'event':        { stroke: '#fbbf24', strokeWidth: 2, dash: 'dotted', arrow: 'end' },
  'command':      { stroke: '#ef4444', strokeWidth: 2, dash: 'solid',  arrow: 'end' },
  'telemetry':    { stroke: '#06b6d4', strokeWidth: 2, dash: 'solid',  arrow: 'end' },
  'network-link': { stroke: '#22d3ee', strokeWidth: 2, dash: 'solid',  arrow: 'both' },
  'persistence':  { stroke: '#0d9488', strokeWidth: 2, dash: 'dashed', arrow: 'end' },
  'association':  { stroke: '#94a3b8', strokeWidth: 1, dash: 'dotted', arrow: 'none' },
  'auth-flow':    { stroke: '#ef4444', strokeWidth: 2, dash: 'dashed', arrow: 'end' },
  'sync-flow':    { stroke: '#a855f7', strokeWidth: 2, dash: 'dotted', arrow: 'both' },
}

// ----------------------------------------------------------------------------
// Section 5.3 Node Shapes by Type
// ----------------------------------------------------------------------------
export const DEFAULT_NODE_SHAPES: Record<DiagramNodeType, DiagramNodeShape> = {
  component: 'rounded-rectangle',
  system: 'rounded-rectangle',
  actor: 'rectangle',
  subsystem: 'rounded-rectangle',
  service: 'rounded-rectangle',
  database: 'cylinder',
  'external-system': 'cloud',
  vehicle: 'hexagon',
  adapter: 'rounded-rectangle',
  'event-bus': 'ellipse',
  queue: 'rectangle',
  sensor: 'hexagon',
  payload: 'hexagon',
  process: 'rounded-rectangle',
  document: 'rectangle',
  decision: 'diamond',
  start: 'circle',
  end: 'circle',
  entity: 'rectangle',
}
