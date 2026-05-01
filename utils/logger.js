

function horodatage() {
  return new Date().toISOString();
}

function safeData(data) {
  if (!data) return null;
  try {
    const str = JSON.stringify(data);
    return str.length > 2000 ? str.slice(0, 2000) + "..." : data;
  } catch {
    return null;
  }
}

function logInfo(event, meta = {}) {
  console.log(JSON.stringify({
    level: "info",
    event,
    ts: horodatage(),
    env: process.env.NODE_ENV || "development",
    ...meta
  }));
}

function logWarn(event, meta = {}) {
  console.warn(JSON.stringify({
    level: "warn",
    event,
    ts: horodatage(),
    env: process.env.NODE_ENV || "development",
    ...meta
  }));
}

function logError(event, error, meta = {}) {
  const errorDetails = {
    name: error?.name || "Error",
    message: error?.message || String(error),
    status: error?.status || 500,
    stack: error?.stack || null,
    data: safeData(error?.response?.data || error?.data)
  };

  console.error(JSON.stringify({
    level: "error",
    event,
    ts: horodatage(),
    env: process.env.NODE_ENV || "development",
    ...errorDetails,
    ...meta
  }));
}

module.exports = {
  logInfo,
  logWarn,
  logError
};
