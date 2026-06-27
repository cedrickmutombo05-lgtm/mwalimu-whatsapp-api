
function horodatage() {
  return new Date().toISOString();
}

function logInfo(event, meta = {}) {
  console.log(JSON.stringify({
    level: "info",
    event,
    ts: horodatage(),
    ...meta
  }));
}

function logWarn(event, meta = {}) {
  console.warn(JSON.stringify({
    level: "warn",
    event,
    ts: horodatage(),
    ...meta
  }));
}

function logError(event, error, meta = {}) {
  console.error(JSON.stringify({
    level: "error",
    event,
    ts: horodatage(),
    message: error?.message || String(error || ""),
    stack: error?.stack || null,
    data: error?.response?.data || null,
    ...meta
  }));
}

module.exports = {
  horodatage,
  logInfo,
  logWarn,
  logError
};
