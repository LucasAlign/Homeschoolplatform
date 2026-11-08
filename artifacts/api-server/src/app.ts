import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json({ limit: "3mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Do not return SQL, uploaded evidence, or stack traces to the browser.
app.use(
  (
    error: { status?: number; type?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const status =
      error.type === "entity.too.large"
        ? 413
        : error.status === 400
          ? 400
          : error.status === 429
            ? 429
            : 500;
    res
      .status(status)
      .json({
        error:
          status === 413
            ? "Submission exceeds the upload limit."
            : status === 400
              ? "Invalid request body."
              : "Unable to save or load work. Please retry.",
      });
  },
);

export default app;
