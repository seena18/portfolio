import { useEffect, useRef, useState } from 'react';
import './LayoutEditor.css';

const KEY = 'portfolio-layout-draft-v1';
const GRID = 8;
const TARGETS = [
  { label: 'Main menu', selector: '.symbiote-nav' },
  { label: 'Seena intro', selector: '.seena-profile__opening' },
  { label: 'Seena bust', selector: '.seena-portrait' },
  { label: 'Seena experience', selector: '.seena-profile__body' },
  { label: 'Project visual', selector: '.project-visual' },
  { label: 'Project text', selector: '.project-overview' },
];
const BREAKPOINTS = [
  { id: 'phone', label: 'Phone', media: '(max-width: 430px)' },
  { id: 'tablet', label: 'Tablet', media: '(min-width: 431px) and (max-width: 1100px)' },
  { id: 'desktop', label: 'Desktop', media: '(min-width: 1101px)' },
];
const blank = { x: 0, y: 0, width: null, height: null };
const snap = value => Math.round(value / GRID) * GRID;
const currentBreakpoint = () => window.innerWidth <= 430 ? 'phone' : window.innerWidth <= 1100 ? 'tablet' : 'desktop';
const viewportRect = () => ({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight });
const axisPoints = (rect, axis) => axis === 'x'
  ? [{ pos: rect.left, edge: 'left' }, { pos: rect.left + rect.width / 2, edge: 'center' }, { pos: rect.right, edge: 'right' }]
  : [{ pos: rect.top, edge: 'top' }, { pos: rect.top + rect.height / 2, edge: 'middle' }, { pos: rect.bottom, edge: 'bottom' }];
const elementRect = selector => {
  if (!selector) return null;
  const node = document.querySelector(selector);
  const rect = node?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const style = getComputedStyle(node);
  return style.visibility !== 'hidden' && Number(style.opacity) > 0.01 ? rect : null;
};

function unionRect(rects) {
  if (!rects.length) return null;
  const x = Math.min(...rects.map(rect => rect.left));
  const y = Math.min(...rects.map(rect => rect.top));
  const right = Math.max(...rects.map(rect => rect.right));
  const bottom = Math.max(...rects.map(rect => rect.bottom));
  return { x, y, width: right - x, height: bottom - y };
}

function snapToAlignment(rect, delta, axis, selected, resize = false) {
  const points = resize ? axisPoints(rect, axis).slice(-1) : axisPoints(rect, axis);
  const selectedLabels = Array.isArray(selected) ? selected : [selected];
  const references = [{ label: 'Window', rect: viewportRect() }, ...TARGETS
    .filter(target => !selectedLabels.includes(target.label))
    .map(target => ({ label: target.label, rect: elementRect(target.selector) }))
    .filter(item => item.rect)];
  let best = null;
  for (const reference of references) {
    const guides = axisPoints(reference.rect, axis);
    for (let index = 0; index < points.length; index++) {
      for (let guideIndex = 0; guideIndex < guides.length; guideIndex++) {
        const distance = guides[guideIndex].pos - (points[index].pos + delta);
        if (Math.abs(distance) <= 7 && (!best || Math.abs(distance) < Math.abs(best.distance))) {
          best = { distance, pos: guides[guideIndex].pos, label: `${points[index].edge} → ${reference.label} ${guides[guideIndex].edge}` };
        }
      }
    }
  }
  return best ? { delta: delta + best.distance, guide: best } : { delta: snap(delta), guide: null };
}

function readDraft() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

function cssFor(draft, preview = false) {
  const rules = BREAKPOINTS.map(({ id, media }) => {
    const entries = TARGETS.flatMap(({ label, selector }) => {
      const value = draft[id]?.[label];
      if (!value) return [];
      const declarations = [
        `translate: ${value.x || 0}px ${value.y || 0}px !important;`,
        value.width != null && `width: ${value.width}px !important;`,
        value.height != null && `height: ${value.height}px !important;`,
      ].filter(Boolean);
      return [`  ${preview ? 'body.layout-editor-active ' : ''}${selector} { ${declarations.join(' ')} }`];
    });
    return entries.length ? `@media ${media} {\n${entries.join('\n')}\n}` : '';
  }).filter(Boolean);
  return rules.join('\n\n');
}

export default function LayoutEditor() {
  const [draft, setDraft] = useState(readDraft);
  const [selectedItems, setSelectedItems] = useState(['Seena bust']);
  const [breakpoint, setBreakpoint] = useState(currentBreakpoint);
  const [bounds, setBounds] = useState(null);
  const [showGrid, setShowGrid] = useState(true);
  const [reference, setReference] = useState('Window');
  const [guides, setGuides] = useState({ x: null, y: null });
  const [notice, setNotice] = useState('');
  const drag = useRef(null);
  const activeItems = selectedItems.filter(label => elementRect(TARGETS.find(target => target.label === label)?.selector));
  const selected = activeItems[0] || selectedItems[0];
  const grouped = activeItems.length > 1;
  const value = draft[breakpoint]?.[selected] || blank;
  const visible = BREAKPOINTS.find(item => item.id === breakpoint)?.media;
  const matches = window.matchMedia(visible).matches;

  useEffect(() => {
    document.body.classList.add('layout-editor-active');
    return () => document.body.classList.remove('layout-editor-active');
  }, []);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(draft));
    let style = document.getElementById('layout-editor-preview');
    if (!style) {
      style = document.createElement('style');
      style.id = 'layout-editor-preview';
      document.head.append(style);
    }
    style.textContent = cssFor(draft, true);
    return () => { style.remove(); };
  }, [draft]);

  useEffect(() => {
    const update = () => setBreakpoint(currentBreakpoint());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    let frame;
    const measure = () => {
      const rect = unionRect(selectedItems.map(label => elementRect(TARGETS.find(target => target.label === label)?.selector)).filter(Boolean));
      setBounds(old => rect
        ? (old && Math.abs(old.x - rect.x) < 0.5 && Math.abs(old.y - rect.y) < 0.5 && Math.abs(old.width - rect.width) < 0.5 && Math.abs(old.height - rect.height) < 0.5
          ? old : rect)
        : old === null ? old : null);
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [selectedItems]);

  const updateValue = patch => setDraft(old => ({ ...old,
    [breakpoint]: { ...old[breakpoint], [selected]: { ...blank, ...old[breakpoint]?.[selected], ...patch } },
  }));
  const moveGroup = (axis, delta, starts = null) => setDraft(old => {
    const next = { ...old[breakpoint] };
    for (const label of activeItems) {
      const before = { ...blank, ...old[breakpoint]?.[label] };
      const base = starts?.[label] ?? before[axis];
      next[label] = { ...before, [axis]: Math.round(base + delta) };
    }
    return { ...old, [breakpoint]: next };
  });

  const toggleSelected = label => {
    if (!selectedItems.includes(label) && !elementRect(TARGETS.find(target => target.label === label)?.selector)) return;
    setSelectedItems(items => items.includes(label)
      ? items.length > 1 ? items.filter(item => item !== label) : items
      : [...items, label]);
    setReference('Window');
    setGuides({ x: null, y: null });
  };

  const pointerDown = (event, mode) => {
    if (!bounds || !matches) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { mode, x: event.clientX, y: event.clientY, value: { ...value }, bounds,
      starts: Object.fromEntries(activeItems.map(label => [label, { x: draft[breakpoint]?.[label]?.x || 0, y: draft[breakpoint]?.[label]?.y || 0 }])) };
  };
  const pointerMove = event => {
    if (!drag.current) return;
    const { mode, x, y, value: start, bounds: startBounds, starts } = drag.current;
    const dx = event.clientX - x, dy = event.clientY - y;
    if (mode === 'move') {
      const horizontal = snapToAlignment({ left: startBounds.x, right: startBounds.x + startBounds.width, width: startBounds.width }, dx, 'x', activeItems);
      const vertical = snapToAlignment({ top: startBounds.y, bottom: startBounds.y + startBounds.height, height: startBounds.height }, dy, 'y', activeItems);
      setGuides({ x: horizontal.guide, y: vertical.guide });
      if (grouped) {
        moveGroup('x', horizontal.delta, Object.fromEntries(Object.entries(starts).map(([label, point]) => [label, point.x])));
        moveGroup('y', vertical.delta, Object.fromEntries(Object.entries(starts).map(([label, point]) => [label, point.y])));
      } else updateValue({ x: Math.round(start.x + horizontal.delta), y: Math.round(start.y + vertical.delta) });
    } else {
      const horizontal = snapToAlignment({ left: startBounds.x, right: startBounds.x + startBounds.width, width: startBounds.width }, dx, 'x', selected, true);
      const vertical = snapToAlignment({ top: startBounds.y, bottom: startBounds.y + startBounds.height, height: startBounds.height }, dy, 'y', selected, true);
      setGuides({ x: horizontal.guide, y: vertical.guide });
      updateValue({ width: Math.max(32, Math.round((start.width ?? startBounds.width) + horizontal.delta)), height: Math.max(32, Math.round((start.height ?? startBounds.height) + vertical.delta)) });
    }
  };

  const align = (axis, edge) => {
    if (!bounds) return;
    const target = grouped || reference === 'Window' ? viewportRect() : elementRect(TARGETS.find(item => item.label === reference)?.selector);
    if (!target) { setNotice('Open the reference element first.'); return; }
    const current = axisPoints({ left: bounds.x, top: bounds.y, right: bounds.x + bounds.width, bottom: bounds.y + bounds.height, width: bounds.width, height: bounds.height }, axis);
    const destination = axisPoints(target, axis);
    const index = edge === 'start' ? 0 : edge === 'center' ? 1 : 2;
    const delta = destination[index].pos - current[index].pos;
    if (grouped) moveGroup(axis, delta);
    else updateValue({ [axis]: Math.round((value[axis] || 0) + delta) });
    const guideLabel = `${grouped ? `${activeItems.length} elements` : selected} aligned to ${grouped ? 'Window' : reference}`;
    setGuides({ x: axis === 'x' ? { pos: destination[index].pos, label: guideLabel } : null,
      y: axis === 'y' ? { pos: destination[index].pos, label: guideLabel } : null });
  };
  const matchSize = axis => {
    const target = reference === 'Window' ? viewportRect() : elementRect(TARGETS.find(item => item.label === reference)?.selector);
    if (!target) { setNotice('Open the reference element first.'); return; }
    updateValue({ [axis]: Math.round(target[axis]) });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cssFor(draft));
      setNotice('CSS copied. Paste it here and I can integrate it cleanly.');
    } catch { setNotice('Clipboard unavailable; use Export CSS below.'); }
  };
  const exportCss = () => {
    const blob = new Blob([cssFor(draft)], { type: 'text/css' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'portfolio-layout-draft.css';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  const reset = () => {
    setDraft({});
    setNotice('Draft reset.');
  };

  return <>
    {showGrid && <div className="layout-editor-grid" aria-hidden="true" />}
    {guides.x && <div className="layout-editor-guide layout-editor-guide--vertical" style={{ left: guides.x.pos }} aria-hidden="true"><span>{guides.x.label}</span></div>}
    {guides.y && <div className="layout-editor-guide layout-editor-guide--horizontal" style={{ top: guides.y.pos }} aria-hidden="true"><span>{guides.y.label}</span></div>}
    {bounds && matches && <div className="layout-editor-selection" style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}>
      <div className="layout-editor-selection__label">{grouped ? `${activeItems.length} elements` : selected} · {Math.round(bounds.width)} × {Math.round(bounds.height)}</div>
      <div className="layout-editor-selection__drag" onPointerDown={event => pointerDown(event, 'move')} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; setGuides({ x: null, y: null }); }} aria-label={`Drag ${selected}`} />
      {!grouped && <div className="layout-editor-selection__resize" onPointerDown={event => pointerDown(event, 'resize')} onPointerMove={event => { event.stopPropagation(); pointerMove(event); }} onPointerUp={event => { event.stopPropagation(); drag.current = null; setGuides({ x: null, y: null }); }} aria-label={`Resize ${selected}`} />}
    </div>}
    <aside className="layout-editor-panel" aria-label="Layout editor">
      <header><strong>Layout mode</strong><span>Local only · 8px snap</span></header>
      <fieldset className="layout-editor-panel__selection"><legend>Select elements</legend>{TARGETS.map(target => <label key={target.label}><input type="checkbox" checked={selectedItems.includes(target.label)} disabled={!selectedItems.includes(target.label) && !elementRect(target.selector)} onChange={() => toggleSelected(target.label)} /> {target.label}</label>)}</fieldset>
      <div className="layout-editor-panel__viewport">{breakpoint} · {window.innerWidth} × {window.innerHeight}{!matches && ' · resize window to edit'}</div>
      {bounds ? <p>{grouped ? 'Drag the group to move it; alignment preserves the spacing inside it.' : 'Drag to move. Drag the lower-right handle to resize.'}</p> : <p>Open the page containing the selected elements to edit them.</p>}
      {!grouped && <div className="layout-editor-panel__fields">{['x', 'y', 'width', 'height'].map(key => <label key={key}>{key}<input type="number" step={GRID} value={value[key] ?? ''} placeholder="auto" onChange={event => updateValue({ [key]: event.target.value === '' ? null : snap(Number(event.target.value)) })} /></label>)}</div>}
      {grouped ? <div className="layout-editor-panel__viewport">Align group to Window</div> : <label className="layout-editor-panel__reference">Align to<select value={reference} onChange={event => setReference(event.target.value)}><option>Window</option>{TARGETS.filter(target => target.label !== selected).map(target => <option key={target.label}>{target.label}</option>)}</select></label>}
      <div className="layout-editor-panel__align" aria-label="Horizontal alignment"><button onClick={() => align('x', 'start')}>Left</button><button onClick={() => align('x', 'center')}>Center X</button><button onClick={() => align('x', 'end')}>Right</button></div>
      <div className="layout-editor-panel__align" aria-label="Vertical alignment"><button onClick={() => align('y', 'start')}>Top</button><button onClick={() => align('y', 'center')}>Center Y</button><button onClick={() => align('y', 'end')}>Bottom</button></div>
      {!grouped && <div className="layout-editor-panel__align" aria-label="Match dimensions"><button onClick={() => matchSize('width')}>Match width</button><button onClick={() => matchSize('height')}>Match height</button></div>}
      {bounds && <div className="layout-editor-panel__measure">Window gaps: L {Math.round(bounds.x)} · R {Math.round(window.innerWidth - bounds.x - bounds.width)} / T {Math.round(bounds.y)} · B {Math.round(window.innerHeight - bounds.y - bounds.height)}<br />{Math.abs(2 * bounds.x + bounds.width - window.innerWidth) <= 2 ? 'Horizontally centered' : 'Horizontal margins differ'} · {Math.abs(2 * bounds.y + bounds.height - window.innerHeight) <= 2 ? 'Vertically centered' : 'Vertical margins differ'}</div>}
      <label className="layout-editor-panel__check"><input type="checkbox" checked={showGrid} onChange={event => setShowGrid(event.target.checked)} /> Show grid</label>
      <div className="layout-editor-panel__actions"><button onClick={copy}>Copy CSS</button><button onClick={exportCss}>Export CSS</button><button onClick={reset}>Reset</button></div>
      {notice && <output>{notice}</output>}
      <small>Changes stay in this browser until reset. Exported CSS is a draft, not a production edit.</small>
    </aside>
  </>;
}
