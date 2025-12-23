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

module.exports = router;
