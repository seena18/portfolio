const TextCustomizationPanel = ({ textParams, setTextParams }) => {
    const sliderStyle = {
      width: '100%',
      marginBottom: '12px',
      accentColor: '#64B5F6',
    };

    const labelStyle = {
      display: 'block',
      marginBottom: '4px',
      fontSize: '12px',
      color: 'rgba(255, 255, 255, 0.8)',
      fontWeight: '500',
    };

    const sectionStyle = {
      marginBottom: '20px',
      padding: '12px',
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      borderRadius: '6px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
    };

    const sectionTitleStyle = {
      fontSize: '14px',
      fontWeight: '600',
      color: 'rgba(255, 255, 255, 0.9)',
      marginBottom: '12px',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      paddingBottom: '6px',
    };

    const updateTextParam = (key, value) => {
      setTextParams(prev => ({
        ...prev,
        [key]: value
      }));
    };

    return (
      <div style={{
        position: 'fixed',
        left: '20px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '280px',
        maxHeight: '80vh',
        overflowY: 'auto',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(10px)',
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        zIndex: 10001,
        color: 'white',
        fontSize: '12px',
        fontFamily: "'Inter', sans-serif",
      }}>
        <h3 style={{
          margin: '0 0 16px 0',
          fontSize: '16px',
          fontWeight: '600',
          color: 'white',
          textAlign: 'center',
          borderBottom: '2px solid rgba(255, 255, 255, 0.2)',
          paddingBottom: '8px',
        }}>
          Text Customization
        </h3>

        {/* Position Section */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Position</div>
          <label style={labelStyle}>
            Horizontal Offset: {textParams.offsetX}%
          </label>
          <input
            type="range"
            min="-50"
            max="50"
            step="1"
            value={textParams.offsetX}
            onChange={(e) => updateTextParam('offsetX', Number(e.target.value))}
            style={sliderStyle}
          />

          <label style={labelStyle}>
            Vertical Offset: {textParams.offsetY}%
          </label>
          <input
            type="range"
            min="-30"
            max="30"
            step="1"
            value={textParams.offsetY}
            onChange={(e) => updateTextParam('offsetY', Number(e.target.value))}
            style={sliderStyle}
          />
        </div>

        {/* Size Section */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Size</div>
          <label style={labelStyle}>
            Title Size: {textParams.titleSize}px
          </label>
          <input
            type="range"
            min="12"
            max="48"
            step="1"
            value={textParams.titleSize}
            onChange={(e) => updateTextParam('titleSize', Number(e.target.value))}
            style={sliderStyle}
          />

          <label style={labelStyle}>
            Body Size: {textParams.bodySize}px
          </label>
          <input
            type="range"
            min="10"
            max="32"
            step="1"
            value={textParams.bodySize}
            onChange={(e) => updateTextParam('bodySize', Number(e.target.value))}
            style={sliderStyle}
          />
        </div>

        {/* Spacing Section */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Spacing</div>
          <label style={labelStyle}>
            Title-Body Gap: {textParams.titleBodyGap}px
          </label>
          <input
            type="range"
            min="0"
            max="50"
            step="1"
            value={textParams.titleBodyGap}
            onChange={(e) => updateTextParam('titleBodyGap', Number(e.target.value))}
            style={sliderStyle}
          />

          <label style={labelStyle}>
            Line Height: {textParams.lineHeight.toFixed(1)}
          </label>
          <input
            type="range"
            min="1.0"
            max="2.5"
            step="0.1"
            value={textParams.lineHeight}
            onChange={(e) => updateTextParam('lineHeight', Number(e.target.value))}
            style={sliderStyle}
          />

          <label style={labelStyle}>
            Letter Spacing: {textParams.letterSpacing}px
          </label>
          <input
            type="range"
            min="-2"
            max="5"
            step="0.1"
            value={textParams.letterSpacing}
            onChange={(e) => updateTextParam('letterSpacing', Number(e.target.value))}
            style={sliderStyle}
          />
        </div>

        {/* Glow Effects Section */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Glow Effects</div>
          <label style={labelStyle}>
            Glow Intensity: {textParams.glowIntensity.toFixed(1)}
          </label>
          <input
            type="range"
            min="0"
            max="2.0"
            step="0.1"
            value={textParams.glowIntensity}
            onChange={(e) => updateTextParam('glowIntensity', Number(e.target.value))}
            style={sliderStyle}
          />

          <label style={labelStyle}>
            Glow Radius: {textParams.glowRadius}px
          </label>
          <input
            type="range"
            min="1"
            max="15"
            step="1"
            value={textParams.glowRadius}
            onChange={(e) => updateTextParam('glowRadius', Number(e.target.value))}
            style={sliderStyle}
          />

          <label style={labelStyle}>
            Glow Layers: {textParams.glowLayers}
          </label>
          <input
            type="range"
            min="1"
            max="5"
            step="1"
            value={textParams.glowLayers}
            onChange={(e) => updateTextParam('glowLayers', Number(e.target.value))}
            style={sliderStyle}
          />
        </div>

        {/* Text Stroke Section */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Text Stroke</div>
          <label style={labelStyle}>
            Stroke Width: {textParams.strokeWidth.toFixed(1)}px
          </label>
          <input
            type="range"
            min="0"
            max="5"
            step="0.1"
            value={textParams.strokeWidth}
            onChange={(e) => updateTextParam('strokeWidth', Number(e.target.value))}
            style={sliderStyle}
          />

          <label style={labelStyle}>
            Stroke Opacity: {textParams.strokeOpacity.toFixed(1)}
          </label>
          <input
            type="range"
            min="0"
            max="1.0"
            step="0.1"
            value={textParams.strokeOpacity}
            onChange={(e) => updateTextParam('strokeOpacity', Number(e.target.value))}
            style={sliderStyle}
          />
        </div>

        {/* Color Section */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Color</div>
          <label style={{...labelStyle, display: 'flex', alignItems: 'center', gap: '8px'}}>
            <input
              type="checkbox"
              checked={textParams.useHighlightColor}
              onChange={(e) => updateTextParam('useHighlightColor', e.target.checked)}
              style={{accentColor: '#64B5F6'}}
            />
            Use Highlight Color
          </label>

          {!textParams.useHighlightColor && (
            <>
              <label style={labelStyle}>
                Color Brightness: +{textParams.colorBrightness}
              </label>
              <input
                type="range"
                min="0"
                max="255"
                step="5"
                value={textParams.colorBrightness}
                onChange={(e) => updateTextParam('colorBrightness', Number(e.target.value))}
                style={sliderStyle}
              />
            </>
          )}
        </div>

        {/* Typography Section */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Typography</div>
          <label style={labelStyle}>
            Font Weight: {textParams.fontWeight}
          </label>
          <input
            type="range"
            min="300"
            max="900"
            step="100"
            value={textParams.fontWeight}
            onChange={(e) => updateTextParam('fontWeight', Number(e.target.value))}
            style={sliderStyle}
          />

          <label style={labelStyle}>
            Text Transform
          </label>
          <select
            value={textParams.textTransform}
            onChange={(e) => updateTextParam('textTransform', e.target.value)}
            style={{
              width: '100%',
              padding: '6px',
              marginBottom: '12px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '4px',
              color: 'white',
              fontSize: '12px',
            }}
          >
            <option value="none">None</option>
            <option value="uppercase">UPPERCASE</option>
            <option value="lowercase">lowercase</option>
            <option value="capitalize">Capitalize</option>
          </select>
        </div>

        {/* Advanced Section */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Advanced</div>
          <label style={labelStyle}>
            Brightness: {textParams.brightness.toFixed(2)}
          </label>
          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.05"
            value={textParams.brightness}
            onChange={(e) => updateTextParam('brightness', Number(e.target.value))}
            style={sliderStyle}
          />

          <label style={labelStyle}>
            Contrast: {textParams.contrast.toFixed(1)}
          </label>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={textParams.contrast}
            onChange={(e) => updateTextParam('contrast', Number(e.target.value))}
            style={sliderStyle}
          />

          <label style={labelStyle}>
            Opacity: {textParams.opacity.toFixed(1)}
          </label>
          <input
            type="range"
            min="0"
            max="1.0"
            step="0.1"
            value={textParams.opacity}
            onChange={(e) => updateTextParam('opacity', Number(e.target.value))}
            style={sliderStyle}
          />

          <label style={labelStyle}>
            Blend Mode
          </label>
          <select
            value={textParams.blendMode}
            onChange={(e) => updateTextParam('blendMode', e.target.value)}
            style={{
              width: '100%',
              padding: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '4px',
              color: 'white',
              fontSize: '12px',
            }}
          >
            <option value="normal">Normal</option>
            <option value="multiply">Multiply</option>
            <option value="screen">Screen</option>
            <option value="overlay">Overlay</option>
            <option value="soft-light">Soft Light</option>
          </select>
        </div>

        {/* Reset Button */}
        <button
          onClick={() => setTextParams({
            offsetX: 0, offsetY: 0, titleSize: 24, bodySize: 16, titleBodyGap: 16, lineHeight: 1.6,
            glowIntensity: 1.0, glowRadius: 3, glowLayers: 3, strokeWidth: 1.5, strokeOpacity: 0.5,
            brightness: 0.85, contrast: 1.3, colorBrightness: 120, useHighlightColor: false,
            fontWeight: 500, letterSpacing: 0, textTransform: 'none', blendMode: 'normal', opacity: 1.0,
          })}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: 'rgba(100, 181, 246, 0.2)',
            border: '1px solid rgba(100, 181, 246, 0.5)',
            borderRadius: '6px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            marginTop: '16px',
          }}
        >
          Reset to Defaults
        </button>
      </div>
    );
  };


export default TextCustomizationPanel;
