import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import Navigation from './components/Navigation';
import Home from './pages/Home';
import About from './pages/About';
import Projects from './pages/Projects';
import Contact from './pages/Contact';
import LavaLampScene from './components/lavalamp/Scene';
import './styles/global.css';

// Define 30 predefined themes with complementary colors
const colorThemes = [
  // Sunset themes
  { name: "Sunset Glow", base: { r: 0.95, g: 0.5, b: 0.2 }, highlight: { r: 1.0, g: 0.8, b: 0.3 }, background: { r: 0.1, g: 0.05, b: 0.2 } },
  { name: "Dusk", base: { r: 0.7, g: 0.3, b: 0.5 }, highlight: { r: 0.9, g: 0.6, b: 0.3 }, background: { r: 0.15, g: 0.1, b: 0.25 } },
  { name: "Golden Hour", base: { r: 0.9, g: 0.6, b: 0.1 }, highlight: { r: 1.0, g: 0.8, b: 0.4 }, background: { r: 0.2, g: 0.1, b: 0.15 } },
  
  // Ocean themes
  { name: "Deep Sea", base: { r: 0.1, g: 0.5, b: 0.8 }, highlight: { r: 0.4, g: 0.8, b: 0.9 }, background: { r: 0.05, g: 0.1, b: 0.2 } },
  { name: "Tropical Waters", base: { r: 0.2, g: 0.6, b: 0.8 }, highlight: { r: 0.3, g: 0.9, b: 0.7 }, background: { r: 0.05, g: 0.15, b: 0.3 } },
  { name: "Aquamarine", base: { r: 0.2, g: 0.8, b: 0.7 }, highlight: { r: 0.4, g: 1.0, b: 0.8 }, background: { r: 0.1, g: 0.2, b: 0.3 } },
  
  // Forest themes
  { name: "Pine Forest", base: { r: 0.2, g: 0.5, b: 0.3 }, highlight: { r: 0.5, g: 0.8, b: 0.2 }, background: { r: 0.1, g: 0.2, b: 0.15 } },
  { name: "Moss Garden", base: { r: 0.3, g: 0.6, b: 0.2 }, highlight: { r: 0.7, g: 0.8, b: 0.3 }, background: { r: 0.1, g: 0.15, b: 0.1 } },
  { name: "Rainforest", base: { r: 0.15, g: 0.4, b: 0.2 }, highlight: { r: 0.4, g: 0.7, b: 0.3 }, background: { r: 0.05, g: 0.1, b: 0.05 } },
  
  // Neon themes
  { name: "Cyberpunk", base: { r: 0.9, g: 0.1, b: 0.9 }, highlight: { r: 0.2, g: 0.9, b: 1.0 }, background: { r: 0.05, g: 0.0, b: 0.1 } },
  { name: "Neon Lights", base: { r: 0.2, g: 0.9, b: 0.6 }, highlight: { r: 1.0, g: 0.2, b: 0.8 }, background: { r: 0.05, g: 0.05, b: 0.1 } },
  { name: "Electric Blue", base: { r: 0.1, g: 0.3, b: 0.9 }, highlight: { r: 0.4, g: 0.8, b: 1.0 }, background: { r: 0.0, g: 0.05, b: 0.15 } },
  
  // Pastel themes
  { name: "Cotton Candy", base: { r: 0.9, g: 0.7, b: 0.8 }, highlight: { r: 0.7, g: 0.8, b: 0.9 }, background: { r: 0.2, g: 0.2, b: 0.3 } },
  { name: "Soft Mint", base: { r: 0.7, g: 0.9, b: 0.8 }, highlight: { r: 0.9, g: 0.8, b: 0.7 }, background: { r: 0.2, g: 0.25, b: 0.2 } },
  { name: "Lavender Mist", base: { r: 0.8, g: 0.7, b: 0.9 }, highlight: { r: 0.9, g: 0.8, b: 1.0 }, background: { r: 0.2, g: 0.15, b: 0.25 } },
  
  // Earth tones
  { name: "Desert Sand", base: { r: 0.9, g: 0.7, b: 0.5 }, highlight: { r: 0.7, g: 0.5, b: 0.3 }, background: { r: 0.2, g: 0.15, b: 0.1 } },
  { name: "Clay Pot", base: { r: 0.7, g: 0.4, b: 0.3 }, highlight: { r: 0.9, g: 0.6, b: 0.4 }, background: { r: 0.2, g: 0.1, b: 0.05 } },
  { name: "Coffee", base: { r: 0.5, g: 0.3, b: 0.2 }, highlight: { r: 0.7, g: 0.5, b: 0.3 }, background: { r: 0.15, g: 0.1, b: 0.05 } },
  
  // Monochrome
  { name: "Silver", base: { r: 0.8, g: 0.8, b: 0.8 }, highlight: { r: 1.0, g: 1.0, b: 1.0 }, background: { r: 0.2, g: 0.2, b: 0.2 } },
  { name: "Charcoal", base: { r: 0.3, g: 0.3, b: 0.3 }, highlight: { r: 0.6, g: 0.6, b: 0.6 }, background: { r: 0.1, g: 0.1, b: 0.1 } },
  { name: "Cream", base: { r: 0.95, g: 0.92, b: 0.85 }, highlight: { r: 1.0, g: 1.0, b: 0.95 }, background: { r: 0.3, g: 0.28, b: 0.25 } },
  
  // Vibrant themes
  { name: "Carnival", base: { r: 1.0, g: 0.2, b: 0.4 }, highlight: { r: 0.3, g: 0.9, b: 0.2 }, background: { r: 0.2, g: 0.0, b: 0.5 } },
  { name: "Summer Pop", base: { r: 1.0, g: 0.5, b: 0.0 }, highlight: { r: 0.0, g: 0.8, b: 1.0 }, background: { r: 0.0, g: 0.3, b: 0.6 } },
  { name: "Fruit Punch", base: { r: 0.9, g: 0.2, b: 0.3 }, highlight: { r: 1.0, g: 0.8, b: 0.2 }, background: { r: 0.2, g: 0.05, b: 0.1 } },
  
  // Cool themes
  { name: "Moonlight", base: { r: 0.5, g: 0.5, b: 0.7 }, highlight: { r: 0.8, g: 0.8, b: 1.0 }, background: { r: 0.1, g: 0.1, b: 0.2 } },
  { name: "Glacier", base: { r: 0.6, g: 0.8, b: 0.9 }, highlight: { r: 0.8, g: 0.9, b: 1.0 }, background: { r: 0.1, g: 0.15, b: 0.2 } },
  { name: "Midnight", base: { r: 0.2, g: 0.2, b: 0.4 }, highlight: { r: 0.4, g: 0.4, b: 0.8 }, background: { r: 0.05, g: 0.05, b: 0.1 } },
  
  // Warm themes
  { name: "Candlelight", base: { r: 0.9, g: 0.7, b: 0.3 }, highlight: { r: 1.0, g: 0.9, b: 0.5 }, background: { r: 0.2, g: 0.15, b: 0.05 } },
  { name: "Amber Glow", base: { r: 0.8, g: 0.5, b: 0.2 }, highlight: { r: 1.0, g: 0.7, b: 0.3 }, background: { r: 0.2, g: 0.1, b: 0.0 } },
  { name: "Crimson", base: { r: 0.8, g: 0.2, b: 0.2 }, highlight: { r: 1.0, g: 0.4, b: 0.3 }, background: { r: 0.15, g: 0.05, b: 0.05 } }
];

// Color picker portal component
const ColorPickerPortal = ({
  show,
  onClose,
  baseColor,
  highlightColor,
  backgroundColor,
  setBaseColor,
  setHighlightColor,
  setBackgroundColor
}) => {
  if (!show) return null;

  return ReactDOM.createPortal(
    <ColorPickerContent
      onClose={onClose}
      baseColor={baseColor}
      highlightColor={highlightColor}
      backgroundColor={backgroundColor}
      setBaseColor={setBaseColor}
      setHighlightColor={setHighlightColor}
      setBackgroundColor={setBackgroundColor}
    />,
    document.body
  );
};

// The actual color picker content
const ColorPickerContent = ({
  onClose,
  baseColor,
  highlightColor,
  backgroundColor,
  setBaseColor,
  setHighlightColor,
  setBackgroundColor
}) => {
  // Add a state for showing manual controls
  const [showManualControls, setShowManualControls] = useState(false);
  const [activeColor, setActiveColor] = useState('base');

  const contentRef = useRef(null);
  const hueCanvasRef = useRef(null);
  const satValCanvasRef = useRef(null);

  // Apply a theme
  const applyTheme = (theme) => {
    setBaseColor(theme.base);
    setHighlightColor(theme.highlight);
    setBackgroundColor(theme.background);
  };

  // Color conversion utilities
  const rgbToHsv = (r, g, b) => {
    r /= 1; g /= 1; b /= 1;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, v = max;

    const d = max - min;
    s = max === 0 ? 0 : d / max;

    if (max === min) {
      h = 0;
    } else {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return { h, s, v };
  };

  const hsvToRgb = (h, s, v) => {
    let r, g, b;

    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }

    return { r, g, b };
  };

  // Get current color based on active selection
  const getCurrentColor = () => {
    switch (activeColor) {
      case 'base': return baseColor;
      case 'highlight': return highlightColor;
      case 'background': return backgroundColor;
      default: return baseColor;
    }
  };

  // Set current color based on active selection
  const setCurrentColor = (color) => {
    switch (activeColor) {
      case 'base': setBaseColor(color); break;
      case 'highlight': setHighlightColor(color); break;
      case 'background': setBackgroundColor(color); break;
    }
  };

  // Draw canvases
  const drawHueCanvas = () => {
    const canvas = hueCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Draw hue gradient
    for (let x = 0; x < width; x++) {
      const hue = x / width;
      const rgb = hsvToRgb(hue, 1, 1);
      ctx.fillStyle = `rgb(${rgb.r * 255}, ${rgb.g * 255}, ${rgb.b * 255})`;
      ctx.fillRect(x, 0, 1, height);
    }

    // Draw current hue marker
    const currentColor = getCurrentColor();
    const hsv = rgbToHsv(currentColor.r, currentColor.g, currentColor.b);
    const markerPos = hsv.h * width;

    ctx.beginPath();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.moveTo(markerPos, 0);
    ctx.lineTo(markerPos, height);
    ctx.stroke();
  };

  const drawSatValCanvas = () => {
    const canvas = satValCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Get current hue
    const currentColor = getCurrentColor();
    const hsv = rgbToHsv(currentColor.r, currentColor.g, currentColor.b);

    // Draw saturation-value grid
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const s = x / width;
        const v = 1 - y / height;
        const rgb = hsvToRgb(hsv.h, s, v);
        ctx.fillStyle = `rgb(${rgb.r * 255}, ${rgb.g * 255}, ${rgb.b * 255})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Draw current sat/val marker
    const markerX = hsv.s * width;
    const markerY = (1 - hsv.v) * height;

    ctx.beginPath();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.arc(markerX, markerY, 5, 0, Math.PI * 2);
    ctx.stroke();
  };

  // Update both canvases
  const updateCanvases = () => {
    drawHueCanvas();
    drawSatValCanvas();
  };

  // Initialize and update canvases when needed
  useEffect(() => {
    if (showManualControls) {
      updateCanvases();
    }
  }, [activeColor, baseColor, highlightColor, backgroundColor, showManualControls]);

  // Update hue color
  const updateHueColor = (x) => {
    const canvas = hueCanvasRef.current;
    const width = canvas.width;

    // Constrain to canvas bounds
    x = Math.max(0, Math.min(x, width));

    // Calculate new hue
    const hue = x / width;

    // Get current color and convert to HSV
    const currentColor = getCurrentColor();
    const hsv = rgbToHsv(currentColor.r, currentColor.g, currentColor.b);

    // Update color with new hue
    setCurrentColor(hsvToRgb(hue, hsv.s, hsv.v));

    // Update canvases
    updateCanvases();
  };

  // Update saturation and value
  const updateSatValColor = (x, y) => {
    const canvas = satValCanvasRef.current;
    const width = canvas.width;
    const height = canvas.height;

    // Constrain to canvas bounds
    x = Math.max(0, Math.min(x, width));
    y = Math.max(0, Math.min(y, height));

    // Calculate saturation and value
    const s = x / width;
    const v = 1 - (y / height);

    // Get current color and extract hue
    const currentColor = getCurrentColor();
    const hsv = rgbToHsv(currentColor.r, currentColor.g, currentColor.b);

    // Update color with new saturation and value
    setCurrentColor(hsvToRgb(hsv.h, s, v));

    // Update canvases
    updateCanvases();
  };

  // Convert RGB to hex for display
  const rgbToHex = ({ r, g, b }) => {
    r = Math.round(r * 255);
    g = Math.round(g * 255);
    b = Math.round(b * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  return (
    <div
      ref={contentRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        width: '340px',
        maxHeight: '80vh',
        overflowY: 'auto',
        backgroundColor: '#2d2d2d',
        color: 'white',
        padding: '15px',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
        fontFamily: 'Arial, sans-serif',
        userSelect: 'none',
        pointerEvents: 'auto'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 style={{ margin: 0 }}>Color Themes</h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            fontSize: '18px',
            cursor: 'pointer'
          }}
        >×</button>
      </div>

      {/* Current Theme Preview */}
      <div style={{
        display: 'flex',
        marginBottom: '15px',
        padding: '10px',
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: '4px'
      }}>
        <div style={{
          width: '100%',
          display: 'flex',
          gap: '10px',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            backgroundColor: `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`,
            border: '2px solid rgba(255,255,255,0.2)'
          }} title="Base Color" />
          <div style={{
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            backgroundColor: `rgb(${highlightColor.r * 255}, ${highlightColor.g * 255}, ${highlightColor.b * 255})`,
            border: '2px solid rgba(255,255,255,0.2)'
          }} title="Highlight Color" />
          <div style={{
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            backgroundColor: `rgb(${backgroundColor.r * 255}, ${backgroundColor.g * 255}, ${backgroundColor.b * 255})`,
            border: '2px solid rgba(255,255,255,0.2)'
          }} title="Background Color" />
        </div>
      </div>

      {/* Theme Grid */}
      <div style={{ marginBottom: '15px' }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#aaa' }}>Select a Theme</h4>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px'
        }}>
          {colorThemes.map((theme, index) => (
            <div
              key={index}
              onClick={() => applyTheme(theme)}
              style={{
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '4px',
                backgroundColor: 'rgba(0,0,0,0.2)',
                transition: 'transform 0.2s'
              }}
              title={theme.name}
            >
              <div style={{
                height: '40px',
                borderRadius: '4px',
                background: `linear-gradient(to right, 
                  rgb(${theme.base.r * 255}, ${theme.base.g * 255}, ${theme.base.b * 255}) 0%, 
                  rgb(${theme.highlight.r * 255}, ${theme.highlight.g * 255}, ${theme.highlight.b * 255}) 50%,
                  rgb(${theme.background.r * 255}, ${theme.background.g * 255}, ${theme.background.b * 255}) 100%)`
              }} />
              <div style={{
                fontSize: '10px',
                textAlign: 'center',
                marginTop: '5px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {theme.name}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Toggle for Manual Controls */}
      <button
        onClick={() => setShowManualControls(!showManualControls)}
        style={{
          width: '100%',
          padding: '8px',
          backgroundColor: '#444',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          marginBottom: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px'
        }}
      >
        {showManualControls ? 'Hide Manual Controls' : 'Show Manual Controls'}
        <span style={{ fontSize: '10px' }}>{showManualControls ? '▲' : '▼'}</span>
      </button>

      {/* Manual Color Controls (hidden by default) */}
      {showManualControls && (
        <div style={{
          backgroundColor: 'rgba(0,0,0,0.2)',
          padding: '10px',
          borderRadius: '4px',
          marginTop: '10px'
        }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#aaa' }}>Manual Color Adjustments</h4>

          {/* Color type selector */}
          <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
            <button
              onClick={() => setActiveColor('base')}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                borderRadius: '4px',
                background: activeColor === 'base' ? '#555' : '#333',
                color: 'white',
                cursor: 'pointer'
              }}
            >Base</button>
            <button
              onClick={() => setActiveColor('highlight')}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                borderRadius: '4px',
                background: activeColor === 'highlight' ? '#555' : '#333',
                color: 'white',
                cursor: 'pointer'
              }}
            >Highlight</button>
            <button
              onClick={() => setActiveColor('background')}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                borderRadius: '4px',
                background: activeColor === 'background' ? '#555' : '#333',
                color: 'white',
                cursor: 'pointer'
              }}
            >Background</button>
          </div>

          {/* Current hex value and color preview */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '15px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '4px',
              backgroundColor: `rgb(${getCurrentColor().r * 255}, ${getCurrentColor().g * 255}, ${getCurrentColor().b * 255})`,
              border: '2px solid #444'
            }} />
            <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>
              {rgbToHex(getCurrentColor()).toUpperCase()}
            </div>
          </div>

          {/* Saturation/Value picker */}
          <div style={{ marginBottom: '15px', position: 'relative', touchAction: 'none' }}>
            <canvas
              ref={satValCanvasRef}
              width={260}
              height={200}
              style={{
                display: 'block',
                width: '100%',
                height: '200px',
                borderRadius: '4px',
                cursor: 'crosshair'
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                cursor: 'crosshair',
                zIndex: 100
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();

                const rect = satValCanvasRef.current.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                // Update color immediately on click
                updateSatValColor(x, y);

                // Set up dragging
                const handleMouseMove = (moveEvent) => {
                  moveEvent.preventDefault();
                  const newX = moveEvent.clientX - rect.left;
                  const newY = moveEvent.clientY - rect.top;
                  updateSatValColor(newX, newY);
                };

                const handleMouseUp = () => {
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              }}
            />
          </div>

          {/* Hue slider */}
          <div style={{ position: 'relative', touchAction: 'none' }}>
            <canvas
              ref={hueCanvasRef}
              width={260}
              height={30}
              style={{
                display: 'block',
                width: '100%',
                height: '30px',
                borderRadius: '4px',
                cursor: 'ew-resize'
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                cursor: 'ew-resize',
                zIndex: 100
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();

                const rect = hueCanvasRef.current.getBoundingClientRect();
                const x = e.clientX - rect.left;

                // Update color immediately on click
                updateHueColor(x);

                // Set up dragging
                const handleMouseMove = (moveEvent) => {
                  moveEvent.preventDefault();
                  const newX = moveEvent.clientX - rect.left;
                  updateHueColor(newX);
                };

                const handleMouseUp = () => {
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const App = () => {
  // Colors state
  const [baseColor, setBaseColor] = useState({ r: 0.1, g: 0.1, b: 0.1 });
  const [highlightColor, setHighlightColor] = useState({ r: 0.8, g: 0.8, b: 0.8 });
  const [backgroundColor, setBackgroundColor] = useState({ r: 0.1, g: 0.1, b: 0.2 });
  const [showColorMenu, setShowColorMenu] = useState(false);
  
  // Toggle button for color picker
  const ColorToggleButton = () => {
    return ReactDOM.createPortal(
      <button
        id="color-toggle-button"
        onClick={(e) => {
          e.stopPropagation();
          setShowColorMenu(!showColorMenu);
        }}
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          padding: '8px 12px',
          backgroundColor: 'rgba(40, 40, 40, 0.8)',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          zIndex: 10000,
          pointerEvents: 'auto'
        }}
      >
        {showColorMenu ? 'Hide Colors' : 'Edit Colors'}
      </button>,
      document.body
    );
  };

  return (
    <div className="app-container">
      {/* Color Toggle Button */}
      <ColorToggleButton />
      
      {/* Color Picker */}
      <ColorPickerPortal
        show={showColorMenu}
        onClose={() => setShowColorMenu(false)}
        baseColor={baseColor}
        highlightColor={highlightColor}
        backgroundColor={backgroundColor}
        setBaseColor={setBaseColor}
        setHighlightColor={setHighlightColor}
        setBackgroundColor={setBackgroundColor}
      />

      {/* Lava Lamp Scene */}
      <LavaLampScene
        baseColor={baseColor}
        highlightColor={highlightColor}
        backgroundColor={backgroundColor}
        setBaseColor={setBaseColor}
        setHighlightColor={setHighlightColor}
        setBackgroundColor={setBackgroundColor}
      />

      {/* <div className="content-overlay">
        <Header />
        <Navigation />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/contact" element={<Contact />} />
        </Routes>
        <Footer />
      </div> */}
    </div>
  );
};

export default App;