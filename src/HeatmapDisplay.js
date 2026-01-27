// HeatmapDisplay.jsx
import React from 'react';
import { HEATMAP_KEYS } from './HeatmapGenerator'; // Import the key list

const HeatmapDisplay = ({ isSubmitted, base64Data, visibleLayers }) => (
  <>
    <div className="scroll-container">
      <div className="result-wrapper">
        <div id="result">


{/* Always show the empty heatmap (if provided) */}
{base64Data.empty && (
  <img
    key="empty"
    src={`data:image/png;base64,${base64Data.empty}`}
    alt={`empty heatmap`}
    className="heatmap-layer visible" // always visible
  />
)}

{/* Only render toggleable layers (car, truck) and respect visibleLayers */}
{HEATMAP_KEYS.map(
  (key) =>
    base64Data[key] && (
      <img
        key={key}
        src={`data:image/png;base64,${base64Data[key]}`}
        alt={`${key} heatmap`}
        className={`heatmap-layer ${visibleLayers[key] ? 'visible' : 'hidden'}`}
      />
    )
)}

        </div>
      </div>
    </div>
  </>
);

export default HeatmapDisplay;