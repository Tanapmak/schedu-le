import { Router } from "express";
import * as ctrl from "../controllers/personnelController.js";

const router = new Router();

router
    .get("/", ctrl.getAllPersonnel)
    .get("/mc", ctrl.getAllMC)
    .get("/pd", ctrl.getAllPD)
    .post("/", ctrl.createPersonnel)
    .get("/:id", ctrl.getPersonnelById)
    .put("/:id", ctrl.updatePersonnel)
    .delete("/:id", ctrl.deletePersonnel);

export default router;