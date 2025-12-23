// Controller for polls API
const express = require("express");
const router = express.Router();
const service = require("../services/pollService");

router.use(express.json());

// Create / save poll (frontend posts the message id as `id`)
router.post("/", async (req, res) => {
  try {
    const payload = req.body || {};
    const created = await service.createPoll(payload);
    res.status(201).json(created);
  } catch (err) {
    res
      .status(500)
      .json({
        error: "Failed to create poll",
        details: err && err.message ? err.message : String(err),
      });
  }
});

// List polls, optional ?chat_id= filter
router.get("/", async (req, res) => {
  try {
    const { chat_id } = req.query || {};
    const rows = await service.listPolls({ chat_id });
    res.json(rows);
  } catch (err) {
    res
      .status(500)
      .json({
        error: "Failed to list polls",
        details: err && err.message ? err.message : String(err),
      });
  }
});

// Get single poll by id
router.get("/:id/", async (req, res) => {
  try {
    const id = req.params.id;
    const p = await service.getPoll(id);
    if (!p) return res.status(404).json({ error: "Not found" });
    res.json(p);
  } catch (err) {
    res
      .status(500)
      .json({
        error: "Failed to get poll",
        details: err && err.message ? err.message : String(err),
      });
  }
});

// Delete poll
router.delete("/:id/", async (req, res) => {
  try {
    const id = req.params.id;
    await service.removePoll(id);
    res.json({ ok: true });
  } catch (err) {
    res
      .status(500)
      .json({
        error: "Failed to delete poll",
        details: err && err.message ? err.message : String(err),
      });
  }
});

// Record vote: POST /:id/votes/
router.post("/:id/votes/", async (req, res) => {
  try {
    const id = req.params.id;
    const payload = req.body || {};
    const created = await service.recordVote(id, payload);
    res.status(201).json(created);
  } catch (err) {
    res
      .status(500)
      .json({
        error: "Failed to record vote",
        details: err && err.message ? err.message : String(err),
      });
  }
});

module.exports = router;
