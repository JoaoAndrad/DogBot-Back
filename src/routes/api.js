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
    e && e.message ? e.message : e,
  );
  // Fallback: expose a helpful 500 on /polls so requests don't silently 404
  const fallback = express.Router();
  fallback.get("/", (req, res) =>
    res.status(500).json({
      error: "polls_controller_failed_to_load",
      details: String(e && e.message ? e.message : e),
    }),
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
    e && e.message ? e.message : e,
  );
  const fallback = express.Router();
  fallback.get("/", (req, res) =>
    res.status(500).json({
      error: "messages_controller_failed_to_load",
      details: String(e && e.message ? e.message : e),
    }),
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
    e && e.message ? e.message : e,
  );
  const fallback = express.Router();
  fallback.get("/", (req, res) =>
    res.status(500).json({
      error: "users_controller_failed_to_load",
      details: String(e && e.message ? e.message : e),
    }),
  );
  router.use("/users", fallback);
}

// confessions (internal)
try {
  const confessions = require("./confessions");
  router.use("/confessions", authHeader, confessions);
  console.info("[routes/api] mounted /api/confessions");
} catch (e) {
  console.log(
    "[routes/api] failed to mount /api/confessions routes:",
    e && e.message ? e.message : e,
  );
  const fallback = express.Router();
  fallback.get("/", (req, res) =>
    res.status(500).json({
      error: "confessions_routes_failed_to_load",
      details: String(e && e.message ? e.message : e),
    }),
  );
  router.use("/confessions", fallback);
}

// menu state for interactive flows
try {
  const menuStateController = require("../domains/menu/controllers/menuStateController");
  router.use("/menu", authHeader, menuStateController);
  console.info("[routes/api] mounted /api/menu");
} catch (e) {
  console.log(
    "[routes/api] failed to mount /api/menu controller:",
    e && e.message ? e.message : e,
  );
  const fallback = express.Router();
  fallback.get("/", (req, res) =>
    res.status(500).json({
      error: "menu_controller_failed_to_load",
      details: String(e && e.message ? e.message : e),
    }),
  );
  router.use("/menu", fallback);
}

// spotify history & stats
try {
  const spotifyHistory = require("./spotifyHistory");
  router.use("/spotify", authHeader, spotifyHistory);
  console.info("[routes/api] mounted /api/spotify");
} catch (e) {
  console.log(
    "[routes/api] failed to mount /api/spotify routes:",
    e && e.message ? e.message : e,
  );
  const fallback = express.Router();
  fallback.get("/", (req, res) =>
    res.status(500).json({
      error: "spotify_routes_failed_to_load",
      details: String(e && e.message ? e.message : e),
    }),
  );
  router.use("/spotify", fallback);
}

// admin spotify (admin UI)
try {
  const adminSpotify = require("./adminSpotify");
  router.use("/admin/spotify", adminSpotify);
  console.info("[routes/api] mounted /api/admin/spotify");
} catch (e) {
  console.log(
    "[routes/api] failed to mount /api/admin/spotify routes:",
    e && e.message ? e.message : e,
  );
  const fallback = express.Router();
  fallback.get("/", (req, res) =>
    res.status(500).json({
      error: "admin_spotify_routes_failed_to_load",
      details: String(e && e.message ? e.message : e),
    }),
  );
  router.use("/admin/spotify", fallback);
}

// collaborative group listening
try {
  const groupController = require("../domains/spotify/controllers/groupController");
  router.use("/groups", authHeader, groupController);
  console.info("[routes/api] mounted /api/groups");
} catch (e) {
  console.log(
    "[routes/api] failed to mount /api/groups routes:",
    e && e.message ? e.message : e,
  );
  const fallback = express.Router();
  fallback.get("/", (req, res) =>
    res.status(500).json({
      error: "groups_routes_failed_to_load",
      details: String(e && e.message ? e.message : e),
    }),
  );
  router.use("/groups", fallback);
}

// broadcasts
try {
  const broadcasts = require("./broadcasts");
  router.use("/broadcasts", broadcasts);
  console.info("[routes/api] mounted /api/broadcasts");
} catch (e) {
  console.log(
    "[routes/api] failed to mount /api/broadcasts routes:",
    e && e.message ? e.message : e,
  );
  const fallback = express.Router();
  fallback.get("/", (req, res) =>
    res.status(500).json({
      error: "broadcasts_routes_failed_to_load",
      details: String(e && e.message ? e.message : e),
    }),
  );
  router.use("/broadcasts", fallback);
}

module.exports = router;
