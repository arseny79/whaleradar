import { Router, Request, Response } from "express";
import { config } from "../config";
import categoryRoutes from "./routes/categories";
import planRoutes from "./routes/plans";
import planAccessRoutes from "./routes/planAccess";
import settingsRoutes from "./routes/settings";
import traderRoutes from "./routes/traders";
import auditLogRoutes from "./routes/auditLog";
import workerLogRoutes from "./routes/workerLogs";

const adminRouter = Router();

function basicAuth(req: Request, res: Response, next: () => void) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="Admin"');
    res.status(401).send("Authentication required");
    return;
  }
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  const [username, password] = decoded.split(":");
  if (username === config.adminUsername && password === config.adminPassword) {
    next();
  } else {
    res.set("WWW-Authenticate", 'Basic realm="Admin"');
    res.status(401).send("Invalid credentials");
  }
}

adminRouter.use(basicAuth);
adminRouter.use(categoryRoutes);
adminRouter.use(planRoutes);
adminRouter.use(planAccessRoutes);
adminRouter.use(settingsRoutes);
adminRouter.use(traderRoutes);
adminRouter.use(auditLogRoutes);
adminRouter.use(workerLogRoutes);

export default adminRouter;
