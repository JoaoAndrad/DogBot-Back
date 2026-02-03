const express = require("express");
const router = express.Router();
const authHeader = require("../middleware/authHeader");

// Apply auth header middleware
router.use(authHeader);

/**
 * GET /api/broadcasts/count
 * Get count of registered users who will receive broadcasts
 */
router.get("/count", async (req, res) => {
  try {
    const { getPrisma } = require("../db");
    const prisma = getPrisma();

    // Count all users (sender_number is required/unique, so all users are valid recipients)
    const count = await prisma.user.count();

    res.json({ count });
  } catch (err) {
    console.error("[GET /api/broadcasts/count] Error:", err);
    res.status(500).json({
      error: "count_failed",
      message: err.message,
    });
  }
});

/**
 * POST /api/broadcasts
 * Create a new broadcast
 * Body: { message: string, createdBy: string (WhatsApp ID) }
 */
router.post("/", express.json(), async (req, res) => {
  try {
    const { message, createdBy } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "missing_message",
        message: "Message is required",
      });
    }

    if (!createdBy) {
      return res.status(400).json({
        error: "missing_creator",
        message: "createdBy (WhatsApp ID) is required",
      });
    }

    // TODO: Verify that createdBy is an admin user
    // For now, we'll trust the frontend verification

    const { getPrisma } = require("../db");
    const prisma = getPrisma();

    // Get all registered users (sender_number is required/unique, so all users are valid)
    const users = await prisma.user.findMany({
      select: {
        id: true,
        sender_number: true,
      },
    });

    // Create broadcast record (for now, we'll use a simple JSON storage approach)
    // In the future, this will be a proper Broadcast model with BroadcastRecipient entries
    const broadcastId = `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store broadcast metadata in a simple way for now
    // TODO: Replace with proper Broadcast model when implementing worker
    const broadcastData = {
      id: broadcastId,
      message: message.trim(),
      createdBy,
      createdAt: new Date().toISOString(),
      recipientCount: users.length,
      recipients: users.map((u) => ({
        userId: u.id,
        whatsappId: u.sender_number,
        status: "pending",
      })),
      status: "pending",
    };

    // For now, we'll just return the broadcast info
    // In the future, this will be queued for the worker to process
    console.log(
      `[Broadcast] Created broadcast ${broadcastId} for ${users.length} users`,
    );
    console.log(`[Broadcast] Message: ${message.trim().substring(0, 50)}...`);
    console.log(`[Broadcast] TODO: Implement worker to actually send messages`);

    res.status(201).json({
      success: true,
      id: broadcastId,
      recipientCount: users.length,
      status: "pending",
      message:
        "Broadcast created (worker not yet implemented - messages will not be sent)",
    });
  } catch (err) {
    console.error("[POST /api/broadcasts] Error:", err);
    res.status(500).json({
      error: "broadcast_failed",
      message: err.message,
    });
  }
});

/**
 * GET /api/broadcasts/:id
 * Get broadcast status by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // TODO: Implement proper broadcast status lookup from database
    res.json({
      id,
      status: "not_implemented",
      message: "Broadcast status tracking not yet implemented",
    });
  } catch (err) {
    console.error("[GET /api/broadcasts/:id] Error:", err);
    res.status(500).json({
      error: "status_failed",
      message: err.message,
    });
  }
});

module.exports = router;
