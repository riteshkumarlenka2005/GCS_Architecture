// Generates a fully self-contained HTML file of the current canvas.
// The exported file has no dependencies: it works offline when opened
// directly in any browser (double-click, file:// or any host).

import type { Shape } from './shapeModel'

export interface ExportNode {
  x: number
  y: number
  w: number
  title: string
  sub: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// JSON embedded inside <script>: escape '<' so '</script>' can never appear
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

// Static SVG markup for all shapes (drawn once, not interactive in the
// exported file). Marker ids use the shape id, so they stay unique.
function shapesToSvg(shapes: Shape[]): string {
  const parts: string[] = []
  for (const shape of shapes) {
    const stroke = shape.stroke ?? 'currentColor'
    // Text is embedded as a single-quoted JS string in the export, so
    // single quotes must be escaped too
    const text = (tx: number, ty: number) =>
      shape.text
        ? `<text class="shape-text-el" x="${tx}" y="${ty}">${escapeHtml(shape.text).replace(/'/g, '&#39;')}</text>`
        : ''
    switch (shape.type) {
      case 'rect':
        parts.push(
          `<rect class="shape-el" x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" fill="${shape.fill ?? 'none'}" stroke="${stroke}"/>` +
            text(shape.x + shape.w / 2, shape.y + shape.h / 2),
        )
        break
      case 'oval':
        parts.push(
`<ellipse class="shape-el" cx="${shape.x + shape.w / 2}" cy="${shape.y + shape.h / 2}" rx="${shape.w / 2}" ry="${shape.h / 2}" fill="${shape.fill ?? 'none'}" stroke="${stroke}"/>` +
            text(shape.x + shape.w / 2, shape.y + shape.h / 2),
        )
        break
      case 'circle':
        parts.push(
          `<circle class="shape-el" cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" fill="${shape.fill ?? 'none'}" stroke="${stroke}"/>` +
            text(shape.cx, shape.cy),
        )
        break
      case 'triangle':
        parts.push(
          `<polygon class="shape-el" points="${shape.x + shape.w / 2},${shape.y} ${shape.x + shape.w},${shape.y + shape.h} ${shape.x},${shape.y + shape.h}" fill="${shape.fill ?? 'none'}" stroke="${stroke}"/>` +
            text(shape.x + shape.w / 2, shape.y + shape.h * 0.58),
        )
        break
      case 'arrow':
      case 'line': {
        const markerId = `arrow-head-${shape.id}`
        const d = shape.bend
          ? `M ${shape.x1} ${shape.y1} Q ${shape.bend.x} ${shape.bend.y} ${shape.x2} ${shape.y2}`
          : `M ${shape.x1} ${shape.y1} L ${shape.x2} ${shape.y2}`
        const marker =
          shape.type === 'arrow'
            ? `<defs><marker id="${markerId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${stroke}"/></marker></defs>`
            : ''
        const markerEnd =
          shape.type === 'arrow' ? ` marker-end="url(#${markerId})"` : ''
        const mid = shape.bend ?? {
          x: (shape.x1 + shape.x2) / 2,
          y: (shape.y1 + shape.y2) / 2,
        }
        parts.push(
          `${marker}<path class="shape-el" d="${d}" fill="none" stroke="${stroke}"${markerEnd}/>` +
            text(mid.x, mid.y),
        )
        break
      }
    }
  }
  return parts.length
    ? `<svg class="shape-layer" width="0" height="0">${parts.join('')}</svg>`
    : ''
}

export interface StandaloneExportOptions {
  diagramSvg?: string
  initialTransform?: { x: number; y: number; scale: number }
}

export function buildStandaloneHtml(
  canvasName: string,
  nodes: ExportNode[],
  shapes: Shape[] = [],
  options: StandaloneExportOptions = {},
): string {
  const title = escapeHtml(canvasName)
  const titleJson = safeJson(canvasName)
  const nodesJson = safeJson(nodes)
  const shapesSvg = shapesToSvg(shapes)
  const diagramSvgJson = safeJson(options.diagramSvg ?? '')
  const initialTransformJson = safeJson(
    options.initialTransform ?? { x: 0, y: 0, scale: 1 },
  )

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root { --accent:#3b82f6; --accent-fg:#ffffff; }
:root[data-theme='light'] { --canvas-bg:#f6f6f8; --grid-dot:#c9c9d2; --toolbar-bg:rgba(255,255,255,0.85); --toolbar-border:rgba(20,20,30,0.1); --toolbar-shadow:0 8px 24px rgba(20,20,30,0.12); --tool-fg:#3f3f46; --tool-hover:rgba(20,20,30,0.06); --menu-title:#8b8b93; --node-bg:#ffffff; color-scheme:light; }
:root[data-theme='dark'] { --accent:#ffffff; --accent-fg:#000000; --canvas-bg:#000000; --grid-dot:#262626; --toolbar-bg:rgba(16,16,16,0.88); --toolbar-border:rgba(255,255,255,0.12); --toolbar-shadow:0 8px 24px rgba(0,0,0,0.7); --tool-fg:#ececec; --tool-hover:rgba(255,255,255,0.1); --menu-title:#9a9aa2; --node-bg:#171717; color-scheme:dark; }
* { box-sizing:border-box; }
html, body { height:100%; margin:0; }
body { overflow:hidden; font-family:system-ui,'Segoe UI',Roboto,sans-serif; -webkit-font-smoothing:antialiased; }
#canvas { position:absolute; inset:0; background-color:var(--canvas-bg); background-image:radial-gradient(circle,var(--grid-dot) 1px,transparent 1.2px); touch-action:none; user-select:none; -webkit-user-select:none; }
#canvas.is-pannable { cursor:grab; }
#canvas.is-pannable:active { cursor:grabbing; }
#content { position:absolute; top:0; left:0; width:0; height:0; transform-origin:0 0; will-change:transform; }
#toolbar { position:absolute; top:16px; left:16px; z-index:10; display:flex; flex-direction:column; gap:4px; padding:8px; border-radius:14px; border:1px solid var(--toolbar-border); background:var(--toolbar-bg); box-shadow:var(--toolbar-shadow); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); }
.tool { display:grid; place-items:center; width:40px; height:40px; padding:0; border:none; border-radius:10px; background:transparent; color:var(--tool-fg); cursor:pointer; transition:background-color .15s ease,color .15s ease,opacity .15s ease; }
.tool:hover:not(:disabled) { background:var(--tool-hover); }
.tool:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.tool.is-active { background:var(--accent); color:var(--accent-fg); }
.tool:disabled { opacity:.35; cursor:not-allowed; }
.sep { height:1px; margin:4px 8px; background:var(--toolbar-border); }
.label { max-width:40px; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:10.5px; letter-spacing:.03em; text-align:center; color:var(--menu-title); }
.node-card { position:absolute; padding:14px 16px; border:1px solid var(--toolbar-border); border-radius:12px; background:var(--node-bg); box-shadow:var(--toolbar-shadow); text-align:left; }
.node-card-title { margin-bottom:4px; font-size:15px; font-weight:600; color:var(--tool-fg); }
.node-card-sub { font-size:12.5px; color:var(--menu-title); }
.shape-layer { position:absolute; top:0; left:0; overflow:visible; color:var(--tool-fg); }
.shape-el { stroke-width:2; }
.shape-text-el { fill:var(--tool-fg); font-size:14px; font-family:inherit; text-anchor:middle; dominant-baseline:central; }
.diagram-layer { position:absolute; top:0; left:0; overflow:visible; pointer-events:none; font-family:inherit; }
.diagram-group-label { font-weight:650; letter-spacing:.015em; }
.diagram-node-label { font-weight:600; dominant-baseline:central; }
.diagram-node-detail { font-weight:450; opacity:.78; }
.diagram-port circle { fill:var(--canvas-bg); stroke:#cbd5e1; stroke-width:1.5; vector-effect:non-scaling-stroke; }
.diagram-port circle[data-direction='out'] { fill:#94a3b8; }
.diagram-port circle[data-direction='inout'] { fill:#fbbf24; }
.diagram-port-label { display:none; }
.diagram-edge-label rect { fill:var(--node-bg); stroke:var(--toolbar-border); stroke-width:1; vector-effect:non-scaling-stroke; }
.diagram-edge-label text { fill:var(--tool-fg); font-weight:500; }
</style>
</head>
<body>
<div id="canvas"><div id="content"></div></div>
<div id="toolbar"></div>
<script>
(function () {
  var MIN_SCALE = 0.1;
  var MAX_SCALE = 8;
  var ZOOM_FACTOR = 1.25;
  var GRID_SIZE = 24;
  var TITLE = ${titleJson};
  var NODES = ${nodesJson};
  var SHAPES_SVG = '${shapesSvg}';
  var DIAGRAM_SVG = ${diagramSvgJson};

  var transform = ${initialTransformJson};
  var locked = false;
  var panMode = true;

  var canvas = document.getElementById('canvas');
  var content = document.getElementById('content');
  var toolbar = document.getElementById('toolbar');

  var stored = null;
  try { stored = localStorage.getItem('canvas-theme'); } catch (e) {}
  var theme = stored === 'light' ? 'light' : 'dark';
  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('canvas-theme', theme); } catch (e) {}
  }
  applyTheme();

  var ICONS = {
    zoomIn: '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path><path d="M11 8v6"></path><path d="M8 11h6"></path>',
    zoomOut: '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path><path d="M8 11h6"></path>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
    unlock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"></path><path d="M14 10V4a2 2 0 0 0-4 0v2"></path><path d="M10 10.5V6a2 2 0 0 0-4 0v8"></path><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path>',
    check: '<path d="M20 6 9 17l-5-5"></path>',
    sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>'
  };

  function iconSvg(name, size) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="' + size + '" height="' + size + '">' + ICONS[name] + '</svg>';
  }

  function makeButton(name, title) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'tool';
    button.title = title;
    button.innerHTML = iconSvg(name, 20);
    toolbar.appendChild(button);
    return button;
  }

  function makeSep() {
    var sep = document.createElement('div');
    sep.className = 'sep';
    toolbar.appendChild(sep);
  }

  var zoomInBtn = makeButton('zoomIn', 'Zoom in');
  var zoomOutBtn = makeButton('zoomOut', 'Zoom out');
  var lockBtn = makeButton('unlock', 'Lock');
  var panBtn = makeButton('hand', 'Pan');
  var okBtn = makeButton('check', 'OK');
  makeSep();
  var themeBtn = makeButton('moon', 'Toggle theme');

  var label = document.createElement('div');
  label.className = 'label';
  label.title = TITLE;
  label.textContent = TITLE;
  toolbar.appendChild(label);

  NODES.forEach(function (node) {
    var card = document.createElement('div');
    card.className = 'node-card';
    card.style.left = node.x + 'px';
    card.style.top = node.y + 'px';
    card.style.width = node.w + 'px';
    var cardTitle = document.createElement('div');
    cardTitle.className = 'node-card-title';
    cardTitle.textContent = node.title;
    var cardSub = document.createElement('div');
    cardSub.className = 'node-card-sub';
    cardSub.textContent = node.sub;
    card.appendChild(cardTitle);
    card.appendChild(cardSub);
    content.appendChild(card);
  });

  if (DIAGRAM_SVG) {
    content.insertAdjacentHTML('beforeend', DIAGRAM_SVG);
  }
  if (SHAPES_SVG) {
    content.insertAdjacentHTML('beforeend', SHAPES_SVG);
  }

  function updateView() {
    var scale = transform.scale;
    canvas.style.backgroundPosition = transform.x + 'px ' + transform.y + 'px';
    canvas.style.backgroundSize = (GRID_SIZE * scale) + 'px ' + (GRID_SIZE * scale) + 'px';
    content.style.transform = 'translate(' + transform.x + 'px, ' + transform.y + 'px) scale(' + scale + ')';
    canvas.className = panMode && !locked ? 'is-pannable' : '';
    lockBtn.innerHTML = iconSvg(locked ? 'lock' : 'unlock', 20);
    lockBtn.title = locked ? 'Unlock' : 'Lock';
    lockBtn.classList.toggle('is-active', locked);
    panBtn.classList.toggle('is-active', panMode);
    zoomInBtn.disabled = locked;
    zoomOutBtn.disabled = locked;
    panBtn.disabled = locked;
    themeBtn.innerHTML = iconSvg(theme === 'light' ? 'moon' : 'sun', 20);
  }

  function zoomAt(factor, anchor) {
    var scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, transform.scale * factor));
    if (scale === transform.scale) return;
    var rect = canvas.getBoundingClientRect();
    var w = rect.width || window.innerWidth;
    var h = rect.height || window.innerHeight;
    var ax = anchor ? anchor.x - rect.left : w / 2;
    var ay = anchor ? anchor.y - rect.top : h / 2;
    var cx = ax - transform.x;
    var cy = ay - transform.y;
    var ratio = scale / transform.scale;
    transform.scale = scale;
    transform.x = ax - cx * ratio;
    transform.y = ay - cy * ratio;
    updateView();
  }

  window.addEventListener('wheel', function (event) {
    if (locked) return;
    if (toolbar.contains(event.target)) return;
    event.preventDefault();
    var delta = Math.max(-300, Math.min(300, event.deltaY));
    var factor = Math.pow(ZOOM_FACTOR, delta / 100);
    zoomAt(factor, { x: event.clientX, y: event.clientY });
  }, { passive: false });

  var drag = null;
  canvas.addEventListener('pointerdown', function (event) {
    if (locked || !panMode || event.button !== 0) return;
    drag = { sx: event.clientX, sy: event.clientY, ox: transform.x, oy: transform.y };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', function (event) {
    if (!drag) return;
    transform.x = drag.ox + (event.clientX - drag.sx);
    transform.y = drag.oy + (event.clientY - drag.sy);
    updateView();
  });
  function endDrag() { drag = null; }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  zoomInBtn.addEventListener('click', function () { zoomAt(ZOOM_FACTOR); });
  zoomOutBtn.addEventListener('click', function () { zoomAt(1 / ZOOM_FACTOR); });
  lockBtn.addEventListener('click', function () { locked = !locked; updateView(); });
  panBtn.addEventListener('click', function () { panMode = !panMode; updateView(); });
  okBtn.addEventListener('click', function () { transform = { x: 0, y: 0, scale: 1 }; updateView(); });
  themeBtn.addEventListener('click', function () {
    theme = theme === 'light' ? 'dark' : 'light';
    applyTheme();
    updateView();
  });

  updateView();
})();
</script>
</body>
</html>
`
}
