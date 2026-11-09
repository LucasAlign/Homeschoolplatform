import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import coursesRouter from "./courses";
import unitsRouter from "./units";
import lessonsRouter from "./lessons";
import studentsRouter from "./students";
import { requireLocalSynthetic } from "../lib/access";
import workRouter from "./work";
import authRouter from "./auth";
import { requireSession, requireParent } from "../lib/session";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireLocalSynthetic);
router.use(authRouter);
router.use(requireSession);
router.use(workRouter);
router.use(studentsRouter);
router.use(requireParent);
router.use(dashboardRouter);
router.use(coursesRouter);
router.use(unitsRouter);
router.use(lessonsRouter);

export default router;
