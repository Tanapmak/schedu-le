import { Router } from "express";
import * as ctrl from "../controllers/dayoffController.js";

const router = new Router();

router
    .get("/", ctrl.getAllDayOffs)
    .get("/:id", ctrl.getDayOffByID)
    .post("/", ctrl.createDayOff)
    .put("/:id", ctrl.updateDayOff)
    .patch("/:id", ctrl.patchDayOffStatus)
    .delete("/:id", ctrl.deleteDayOff);

export default router;