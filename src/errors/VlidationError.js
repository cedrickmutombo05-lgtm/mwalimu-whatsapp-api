
class ValidationError extends Error {
  constructor(message = "Données invalides") {
    super(message);
    this.name = "ValidationError";
    this.code = "VALIDATION_ERROR";
    this.status = 400;
  }
}

module.exports = ValidationError;
