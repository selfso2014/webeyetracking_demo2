// js/app.js
import { loadWebpackModule } from "./webpack-loader.js";

const LICENSE_KEY = "dev_1ntzip9admm6g0upynw3gooycnecx0vl93hz8nox"; // Key is not shown in the UI.
const BUILD = "20260104_1"; // cache-bust / debug stamp

const els = {
  calPoints: document.getElementById("calPoints"),
  btnStart: document.getElementById("btnStart"),
  btnStop: document.getElementById("btnStop"),
  btnCal: document.getElementById("btnCal"),
  btnClear: document.getElementById("btnClear"),
  pillCoi: document.getElementById("pillCoi"),
  pillSdk: document.getElementById("pillSdk"),
  pillTrack: document.getElementById("pillTrack"),
  pillPerm: document.getElementById("pillPerm"),
  canvas: document.getElementById("output"),
};

function setPill(el, text) {
  if (el) el.textContent = text;
}

function getOrCreateUserId() {
  const key = "eyedid_user_id";
  let v = localStorage.getItem(key);
  if (!v) {
    v = "u_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
    localStorage.setItem(key, v);
  }
  return v;
}

// (Backward compatibility) If user previously used QuickStart calibration page,
// it may return here with ?calibrationData=...
function parseCalibrationDataFromUrl() {
  const sp = new URLSearchParams(location.search);
  const data = sp.get("calibrationData");
  return data ? decodeURIComponent(data) : null;
}

function getCachedCalibration(userId) {
  return localStorage.getItem(`eyedid_calibration_${userId}`);
}
function setCachedCalibration(userId, data) {
  localStorage.setItem(`eyedid_calibration_${userId}`, data);
}

async function registerCOIServiceWorker() {
  if (!("serviceWorker" in navigator)) return false;
  try {
    // Add version query to help SW update when you redeploy
    await navigator.serviceWorker.register(`./js/coi-serviceworker.js?v=${BUILD}`, { scope: "./" });
    return true;
  } catch (e) {
    console.warn("COI service worker registration failed:", e);
    return false;
  }
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = els.canvas.getBoundingClientRect();

  els.canvas.width = Math.floor(rect.width * dpr);
  els.canvas.height = Math.floor(rect.height * dpr);

  const c = els.canvas.getContext("2d");
  // draw in CSS pixel coordinates
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return c;
}

function clearCanvas() {
  const c = els.canvas.getContext("2d");
  if (!c) return;
  c.clearRect(0, 0, els.canvas.width, els.canvas.height);
}

// Optional safety: hide any other canvases that might overlay gaze dots
function suppressOtherCanvases() {
  document.querySelectorAll("canvas").forEach((c) => {
    if (c !== els.canvas) c.style.display = "none";
  });
}

let ctx = null;
let seeso = null;
let EasySeeso = null;
let TrackingState = null;
let sdkReady = false;
let tracking = false;

// Calibration UI state
let isCalibrating = false;
let calTarget = null; // {x, y}
let collectTimer = null;

function drawGazeDot(x, y) {
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);

  ctx.beginPath();
  ctx.arc(x, y, 50, 0, Math.PI * 2, true);
  ctx.fillStyle = "#34C759"; // green
  ctx.fill();

  // small crosshair
  ctx.beginPath();
  ctx.moveTo(x - 18, y);
  ctx.lineTo(x + 18, y);
  ctx.moveTo(x, y - 18);
  ctx.lineTo(x, y + 18);
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawCalibrationTarget() {
  if (!ctx) ctx = resizeCanvas();

  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  if (!calTarget) return;

  const { x, y } = calTarget;

  // Outer ring
  ctx.beginPath();
  ctx.arc(x, y, 44, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(52,199,89,0.45)";
  ctx.lineWidth = 5;
  ctx.stroke();

  // Inner solid dot
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.fillStyle = "#34C759"; // green
  ctx.fill();

  // Crosshair
  ctx.beginPath();
  ctx.moveTo(x - 20, y);
  ctx.lineTo(x + 20, y);
  ctx.moveTo(x, y - 20);
  ctx.lineTo(x, y + 20);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function onGaze(gazeInfo) {
  if (!ctx) ctx = resizeCanvas();

  // During calibration, do NOT draw gaze dot (otherwise it erases the calibration target)
  if (isCalibrating) return;

  // Only draw when tracking is successful.
  if (gazeInfo?.trackingState !== TrackingState?.SUCCESS) return;

  const x = gazeInfo.x;
  const y = gazeInfo.y;

  drawGazeDot(x, y);
}

function onDebug(_debugInfo) {
  // Keep this lightweight; debugInfo can be frequent.
}

async function loadSDK() {
  setPill(els.pillSdk, `SDK: loading… (${BUILD})`);

  // 1) Load seeso.js (webpack module file)
  const seesoExports = await loadWebpackModule("./seeso.js", (id) => {
    // seeso.js only imports core-js polyfills; ignore
    return undefined;
  });

  TrackingState = seesoExports.TrackingState;

  // 2) Load easy-seeso.js, resolving its import of seeso/dist/seeso.js to the exports above
  const easyExports = await loadWebpackModule("./easy-seeso.js", (id) => {
    if (id === "./node_modules/seeso/dist/seeso.js") return seesoExports;
    return undefined;
  });

  EasySeeso = easyExports.default;

  setPill(els.pillSdk, `SDK: loaded (${BUILD})`);
  return { seesoExports, easyExports };
}

async function initSDK() {
  const licenseKey = LICENSE_KEY;
  if (!licenseKey) throw new Error("License key is not configured.");

  const userId = getOrCreateUserId();

  seeso = new EasySeeso();

  const afterInitialized = () => {
    sdkReady = true;
    setPill(els.pillSdk, `SDK: initialized (${BUILD})`);
  };

  const afterFailed = () => {
    sdkReady = false;
    setPill(els.pillSdk, "SDK: init failed");
  };

  await seeso.init(licenseKey, afterInitialized, afterFailed);

  // Apply calibration data (from URL or cached)
  // (URL support remains for backward compatibility; no longer used for normal calibration flow.)
  const calFromUrl = parseCalibrationDataFromUrl();
  if (calFromUrl) {
    setCachedCalibration(userId, calFromUrl);
    await seeso.setCalibrationData(calFromUrl);
  } else {
    const cached = getCachedCalibration(userId);
    if (cached) {
      await seeso.setCalibrationData(cached);
    }
  }
}

async function startTracking() {
  if (!sdkReady) await initSDK();

  setPill(els.pillPerm, "Camera: requesting…");

  try {
    const ok = await seeso.startTracking(onGaze, onDebug);
    tracking = !!ok;

    setPill(els.pillPerm, "Camera: granted");
    setPill(els.pillTrack, tracking ? "Tracking: ON" : "Tracking: failed");
  } catch (e) {
    tracking = false;
    setPill(els.pillPerm, "Camera: denied / error");
    setPill(els.pillTrack, "Tracking: OFF");
    console.error(e);
    alert("Camera permission failed or was blocked by the browser. Please allow camera access and try again.");
  }
}

function stopTracking() {
  try {
    // Stop calibration if running
    if (isCalibrating) {
      try {
        seeso?.stopCalibration?.();
      } catch (_) {}
    }
  } catch (_) {}

  isCalibrating = false;
  calTarget = null;
  if (collectTimer) {
    clearTimeout(collectTimer);
    collectTimer = null;
  }

  try {
    seeso?.stopTracking?.();
  } catch (e) {
    console.warn(e);
  }

  tracking = false;
  setPill(els.pillTrack, "Tracking: OFF");
  clearCanvas();
}

/**
 * In-page calibration (NO redirect to external QuickStart page).
 * Calibration target is drawn on our own canvas in GREEN.
 *
 * IMPORTANT: EasySeeso.startCalibration triggers next-point callbacks,
 * but sample collection must be started by calling seeso.startCollectSamples().
 */
async function calibrate() {
  if (isCalibrating) return;

  if (!sdkReady) await initSDK();

  // Start tracking first (needs camera stream active)
  if (!tracking) {
    await startTracking();
    if (!tracking) return;
  }

  const userId = getOrCreateUserId();
  const points = parseInt(els.calPoints.value, 10) || 5;

  isCalibrating = true;
  calTarget = null;
  setPill(els.pillTrack, `Calibration: starting (${points} pt)`);

  // Start calibration in-page
  const ok = seeso.startCalibration(
    // onCalibrationNextPoint(x, y)
    (x, y) => {
      calTarget = { x, y };
      drawCalibrationTarget();

      // Give user a short moment to focus, then collect samples.
      // (This is the key step QuickStart page does internally.)
      if (collectTimer) clearTimeout(collectTimer);
      collectTimer = setTimeout(() => {
        try {
          seeso.startCollectSamples();
        } catch (e) {
          console.warn("startCollectSamples failed:", e);
        }
      }, 500);
    },

    // onCalibrationProgress(progress: 0..1)
    (p) => {
      const pct = Math.max(0, Math.min(100, Math.round((p || 0) * 100)));
      setPill(els.pillTrack, `Calibration: ${pct}%`);
    },

    // onCalibrationFinished(calibrationDataString)
    async (calibrationDataString) => {
      isCalibrating = false;
      calTarget = null;
      if (collectTimer) {
        clearTimeout(collectTimer);
        collectTimer = null;
      }

      try {
        // Save + apply calibration
        setCachedCalibration(userId, calibrationDataString);
        await seeso.setCalibrationData(calibrationDataString);

        setPill(els.pillTrack, "Tracking: ON");
        clearCanvas();
      } catch (e) {
        console.error(e);
        setPill(els.pillTrack, "Calibration: finished (apply failed)");
      }
    },

    points
  );

  if (!ok) {
    isCalibrating = false;
    calTarget = null;
    setPill(els.pillTrack, "Calibration: failed to start");
  }
}

async function main() {
  // Canvas init
  ctx = resizeCanvas();
  suppressOtherCanvases();
  window.addEventListener("resize", () => {
    ctx = resizeCanvas();
  });

  // COI status + SW
  const swOk = await registerCOIServiceWorker();
  setPill(els.pillCoi, `COI: ${crossOriginIsolated ? "on" : (swOk ? "pending reload" : "off")}`);

  // Load SDK sources
  await loadSDK();

  // Buttons
  els.btnStart?.addEventListener("click", startTracking);
  els.btnStop?.addEventListener("click", stopTracking);
  els.btnCal?.addEventListener("click", calibrate);
  els.btnClear?.addEventListener("click", clearCanvas);

  setPill(els.pillTrack, "Tracking: OFF");
  setPill(els.pillPerm, "Camera: idle");

  // Auto-calibrate immediately on first load (no button click), then auto-start tracking after calibration.
  // If cached calibration exists (or legacy ?calibrationData exists), just start tracking.
  const userId = getOrCreateUserId();
  const hasCalibrationData = !!parseCalibrationDataFromUrl() || !!getCachedCalibration(userId);

  setTimeout(() => {
    if (hasCalibrationData) {
      startTracking();
    } else {
      calibrate();
    }
  }, 300);
}

main().catch((e) => {
  console.error(e);
  alert("Failed to start app: " + (e?.message || e));
});
