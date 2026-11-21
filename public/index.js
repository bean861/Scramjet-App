"use strict";
/**
 * HYDRO bridge for MercuryWorkshop/Scramjet-App.
 * Replace Scramjet-App/public/index.js with this file to allow HYDRO's top
 * address/search bar to navigate the embedded Scramjet app via postMessage.
 */
const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const searchEngine = document.getElementById("sj-search-engine");
const error = document.getElementById("sj-error");
const errorCode = document.getElementById("sj-error-code");
const { ScramjetController } = $scramjetLoadController();

const scramjet = new ScramjetController({
  files: {
    wasm: "/scram/scramjet.wasm.wasm",
    all: "/scram/scramjet.all.js",
    sync: "/scram/scramjet.sync.js",
  },
});
scramjet.init();

const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
let activeFrame = null;

async function navigate(input) {
  const destination = search(String(input || "").trim(), searchEngine.value);
  if (!destination) return;

  try {
    await registerSW();
  } catch (err) {
    error.textContent = "Failed to register service worker.";
    errorCode.textContent = String(err);
    throw err;
  }

  const wispUrl =
    (location.protocol === "https:" ? "wss" : "ws") +
    "://" + location.host + "/wisp/";

  if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
    await connection.setTransport("/libcurl/index.mjs", [
      { websocket: wispUrl },
    ]);
  }

  // Reuse the Scramjet demo's single viewing area rather than stacking frames.
  if (activeFrame?.frame?.isConnected) activeFrame.frame.remove();
  activeFrame = scramjet.createFrame();
  activeFrame.frame.id = "sj-frame";
  document.body.appendChild(activeFrame.frame);
  activeFrame.go(destination);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await navigate(address.value);
  } catch (err) {
    error.textContent = "Failed to open that address.";
    errorCode.textContent = String(err);
  }
});

// Only accept navigation messages from the page that embedded this instance.
// HYDRO sets strict-origin-when-cross-origin so document.referrer exposes the
// parent origin without disclosing its full page URL.
let allowedParentOrigin = "";
try {
  allowedParentOrigin = document.referrer ? new URL(document.referrer).origin : "";
} catch {
  allowedParentOrigin = "";
}

window.addEventListener("message", async (event) => {
  if (!allowedParentOrigin || event.origin !== allowedParentOrigin || event.source !== window.parent) return;
  const data = event.data;
  if (!data || data.type !== "hydro:navigate" || typeof data.url !== "string" || data.url.length > 4096) return;
  try {
    const url = new URL(data.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    address.value = url.href;
    await navigate(url.href);
  } catch (err) {
    error.textContent = "HYDRO could not open that address.";
    errorCode.textContent = String(err);
  }
});

