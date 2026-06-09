const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const authenticate = require("../middleware/auth");

router.use(authenticate);

router.get("/", async (req, res) => {
  const leaderboard = await prisma.user.findMany({
    take: 5,
    orderBy: {
      attempts: { _count: "desc" },
    },
    select: {
      id: true,
      name: true,
      _count: { select: { attempts: true } },
    },
  });

  res.json(
    leaderboard.map((u, i) => ({
      rank: i + 1,
      userId: u.id,
      name: u.name,
      attemptCount: u._count.attempts,
    }))
  );
});

module.exports = router;