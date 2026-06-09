const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const authenticate = require("../middleware/auth");
const isOwner = require("../middleware/isOwner");
const multer = require("multer");
const path = require('path');
const { z } = require("zod");
const { NotFoundError, ValidationError } = require("../lib/errors");

const PostInput = z.object({
  question: z.string().min(1),
  date: z.string().optional(),
  answer: z.string().min(1),
  keywords: z.union([z.string(), z.array(z.string())]).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional().default("medium"),
});

const storage = multer.diskStorage({
  destination: path.join(__dirname, "..", "..", "public", "uploads"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new ValidationError("Only image files are allowed"));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

function formatQuestion(question) {
  return {
    ...question,
    date: question.date.toISOString().split("T")[0],
    keywords: question.keywords.map((k) => k.name),
    difficulty: question.difficulty,
    userName: question.user?.name || null,
    attemptCount: question._count?.attempts ?? 0,
    attempted: question.attempts ? question.attempts.length > 0 : false,
    user: undefined,
    attempts: undefined,
    _count: undefined,
  };
}

// Apply authentication to ALL routes in this router
router.use(authenticate);

// GET 
router.get("/", async (req, res) => {
  const { keyword, difficulty } = req.query;

  const where = {
    ...(keyword ? { keywords: { some: { name: keyword } } } : {}),
    ...(difficulty ? { difficulty } : {}),
  };

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 5));
  const skip = (page - 1) * limit;
  
  const [filteredQuestions, total] = await Promise.all([
    prisma.question.findMany({
        where,
        include: {
        keywords: true,
        user: true,
        attempts: { where: { userId: req.user.userId }, take: 1 },
        _count: { select: { attempts: true } },
    },
        orderBy: { id: "asc" },
        skip,
        take: limit,
    }),
    prisma.question.count({ where }),
]);

  res.json({
    data: filteredQuestions.map(formatQuestion),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
});
});

// GET 
router.get("/quiz", async (req, res) => {
  const { difficulty } = req.query;

  const where = difficulty ? { difficulty } : {};

  const total = await prisma.question.count({ where });
  if (total < 10) {
    return res.json(await prisma.question.findMany({
      where,
      include: {
        keywords: true,
        user: true,
        attempts: { where: { userId: req.user.userId }, take: 1 },
        _count: { select: { attempts: true } },
      },
    }).then(qs => qs.map(formatQuestion)));
  }

  const skip = Math.max(0, Math.floor(Math.random() * (total - 10)));

  const questions = await prisma.question.findMany({
    where,
    include: {
      keywords: true,
      user: true,
      attempts: { where: { userId: req.user.userId }, take: 1 },
      _count: { select: { attempts: true } },
    },
    skip,
    take: 10,
  });

  res.json(questions.map(formatQuestion));
});

// GET 
router.get("/:questionId", async (req, res) => {
  const questionId = Number(req.params.questionId);
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
            keywords: true,
            user: true,
            attempts: { where: { userId: req.user.userId }, take: 1 },
            _count: { select: { attempts: true } },
        },

  });

  if (!question) {
    throw new NotFoundError ("Question not found")
  }

  res.json(formatQuestion(question));
});

// POST
router.post("/", upload.single("image"), async (req, res) => {
  const { question, date, answer, keywords, difficulty } = PostInput.parse(req.body);

  const keywordsArray = Array.isArray(keywords)
  ? keywords
  : typeof keywords === "string" && keywords.trim()
    ? keywords.split(",").map(k => k.trim()).filter(Boolean)
    : [];
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;  

  const newQuestion = await prisma.question.create({
    data: {
      question, 
      date: date ? new Date(date) : new Date(), 
      answer,
      difficulty: difficulty || "medium",
      userId: req.user.userId,
      imageUrl,
      keywords: {
        connectOrCreate: keywordsArray.map((kw) => ({
          where: { name: kw }, create: { name: kw },
        })), 
      },
    },
    include: { keywords: true, user: true},
  });

  res.status(201).json(formatQuestion(newQuestion));
});

// PUT 
router.put("/:questionId", upload.single("image"), isOwner, async (req, res) => {
  const questionId = Number(req.params.questionId);
  const { question, date, answer, keywords, difficulty } = PostInput.parse(req.body);

  const existingQuestion = await prisma.question.findUnique({ where: { id: questionId } });
  if (!existingQuestion) {
    throw new NotFoundError( "Question not found" );
  }

  if (!question || !answer) {
    throw new ValidationError( "Question and answer are required" );
  }

  const keywordsArray = Array.isArray(keywords)
  ? keywords
  : typeof keywords === "string" && keywords.trim()
    ? keywords.split(",").map(k => k.trim()).filter(Boolean)
    : [];
  
  const data = {
    question,
    date: date ? new Date(date) : existingQuestion.date,
    answer,
    difficulty: difficulty || existingQuestion.difficulty,
    keywords: {
      set: [],
      connectOrCreate: keywordsArray.map((kw) => ({
        where: { name: kw },
        create: { name: kw },
      })),
    },
  };

  if (req.file) data.imageUrl = `/uploads/${req.file.filename}`;

  const updatedQuestion = await prisma.question.update({
    where: { id: questionId }, 
    data,
    include: { keywords: true, user: true },
  });

  res.json(formatQuestion(updatedQuestion));
});

// DELETE 
router.delete("/:questionId", isOwner, async (req, res) => {
  const questionId = Number(req.params.questionId);

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { keywords: true, user: true },
  });

  if (!question) {
    throw new NotFoundError("Question not found" );
  }

  await prisma.question.delete({ where: { id: questionId } });

  res.json({
    message: "Question deleted successfully",
    question: formatQuestion(question),
  });
});

// POST
router.post("/:questionId/attempt", async (req, res) => {
    const questionId = Number(req.params.questionId);

    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
        throw new NotFoundError("Question not found" );
    }

    const attempt = await prisma.attempt.upsert({
        where: { userId_questionId: { userId: req.user.userId, questionId } },
        update: {},
        create: { userId: req.user.userId, questionId },
    });

    const attemptCount = await prisma.attempt.count({ where: { questionId } });

    res.status(201).json({
        id: attempt.id,
        questionId,
        attempted: true,
        attemptCount,
        createdAt: attempt.createdAt,
    });
});

// DELETE 
router.delete("/:questionId/attempt", async (req, res) => {
    const questionId = Number(req.params.questionId);

    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
        throw new NotFoundError( "Question not found" );
    }

    await prisma.attempt.deleteMany({
        where: { userId: req.user.userId, questionId },
    });

    const attemptCount = await prisma.attempt.count({ where: { questionId } });

    res.json({ questionId, attempted: false, attemptCount });
});

// POST
router.post("/:questionId/play", async (req, res) => {
  const questionId = Number(req.params.questionId);
  const { answer } = req.body;

  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });

  if (!question) {
    throw new NotFoundError( "Question not found" );
  }

  const correct =
    answer.trim().toLowerCase() === question.answer.trim().toLowerCase();

  if (correct) {
    await prisma.attempt.upsert({
      where: {
        userId_questionId: {
          userId: req.user.userId,
          questionId,
        },
      },
      update: {},
      create: {
        userId: req.user.userId,
        questionId,
      },
    });
  }

  res.json({
    correct,
    correctAnswer: question.answer,
  });
});

// GET 
router.get("/:questionId/comments", async (req, res) => {
  const questionId = Number(req.params.questionId);

  const comments = await prisma.comment.findMany({
    where: { questionId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  res.json(comments.map((c) => ({
    id: c.id,
    content: c.content,
    createdAt: c.createdAt,
    userId: c.userId,
    userName: c.user.name,
  })));
});

// POST 
router.post("/:questionId/comments", async (req, res) => {
  const questionId = Number(req.params.questionId);
  const { content } = req.body;

  if (!content?.trim()) {
    return res.status(400).json({ error: "Comment cannot be empty" });
  }

  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) throw new NotFoundError("Question not found");

  const comment = await prisma.comment.create({
    data: {
      content: content.trim(),
      userId: req.user.userId,
      questionId,
    },
    include: { user: { select: { id: true, name: true } } },
  });

  res.status(201).json({
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt,
    userId: comment.userId,
    userName: comment.user.name,
  });
});

// DELETE 
router.delete("/:questionId/comments/:commentId", async (req, res) => {
  const commentId = Number(req.params.commentId);

  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new NotFoundError("Comment not found");

  if (comment.userId !== req.user.userId) {
    return res.status(403).json({ error: "Not authorized" });
  }

  await prisma.comment.delete({ where: { id: commentId } });
  res.json({ message: "Comment deleted" });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError ||
      err?.message === "Only image files are allowed") {
    return res.status(400).json({ msg: err.message });
  }
  next(err);
});

module.exports = router;