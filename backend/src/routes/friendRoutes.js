import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  listFriends,
  createFriend,
  deleteFriend,
} from "../controllers/friendController.js";

export const friendRouter = express.Router();

friendRouter.get("/", protect, listFriends);
friendRouter.post("/", protect, createFriend);
friendRouter.delete("/:id", protect, deleteFriend);
