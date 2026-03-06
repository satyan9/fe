import React, { useState, useEffect, useRef } from "react";
import dayjs from "dayjs";

const CameraBlock = ({ mm, route, timestamp, color, allMMs, onMMChange, state }) => {
  const [images, setImages] = useState({});
  const [selectedCam, setSelectedCam] = useState("");
  const [loading, setLoading] = useState(false);

  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!timestamp || !route || mm === null || mm === undefined) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLoading(true);

    const fetchData = () => {
      const formattedTime = timestamp
        .toISOString()
        .replace(/[-:]/g, "")
        .split(".")[0];
      const mileParam = parseFloat(mm).toFixed(1);

      // Ensure this URL matches your backend
      const url = `http://localhost:5000/get-images?timestamp=${formattedTime}&road=${route}&mile=${mileParam}&state=${state || 'IN'}`;

      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.images) {
            setImages(data.images);
            const keys = Object.keys(data.images);
            if (keys.length > 0) {
              const defaultCam = data.images["cam1"] ? "cam1" : keys[0];
              setSelectedCam((prev) => (data.images[prev] ? prev : defaultCam));
            } else {
              setImages({});
              setSelectedCam("");
            }
          } else {
            setImages({});
            setSelectedCam("");
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error("Camera fetch error:", err);
          setImages({});
          setSelectedCam("");
          setLoading(false);
        });
    };

    timeoutRef.current = setTimeout(fetchData, 500);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [timestamp, route, mm]);

  const handleDownload = () => {
    if (!currentImageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              window.open(currentImageUrl, "_blank");
              return;
            }
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            const timeStr = timestamp
              .toISOString()
              .replace(/[-:T]/g, "_")
              .split(".")[0];
            const filename = `${route}_MM${mm}_${selectedCam}_${timeStr}.jpg`;
            link.setAttribute("download", filename);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);
          },
          "image/jpeg",
          0.95
        );
      } catch (err) {
        window.open(currentImageUrl, "_blank");
      }
    };
    img.onerror = () => {
      window.open(currentImageUrl, "_blank");
    };
    img.src = currentImageUrl;
  };

  const borderStyle = `2px solid ${color}`;
  const currentImageUrl = images[selectedCam] || "";
  const cameraKeys = Object.keys(images).filter((k) => images[k]);

  // Reusable style for the option tags
  const optionStyle = {
    fontSize: "13px",
    color: "#333",
    padding: "4px",
  };

  return (
    <div
      className="card"
      style={{
        minWidth: "320px",
        flex: 1,
        border: borderStyle,
        backgroundColor: "#f8f9fa",
        boxShadow: "2px 4px 6px rgba(129, 125, 125, 0.8)",
      }}
    >
      <div className="card-body p-2 d-flex flex-column">
        {/* Image Area */}
        <div
          style={{
            width: "100%",
            backgroundColor: "#e9ecef",
            borderRadius: "4px",
            marginBottom: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            position: "relative",
            aspectRatio: "16/9",
            minHeight: "180px",
          }}
        >
          {loading && (
            <div
              className="spinner-border text-primary"
              role="status"
              style={{ position: "absolute" }}
            >
              <span className="visually-hidden">Loading...</span>
            </div>
          )}

          {!loading && currentImageUrl ? (
            <img
              src={currentImageUrl}
              alt="Camera Feed"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : !loading ? (
            <div className="text-muted small">No Image</div>
          ) : null}
        </div>

        {/* Date Time */}
        <div className="mb-2">
          <small
            className="text-muted fw-bold"
            style={{ fontSize: "18px", color: "#000000ff" }}
          >
            {timestamp
              ? timestamp.toISOString().replace("T", " ").substring(0, 16)
              : "--"}
          </small>
        </div>

        {/* Controls Row */}
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
          {/* MM Dropdown Group */}
          <div className="d-flex align-items-center bg-white rounded border px-2 py-1">
            <span
              className="fw-bold small me-2 text-nowrap"
              style={{ fontSize: "18px", color: "#000000ff" }}
            >
              {route} MM:
            </span>
            <select
              className="form-select form-select-sm border-0 py-0 shadow-none"
              style={{
                width: "auto",
                fontSize: "15px",
                fontWeight: "600", // Bold text for the value
                color: "#50565dff", // Dark text color
                paddingRight: "24px",
                paddingLeft: "8px",
                cursor: "pointer",
              }}
              value={mm || ""}
              onChange={(e) => onMMChange(parseFloat(e.target.value))}
            >
              {allMMs.map((m) => (
                <option key={m} value={m} style={optionStyle}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Camera Dropdown Group */}
          {cameraKeys.length > 0 && (
            <div className="d-flex align-items-center bg-white rounded border px-2 py-1">
              <span
                className="fw-bold small me-2 text-nowrap"
                style={{ fontSize: "18px", color: "#000000ff" }}
              >
                Cam:
              </span>
              <select
                className="form-select form-select-sm border-0 py-0 shadow-none"
                style={{
                  width: "auto",
                  fontSize: "15px",
                  fontWeight: "600", // Bold text for the value
                  color: "#50565dff",
                  maxWidth: "100px",
                  paddingRight: "30px",
                  paddingLeft: "5px",
                  cursor: "pointer",
                }}
                value={selectedCam}
                onChange={(e) => setSelectedCam(e.target.value)}
              >
                {cameraKeys.map((k) => (
                  <option key={k} value={k} style={optionStyle}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Download Button */}
        <button
          className="btn btn-primary btn-sm w-100 mt-auto"
          onClick={handleDownload}
          disabled={!currentImageUrl || loading}
          style={{ fontSize: "12px" }}
        >
          <i className="bi bi-download me-1"></i> Download
        </button>
      </div>
    </div>
  );
};

export default CameraBlock;
