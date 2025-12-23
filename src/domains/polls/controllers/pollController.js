// Controller stub for polls
const express = require("express");
const router = express.Router();

// TODO: implement poll endpoints
router.get("/", (req, res) => res.json({ ok: true, msg: "polls root" }));

module.exports = router;
