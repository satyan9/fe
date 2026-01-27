// frontend/src/App.js
import React from 'react';
import HeatmapGenerator from './HeatmapGenerator';
import { Routes, Route } from 'react-router-dom'; // 1. Import
import './App.css'; // You can use this for global styles
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";

function App() {
  return (
    <div className="App">
      {/* 2. Define your routes */}
      <Routes>
        {/* Route for the dynamic parameters with state and timezone */}
        <Route
          path="/:state/:start_date/:end_date/:route/:start_mm/:end_mm/:timezone"
          element={<HeatmapGenerator />}
        />
        {/* Supporting existing state-based route */}
        <Route
          path="/:state/:start_date/:end_date/:route/:start_mm/:end_mm"
          element={<HeatmapGenerator />}
        />
        {/* Route for the dynamic parameters (Legacy default IN) */}
        <Route
          path="/:start_date/:end_date/:route/:start_mm/:end_mm"
          element={<HeatmapGenerator />}
        />
        {/* Default route */}
        <Route path="/" element={<HeatmapGenerator />} />
      </Routes>
    </div>
  );
}



export default App;