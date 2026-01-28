import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  listBeneficiaries,
  createBeneficiary,
  deleteBeneficiary,
} from "../controllers/beneficiaryController.js";

export const beneficiaryRouter = express.Router();

beneficiaryRouter.get("/", protect, listBeneficiaries);
beneficiaryRouter.post("/", protect, createBeneficiary);
beneficiaryRouter.delete("/:id", protect, deleteBeneficiary);
