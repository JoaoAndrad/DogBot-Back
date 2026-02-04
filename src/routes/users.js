const express = require("express");
const router = express.Router();
const { prisma } = require("../services/spotifyService");
const logger = require("../lib/logger");

/**
 * GET /api/users/by-sender-number/:senderNumber
 * Get user by WhatsApp sender number
 */
router.get("/by-sender-number/:senderNumber", async (req, res, next) => {
  try {
    const { senderNumber } = req.params;

    if (!senderNumber) {
      return res.status(400).json({
        success: false,
        error: "MISSING_SENDER_NUMBER",
        message: "Sender number is required",
      });
    }

    const user = await prisma.user.findFirst({
      where: { sender_number: senderNumber },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (err) {
    logger.error("[UserRoutes] Error getting user by sender number:", err);
    next(err);
  }
});

module.exports = router;
