import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import HeatmapForm from "./HeatmapForm";
import TrafficHeatmapD3 from "./TrafficHeatmapD3";
import CameraPreviewRow from "./CameraPreviewRow";
import { ROUTE_IMAGES, ROUTE_DIRECTIONS } from "./RouteConfig";
import districtBoundaryData from "./districtBoundary.json";


const today = dayjs().format("YYYY-MM-DD");
const yesterday = dayjs().subtract(1, "day").format("YYYY-MM-DD");
const DEFAULT_FORM_STATE = {
  state: "IN",
  start_date: yesterday,
  end_date: today,
  route: "I-70",
  start_mm: 0,
  end_mm: 20,
  accel: 0.25,
  decel: -0.25,
  width: 400,
  height: 300,
  size: 2,
  timezone: "EST",
};

const DISTRICT_COLORS = {
  'Crawfordsville': 'rgb(231, 239, 249)',
  'Fort Wayne': 'rgb(207, 207, 207)',
  'Greenfield': 'rgb(237, 255, 222)',
  'La Porte': 'rgb(253, 233, 223)',
  'Seymour': 'rgb(195, 196, 243)',
  'Vincennes': 'rgb(244, 158, 170)',
};




const HeatmapGenerator = () => {
  const params = useParams();
  const navigate = useNavigate();
  const isFormNavigation = useRef(false);
  const abortControllerRef = useRef(null);

  // Reference to Child Component for direct drawing
  const heatmapRef = useRef(null);

  // States
  const [draftFormState, setDraftFormState] = useState(DEFAULT_FORM_STATE);
  const [appliedFormState, setAppliedFormState] = useState(DEFAULT_FORM_STATE);

  // Data storage
  const [dataVersion, setDataVersion] = useState(0);

  const [cameraLocations, setCameraLocations] = useState([]);
  const [showCameraLines, setShowCameraLines] = useState(false);
  const [exitLines, setExitLines] = useState([]);
  const [showExitLines, setShowExitLines] = useState(false);
  const [showTimeIndicators, setShowTimeIndicators] = useState(true);
  const [selectedMMs, setSelectedMMs] = useState([null, null, null]);
  const [districtMode, setDistrictMode] = useState(0); // 0: off, 1: fill+lines, 2: lines
  const [currentGraphTime, setCurrentGraphTime] = useState(null);


  const [metaData, setMetaData] = useState({ cost: 0, bytes: 0 });

  const [visibleLayers, setVisibleLayers] = useState({
    car: true,
    truck: true,
    accel: false,
    decel: false,
  });

  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const formatBytesToTB = (bytes) => {
    if (!bytes) return "--";
    return (bytes / 1e12).toFixed(5) + " TB";
  };

  const getDaysArray = (start, end) => {
    let arr = [];
    let dt = dayjs(start);
    const endDt = dayjs(end);
    while (dt.isBefore(endDt) || dt.isSame(endDt, "day")) {
      arr.push(dt.format("YYYY-MM-DD"));
      dt = dt.add(1, "day");
    }
    return arr;
  };

  const processChunkToMap = (dataChunk, forcedDir, forcedType) => {
    const map = {};

    for (let i = 0; i < dataChunk.length; i++) {
      const row = dataChunk[i];
      // Backend now sends optimized objects: { bin, mph, mm }
      // direction and type are provided by the caller based on the API request context
      let dir = forcedDir || "E";
      const rawDir = row.direction;
      if (rawDir) {
        if (rawDir.includes("IL")) dir = "IL";
        else if (rawDir.includes("OL")) dir = "OL";
        else if (rawDir.includes("N")) dir = "N";
        else if (rawDir.includes("S")) dir = "S";
        else if (rawDir.includes("E")) dir = "E";
        else if (rawDir.includes("W")) dir = "W";
      }

      // Convert Unix timestamp (seconds) to Date object
      const dateObj = new Date(row.bin * 1000);

      // Get the Indiana wall-clock date string (YYYY-MM-DD)
      const y = dateObj.getUTCFullYear();
      const m = (dateObj.getUTCMonth() + 1).toString().padStart(2, "0");
      const d = dateObj.getUTCDate().toString().padStart(2, "0");
      const dayStr = `${y}-${m}-${d}`;

      // Calculate decimal hour using getUTC* (pseudo-Indiana time)
      const decimalHour =
        dateObj.getUTCHours() +
        dateObj.getUTCMinutes() / 60 +
        dateObj.getUTCSeconds() / 3600;

      if (!map[dayStr]) map[dayStr] = {};
      if (!map[dayStr][dir]) map[dayStr][dir] = [];

      map[dayStr][dir].push({
        mm: row.mm,
        mph: row.mph !== undefined ? row.mph : row.speed, // handle both mph and speed
        event_type: forcedType || row.event_type,
        mmStep: row.mmStep || 0.1, // Default to 0.1 if not provided
        binStep: row.binStep || 60, // Default to 60s if not provided
        dateObj: dateObj,
        decimalHour: decimalHour,
        local_bin: row.bin,
        normalizedDir: dir,
      });
    }
    return map;
  };

  const fetchData = async (url, formData, signal, onChunk) => {
    try {
      const options = {
        method: formData ? "POST" : "GET",
        body: formData || undefined,
        signal,
        // Add timeout via AbortSignal (10 minutes to match backend)
        keepalive: true,
      };

      const response = await fetch(url, options);
      if (!response.ok) {
        console.error(`HTTP Error ${response.status} for ${url}`);
        throw new Error(`HTTP Error ${response.status}`);
      }

      const contentType = response.headers.get("Content-Type") || "";

      if (contentType.includes("x-ndjson")) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let rowBatch = [];
        const BATCH_SIZE = 500;

        while (true) {
          const { value, done } = await reader.read();

          if (done) {
            // Process any remaining buffer data
            if (buffer.trim()) {
              try {
                rowBatch.push(JSON.parse(buffer));
              } catch (e) {
                console.warn("Final buffer parse error:", e, "Buffer:", buffer);
              }
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop(); // Keep the last incomplete line

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              rowBatch.push(JSON.parse(line));
              if (rowBatch.length >= BATCH_SIZE) {
                onChunk(rowBatch);
                rowBatch = [];
              }
            } catch (e) {
              console.error("NDJSON Parse error", e, "Line:", line);
            }
          }
        }
        // Final batch
        if (rowBatch.length > 0) {
          onChunk(rowBatch);
        }
        console.log(`Stream completed for ${url}`);
      } else {
        // Fallback for standard JSON (events or older fallback)
        const data = await response.json();
        if (Array.isArray(data)) {
          onChunk(data);
        }
      }
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("Fetch aborted:", url);
      } else {
        console.error("Fetch error for", url, ":", err.message, err);
      }
    }
  };

  const generatePlot = useCallback(async (stateToUse) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    setLoading(true);

    // RESET DATA
    // Trigger version update to clear canvas via useEffect in child
    setDataVersion((v) => v + 1);

    setMetaData({ cost: 0, bytes: 0 });
    setCameraLocations([]);
    setExitLines([]);
    setSelectedMMs([null, null, null]);
    setCurrentGraphTime(null);

    // Fetch Camera Locations
    // No more master data storage! We draw and discard.
    const route = stateToUse.route;
    const start_mm = stateToUse.start_mm;
    const end_mm = stateToUse.end_mm;
    const state = stateToUse.state;

    const cameraUrl = `http://localhost:5000/get_camera_locations?state=${state}&route=${route}&start_mile=${start_mm}&end_mile=${end_mm}`;
    fetch(cameraUrl)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.locations) {
          const numericLocs = data.locations.map(Number);
          setCameraLocations(numericLocs);
          const initMMs = [
            numericLocs.length > 0 ? numericLocs[0] : 0,
            numericLocs.length > 1 ? numericLocs[1] : numericLocs[0] || 0,
            numericLocs.length > 2 ? numericLocs[2] : numericLocs[0] || 0,
          ];
          setSelectedMMs(initMMs);
          const start = dayjs(stateToUse.start_date);
          setCurrentGraphTime(
            new Date(
              Date.UTC(start.year(), start.month(), start.date(), 0, 0, 0)
            )
          );
        }
      })
      .catch((err) => console.error("Error fetching cameras:", err));

    // Fetch Exit Lines
    const exitLinesUrl = `http://localhost:5000/get_exit_lines?state=${state}&route=${route}&start_mile=${start_mm}&end_mile=${end_mm}`;
    fetch(exitLinesUrl)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setExitLines(data);
        }
      })
      .catch((err) => console.error("Error fetching exit lines:", err));

    // Calc Tasks
    const stateDirections = ROUTE_DIRECTIONS[state] || ROUTE_DIRECTIONS['IN'];
    const directions = stateDirections[route] || ["E", "W"];

    const types = ["car", "truck", "events"];

    // setProgress({ completed: 0, total: totalTasks });

    let totalCost = 0;
    let totalBytes = 0;

    try {
      const allTasks = [];
      const { start_date, end_date, route, start_mm, end_mm, accel, decel } =
        stateToUse;
      const allDates = getDaysArray(start_date, end_date);

      // Helper to chunk dates (e.g. 3 days per request) to balance request count vs payload size
      const chunkArray = (arr, size) => {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
          chunks.push(arr.slice(i, i + size));
        }
        return chunks;
      };

      const dateChunks = chunkArray(allDates, 5); // 1 Day per request

      // 1. CREATE ALL TASKS
      dateChunks.forEach((chunk) => {
        const chunkStart = chunk[0];
        const chunkEnd = chunk[chunk.length - 1];

        types.forEach((type) => {
          directions.forEach((dir) => {
            // Define the task function
            const taskFn = async () => {
              if (signal.aborted) return;

              const processResponse = async (formData, urlOverride) => {
                await fetchData(
                  urlOverride ||
                  `http://localhost:5000/generate_heatmap_${type}`,
                  formData,
                  signal,
                  async (dataChunk) => {
                    if (signal.aborted) return;

                    // Filter out meta rows and update stats
                    const contentRows = [];
                    dataChunk.forEach((row) => {
                      if (row.meta) {
                        if (row.bytes) totalBytes += row.bytes;
                        if (row.cost) totalCost += row.cost;
                      } else {
                        contentRows.push(row);
                      }
                    });

                    if (contentRows.length === 0) return;

                    // Batching is handled inside fetchData for NDJSON
                    const chunkMap = processChunkToMap(
                      contentRows,
                      dir,
                      type === "events" ? null : type
                    );

                    // DIRECT DRAW TO CANVAS AND DISCARD
                    if (heatmapRef.current) {
                      heatmapRef.current.appendData(chunkMap);
                    }
                  }
                );
              };

              if (type === "car" || type === "truck") {
                const formattedRoute = route.startsWith('I-') ? route : route.replace('I', 'I-');
                const roadName = `${formattedRoute} ${dir}`;
                const { timezone } = stateToUse;
                // API expects End Date to be the boundary.
                const endDatePayload = dayjs(chunkEnd)
                  .add(1, "day")
                  .format("YYYY-MM-DD");
                const endpoint = type === "car" ? "getMiles" : "getMiles_truck";
                const url = `http://localhost:5000/api/heatmap/${endpoint}/${state}/${roadName}/${chunkStart}/${endDatePayload}/${start_mm}/${end_mm}/${timezone}`;
                await processResponse(null, url);
              } else {
                // Events
                const formattedRoute = route.startsWith('I-') ? route : route.replace('I', 'I-');
                const formData = new FormData();
                formData.append("state", state);
                formData.append("start_date", chunkStart);
                formData.append("end_date", chunkEnd);
                formData.append(
                  "direction",
                  `${formattedRoute} ${dir}`
                );
                formData.append("route", route);
                formData.append("start_mm", start_mm);
                formData.append("end_mm", end_mm);
                formData.append("timezone", stateToUse.timezone);
                if (accel !== undefined) formData.append("accel", accel);
                if (decel !== undefined) formData.append("decel", decel);
                await processResponse(formData);
              }
            };

            allTasks.push(taskFn);
          });
        });
      });

      // 2. PROCESS WITH CONCURRENCY LIMIT
      const CONCURRENCY = 6;
      await processQueue(allTasks, CONCURRENCY, signal);

      setMetaData({ cost: totalCost.toFixed(6), bytes: totalBytes });
    } catch (err) {
      if (err.name !== "AbortError") console.error("Batch error", err);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  // Helper to run tasks with concurrency
  const processQueue = async (tasks, concurrency, signal) => {
    const results = [];
    const executing = new Set();
    for (const task of tasks) {
      if (signal.aborted) break;
      const p = task().then((r) => {
        executing.delete(p);
        return r;
      });
      executing.add(p);
      results.push(p);
      if (executing.size >= concurrency) {
        await Promise.race(executing);
      }
    }
    return Promise.all(results);
  };

  useEffect(() => {
    if (isFormNavigation.current) {
      isFormNavigation.current = false;
      return;
    }
    if (params.start_date || params.state) {
      const newState = { ...DEFAULT_FORM_STATE };
      // Handle state param if present, or default to IN if not (backward compat handled by router usually)
      if (params.state) {
        newState.state = params.state;
      }

      Object.keys(params).forEach((key) => {
        // If we have route params matching keys in state
        if (newState.hasOwnProperty(key)) {
          const value = params[key];
          // let value = params[key];

          // // Support keyword dates like 'today' or 'today-1'
          // if ((key === "start_date" || key === "end_date") && value) {
          //   if (value === "today") {
          //     value = dayjs().format("YYYY-MM-DD");
          //   } else if (value.startsWith("today-")) {
          //     const days = parseInt(value.split("-")[1], 10);
          //     if (!isNaN(days)) {
          //       value = dayjs().subtract(days, "day").format("YYYY-MM-DD");
          //     }
          //   }
          // }

          const isNum = ["start_mm", "end_mm"].includes(key);
          newState[key] = isNum ? parseFloat(value) || 0 : value;
        }
      });

      if (params.timezone) {
        newState.timezone = params.timezone;
      }

      setDraftFormState(newState);
      setAppliedFormState(newState);
      setIsSubmitted(true);
      generatePlot(newState);
    }
  }, [params, generatePlot]);

  // Keyboard Listeners
  useEffect(() => {
    const handleKey = (e) => {
      if (!isSubmitted) return;
      const key = e.key.toUpperCase();
      if (key === "T") setVisibleLayers((p) => ({ ...p, truck: !p.truck }));
      if (key === "D") setVisibleLayers((p) => ({ ...p, car: !p.car }));
      if (key === "N") setVisibleLayers((p) => ({ ...p, accel: !p.accel }));
      if (key === "B") setVisibleLayers((p) => ({ ...p, decel: !p.decel }));
      if (key === "L") setShowCameraLines((prev) => !prev);
      if (key === "E") setShowExitLines((prev) => !prev);
      if (key === "R") setDistrictMode((prev) => (prev + 1) % 3);
      if (key === "S") setShowTimeIndicators((prev) => !prev);

    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isSubmitted]);

  const handleInputChange = (e) =>
    setDraftFormState((p) => ({
      ...p,
      [e.target.id]:
        e.target.type === "number"
          ? parseFloat(e.target.value) || 0
          : e.target.value,
    }));

  const handleSubmit = (e) => {
    e.preventDefault();
    isFormNavigation.current = true;
    setAppliedFormState(draftFormState);
    const { state, start_date, end_date, route, start_mm, end_mm, timezone } = draftFormState;
    // Updated route structure including state and timezone
    navigate(`/${state}/${start_date}/${end_date}/${route}/${start_mm}/${end_mm}/${timezone}`, {
      replace: true,
    });
    setIsSubmitted(true);
    generatePlot(draftFormState);
  };

  const handleMMChange = (index, val) => {
    const newMMs = [...selectedMMs];
    newMMs[index] = val;
    setSelectedMMs(newMMs);
  };

  const handleTimeAdjust = (minutes) => {
    if (!currentGraphTime) return;
    const newTime = dayjs(currentGraphTime).add(minutes, "minute").toDate();

    // Construct UTC boundaries to match currentGraphTime initialization which uses Date.UTC
    const s = dayjs(appliedFormState.start_date);
    const startDate = new Date(
      Date.UTC(s.year(), s.month(), s.date(), 0, 0, 0)
    );

    const e = dayjs(appliedFormState.end_date);
    const endDate = new Date(
      Date.UTC(e.year(), e.month(), e.date(), 23, 59, 59, 999)
    );

    if (newTime < startDate || newTime > endDate) return;
    setCurrentGraphTime(newTime);
  };

  return (
    <div className="heatmap-wrapper" style={{ position: "relative" }}>
      {/* {alertMessage && (
        <div style={{ position: "fixed", top: "20px", right: "20px", padding: "12px 18px", backgroundColor: "#ff5733", color: "white", fontWeight: "bold", borderRadius: "6px", zIndex: 9999 }}>
          {alertMessage}
        </div>
      )} */}

      <HeatmapForm
        draftFormState={draftFormState}
        loading={loading}
        handleInputChange={handleInputChange}
        handleSubmit={handleSubmit}
      />

      <div style={{ marginTop: "65px" }}>
        {isSubmitted && (
          <div>
            <div style={{ position: "relative" }}>
              <TrafficHeatmapD3
                ref={heatmapRef} // ATTACH REF HERE
                groupedData={{}} // Always pass empty object to avoid re-renders
                dataVersion={dataVersion}
                state={appliedFormState.state}
                startDate={appliedFormState.start_date}
                endDate={appliedFormState.end_date}
                route={appliedFormState.route}
                startMM={appliedFormState.start_mm}
                endMM={appliedFormState.end_mm}
                width={appliedFormState.width}
                height={appliedFormState.height}
                pointSize={appliedFormState.size}
                visibleLayers={visibleLayers}
                selectedMMs={selectedMMs}
                onTimeChange={setCurrentGraphTime}
                selectedTime={currentGraphTime}
                cameraLocations={cameraLocations}
                showCameraLines={showCameraLines}
                exitLines={exitLines}
                showExitLines={showExitLines}
                districtBoundaryData={districtBoundaryData}
                districtMode={districtMode}
                showTimeIndicators={showTimeIndicators}

              >
                {/* FOOTER */}
                <div
                  id="filter-status"
                  className="d-flex align-items-center flex-wrap gap-4 py-2 px-3 bg-white border-top"
                  style={{ borderRadius: "0 0 20px 20px" }}
                >
                  <div className="d-flex align-items-center gap-3 flex-nowrap">
                    <span className="fw-semibold">Toggle layers:</span>
                    {["truck", "car", "accel", "decel", "lines", "exits", "districts"].map((k) => (
                      <div

                        key={k}
                        className="d-flex align-items-center gap-2 flex-nowrap"
                      >
                        <kbd
                          className={`badge ${k === "lines" || k === "exits" || k === "districts"
                            ? (k === "lines" ? showCameraLines : k === "exits" ? showExitLines : districtMode > 0)
                              ? "bg-dark"
                              : "bg-secondary"
                            : visibleLayers[k]

                              ? k === "truck"
                                ? "bg-primary"
                                : k === "car"
                                  ? "bg-success"
                                  : k === "accel"
                                    ? "bg-warning"
                                    : "bg-danger"
                              : "bg-secondary"
                            } fs-6 px-3 py-2`}
                        >
                          {k === "truck"
                            ? "T"
                            : k === "car"
                              ? "D"
                              : k === "accel"
                                ? "N"
                                : k === "decel"
                                  ? "B"
                                  : k === "lines" ? "L" : k === "exits" ? "E" : "R"}
                        </kbd>

                        <span
                          className={
                            (k === "lines" ? showCameraLines : k === "exits" ? showExitLines : k === "districts" ? districtMode > 0 : visibleLayers[k])
                              ? "text-dark fw-semibold"
                              : "text-muted"
                          }
                        >
                          {k === "lines"
                            ? "Cam Lines"
                            : k === "exits"
                              ? "Exit Lines"
                              : k === "districts"
                                ? "Districts"
                                : k.charAt(0).toUpperCase() + k.slice(1)}
                        </span>

                      </div>
                    ))}
                  </div>

                  <div className="d-flex align-items-center gap-3 border-start border-end px-3">
                    <span className="small">
                      <strong>Cost:</strong> ${metaData.cost}
                    </span>
                    <span className="small">
                      <strong>Bytes:</strong> {formatBytesToTB(metaData.bytes)}
                    </span>
                  </div>

                  <img
                    src={ROUTE_IMAGES[appliedFormState.state]?.[appliedFormState.route] || ROUTE_IMAGES.IN["I-465"]}
                    alt=""
                    height={40}
                    width={40}
                    className="rounded shadow-sm"
                    style={{ objectFit: "contain", flexShrink: 0 }}
                  />

                  <div className="d-flex align-items-center gap-3 flex-nowrap">
                    <span className="fw-semibold small">Speed (mph):</span>
                    {[
                      ["rgb(234, 0, 234)", "0–14"],
                      ["rgb(211, 2, 2)", "15–24"],
                      ["rgb(239, 67, 9)", "25–34"],
                      ["rgb(249, 183, 49)", "35–44"],
                      ["rgb(239, 234, 91)", "45–54"],
                      ["rgb(127, 234, 51)", "55–64"],
                      ["rgb(204, 255, 153)", ">65"],
                      ["rgb(238, 238, 238)", "No Data"],
                    ].map(([color, label]) => (
                      <div
                        key={label}
                        className="d-flex align-items-center gap-2 flex-nowrap"
                      >
                        <div
                          style={{
                            width: "14px",
                            height: "14px",
                            backgroundColor: color,
                            border: "1px solid #ddd",
                            flexShrink: 0,
                          }}
                        />
                        <span className="small">{label}</span>
                      </div>
                    ))}
                  </div>

                  {districtMode === 1 && districtBoundaryData[appliedFormState.route] && (
                    <div className="d-flex align-items-center gap-3 flex-nowrap border-start ps-3">
                      <span className="fw-semibold small">Districts:</span>
                      {Object.keys(districtBoundaryData[appliedFormState.route]).map((name) => (
                        <div key={name} className="d-flex align-items-center gap-2 flex-nowrap">
                          <div
                            style={{
                              width: "14px",
                              height: "14px",
                              backgroundColor: DISTRICT_COLORS[name] || "#eee",
                              border: "1px solid #ddd",
                              flexShrink: 0,
                            }}
                          />
                          <span className="small">{name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TrafficHeatmapD3>

              {/* {loading && <div style={{ position: "absolute", top: 10, right: 10 }}>Loading...</div>} */}
            </div>

            <div className="mt-4 px-3">
              <CameraPreviewRow
                data={selectedMMs.map((mm) => ({ mm }))}
                allMMs={cameraLocations}
                dateTime={currentGraphTime}
                route={appliedFormState.route}
                state={appliedFormState.state}
                onMMChange={handleMMChange}
                onTimeAdjust={handleTimeAdjust}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HeatmapGenerator;
