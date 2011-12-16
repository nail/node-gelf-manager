function GELFManagerError(message) {
  Error.call(this);
  Error.captureStackTrace(this, this.constructor);
  this.name = "GELFManagerError";
  this.message = message || "GELFManager Unknown error";
}

GELFManagerError.prototype.__proto__ = Error.prototype;

module.exports = GELFManagerError;
