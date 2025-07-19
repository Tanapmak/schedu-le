import { Router } from "express";
import * as ctrl from "../controllers/roomController.js";

const router = new Router();

router
    .get("/", ctrl.getAllRooms)
    .get("/:id", ctrl.getRoomById)
    .post("/", ctrl.createRoom)
    .put("/:id", ctrl.updateRoom)
    .delete("/:id", ctrl.deleteRoom);

export default router;