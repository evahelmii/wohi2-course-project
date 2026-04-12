const express = require("express");
const router = express.Router();

const quiz = require("../data/questions");

router.get("/", (req, res) => {
  res.json(quiz);
});

// GET /posts/:postId
// Show a specific post
router.get("/:questionId", (req, res) => {
  const questionId = Number(req.params.questionId);

  const question = quiz.find((q) => q.id === questionId);

  if (!question) {
    return res.status(404).json({ message: "Question not found" });
  }

  res.json(question);
});

// POST /posts
// Create a new post
router.post("/", (req, res) => {
  const { question, answer } = req.body;

  if (!question || !answer) {
    return res.status(400).json({
      message: "Question and answer are required"
    });
  }
  const maxId = Math.max(...quiz.map(q => q.id), 0);

  const newQuestion = {
    id: quiz.length ? maxId + 1 : 1,
    question,
    answer
  };
  quiz.push(newQuestion);
  res.status(201).json(newQuestion);
});

// PUT /posts/:postId
// Edit a post
router.put("/:questionId", (req, res) => {
  const questionId = Number(req.params.questionId);
  const { question, answer } = req.body;

  const questionItem = quiz.find((q) => q.id === questionId);

  if (!questionItem) {
    return res.status(404).json({ message: "Question not found" });
  }

  if (!question || !answer ) {
    return res.json({
      message: "question and answer are required"
    });
  }

  questionItem.question = question;
  questionItem.answer = answer;

  res.json(questionItem);
});

// DELETE /posts/:postId
// Delete a post
router.delete("/:questionId", (req, res) => {
  const questionId = Number(req.params.questionId);

  const questionIndex = quiz.findIndex((q) => q.id === questionId);

  if (questionIndex === -1) {
    return res.status(404).json({ message: "Question not found" });
  }

  const deletedQuestion = quiz.splice(questionIndex, 1);

  res.json({
    message: "Question deleted successfully",
    post: deletedQuestion[0]
  });
});

module.exports = router;