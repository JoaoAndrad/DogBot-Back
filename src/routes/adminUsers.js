const express = require("express");
const basicAuth = require("../middleware/adminAuth");
const userService = require("../domains/users/service/userService");

const router = express.Router();

router.use(basicAuth);

// GET /admin/api/users
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const per_page = parseInt(req.query.per_page || "20", 10);
    const q = req.query.q || undefined;
    const data = await userService.listUsers({ page, per_page, q });
    res.json(data);
  } catch (e) {
    console.error("users list error", e && e.message ? e.message : e);
    res.status(500).json({ error: "Failed to list users" });
  }
});

// POST /admin/api/users
router.post("/", express.json(), async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.sender_number)
      return res.status(400).json({ error: "sender_number is required" });
    const created = await userService.createUser(payload);
    res.status(201).json(created);
  } catch (e) {
    console.error("user create error", e && e.message ? e.message : e);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// GET /admin/api/users/:id
router.get("/:id", async (req, res) => {
  try {
    const user = await userService.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (e) {
    console.error("user detail error", e && e.message ? e.message : e);
    res.status(500).json({ error: "Failed to get user" });
  }
});

// PATCH /admin/api/users/:id
router.patch("/:id", express.json(), async (req, res) => {
  try {
    const id = req.params.id;
    console.debug("[admin] PATCH /admin/api/users/:id body:", req.body);
    // allow updating basic user fields plus sender_number and nested dogfort
    const allowed = [
      "display_name",
      "push_name",
      "metadata",
      "last_known_lid",
      "sender_number",
      "dogfort",
    ];
    const payload = {};
    for (const k of allowed) if (k in req.body) payload[k] = req.body[k];
    if (Object.keys(payload).length === 0)
      return res.status(400).json({ error: "No updatable fields provided" });
    const updated = await userService.updateUser(id, payload);
    res.json(updated);
  } catch (e) {
    console.error("user update error", e && e.message ? e.message : e);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// DELETE /admin/api/users/:id
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await userService.deleteUser(id);
    res.json({ success: true });
  } catch (e) {
    console.error("user delete error", e && e.message ? e.message : e);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// POST /admin/api/users/bulk
router.post("/bulk", express.json(), async (req, res) => {
  try {
    const { ids, action } = req.body || {};
    if (!Array.isArray(ids) || !ids.length)
      return res.status(400).json({ error: "No ids provided" });
    const result = await userService.bulkUsers({ ids, action });
    res.json(result);
  } catch (e) {
    console.error("bulk users error", e && e.message ? e.message : e);
    res.status(500).json({ error: "Failed to perform bulk action" });
  }
});

module.exports = router;
