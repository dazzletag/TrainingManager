import { Router } from "express";
import staffRoutes from "./staff";
import managerRoutes from "./manager";
import adminRoutes from "./admin";
import schedulerRoutes from "./scheduler";

const router = Router();

router.use("/staff", staffRoutes);
router.use("/manager", managerRoutes);
router.use("/admin", adminRoutes);
router.use("/scheduler", schedulerRoutes);

export default router;
