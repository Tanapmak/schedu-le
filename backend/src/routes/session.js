import { Router } from "express";
import * as ctrl from "../controllers/sessionController.js";

const router = new Router();

router
    .get("/", ctrl.getAllSessions)
    .get("/:id", ctrl.getSessionById)
    .post("/:id", ctrl.createSession)
    .put("/:id", ctrl.updateSession)
    .delete("/:id", ctrl.deleteSession);

export default router;