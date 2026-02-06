// Controller for polls API
const express = require("express");
const router = express.Router();
const service = require("../services/pollService");

router.use(express.json());

// Create / save poll (frontend posts the message id as `id`)
router.post("/", async (req, res) => {
  try {
    const payload = req.body || {};
    console.info("[pollController] POST /api/polls/", payload && payload.id);
    const created = await service.createPoll(payload);
    console.info("[pollController] created poll", created && created.id);
    res.status(201).json(created);
  } catch (err) {
    console.log(
      "[pollController] create error",
      err && err.message ? err.message : err,
    );
    res.status(500).json({
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
    console.log(
      "[pollController] list error",
      err && err.message ? err.message : err,
    );
    res.status(500).json({
      error: "Failed to list polls",
      details: err && err.message ? err.message : String(err),
    });
  }
});

// Get single poll by id
router.get("/:id/", async (req, res) => {
  try {
    const id = req.params.id;
    console.info("[pollController] GET /api/polls/:id", id);
    const p = await service.getPoll(id);
    if (!p) {
      console.info("[pollController] GET not found", id);
      return res.status(404).json({ error: "Not found" });
    }
    res.json(p);
  } catch (err) {
    console.log(
      "[pollController] get error",
      err && err.message ? err.message : err,
    );
    res.status(500).json({
      error: "Failed to get poll",
      details: err && err.message ? err.message : String(err),
    });
  }
});

// Delete poll
router.delete("/:id/", async (req, res) => {
  try {
    const id = req.params.id;
    console.info("[pollController] DELETE /api/polls/:id", id);
    await service.removePoll(id);
    console.info("[pollController] deleted", id);
    res.json({ ok: true });
  } catch (err) {
    console.log(
      "[pollController] delete error",
      err && err.message ? err.message : err,
    );
    res.status(500).json({
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
    console.info(
      "[pollController] POST /api/polls/:id/votes",
      id,
      payload && payload.voter_id,
    );
    const created = await service.recordVote(id, payload);
    console.info("[pollController] vote created", created && created.id);
    res.status(201).json(created);
  } catch (err) {
    console.log(
      "[pollController] record vote error",
      err && err.message ? err.message : err,
    );
    res.status(500).json({
      error: "Failed to record vote",
      details: err && err.message ? err.message : String(err),
    });
  }
});

// Get poll state (poll + votes + statistics)
router.get("/:id/state", async (req, res) => {
  try {
    const id = req.params.id;
    console.info("[pollController] GET /api/polls/:id/state", id);
    const state = await service.getPollState(id);
    if (!state) {
      console.info("[pollController] poll state not found", id);
      return res.status(404).json({ error: "Not found" });
    }
    res.json(state);
  } catch (err) {
    console.log(
      "[pollController] get poll state error",
      err && err.message ? err.message : err,
    );
    res.status(500).json({
      error: "Failed to get poll state",
      details: err && err.message ? err.message : String(err),
    });
  }
});

module.exports = router;
