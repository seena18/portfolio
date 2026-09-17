import { useState } from 'react';
import './LabPanel.css';

const PRESETS = [
  {
    name: 'Original',
    params: { numMetaballs: 1, isolation: 300, strength: 4.2, internalWarpStrength: 0.1, asymmetryFactor: 20, jiggleIntensity: 0, maxDistance: 0.35, speed: 1.02 }
  },
  {
    name: 'Fluid',
    params: { numMetaballs: 2, isolation: 285, strength: 4.4, internalWarpStrength: 0.5, asymmetryFactor: 12, jiggleIntensity: 0.3, maxDistance: 0.45, speed: 1.12 }
  },
  {
    name: 'Restless',
    params: { numMetaballs: 3, isolation: 260, strength: 4.5, internalWarpStrength: 0.9, asymmetryFactor: 8, jiggleIntensity: 0.8, maxDistance: 0.6, speed: 1.45 }
  }
];

const CONTROLS = [
  { group: 'Form', items: [
    { key: 'numMetaballs', label: 'Bodies', min: 1, max: 15, step: 1 },
    { key: 'isolation', label: 'Threshold', min: 10, max: 300, step: 5 },
    { key: 'strength', label: 'Density', min: 0.1, max: 10, step: 0.1 },
    { key: 'maxDistance', label: 'Reach', min: 0.1, max: 2, step: 0.05 }
  ] },
  { group: 'Motion', items: [
    { key: 'speed', label: 'Speed', min: 0.01, max: 2, step: 0.01 },
    { key: 'internalWarpStrength', label: 'Warp', min: 0.1, max: 10, step: 0.1 },
    { key: 'asymmetryFactor', label: 'Asymmetry', min: 0.1, max: 20, step: 0.1 },
    { key: 'jiggleIntensity', label: 'Jiggle', min: 0, max: 5, step: 0.1 }
  ] }
];

export default function LabPanel({ params, onChange, onPreset, onBack }) {
  const [open, setOpen] = useState(false);
  const activePreset = PRESETS.find(({ params: values }) =>
    Object.keys(values).every(key => params[key] === values[key]))?.name;

  return (
    <div className="lab-ui">
      <header className="lab-ui__masthead">
        <button type="button" className="lab-ui__back" onClick={onBack}>← Menu</button>
        <span className="lab-ui__index">SEENA / LAB</span>
      </header>

      <aside className={`lab-ui__dock${open ? ' lab-ui__dock--open' : ''}`} aria-label="Lava lamp controls">
        <button type="button" className="lab-ui__mobile-toggle" aria-controls="lab-ui-controls" aria-expanded={open} onClick={() => setOpen(value => !value)}>
          <span>LAB <span className="lab-ui__mobile-hint">/ Tune the blob</span></span>
          <span aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
        <div className="lab-ui__contents" id="lab-ui-controls">
          <div className="lab-ui__intro">
            <span className="lab-ui__eyebrow">A LIVE EXPERIMENT</span>
            <h1>Make it move.</h1>
            <p>Drag through the blob to slice it. Change the material as it reforms.</p>
          </div>

          <div className="lab-ui__presets" role="group" aria-label="Blob presets">
            {PRESETS.map(preset => (
              <button
                key={preset.name}
                type="button"
                className={activePreset === preset.name ? 'is-active' : ''}
                aria-pressed={activePreset === preset.name}
                onClick={() => onPreset({ ...preset.params })}
              >{preset.name}</button>
            ))}
          </div>

          {CONTROLS.map(group => (
            <section className="lab-ui__group" key={group.group} aria-label={`${group.group} controls`}>
              <h2>{group.group}</h2>
              {group.items.map(control => (
                <div className="lab-ui__control" key={control.key}>
                  <div className="lab-ui__control-heading">
                    <label htmlFor={`lab-${control.key}`}>{control.label}</label>
                    <output htmlFor={`lab-${control.key}`}>{params[control.key]}</output>
                  </div>
                  <input
                    id={`lab-${control.key}`}
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={params[control.key]}
                    onChange={event => onChange(control.key, Number(event.target.value))}
                    style={{ '--value': `${(params[control.key] - control.min) / (control.max - control.min) * 100}%` }}
                  />
                </div>
              ))}
            </section>
          ))}

          <div className="lab-ui__footer">
            <span>Changes saved locally</span>
            <button type="button" onClick={() => onPreset({ ...PRESETS[0].params })}>Reset ↗</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
