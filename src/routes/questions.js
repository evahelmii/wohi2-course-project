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

router.get("/", async (req, res) => {
  const { keyword } = req.query; 

  const where = keyword
    ? { keywords: { some: { name: keyword } } }
    : {};

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
  const { question, date, answer, keywords } = PostInput.parse(req.body);
  
  console.log("DATE:", date);

  const keywordsArray = Array.isArray(keywords) ? keywords : [];
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;  

  const newQuestion = await prisma.question.create({
    data: {
      question, date: date ? new Date(date) : new Date(), answer,
      userId: req.user.userId,
      imageUrl,
      keywords: {
        connectOrCreate: keywordsArray.map((kw) => ({
          where: { name: kw }, create: { name: kw },
        })), },
    },
    include: { keywords: true, user: true},
  });

  res.status(201).json(formatQuestion(newQuestion));
});


// PUT
router.put("/:questionId", upload.single("image"), isOwner, async (req, res) => {
  const questionId = Number(req.params.questionId);
  const { question, date, answer, keywords } = PostInput.parse(req.body);

  const existingQuestion = await prisma.question.findUnique({ where: { id: questionId } });
  if (!existingQuestion) {
    throw new NotFoundError( "Question not found" );
  }

  if (!question || !answer) {
    throw new ValidationError( "Question and answer are required" );
  }

  const keywordsArray = Array.isArray(keywords) ? keywords : [];
  
  const data = {
    question,
    date: date ? new Date(date) : existingQuestion.date,
    answer,
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
    where: { id: questionId }, data,
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

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError ||
      err?.message === "Only image files are allowed") {
    return res.status(400).json({ msg: err.message });
  }
  next(err); // pass through to global handler
});


module.exports = router;