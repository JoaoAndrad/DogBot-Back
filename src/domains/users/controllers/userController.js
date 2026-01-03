const express = require("express");
const router = express.Router();
const userRepo = require("../repo/userRepo");
const logger = require("../../../lib/logger");

/**
 * POST /api/users/upsert
 * Find or create user by identifier, with intelligent fallback strategies
 *
 * Body:
 * {
 *   identifier: "558182132346@c.us" or "185495510364403@lid",
 *   push_name: "Dogão",
 *   display_name: "Dogão da Academia",
 *   observed_from: "5581999999999-1234567890@g.us" (chat_id),
 *   observed_lid: "185495510364403" (optional, if from group)
 * }
 *
 * Returns: User object with UUID id
 */
router.post("/upsert", async (req, res) => {
  try {
    const { identifier, push_name, display_name, observed_from, observed_lid } =
      req.body;

    if (!identifier) {
      return res.status(400).json({
        error: "missing_identifier",
        message: "Field 'identifier' is required",
      });
    }

    const user = await userRepo.findOrCreateUser({
      identifier,
      push_name,
      display_name,
      observed_from,
      observed_lid,
    });

    return res.json({
      success: true,
      user: {
        id: user.id,
        sender_number: user.sender_number,
        identifiers: user.identifiers,
        push_name: user.push_name,
        display_name: user.display_name,
        created_at: user.created_at,
        last_seen: user.last_seen,
      },
    });
  } catch (err) {
    console.log("[POST /api/users/upsert] Error:", err);
    return res.status(500).json({
      error: "upsert_failed",
      message: err.message,
    });
  }
});

/**
 * GET /api/users/by-identifier/:identifier
 * Lookup user by any known identifier
 *
 * Returns: User object or 404
 */
router.get("/by-identifier/:identifier", async (req, res) => {
  try {
    const { identifier } = req.params;

    if (!identifier) {
      return res.status(400).json({
        error: "missing_identifier",
        message: "Identifier parameter is required",
      });
    }

    // Try exact match first
    let user = await userRepo.findByIdentifierExact(identifier);

    // Fallback to base number
    if (!user) {
      const baseNumber = userRepo.extractBaseNumber(identifier);
      if (baseNumber && baseNumber !== identifier) {
        user = await userRepo.findByBaseNumber(baseNumber);
      }
    }

    if (!user) {
      return res.status(404).json({
        error: "user_not_found",
        message: `No user found with identifier: ${identifier}`,
      });
    }

    // Sanitize BigInt fields (e.g., ts) to strings for JSON serialization
    const pushNameHistory = (user.pushNameHistory || []).map((h) => ({
      id: h.id,
      push_name: h.push_name,
      observed_from: h.observed_from,
      observed_lid: h.observed_lid,
      ts: h.ts ? String(h.ts) : h.ts,
    }));

    return res.json({
      success: true,
      user: {
        id: user.id,
        sender_number: user.sender_number,
        identifiers: user.identifiers,
        push_name: user.push_name,
        display_name: user.display_name,
        created_at: user.created_at ? String(user.created_at) : user.created_at,
        last_seen: user.last_seen ? String(user.last_seen) : user.last_seen,
        push_name_history: pushNameHistory,
      },
    });
  } catch (err) {
    console.log("[GET /api/users/by-identifier/:identifier] Error:", err);
    return res.status(500).json({
      error: "lookup_failed",
      message: err.message,
    });
  }
});

/**
 * GET /api/users/:id
 * Get user by UUID
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const user = await userRepo.findUserById(id);

    if (!user) {
      return res.status(404).json({
        error: "user_not_found",
        message: `User with id ${id} not found`,
      });
    }

    return res.json({
      success: true,
      user,
    });
  } catch (err) {
    console.log("[GET /api/users/:id] Error:", err);
    return res.status(500).json({
      error: "fetch_failed",
      message: err.message,
    });
  }
});

/**
 * GET /api/users
 * List users with pagination and search
 */
router.get("/", async (req, res) => {
  try {
    const { page, per_page, q, is_active } = req.query;

    const result = await userRepo.findUsers({
      page: page ? parseInt(page) : 1,
      per_page: per_page ? parseInt(per_page) : 20,
      q,
      is_active:
        is_active === "true" ? true : is_active === "false" ? false : undefined,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.log("[GET /api/users] Error:", err);
    return res.status(500).json({
      error: "list_failed",
      message: err.message,
    });
  }
});

module.exports = router;
