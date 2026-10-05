/**
 * Thrown for expected auth failures whose message is already safe to show
 * directly to the user (e.g. "Invalid email or password."). Anything else
 * thrown out of the auth service layer is an unexpected error and should be
 * surfaced to the client as a generic failure, not its raw message.
 */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
