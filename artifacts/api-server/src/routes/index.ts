import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import coursesRouter from "./courses";
import unitsRouter from "./units";
import lessonsRouter from "./lessons";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(coursesRouter);
router.use(unitsRouter);
router.use(lessonsRouter);

export default router;
