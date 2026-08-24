import express from "express";
import mongoose from "mongoose";
import { Notification } from "../models/Notification.js";
import { protect } from "../middleware/authMiddleware.js";
import { allowBodyFields, allowQueryFields } from "../middleware/allowFields.js";
import { repairUnfundedReversals } from "../utils/reversalIntegrity.js";

export const notificationRouter = express.Router();

notificationRouter.use(protect);

notificationRouter.get("/", allowQueryFields([]), allowBodyFields([]), async (req, res, next) => {
  try {
    await repairUnfundedReversals();
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100).lean(),
      Notification.countDocuments({ userId: req.user._id, readAt: null }),
    ]);
    res.json({ ok: true, unreadCount, notifications: notifications.map((item) => ({ ...item, id: item._id })) });
  } catch (err) {
    next(err);
  }
});

notificationRouter.patch("/:id/read", allowQueryFields([]), allowBodyFields([]), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id || ""))) {
      res.status(400);
      throw new Error("Invalid notification id.");
    }
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { readAt: new Date() } },
      { new: true }
    ).lean();
    if (!notification) {
      res.status(404);
      throw new Error("Notification not found.");
    }
    res.json({ ok: true, notification: { ...notification, id: notification._id } });
  } catch (err) {
    next(err);
  }
});

notificationRouter.patch("/read-all", allowQueryFields([]), allowBodyFields([]), async (req, res, next) => {
  try {
    await Notification.updateMany({ userId: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ ok: true, unreadCount: 0 });
  } catch (err) {
    next(err);
  }
});
