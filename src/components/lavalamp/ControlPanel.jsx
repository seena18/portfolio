import { useState } from 'react';

  // Slider Control Panel Component
const ControlPanel = ({ params, responsiveScale, onParamChange, embedded = false }) => {
    const [isVisible, setIsVisible] = useState(true);

    const resetToDefaults = () => {
      const defaults = {
        numMetaballs: 1,
        isolation: 300,
        strength: 4.2,
        internalWarpStrength: 0.1,
        asymmetryFactor: 20,
        jiggleIntensity: 0,
        maxDistance: 0.35,
        speed: 1.02
      };

      // Update all parameters at once
      Object.keys(defaults).forEach(key => {
        onParamChange(key, defaults[key]);
      });
    };

    const isMobile = window.innerWidth < 768;
    const isTablet = window.innerWidth < 1200;

    const sliderStyle = {
      margin: isMobile ? '6px 0' : '8px 0',
      display: 'flex',
      alignItems: 'center',
      gap: isMobile ? '6px' : '8px',
      justifyContent: 'space-between'
    };

    const labelStyle = {
      minWidth: isMobile ? '90px' : (isTablet ? '110px' : '130px'),
      fontSize: embedded ? '12px' : (isMobile ? '10px' : (isTablet ? '11px' : '12px')),
      color: embedded ? 'rgba(255, 255, 255, 0.9)' : '#333',
      flexShrink: 0,
      textShadow: embedded ? '0 1px 2px rgba(0, 0, 0, 0.3)' : 'none'
    };

    const inputStyle = {
      width: isMobile ? '80px' : (isTablet ? '90px' : '100px'),
      height: isMobile ? '18px' : '20px',
      flexShrink: 0
    };

    const valueStyle = {
      minWidth: isMobile ? '35px' : '45px',
      fontSize: embedded ? '11px' : (isMobile ? '9px' : '11px'),
      color: embedded ? 'rgba(255, 255, 255, 0.8)' : '#666',
      textAlign: 'right',
      paddingLeft: '5px',
      textShadow: embedded ? '0 1px 2px rgba(0, 0, 0, 0.3)' : 'none'
    };

    const buttonStyle = {
      background: embedded ? 'rgba(255, 255, 255, 0.1)' : '#f0f0f0',
      border: embedded ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid #ccc',
      borderRadius: '8px',
      padding: '8px 12px',
      fontSize: '11px',
      cursor: 'pointer',
      marginTop: '10px',
      width: '100%',
      color: embedded ? 'white' : '#333',
      backdropFilter: embedded ? 'blur(10px)' : 'none',
      textShadow: embedded ? '0 1px 2px rgba(0, 0, 0, 0.3)' : 'none',
      transition: 'all 0.2s ease'
    };

    const panelStyle = embedded ? {
      background: 'transparent',
      padding: '0',
      borderRadius: '0',
      boxShadow: 'none',
      zIndex: 'auto',
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      width: '100%',
      opacity: 1,
      pointerEvents: 'auto'
    } : {
      position: 'fixed',
      top: isMobile ? '10px' : '20px',
      right: isMobile ? '10px' : '20px',
      background: 'rgba(255, 255, 255, 0.95)',
      padding: isMobile ? '8px' : (isTablet ? '12px' : '15px'),
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      zIndex: 10000,
      fontFamily: 'Arial, sans-serif',
      fontSize: isMobile ? '10px' : (isTablet ? '11px' : '12px'),
      maxHeight: '80vh',
      overflowY: 'auto',
      width: isMobile ? '220px' : (isTablet ? '260px' : '300px'),
      transition: 'opacity 0.3s ease',
      opacity: isVisible ? 1 : 0.3,
      pointerEvents: 'auto'
    };

    const toggleStyle = {
      position: 'absolute',
      top: '5px',
      right: '8px',
      background: 'none',
      border: 'none',
      fontSize: '16px',
      cursor: 'pointer',
      opacity: 0.7
    };

    return (
      <div style={panelStyle} onMouseEnter={() => setIsVisible(true)} onMouseLeave={() => setIsVisible(false)}>
        <button style={toggleStyle} onClick={() => setIsVisible(!isVisible)}>
          {isVisible ? '−' : '+'}
        </button>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#222' }}>
          Lava Lamp Controls
          <div style={{ fontSize: '10px', color: '#888', fontWeight: 'normal' }}>
            Settings auto-saved • Scale: {(responsiveScale * 100).toFixed(0)}%
          </div>
        </h3>

        <div style={sliderStyle}>
          <label style={labelStyle}>Metaballs:</label>
          <input
            type="range"
            min="1"
            max="15"
            step="1"
            value={params.numMetaballs}
            onChange={(e) => onParamChange('numMetaballs', parseInt(e.target.value))}
            style={inputStyle}
          />
          <span style={valueStyle}>{params.numMetaballs}</span>
        </div>

        <div style={sliderStyle}>
          <label style={labelStyle}>Isolation:</label>
          <input
            type="range"
            min="10"
            max="300"
            step="5"
            value={params.isolation}
            onChange={(e) => onParamChange('isolation', parseInt(e.target.value))}
            style={inputStyle}
          />
          <span style={valueStyle}>{params.isolation}</span>
        </div>

        <div style={sliderStyle}>
          <label style={labelStyle}>Strength:</label>
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={params.strength}
            onChange={(e) => onParamChange('strength', parseFloat(e.target.value))}
            style={inputStyle}
          />
          <span style={valueStyle}>{params.strength}</span>
        </div>

        <div style={sliderStyle}>
          <label style={labelStyle}>Warp Strength:</label>
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={params.internalWarpStrength}
            onChange={(e) => onParamChange('internalWarpStrength', parseFloat(e.target.value))}
            style={inputStyle}
          />
          <span style={valueStyle}>{params.internalWarpStrength}</span>
        </div>

        <div style={sliderStyle}>
          <label style={labelStyle}>Asymmetry:</label>
          <input
            type="range"
            min="0.1"
            max="20"
            step="0.1"
            value={params.asymmetryFactor}
            onChange={(e) => onParamChange('asymmetryFactor', parseFloat(e.target.value))}
            style={inputStyle}
          />
          <span style={valueStyle}>{params.asymmetryFactor}</span>
        </div>

        <div style={sliderStyle}>
          <label style={labelStyle}>Jiggle:</label>
          <input
            type="range"
            min="0"
            max="5"
            step="0.1"
            value={params.jiggleIntensity}
            onChange={(e) => onParamChange('jiggleIntensity', parseFloat(e.target.value))}
            style={inputStyle}
          />
          <span style={valueStyle}>{params.jiggleIntensity}</span>
        </div>

        <div style={sliderStyle}>
          <label style={labelStyle}>Max Distance:</label>
          <input
            type="range"
            min="0.1"
            max="2"
            step="0.05"
            value={params.maxDistance}
            onChange={(e) => onParamChange('maxDistance', parseFloat(e.target.value))}
            style={inputStyle}
          />
          <span style={valueStyle}>{params.maxDistance}</span>
        </div>

        <div style={sliderStyle}>
          <label style={labelStyle}>Speed:</label>
          <input
            type="range"
            min="0.01"
            max="2"
            step="0.01"
            value={params.speed}
            onChange={(e) => onParamChange('speed', parseFloat(e.target.value))}
            style={inputStyle}
          />
          <span style={valueStyle}>{params.speed}</span>
        </div>

        <button
          style={buttonStyle}
          onClick={resetToDefaults}
          onMouseOver={(e) => e.target.style.background = '#e0e0e0'}
          onMouseOut={(e) => e.target.style.background = '#f0f0f0'}
        >
          Reset to Defaults
        </button>
      </div>
    );
  };


export default ControlPanel;
