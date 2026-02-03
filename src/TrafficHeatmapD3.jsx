import React, { useMemo, useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import * as d3 from "d3";
import dayjs from "dayjs";
import { ROUTE_DIRECTIONS } from "./RouteConfig";


const SPEED_COLORS = [
  { max: 15, color: "rgb(234, 0, 234)" }, // 0-14
  { max: 25, color: "rgb(211, 2, 2)" },   // 15-24
  { max: 35, color: "rgb(239, 67, 9)" },  // 25-34
  { max: 45, color: "rgb(249, 183, 49)" },// 35-44
  { max: 55, color: "rgb(239, 234, 91)" },// 45-54
  { max: 65, color: "rgb(127, 234, 51)" },// 55-64
];

const COLOR_GREATER_65 = "rgb(204, 255, 153)"; // >65
const COLOR_NO_DATA = "rgb(238, 238, 238)";    // No Data

const DISTRICT_COLORS = {
  'Crawfordsville': 'rgb(231, 239, 249)',
  'Fort Wayne': 'rgb(207, 207, 207)',
  'Greenfield': 'rgb(237, 255, 222)',
  'La Porte': 'rgb(253, 233, 223)',
  'Seymour': 'rgb(195, 196, 243)',
  'Vincennes': 'rgb(244, 158, 170)',
};

// Removed hardcoded ROUTE_DIRECTIONS_IN in favor of RouteConfig



const getColor = (mph) => {
  if (mph === null || mph === undefined) return COLOR_NO_DATA;
  for (let bucket of SPEED_COLORS) { if (mph < bucket.max) return bucket.color; }
  return COLOR_GREATER_65;
};

const TrafficHeatmapD3 = forwardRef(({
  groupedData = {}, state = "IN", startDate, endDate, route, startMM, endMM,

  width, height, pointSize, visibleLayers,
  selectedMMs = [], onTimeChange, selectedTime,
  showCameraLines = false, showTimeIndicators = true,
  cameraLocations = [],
  exitLines = [],
  showExitLines = false,
  districtBoundaryData = {},
  districtMode = 0,
  dataVersion = 0,
  children

}, ref) => {
  // Separate canvases for each layer to allow instant CSS toggling
  const carCanvasRef = useRef();
  const truckCanvasRef = useRef();
  const accelCanvasRef = useRef();
  const decelCanvasRef = useRef();
  const vizzionCanvasRef = useRef();

  const svgRef = useRef();
  const sliderTrackRef = useRef();

  // Store drawing context (scales, dims) to use in imperative handle
  const drawContextRef = useRef(null);

  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: "" });
  const [sliderX, setSliderX] = useState(0);
  const isDragging = useRef(false);

  // 1. Process Grid Structure
  const gridLayout = useMemo(() => {
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    if (!start.isValid() || !end.isValid()) return null;

    const daysDiff = end.diff(start, "day") + 1;
    const days = [];
    for (let i = 0; i < daysDiff; i++) days.push(start.add(i, "day"));

    const stateDirections = ROUTE_DIRECTIONS[state] || ROUTE_DIRECTIONS['IN'];
    const currentDirections = stateDirections[route] || ["E", "W"];
    return { days, directions: currentDirections };
  }, [startDate, endDate, route, state]);

  // 2. Pre-Calculate Dimensions
  const dimensions = useMemo(() => {
    if (!gridLayout) return { totalWidth: 0, totalHeight: 0 };

    const margin = { top: 30, right: 0, bottom: 20, left: 0 };
    const chartWidth = width || 400;
    const chartHeight = height || 300;
    const sliderHeight = 20;

    const totalWidth = chartWidth * gridLayout.days.length;
    const rowFullHeight = chartHeight + margin.top + margin.bottom;
    const totalHeight = (rowFullHeight * gridLayout.directions.length) + sliderHeight;

    return {
      totalWidth, totalHeight, chartWidth, chartHeight, margin, sliderHeight, rowFullHeight
    };
  }, [gridLayout, width, height]);

  // Helper to get correct context
  const getContextByType = useCallback((type) => {
    if (type === 'car') return carCanvasRef.current?.getContext('2d');
    if (type === 'truck') return truckCanvasRef.current?.getContext('2d');
    if (type === 'accel') return accelCanvasRef.current?.getContext('2d');
    if (type === 'decel') return decelCanvasRef.current?.getContext('2d');
    if (type === 'vizzion') return vizzionCanvasRef.current?.getContext('2d');
    return null;
  }, []);

  // --- IMPERATIVE HANDLE: Allow parent to push data directly ---
  useImperativeHandle(ref, () => ({
    appendData: (newChunkMap) => {
      const dCtx = drawContextRef.current;
      if (!dCtx || !newChunkMap) return;

      const { days, directions, chartWidth, yScale, margin, rowFullHeight, rectH, baseRectWidth } = dCtx;

      Object.keys(newChunkMap).forEach(dayStr => {
        const dayIndex = days.findIndex(d => d.format("YYYY-MM-DD") === dayStr);
        if (dayIndex === -1) return;

        const hourScale = d3.scaleLinear().domain([0, 24]).range([0, chartWidth]);
        const xOffset = dayIndex * chartWidth;

        Object.keys(newChunkMap[dayStr]).forEach(dir => {
          const rowIdx = directions.indexOf(dir);
          if (rowIdx === -1) return;

          const yOffset = rowIdx * rowFullHeight + margin.top;
          const cellData = newChunkMap[dayStr][dir];

          // Draw pixels immediately to the specific canvas layer
          cellData.forEach(d => {
            const ctx = getContextByType(d.event_type);
            if (!ctx) return;

            // We draw regardless of 'visibleLayers' here. Visibility is handled by CSS.
            if (d.event_type === 'car' || d.event_type === 'truck') {
              ctx.fillStyle = getColor(d.mph);
              const x = xOffset + hourScale(d.decimalHour);
              const y = yOffset + yScale(d.mm);
              // Precise rendering: scale width/height based on bin/mm steps
              const actualRectW = (d.binStep / 60) * baseRectWidth + 1.0;
              const actualRectH = (d.mmStep / 0.1) * rectH + 1.0;
              // Center the rectangle on the time bin and mile marker
              ctx.fillRect(x, y - (actualRectH / 2), actualRectW, actualRectH);
            } else if (d.event_type === 'vizzion') {
              // Vizzion Drives: brown circles, fixed size 3
              ctx.fillStyle = "gray";
              const cx = xOffset + hourScale(d.decimalHour);
              const cy = yOffset + yScale(d.mm);
              ctx.beginPath();
              ctx.arc(cx, cy, 2, 0, 2 * Math.PI);// change the size of the circle here
              ctx.fill();
            } else {
              // Accel/Decel
              ctx.strokeStyle = d.event_type === 'accel' ? "blue" : "black";
              ctx.lineWidth = 2;
              const cx = xOffset + hourScale(d.decimalHour);
              const cy = yOffset + yScale(d.mm);
              ctx.beginPath();
              ctx.arc(cx, cy, (pointSize || 10) / 2, 0, 2 * Math.PI);
              ctx.stroke();
            }
          });
        });
      });
    }
  }), [pointSize, getContextByType]);

  // 4. MAIN RENDER EFFECT
  useEffect(() => {
    if (!gridLayout || !dimensions) return;

    const { days, directions } = gridLayout;
    const { totalWidth, totalHeight, chartWidth, chartHeight, margin, sliderHeight, rowFullHeight } = dimensions;

    const yScale = d3.scaleLinear().domain([startMM, endMM]).range([chartHeight, 0]);
    const dynamicRectH = Math.abs(yScale(0.1) - yScale(0));
    const baseRectWidth = chartWidth / (24 * 60);

    // Save context for imperative drawer
    drawContextRef.current = {
      days, directions, chartWidth, chartHeight, margin, rowFullHeight, yScale, rectH: dynamicRectH, baseRectWidth
    };

    // --- SETUP SVG ---
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", totalWidth).attr("height", totalHeight - sliderHeight);
    svg.style("cursor", "none");

    // --- SETUP CANVASES ---
    const dpr = window.devicePixelRatio || 1;
    const setupCanvas = (ref) => {
      const cvs = ref.current;
      if (!cvs) return;
      const ctx = cvs.getContext("2d");
      cvs.width = totalWidth * dpr;
      cvs.height = (totalHeight - sliderHeight) * dpr;
      cvs.style.width = `${totalWidth}px`;
      cvs.style.height = `${totalHeight - sliderHeight}px`;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, totalWidth, totalHeight - sliderHeight);
      return ctx;
    };

    const ctxCar = setupCanvas(carCanvasRef);
    const ctxTruck = setupCanvas(truckCanvasRef);
    const ctxAccel = setupCanvas(accelCanvasRef);
    const ctxDecel = setupCanvas(decelCanvasRef);
    const ctxVizzion = setupCanvas(vizzionCanvasRef);

    const rectH = dynamicRectH;

    // --- LOOP THROUGH GRID ---
    directions.forEach((dir, rowIdx) => {
      days.forEach((dayObj, colIdx) => {
        const xOffset = colIdx * chartWidth;
        const yOffset = rowIdx * rowFullHeight + margin.top;

        const dayStart = new Date(Date.UTC(dayObj.year(), dayObj.month(), dayObj.date()));
        const dayEnd = new Date(Date.UTC(dayObj.year(), dayObj.month(), dayObj.date() + 1));
        const xScale = d3.scaleUtc().domain([dayStart, dayEnd]).range([0, chartWidth]);

        const g = svg.append("g").attr("transform", `translate(${xOffset}, ${yOffset})`);

        // --- X Axis ---
        const xAxis = d3.axisBottom(xScale)
          .ticks(d3.utcHour.every(2))
          .tickFormat(d => d.getUTCHours() === 0 ? "" : d.getUTCHours())
          .tickSize(4);

        g.append("g")
          .attr("transform", `translate(0, ${chartHeight})`)
          .call(xAxis)
          .style("font-family", "sans-serif")
          .style("font-size", "11px")
          .style("font-weight", "600")
          .call(g => g.select(".domain").attr("stroke", "#ccc"));

        // --- Grid Lines ---
        const xTicks = xScale.ticks(d3.utcHour.every(2));
        g.append("g")
          .attr("class", "grid-lines")
          .selectAll("line")
          .data(xTicks)
          .enter()
          .append("line")
          .attr("x1", d => xScale(d))
          .attr("x2", d => xScale(d))
          .attr("y1", 0)
          .attr("y2", chartHeight)
          .attr("stroke", "#a79b9bff")
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", "3, 3")
          .style("pointer-events", "none");

        // --- Y Axis ---
        const yTicks = yScale.ticks(8);
        const maxVal = d3.max(yTicks);
        const minVal = d3.min(yTicks);

        g.append("g")
          .selectAll(".y-tick-label")
          .data(yTicks)
          .enter()
          .append("text")
          .attr("x", 6)
          .attr("y", d => yScale(d))
          .attr("dy", d => {
            if (d === maxVal) return "0.9em";
            if (d === minVal) return "-0.3em";
            return "0.32em";
          })
          .attr("text-anchor", "start")
          .style("font-family", "sans-serif")
          .style("font-size", "11px")
          .style("font-weight", "600")
          .style("fill", "#070707ff")
          .style("pointer-events", "none")
          .style("text-shadow", "0px 0px 4px rgba(255,255,255,0.8)")
          .text(d => d);

        // --- Date Title ---
        if (rowIdx === 0) {
          g.append("text")
            .attr("x", chartWidth / 2)
            .attr("y", -8)
            .attr("text-anchor", "middle")
            .style("font-family", "sans-serif")
            .style("font-weight", "bold")
            .style("font-size", "25px")
            .style("fill", "#444")
            .text(dayObj.format("ddd MM/DD"));
        }

        // --- Chart Border ---
        g.append("rect")
          .attr("width", chartWidth)
          .attr("height", chartHeight)
          .attr("fill", "none")
          .attr("stroke", "#4c4c4cff")
          .attr("stroke-width", 1);

        // --- Horizontal District Boundaries ---
        // if (districtBoundaryData[route]) {
        //   const districts = districtBoundaryData[route];

        //   Object.entries(districts).forEach(([name, bounds]) => {
        //     const sm = parseFloat(bounds.sm);
        //     const em = parseFloat(bounds.em);
        //     const color = DISTRICT_COLORS[name] || "#eee";

        //     const minMM = Math.min(startMM, endMM);
        //     const maxMM = Math.max(startMM, endMM);

        //     // Fill
        //     const y1 = yScale(sm);
        //     const y2 = yScale(em);
        //     const fillY = Math.min(y1, y2);
        //     const fillH = Math.abs(y1 - y2);

        //     const rectY = Math.max(0, fillY);
        //     const rectH = Math.min(chartHeight - rectY, fillH - (rectY - fillY));

        //     if (rectH > 0) {
        //       g.append("rect")
        //         .attr("class", "district-fill-layer")
        //         .attr("x", 0)
        //         .attr("width", chartWidth)
        //         .attr("y", rectY)
        //         .attr("height", rectH)
        //         .attr("fill", color)
        //         .attr("opacity", 0.6)
        //         .style("display", districtMode === 1 ? "inline" : "none")
        //         .style("pointer-events", "none");
        //     }

        //     // Lines and Label
        //     const lineGroup = g.append("g").attr("class", "district-line-layer")
        //       .style("display", districtMode > 0 ? "inline" : "none");

        //     [sm, em].forEach(loc => {
        //       if (loc >= minMM && loc <= maxMM) {
        //         lineGroup.append("line")
        //           .attr("x1", 0)
        //           .attr("x2", chartWidth)
        //           .attr("y1", yScale(loc))
        //           .attr("y2", yScale(loc))
        //           .attr("stroke", "#444")
        //           .attr("stroke-width", 1.5)
        //           .style("pointer-events", "none");
        //       }
        //     });

        //     const midMM = (sm + em) / 2;
        //     if (midMM >= minMM && midMM <= maxMM) {
        //       lineGroup.append("text")
        //         .attr("x", 10)
        //         .attr("y", yScale(midMM))
        //         .attr("dy", "0.35em")
        //         .attr("text-anchor", "start")
        //         .style("font-family", "sans-serif")
        //         .style("font-size", "0px")
        //         .style("font-weight", "bold")
        //         .style("fill", "#222")
        //         .style("pointer-events", "none")
        //         .style("text-shadow", "0px 0px 4px rgba(255,255,255,0.9)")
        //         .text(name);
        //     }
        //   });
        // }

        // --- Horizontal Camera Lines (Pre-rendered, visibility toggled via CSS) ---
        if (cameraLocations.length > 0) {
          const camGroup = g.append("g").attr("class", "camera-lines-layer")
            .style("display", showCameraLines ? "inline" : "none");
          cameraLocations.forEach(loc => {
            const minMM = Math.min(startMM, endMM);
            const maxMM = Math.max(startMM, endMM);
            if (loc >= minMM && loc <= maxMM) {
              camGroup.append("line")
                .attr("x1", 0)
                .attr("x2", chartWidth)
                .attr("y1", yScale(loc))
                .attr("y2", yScale(loc))
                .attr("stroke", "#333")
                .attr("stroke-width", 0.5)
                .style("pointer-events", "none");
            }
          });
        }

        // --- Horizontal Exit Lines ---
        if (exitLines.length > 0) {
          const exitGroup = g.append("g").attr("class", "exit-lines-layer")
            .style("display", showExitLines ? "inline" : "none");
          exitLines.forEach(ex => {
            if (ex.interstate_dir.endsWith(` ${dir}`)) {
              const loc = ex.milepost;
              const minMM = Math.min(startMM, endMM);
              const maxMM = Math.max(startMM, endMM);
              if (loc >= minMM && loc <= maxMM) {
                exitGroup.append("line")
                  .attr("x1", 0)
                  .attr("x2", chartWidth)
                  .attr("y1", yScale(loc))
                  .attr("y2", yScale(loc))
                  .attr("stroke", "#000000ff")
                  .attr("stroke-width", 0.5)
                  .style("pointer-events", "none");

                exitGroup.append("text")
                  .attr("x", chartWidth - 5)
                  .attr("y", yScale(loc))
                  .attr("dy", "-0.2em")
                  .attr("text-anchor", "end")
                  .style("font-family", "sans-serif")
                  .style("font-size", "0px")
                  .style("font-weight", "bold")
                  .style("fill", "#d45500")
                  .style("pointer-events", "none")
                  .style("text-shadow", "0px 0px 3px rgba(255,255,255,0.9)")
                  .text(`Exit ${ex.exit}`);
              }
            }
          });
        }

        // --- INTERACTION LAYER ---
        const cursorCircle = g.append("circle")
          .attr("r", 4)
          .attr("fill", "none")
          .attr("stroke", "black")
          .attr("stroke-width", 2)
          .style("pointer-events", "none")
          .style("opacity", 0);

        g.append("rect")
          .attr("width", chartWidth)
          .attr("height", chartHeight)
          .attr("fill", "transparent")
          .on("mousemove", (event) => {
            const [px, py] = d3.pointer(event);
            const hoveredDate = xScale.invert(px);
            const hoveredMM = yScale.invert(py);
            cursorCircle.attr("cx", px).attr("cy", py).style("opacity", 1);
            const formatTimeUTC = (date) => {
              const h = date.getUTCHours().toString().padStart(2, '0');
              const m = date.getUTCMinutes().toString().padStart(2, '0');
              return `${h}:${m}`;
            };
            setTooltip({
              visible: true,
              x: event.clientX + 15,
              y: event.clientY - 15,
              content: `MM: ${hoveredMM.toFixed(1)} | Time: ${formatTimeUTC(hoveredDate)}`
            });
          })
          .on("mouseout", () => {
            setTooltip(t => ({ ...t, visible: false }));
            cursorCircle.style("opacity", 0);
          });
      });
    });


    // --- RE-DRAW EXISTING DATA (if any) ---
    if (Object.keys(groupedData).length > 0) {
      Object.keys(groupedData).forEach(dayStr => {
        const dayIndex = days.findIndex(d => d.format("YYYY-MM-DD") === dayStr);
        if (dayIndex === -1) return;

        const hourScale = d3.scaleLinear().domain([0, 24]).range([0, chartWidth]);
        const xOffset = dayIndex * chartWidth;

        Object.keys(groupedData[dayStr]).forEach(dir => {
          const rowIdx = directions.indexOf(dir);
          if (rowIdx === -1) return;
          const yOffset = rowIdx * rowFullHeight + margin.top;
          const cellData = groupedData[dayStr][dir];

          // Iterate and draw to specific canvases
          // No visibility checks here! We strictly draw data to its layer.
          cellData.forEach(d => {
            let ctx = null;
            if (d.event_type === 'car') ctx = ctxCar;
            else if (d.event_type === 'truck') ctx = ctxTruck;
            else if (d.event_type === 'accel') ctx = ctxAccel;
            else if (d.event_type === 'decel') ctx = ctxDecel;
            else if (d.event_type === 'vizzion') ctx = ctxVizzion;

            if (!ctx) return;

            if (d.event_type === 'car' || d.event_type === 'truck') {
              ctx.fillStyle = getColor(d.mph);
              const x = xOffset + hourScale(d.decimalHour);
              const y = yOffset + yScale(d.mm);
              // Precise rendering: scale width/height based on bin/mm steps
              const actualRectW = (d.binStep / 60) * baseRectWidth + 1.0;
              const actualRectH = (d.mmStep / 0.1) * rectH + 1.0;
              // Center the rectangle on the time bin and mile marker
              ctx.fillRect(x, y - (actualRectH / 2), actualRectW, actualRectH);
            } else if (d.event_type === 'vizzion') {
              ctx.fillStyle = "brown";
              const cx = xOffset + hourScale(d.decimalHour);
              const cy = yOffset + yScale(d.mm);
              ctx.beginPath();
              ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
              ctx.fill();
            } else {
              ctx.strokeStyle = d.event_type === 'accel' ? "blue" : "black";
              ctx.lineWidth = 2;
              const cx = xOffset + hourScale(d.decimalHour);
              const cy = yOffset + yScale(d.mm);
              ctx.beginPath();
              ctx.arc(cx, cy, (pointSize || 10) / 2, 0, 2 * Math.PI);
              ctx.stroke();
            }
          });
        });
      });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridLayout, dimensions, startMM, endMM, pointSize, cameraLocations, exitLines, dataVersion, districtBoundaryData]);
  // REMOVED `showCameraLines`, `showExitLines`, `districtMode` from dependency array



  // 5. EFFECT: Toggle Camera Lines Display (Cheap)
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current).selectAll(".camera-lines-layer")
      .style("display", showCameraLines ? "inline" : "none");
  }, [showCameraLines]);

  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current).selectAll(".exit-lines-layer")
      .style("display", showExitLines ? "inline" : "none");
  }, [showExitLines]);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll(".district-fill-layer")
      .style("display", districtMode === 1 ? "inline" : "none");
    svg.selectAll(".district-line-layer")
      .style("display", districtMode > 0 ? "inline" : "none");
  }, [districtMode]);



  // --- SLIDER LOGIC ---
  const handleDragStart = (e) => {
    isDragging.current = true;
    e.preventDefault();
  };

  const calculateTimeFromX = useCallback((x) => {
    if (!dimensions || !gridLayout) return null;
    const { chartWidth } = dimensions;
    const colIdx = Math.floor(x / chartWidth);
    if (colIdx < 0 || colIdx >= gridLayout.days.length) return null;

    const dayObj = gridLayout.days[colIdx];
    const xInCol = x % chartWidth;
    const dayStart = new Date(Date.UTC(dayObj.year(), dayObj.month(), dayObj.date()));
    const dayEnd = new Date(Date.UTC(dayObj.year(), dayObj.month(), dayObj.date() + 1));
    const xScale = d3.scaleUtc().domain([dayStart, dayEnd]).range([0, chartWidth]);

    return xScale.invert(xInCol);
  }, [dimensions, gridLayout]);

  const calculateXFromTime = useCallback((time) => {
    if (!dimensions || !gridLayout || !time) return 0;
    const { chartWidth } = dimensions;
    const { days } = gridLayout;
    // Use UTC components to find the matching day index, as the graph is UTC-based
    const targetDay = dayjs(
      new Date(time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate())
    );

    const dayIdx = days.findIndex((d) => d.isSame(targetDay, "day"));
    if (dayIdx === -1) return 0;

    const dayStart = new Date(Date.UTC(targetDay.year(), targetDay.month(), targetDay.date()));
    const dayEnd = new Date(Date.UTC(targetDay.year(), targetDay.month(), targetDay.date() + 1));
    const xScale = d3.scaleUtc().domain([dayStart, dayEnd]).range([0, chartWidth]);

    return (dayIdx * chartWidth) + xScale(time);
  }, [dimensions, gridLayout]);

  useEffect(() => {
    if (!dimensions) return;
    setSliderX(prev => Math.max(0, Math.min(prev, dimensions.totalWidth)));
  }, [dimensions]);

  useEffect(() => {
    if (!isDragging.current && selectedTime) {
      const newX = calculateXFromTime(selectedTime);
      setSliderX(newX);
    }
  }, [selectedTime, calculateXFromTime]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current || !sliderTrackRef.current || !dimensions) return;
      const rect = sliderTrackRef.current.getBoundingClientRect();
      let newSliderX = e.clientX - rect.left;
      newSliderX = Math.max(0, Math.min(newSliderX, dimensions.totalWidth));

      setSliderX(newSliderX);
      const t = calculateTimeFromX(newSliderX);
      if (t && onTimeChange) onTimeChange(t);
    };

    const handleMouseUp = () => isDragging.current = false;

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dimensions, calculateTimeFromX, onTimeChange]);

  if (!dimensions) return null;

  const camColors = ["#007bffff", "#726b6bff", "#ffc107"];
  const { chartHeight, margin, sliderHeight, rowFullHeight } = dimensions;
  const yScaleVal = d3.scaleLinear().domain([startMM, endMM]).range([chartHeight, 0]);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", paddingTop: "5px", border: "1px solid #ddd", borderRadius: "20px", boxShadow: "2px 4px 6px rgba(123, 122, 122, 0.9)", backgroundColor: "#fcfcfc", fontFamily: "sans-serif" }}>

      {/* WRAPPER FOR GRAPH ROW */}
      <div style={{ display: "flex", width: "100%" }}>
        {/* DIRECTIONS SIDEBAR */}
        <div style={{
          width: "60px", flexShrink: 0, backgroundColor: "#ffffffff", borderRight: "1px solid #ddd", borderRadius: "20px 0 0 0", paddingTop: margin.top, display: "flex", flexDirection: "column", alignItems: "center"
        }}>
          {gridLayout?.directions.map((dir, i) => (
            <div key={i} style={{
              height: rowFullHeight, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "25px", color: "#444"
            }}>
              {dir}
            </div>
          ))}
          <div style={{ height: sliderHeight }} />
        </div>

        {/* HEATMAP CONTAINER */}
        <div style={{ flexGrow: 1, overflowX: "auto", position: "relative" }}>
          <div style={{ width: dimensions.totalWidth, height: dimensions.totalHeight, position: "relative" }}>

            {/* LAYER 1: CAR */}
            <canvas ref={carCanvasRef} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 1, display: visibleLayers.car ? 'block' : 'none' }} />

            {/* LAYER 2: TRUCK */}
            <canvas ref={truckCanvasRef} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 2, display: visibleLayers.truck ? 'block' : 'none' }} />

            {/* LAYER 3: ACCEL (Blue) */}
            <canvas ref={accelCanvasRef} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 3, display: visibleLayers.accel ? 'block' : 'none' }} />

            {/* LAYER 4: DECEL (Black) */}
            <canvas ref={decelCanvasRef} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 4, display: visibleLayers.decel ? 'block' : 'none' }} />

            {/* LAYER V: VIZZION (Brown) */}
            <canvas ref={vizzionCanvasRef} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 4, display: visibleLayers.vizzion ? 'block' : 'none' }} />

            {/* LAYER 5: SVG (Axes, Grid, Interaction) */}
            <svg ref={svgRef} style={{ position: "absolute", top: 0, left: 0, zIndex: 5 }} />

            {showTimeIndicators && (
              <>
                <div style={{ position: 'absolute', left: sliderX, top: 0, height: dimensions.totalHeight - sliderHeight, pointerEvents: 'none', zIndex: 10 }}>
                  {gridLayout?.directions.map((_, rowIdx) => {
                    const top = rowIdx * rowFullHeight + margin.top;
                    return (
                      <div key={`line-${rowIdx}`} style={{ position: 'absolute', left: 0, top: top, height: chartHeight, borderLeft: '2px solid #007bff' }} />
                    );
                  })}
                  {/* Camera Dots */}
                  {gridLayout?.directions.map((dir, rowIdx) => {
                    const yOffset = rowIdx * rowFullHeight + margin.top;
                    return (
                      <React.Fragment key={rowIdx}>
                        {selectedMMs.map((mm, i) => {
                          if (mm === null || mm === undefined || mm < Math.min(startMM, endMM) || mm > Math.max(startMM, endMM)) return null;
                          return (
                            <div key={`dot-${i}`} style={{
                              position: 'absolute', left: -5, top: yOffset + yScaleVal(mm) - 6,
                              width: 12, height: 12, borderRadius: '50%', backgroundColor: camColors[i],
                              border: '2px solid white', boxShadow: '0 0 3px rgba(0,0,0,0.6)'
                            }} />
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </div>

                <div ref={sliderTrackRef} style={{ position: 'absolute', bottom: 0, left: 0, width: dimensions.totalWidth, height: sliderHeight, backgroundColor: '#f9f9f9', borderTop: '1px solid #e0e0e0', zIndex: 20, cursor: 'pointer' }}
                  onMouseDown={(e) => {
                    if (sliderTrackRef.current) {
                      const rect = sliderTrackRef.current.getBoundingClientRect();
                      let newSliderX = e.clientX - rect.left;
                      newSliderX = Math.max(0, Math.min(newSliderX, dimensions.totalWidth));
                      setSliderX(newSliderX);
                      isDragging.current = true;
                      const t = calculateTimeFromX(newSliderX);
                      if (t && onTimeChange) onTimeChange(t);
                    }
                  }}
                >
                  <div style={{ position: 'absolute', top: '50%', left: 5, right: 5, height: 6, backgroundColor: '#a6d8ff', borderRadius: 3, marginTop: -3 }} />
                  <div style={{
                    position: 'absolute', left: sliderX - 10, top: '50%', marginTop: -10, width: 20, height: 20,
                    backgroundColor: 'white', borderRadius: '50%', border: '3px solid #007bff',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.3)', cursor: 'grab', zIndex: 2
                  }} onMouseDown={handleDragStart} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {children}

      {tooltip.visible && (
        <div style={{
          position: "fixed", left: tooltip.x, top: tooltip.y,
          backgroundColor: "rgba(33, 37, 41, 0.9)", color: "white",
          padding: "6px 10px", borderRadius: "4px", fontSize: "12px",
          fontWeight: "500", pointerEvents: "none", zIndex: 9999,
          whiteSpace: "nowrap", boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
        }}>
          {tooltip.content}
        </div>
      )}
    </div>
  );
});

export default TrafficHeatmapD3;
