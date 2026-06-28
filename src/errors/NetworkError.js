
class NetworkError extends Error {
  constructor(message = "Problème réseau temporaire") {
    super(message);
    this.name = "NetworkError";
    this.code = "NETWORK_ERROR";
    this.status = 503;
  }
}

module.exports = NetworkError;
