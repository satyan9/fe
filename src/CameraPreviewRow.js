import React from 'react';
import CameraBlock from './CameraBlock';

const CameraPreviewRow = ({ data, allMMs, dateTime, route, state, onMMChange, onTimeAdjust }) => {
  const colors = ["#719ac6ff", "#a9a9a9ff", "#ceb772ff"]; // Blue, Black, Yellow

  return (
    /* Main Container with Border and Box Shadow */
    <div className="card shadow border mt-4 mb-3 bg-white rounded">
      <div className="card-body p-2 d-flex align-items-center gap-2">

        {/* Left Arrow - Compact Size */}
        <button
          className="btn btn-outline-secondary btn-sm rounded-circle d-flex align-items-center justify-content-center"
          style={{ width: '32px', height: '32px', flexShrink: 0 }}
          onClick={() => onTimeAdjust && onTimeAdjust(-1)}
          title="Minus 1 Minute"
        >
          <i className="bi bi-chevron-left" style={{ fontSize: '14px' }}></i>
        </button>

        {/* Scrollable Camera Area */}
        <div className="d-flex justify-content-between gap-3 flex-grow-1" style={{ overflowX: 'auto', padding: '5px' }}>
          {data.map((item, index) => (
            <CameraBlock
              key={index}
              mm={item.mm}
              route={route}
              state={state}
              timestamp={dateTime}
              color={colors[index]}
              allMMs={allMMs}
              onMMChange={(newMM) => onMMChange(index, newMM)}
            />
          ))}
        </div>

        {/* Right Arrow - Compact Size */}
        <button
          className="btn btn-outline-secondary btn-sm rounded-circle d-flex align-items-center justify-content-center"
          style={{ width: '32px', height: '32px', flexShrink: 0 }}
          onClick={() => onTimeAdjust && onTimeAdjust(1)}
          title="Plus 1 Minute"
        >
          <i className="bi bi-chevron-right" style={{ fontSize: '14px' }}></i>
        </button>

      </div>
    </div>
  );
};

export default CameraPreviewRow;