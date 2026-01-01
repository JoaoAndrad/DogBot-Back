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
  console.log(
    "[routes/api] failed to mount /api/polls controller:",
    e && e.message ? e.message : e
  );
  // Fallback: expose a helpful 500 on /polls so requests don't silently 404
  const fallback = express.Router();
  fallback.get("/", (req, res) =>
    res.status(500).json({
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
  console.log(
    "[routes/api] failed to mount /api/messages controller:",
    e && e.message ? e.message : e
  );
  const fallback = express.Router();
  fallback.get("/", (req, res) =>
    res.status(500).json({
      error: "messages_controller_failed_to_load",
      details: String(e && e.message ? e.message : e),
    })
  );
  router.use("/messages", fallback);
}

// users
try {
  const userController = require("../domains/users/controllers/userController");
  router.use("/users", authHeader, userController);
  console.info("[routes/api] mounted /api/users");
} catch (e) {
  console.log(
    "[routes/api] failed to mount /api/users controller:",
    e && e.message ? e.message : e
  );
  const fallback = express.Router();
  fallback.get("/", (req, res) =>
    res.status(500).json({
      error: "users_controller_failed_to_load",
      details: String(e && e.message ? e.message : e),
    })
  );
  router.use("/users", fallback);
}

// spotify history & stats
try {
  const spotifyHistory = require("./spotifyHistory");
  router.use("/spotify", authHeader, spotifyHistory);
  console.info("[routes/api] mounted /api/spotify");
} catch (e) {
  console.log(
    "[routes/api] failed to mount /api/spotify routes:",
    e && e.message ? e.message : e
  );
  const fallback = express.Router();
  fallback.get("/", (req, res) =>
    res.status(500).json({
      error: "spotify_routes_failed_to_load",
      details: String(e && e.message ? e.message : e),
    })
  );
  router.use("/spotify", fallback);
}

module.exports = router;
