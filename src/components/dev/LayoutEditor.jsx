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
  const [selected, setSelected] = useState('Seena bust');
  const [breakpoint, setBreakpoint] = useState(currentBreakpoint);
  const [bounds, setBounds] = useState(null);
  const [showGrid, setShowGrid] = useState(true);
  const [notice, setNotice] = useState('');
  const drag = useRef(null);
  const selectedTarget = TARGETS.find(target => target.label === selected);
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
      const target = document.querySelector(selectedTarget.selector);
      const rect = target?.getBoundingClientRect();
      setBounds(old => rect && rect.width && rect.height
        ? (old && Math.abs(old.x - rect.x) < 0.5 && Math.abs(old.y - rect.y) < 0.5 && Math.abs(old.width - rect.width) < 0.5 && Math.abs(old.height - rect.height) < 0.5
          ? old : { x: rect.x, y: rect.y, width: rect.width, height: rect.height })
        : old === null ? old : null);
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [selectedTarget]);

  const updateValue = patch => setDraft(old => ({ ...old,
    [breakpoint]: { ...old[breakpoint], [selected]: { ...blank, ...old[breakpoint]?.[selected], ...patch } },
  }));

  const pointerDown = (event, mode) => {
    if (!bounds || !matches) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { mode, x: event.clientX, y: event.clientY, value: { ...value }, bounds };
  };
  const pointerMove = event => {
    if (!drag.current) return;
    const { mode, x, y, value: start, bounds: startBounds } = drag.current;
    const dx = event.clientX - x, dy = event.clientY - y;
    updateValue(mode === 'move'
      ? { x: snap(start.x + dx), y: snap(start.y + dy) }
      : { width: Math.max(32, snap((start.width ?? startBounds.width) + dx)), height: Math.max(32, snap((start.height ?? startBounds.height) + dy)) });
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
    {bounds && matches && <div className="layout-editor-selection" style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}>
      <div className="layout-editor-selection__label">{selected} · {Math.round(bounds.width)} × {Math.round(bounds.height)}</div>
      <div className="layout-editor-selection__drag" onPointerDown={event => pointerDown(event, 'move')} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} aria-label={`Drag ${selected}`} />
      <div className="layout-editor-selection__resize" onPointerDown={event => pointerDown(event, 'resize')} onPointerMove={event => { event.stopPropagation(); pointerMove(event); }} onPointerUp={event => { event.stopPropagation(); drag.current = null; }} aria-label={`Resize ${selected}`} />
    </div>}
    <aside className="layout-editor-panel" aria-label="Layout editor">
      <header><strong>Layout mode</strong><span>Local only · 8px snap</span></header>
      <label>Element<select value={selected} onChange={event => setSelected(event.target.value)}>{TARGETS.map(target => <option key={target.label}>{target.label}</option>)}</select></label>
      <div className="layout-editor-panel__viewport">{breakpoint} · {window.innerWidth} × {window.innerHeight}{!matches && ' · resize window to edit'}</div>
      {bounds ? <p>Drag the blue area to move. Drag its lower-right handle to resize.</p> : <p>Open the menu or page containing this element to edit it.</p>}
      <div className="layout-editor-panel__fields">{['x', 'y', 'width', 'height'].map(key => <label key={key}>{key}<input type="number" step={GRID} value={value[key] ?? ''} placeholder="auto" onChange={event => updateValue({ [key]: event.target.value === '' ? null : snap(Number(event.target.value)) })} /></label>)}</div>
      <label className="layout-editor-panel__check"><input type="checkbox" checked={showGrid} onChange={event => setShowGrid(event.target.checked)} /> Show grid</label>
      <div className="layout-editor-panel__actions"><button onClick={copy}>Copy CSS</button><button onClick={exportCss}>Export CSS</button><button onClick={reset}>Reset</button></div>
      {notice && <output>{notice}</output>}
      <small>Changes stay in this browser until reset. Exported CSS is a draft, not a production edit.</small>
    </aside>
  </>;
}
