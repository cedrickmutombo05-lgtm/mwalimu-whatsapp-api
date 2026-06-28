
class QuotaError extends Error {
  constructor(message = "Quota IA temporairement atteint") {
    super(message);
    this.name = "QuotaError";
    this.code = "QUOTA_ERROR";
    this.status = 429;
  }
}

module.exports = QuotaError;
