import type {
  NextFunction,
  Request,
  RequestHandler,
  Response
} from "express";

// Wrap async route handlers so any rejected promise reaches the global error
// handler instead of becoming an unhandled rejection. Express 5 supports this
// natively, but the wrapper makes intent explicit and works on either major.
export function asyncHandler<
  Req extends Request = Request,
  Res extends Response = Response
>(
  fn: (req: Req, res: Res, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as Req, res as Res, next)).catch(next);
  };
}
