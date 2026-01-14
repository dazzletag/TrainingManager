import { Router } from "express";
import staffRoutes from "./staff";
import managerRoutes from "./manager";
import adminRoutes from "./admin";

const router = Router();

router.use("/staff", staffRoutes);
router.use("/manager", managerRoutes);
router.use("/admin", adminRoutes);

export default router;
