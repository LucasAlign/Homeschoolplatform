import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import coursesRouter from "./courses";
import unitsRouter from "./units";
import lessonsRouter from "./lessons";
import studentsRouter from "./students";
import { requireLocalSynthetic } from "../lib/access";
import workRouter from "./work";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireLocalSynthetic);
router.use(workRouter);
router.use(dashboardRouter);
router.use(coursesRouter);
router.use(unitsRouter);
router.use(lessonsRouter);
router.use(studentsRouter);

export default router;
