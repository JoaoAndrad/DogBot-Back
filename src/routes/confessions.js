const express = require("express");
const router = express.Router();
const authHeader = require("../middleware/authHeader");
const confessionsService = require("../services/confessionsService");

// Protected by authHeader in api.js mount
router.get("/balance", async (req, res) => {
  try {
    const senderNumber = req.query.senderNumber;
    if (!senderNumber)
      return res.status(400).json({ error: "missing_senderNumber" });
    const balance = await confessionsService.getBalance(senderNumber);
    return res.json({ ok: true, balance });
  } catch (err) {
    console.error(
      "[confessions] balance error",
      err && err.message ? err.message : err
    );
    return res.status(500).json({ error: "internal_error" });
  }
});

router.post("/consume", async (req, res) => {
  try {
    const senderNumber =
      req.body.senderNumber || (req.body.user && req.body.user.senderNumber);
    if (!senderNumber)
      return res.status(400).json({ error: "missing_senderNumber" });

    const result = await confessionsService.consumeBalance(senderNumber);
    if (!result.success) {
      if (result.reason === "insufficient_balance")
        return res
          .status(409)
          .json({ ok: false, reason: "insufficient_balance" });
      return res.status(400).json({ ok: false, reason: result.reason });
    }
    return res.json({ ok: true, remaining: result.remaining });
  } catch (err) {
    console.error(
      "[confessions] consume error",
      err && err.message ? err.message : err
    );
    if (err.message === "user_not_found")
      return res.status(404).json({ error: "user_not_found" });
    return res.status(500).json({ error: "internal_error" });
  }
});

module.exports = router;
