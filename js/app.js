// js/app.js
import { loadWebpackModule } from "./webpack-loader.js";

const LICENSE_KEY = "dev_1ntzip9admm6g0upynw3gooycnecx0vl93hz8nox"; // Key is not shown in the UI.

const els = {  calPoints: document.getElementById("calPoints"),
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

function setPill(el, text) { el.textContent = text; }

function getOrCreateUserId() {
  const key = "eyedid_user_id";
  let v = localStorage.getItem(key);
  if (!v) {
    v = "u_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
    localStorage.setItem(key, v);
  }
  return v;
}

function parseCalibrationDataFromUrl() {
  // URL example: https://.../index.html?calibrationData=....
  const sp = new URLSearchParams(location.search);
  const data = sp.get("calibrationData");
  return data ? decodeURIComponent(data) : null;
}

async function registerCOIServiceWorker() {
  // Must be same-origin; on GitHub Pages, this file is hosted alongside your site.
  if (!("serviceWorker" in navigator)) return false;
  try {
    await navigator.serviceWorker.register("./js/coi-serviceworker.js", { scope: "./" });
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
  const ctx = els.canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function clearCanvas() {
  const ctx = els.canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
}

let ctx = null;
let seeso = null;
let EasySeeso = null;
let TrackingState = null;
let sdkReady = false;
let tracking = false;

function onGaze(gazeInfo) {
  if (!ctx) ctx = resizeCanvas();

  // Only draw when tracking is successful.
  if (gazeInfo?.trackingState !== TrackingState?.SUCCESS) return;

  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);

  const x = gazeInfo.x;
  const y = gazeInfo.y;

  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2, true);
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

function onDebug(debugInfo) {
  // Keep this lightweight; debugInfo can be frequent.
  // console.log("debug", debugInfo);
}

async function loadSDK() {
  setPill(els.pillSdk, "SDK: loading…");

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

  setPill(els.pillSdk, "SDK: loaded");
  return { seesoExports, easyExports };
}

async function initSDK() {
  const licenseKey = LICENSE_KEY;
  if (!licenseKey) throw new Error("License key is not configured.");

  const userId = getOrCreateUserId();

  seeso = new EasySeeso();

  const afterInitialized = () => {
    sdkReady = true;
    setPill(els.pillSdk, "SDK: initialized");
  };

  const afterFailed = () => {
    sdkReady = false;
    setPill(els.pillSdk, "SDK: init failed");
  };

  await seeso.init(licenseKey, afterInitialized, afterFailed);

  // Apply calibration data (from URL or cached)
  const calFromUrl = parseCalibrationDataFromUrl();
  if (calFromUrl) {
    localStorage.setItem(`eyedid_calibration_${userId}`, calFromUrl);
    await seeso.setCalibrationData(calFromUrl);
  } else {
    const cached = localStorage.getItem(`eyedid_calibration_${userId}`);
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
    seeso?.stopTracking?.();
  } catch (e) {
    console.warn(e);
  }
  tracking = false;
  setPill(els.pillTrack, "Tracking: OFF");
}

function calibrate() {
  const licenseKey = LICENSE_KEY;
  const userId = getOrCreateUserId();
  const points = parseInt(els.calPoints.value, 10) || 5;

  // Redirect URL should be the exact GitHub Pages URL of this page (without query string).
  const redirectUrl = `${location.origin}${location.pathname}`;

  // This moves the browser to the calibration service page and then returns here with ?calibrationData=...
  EasySeeso.openCalibrationPageQuickStart(licenseKey, userId, redirectUrl, points);
}

async function main() {  // UI init

  // Resize
  ctx = resizeCanvas();
  window.addEventListener("resize", () => { ctx = resizeCanvas(); });

  // COI status + SW
  const swOk = await registerCOIServiceWorker();
  setPill(els.pillCoi, `COI: ${crossOriginIsolated ? "on" : (swOk ? "pending reload" : "off")}`);

  // Load SDK sources
  await loadSDK();

  // Buttons
  els.btnStart.addEventListener("click", startTracking);
  els.btnStop.addEventListener("click", stopTracking);
  els.btnCal.addEventListener("click", calibrate);
  els.btnClear.addEventListener("click", clearCanvas);

  setPill(els.pillTrack, "Tracking: OFF");
  setPill(els.pillPerm, "Camera: idle");

  // Auto-calibrate immediately on first load (no button click), then auto-start tracking when calibration returns.
  // If the URL already contains ?calibrationData=..., we skip calibration and start tracking.
  const hasCalibrationData = !!parseCalibrationDataFromUrl();
  setTimeout(() => { hasCalibrationData ? startTracking() : calibrate(); }, 300);
}

main().catch((e) => {
  console.error(e);
  alert("Failed to start app: " + (e?.message || e));
});
