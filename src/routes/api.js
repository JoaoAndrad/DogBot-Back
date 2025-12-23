const express = require("express");
const router = express.Router();

// Mount domain routers (lazy require to avoid startup errors)
const authHeader = require("../middleware/authHeader");
try {
  const pollController = require("../domains/polls/controllers/pollController");
  // protect modifying methods with authHeader
  router.use("/polls", authHeader, pollController);
} catch (e) {}

try {
  const messageController = require("../domains/messages/controllers/messageController");
  router.use("/messages", authHeader, messageController);
} catch (e) {}

module.exports = router;
