/* eslint-disable no-restricted-globals */

// Helper to safely parse date string as LOCAL time (ignoring timezones)
const parseDateAsLocal = (dateStr) => {
    if (!dateStr) return new Date();
    const parts = dateStr.split(/[- :T]/);
    // Note: Month is 0-indexed in JS Date
    return new Date(
        parseInt(parts[0]),      // Year
        parseInt(parts[1]) - 1,  // Month
        parseInt(parts[2]),      // Day
        parseInt(parts[3] || 0), // Hour
        parseInt(parts[4] || 0), // Minute
        parseInt(parts[5] || 0)  // Second
    );
};

const processChunkToMap = (dataChunk) => {
  const map = {};
  const IDX_DIR = 0;
  const IDX_TS = 1;
  const IDX_MM = 2;
  const IDX_VAL = 3;
  const IDX_TYPE = 4;

  for (let i = 0; i < dataChunk.length; i++) {
    const row = dataChunk[i];
    let dir = "E";
    const rawDir = row[IDX_DIR];
    
    // Direction Normalization
    if (rawDir) {
      if (rawDir.includes(" I ")) dir = "IL";
      else if (rawDir.includes(" O ")) dir = "OL";
      else if (rawDir.includes("IL")) dir = "IL";
      else if (rawDir.includes("OL")) dir = "OL";
      else if (rawDir.includes(" N")) dir = "N";
      else if (rawDir.includes(" S")) dir = "S";
      else if (rawDir.includes(" E")) dir = "E";
      else if (rawDir.includes(" W")) dir = "W";
    }

    const rawTs = row[IDX_TS]; // e.g., "2025-09-22 14:30:00"

    // 1. Get Day Bucket Key directly from string to prevent bucket shifting
    const dayStr = rawTs.substring(0, 10); 

    // 2. Parse Date Object as Local Time to prevent axis shifting
    const dateObj = parseDateAsLocal(rawTs);

    if (!map[dayStr]) map[dayStr] = {};
    if (!map[dayStr][dir]) map[dayStr][dir] = [];

    map[dayStr][dir].push({
      mm: row[IDX_MM],
      mph: row[IDX_VAL],
      event_type: row[IDX_TYPE],
      dateObj: dateObj, 
      local_ts: rawTs,
      normalizedDir: dir
    });
  }
  return map;
};

self.onmessage = async (e) => {
  const { type, url, params, date } = e.data;

  if (type === "FETCH_DATE") {
    try {
      const formData = new FormData();
      Object.keys(params).forEach(key => formData.append(key, params[key]));

      const response = await fetch(url, {
        method: "POST",
        body: formData
      });

      if (!response.ok) throw new Error(`Failed to fetch ${date}`);

      const result = await response.json();

      let chunkMap = {};
      if (result.data && result.data.length > 0) {
        chunkMap = processChunkToMap(result.data);
      }

      self.postMessage({
        type: "SUCCESS",
        date,
        chunkMap,
        cost: result.estimated_cost_usd || 0,
        bytes: result.bigquery_bytes_processed || 0
      });

    } catch (error) {
      self.postMessage({
        type: "ERROR",
        date,
        message: error.message
      });
    }
  }
};