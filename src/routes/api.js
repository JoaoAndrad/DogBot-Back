const express = require("express");
const router = express.Router();

// Mount domain routers (lazy require to avoid startup errors)
try {
  const pollController = require("../domains/polls/controllers/pollController");
  router.use("/polls", pollController);
} catch (e) {}

try {
  const messageController = require("../domains/messages/controllers/messageController");
  router.use("/messages", messageController);
} catch (e) {}

module.exports = router;
