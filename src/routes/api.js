const express = require("express");
const router = express.Router();

// Mount domain routers (lazy require to avoid startup errors)
const authHeader = require("../middleware/authHeader");

// polls
try {
  const pollController = require("../domains/polls/controllers/pollController");
  router.use("/polls", authHeader, pollController);
  console.info("[routes/api] mounted /api/polls");
} catch (e) {
  console.error(
    "[routes/api] failed to mount /api/polls controller:",
    e && e.message ? e.message : e
  );
  // Fallback: expose a helpful 500 on /polls so requests don't silently 404
  const fallback = express.Router();
  fallback.get("/", (req, res) =>
    res
      .status(500)
      .json({
        error: "polls_controller_failed_to_load",
        details: String(e && e.message ? e.message : e),
      })
  );
  router.use("/polls", fallback);
}

// messages
try {
  const messageController = require("../domains/messages/controllers/messageController");
  router.use("/messages", authHeader, messageController);
  console.info("[routes/api] mounted /api/messages");
} catch (e) {
  console.error(
    "[routes/api] failed to mount /api/messages controller:",
    e && e.message ? e.message : e
  );
  const fallback = express.Router();
  fallback.get("/", (req, res) =>
    res
      .status(500)
      .json({
        error: "messages_controller_failed_to_load",
        details: String(e && e.message ? e.message : e),
      })
  );
  router.use("/messages", fallback);
}

module.exports = router;
