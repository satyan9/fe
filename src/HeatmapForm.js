import React from "react";
import { DatePicker as MUIDatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import { ROUTE_OPTIONS, ROUTE_IMAGES, ROUTE_MM_LIMITS } from "./RouteConfig";


const STATE_OPTIONS = ["IN", "AR", "AL", "AZ", "CA", "CO", "CT", "DC", "DE","FL", "GA", "HI", "IA", "ID", "IL", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY"];

const HeatmapForm = ({
  draftFormState,
  loading,
  handleInputChange,
  handleSubmit,
}) => {

  // ⭐ Universal MM Limiter for Start & End Inputs
  const handleInputChangeEnhanced = (e) => {
    const { id, value, type } = e.target;
    let val = type === "number" ? parseFloat(value) || 0 : value;

    // Find max MM based on current state and route
    const state = draftFormState.state || "IN";
    const route = draftFormState.route;
    const maxMM = ROUTE_MM_LIMITS[state]?.[route];

    // ⭐ Clamp Start MM
    if (id === "start_mm") {
      if (val < 0) val = 0;
      if (val > maxMM) val = maxMM;
    }

    // ⭐ Clamp End MM
    if (id === "end_mm") {
      if (val < 0) val = 0;
      if (val > maxMM) val = maxMM;
    }

    handleInputChange({
      target: { id, value: val, type },
    });
  };

  // ⭐ When Route changes → auto-adjust start & end MM
  const handleRouteSelect = (routeValue) => {
    const state = draftFormState.state || "IN";
    const maxMM = ROUTE_MM_LIMITS[state]?.[routeValue];

    const correctedStart = Math.min(draftFormState.start_mm, maxMM);
    const correctedEnd = Math.min(draftFormState.end_mm, maxMM);

    handleInputChange({
      target: { id: "route", value: routeValue, type: "text" },
    });
    handleInputChange({
      target: { id: "start_mm", value: correctedStart, type: "number" },
    });
    handleInputChange({
      target: { id: "end_mm", value: correctedEnd, type: "number" },
    });
  };

  const handleStateSelect = (stateValue) => {
    // Reset route to first available in new state
    const availableRoutes = ROUTE_OPTIONS[stateValue] || [];
    // Sort routes for consistent selection logic if needed, though mostly visual
    const sortedRoutes = availableRoutes.slice().sort((a, b) =>
      a.value.localeCompare(b.value, undefined, { numeric: true })
    );
    const firstRoute = sortedRoutes.length > 0 ? sortedRoutes[0].value : "";

    handleInputChange({
      target: { id: "state", value: stateValue, type: "text" }
    });
    // Also trigger route select to reset MMs and route
    if (firstRoute) handleRouteSelect(firstRoute);
  };

  const currentState = draftFormState.state || "IN";
  // Sort the options for display
  const currentRouteOptions = (ROUTE_OPTIONS[currentState] || []).slice().sort((a, b) =>
    a.value.localeCompare(b.value, undefined, { numeric: true })
  );

  const selectedRoute = currentRouteOptions.find(
    (r) => r.value === draftFormState.route
  ) || currentRouteOptions[0] || { value: draftFormState.route, label: draftFormState.route };

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="bg-light p-1 border-bottom position-fixed top-0 start-0 w-100 shadow-sm"
        style={{ zIndex: 1050 }}
      >
        <div className="container-fluid">
          <div className="row g-2 align-items-end">

            {/* State Dropdown */}
            <div className="col">
              <label className="form-label fw-semibold mb-1" style={{ fontSize: "0.8rem" }}>State</label>
              <div className="dropdown">
                <button
                  className="btn btn-outline-secondary dropdown-toggle w-100 btn-sm "
                  type="button"
                  data-bs-toggle="dropdown"
                  style={{ fontSize: "0.8rem" }}
                >
                  {currentState}
                </button>
                <ul className="dropdown-menu shadow-sm" style={{ maxHeight: "200px", overflowY: "auto" }}>
                  {STATE_OPTIONS.map((st) => (
                    <li key={st}>
                      <button
                        className="dropdown-item"
                        type="button"
                        onClick={() => handleStateSelect(st)}
                        style={{ fontSize: "0.8rem" }}
                      >
                        {st}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Start Date */}
            <div className="col" style={{ width: "150px", flex: "none" }}>
              <label className="form-label fw-semibold mb-1" style={{ fontSize: "0.8rem" }}>Begin Date</label>
              <MUIDatePicker
                value={dayjs(draftFormState.start_date)}
                views={['year', 'month', 'day']}
                format="YYYY/MM/DD"
                onChange={(newValue) =>
                  handleInputChange({
                    target: {
                      id: "start_date",
                      value: newValue.format("YYYY-MM-DD"),
                      type: "text",
                    },
                  })
                }
                slotProps={{
                  textField: {
                    size: "small",
                    fullWidth: true,
                    InputProps: { style: { fontSize: "0.8rem", height: "31px" } }
                  },
                }}
              />
            </div>

            {/* End Date */}
            <div className="col" style={{ width: "150px", flex: "none" }}>
              <label className="form-label fw-semibold mb-1" style={{ fontSize: "0.8rem" }}>End Date</label>
              <MUIDatePicker
                value={dayjs(draftFormState.end_date)}
                views={['year', 'month', 'day']}
                format="YYYY/MM/DD"
                onChange={(newValue) =>
                  handleInputChange({
                    target: {
                      id: "end_date",
                      value: newValue.format("YYYY-MM-DD"),
                      type: "text",
                    },
                  })
                }
                slotProps={{
                  textField: {
                    size: "small",
                    fullWidth: true,
                    InputProps: { style: { fontSize: "0.8rem", height: "31px" } }
                  },
                }}
              />
            </div>

            {/* Route Dropdown */}
            <div className="col">
              <label className="form-label fw-semibold mb-1" style={{ fontSize: "0.8rem" }}>Road</label>
              <div className="dropdown w-100">
                <button
                  className="btn btn-outline bg-white border dropdown-toggle w-100 btn-sm p-0 d-flex align-items-center justify-content-center"
                  type="button"
                  data-bs-toggle="dropdown"
                  style={{ height: "31px" }}
                >
                  <img
                    src={ROUTE_IMAGES[currentState]?.[selectedRoute?.value] || ROUTE_IMAGES[currentState]?.[draftFormState.route] || ROUTE_IMAGES.IN["I-64"]}
                    width="20"
                    height="20"
                    className="rounded"
                    alt=""
                  />
                </button>

                <ul className="dropdown-menu shadow-sm" style={{ maxHeight: "200px", overflowY: "auto" }}>
                  {currentRouteOptions.map((route) => (
                    <li key={route.value}>
                      <button
                        className="dropdown-item"
                        type="button"
                        onClick={() => handleRouteSelect(route.value)}
                      >
                        <img
                          src={ROUTE_IMAGES[currentState]?.[route.value]}
                          width="30"
                          height="30"
                          className="rounded border"
                          alt={route.label}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Timezone Dropdown */}
            <div className="col">
              <label className="form-label fw-semibold mb-1" style={{ fontSize: "0.8rem" }}>TZ</label>
              <div className="dropdown">
                <button
                  className="btn btn-outline-secondary dropdown-toggle w-100 btn-sm "
                  type="button"
                  data-bs-toggle="dropdown"
                  style={{ fontSize: "0.8rem" }}
                >
                  {draftFormState.timezone || "EST"}
                </button>
                <ul className="dropdown-menu shadow-sm" style={{ maxHeight: "200px", overflowY: "auto" }}>
                  {["EST", "EDT", "CST", "CDT", "MST", "MDT", "PST", "PDT", "HST", "HDT"].map((tz) => (
                    <li key={tz}>
                      <button
                        className="dropdown-item"
                        type="button"
                        onClick={() => handleInputChange({ target: { id: "timezone", value: tz, type: "text" } })}
                        style={{ fontSize: "0.8rem" }}
                      >
                        {tz}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Start MM */}
            <div className="col">
              <label className="form-label fw-semibold mb-1" style={{ fontSize: "0.8rem" }}>Start MM</label>
              <input
                type="number"
                id="start_mm"
                className="form-control form-control-sm"
                style={{ fontSize: "0.8rem" }}
                value={draftFormState.start_mm}
                onChange={handleInputChangeEnhanced}
              />
            </div>

            {/* End MM */}
            <div className="col">
              <label className="form-label fw-semibold mb-1" style={{ fontSize: "0.8rem" }}>End MM</label>
              <input
                type="number"
                id="end_mm"
                className="form-control form-control-sm"
                style={{ fontSize: "0.8rem" }}
                value={draftFormState.end_mm}
                onChange={handleInputChangeEnhanced}
              />
            </div>

            {/* Accel */}
            <div className="col">
              <label className="form-label fw-semibold mb-1" style={{ fontSize: "0.8rem" }}>Accel</label>
              <input
                type="number"
                id="accel"
                step="0.01"
                min="0"
                max="0.8"
                className="form-control form-control-sm"
                style={{ fontSize: "0.8rem" }}
                value={draftFormState.accel}
                onChange={handleInputChange}
              />
            </div>

            {/* Decel */}
            <div className="col">
              <label className="form-label fw-semibold mb-1" style={{ fontSize: "0.8rem" }}>Decel</label>
              <input
                type="number"
                id="decel"
                step="0.01"
                max="-0.01"
                min="-0.8"
                className="form-control form-control-sm"
                style={{ fontSize: "0.8rem" }}
                value={draftFormState.decel}
                onChange={handleInputChange}
              />
            </div>

            {/* Width */}
            <div className="col">
              <label className="form-label fw-semibold mb-1" style={{ fontSize: "0.8rem" }}>Width</label>
              <input
                type="number"
                id="width"
                min="200"
                className="form-control form-control-sm"
                style={{ fontSize: "0.8rem" }}
                value={draftFormState.width}
                onChange={handleInputChange}
              />
            </div>

            {/* Height */}
            <div className="col">
              <label className="form-label fw-semibold mb-1" style={{ fontSize: "0.8rem" }}>Height</label>
              <input
                type="number"
                id="height"
                className="form-control form-control-sm"
                style={{ fontSize: "0.8rem" }}
                value={draftFormState.height}
                onChange={handleInputChange}
              />
            </div>

            {/* accel and decel size */}
            <div className="col">
              <label className="form-label fw-semibold mb-1" style={{ fontSize: "0.8rem" }}>size</label>
              <input
                type="number"
                id="size"
                className="form-control form-control-sm"
                style={{ fontSize: "0.8rem" }}
                value={draftFormState.size}
                onChange={handleInputChange}
              />
            </div>

            {/* Submit button */}
            <div className="col d-flex align-items-end">
              <button
                type="submit"
                className="btn btn-primary w-100 fw-semibold btn-sm"
                style={{ fontSize: "0.8rem" }}
                disabled={loading}
              >
                {loading ? "..." : "Generate"}
              </button>
            </div>
          </div>
        </div>
      </form>
      {/* {loading && ( <div className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column justify-content-center align-items-center" style={{ backgroundColor: "rgba(0, 0, 0, 0.6)", zIndex: 2000 }} > <div className="spinner-border text-light mb-3" role="status" style={{ width: "2rem", height: "2rem" }} > <span className="visually-hidden">Loading...</span> </div> <h5 className="text-white fw-semibold">Generating Heatmaps...</h5> </div> )} */}
    </>
  );
};

export default HeatmapForm;