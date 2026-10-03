// Errors that carry an HTTP status and a message that is safe to show people.
export class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "InputError";
    this.status = status;
  }
}
