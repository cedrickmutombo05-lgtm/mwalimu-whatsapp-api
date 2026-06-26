
// =========================================================
// LOGGER – JOURNALISATION CENTRALISÉE
// =========================================================

function logInfo(event, data = {}) {
  console.log(JSON.stringify({
    level: "info",
    event,
    ts: new Date().toISOString(),
    ...data
  }));
}

function logWarn(event, data = {}) {
  console.warn(JSON.stringify({
    level: "warn",
    event,
    ts: new Date().toISOString(),
    ...data
  }));
}

function logError(event, error, data = {}) {
  console.error(JSON.stringify({
    level: "error",
    event,
    ts: new Date().toISOString(),
    message: error?.message || String(error),
    stack: error?.stack || null,
    data
  }));
}

module.exports = {
  logInfo,
  logWarn,
  logError
};
