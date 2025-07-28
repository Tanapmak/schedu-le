import { Router } from "express";
import * as ctrl from "../controllers/sessionController.js";

const router = new Router();

router
    .get("/", ctrl.getAllSessions)
    .get("/dayoff", ctrl.getDayOffSessions)
    .get("/:id", ctrl.getSessionById)
    .post("/", ctrl.createSession)
    .put("/:id", ctrl.updateSession)
    .patch("/:id", ctrl.updateSession)
    .delete("/:id", ctrl.deleteSession);

export default router;