import { Router } from "express";
import * as ctrl from "../controllers/summaryController.js";

const router = new Router();

router
    .get("/", ctrl.getSummaryData)

export default router;