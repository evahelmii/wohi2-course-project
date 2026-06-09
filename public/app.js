let isRegisterMode = false;

function getCurrentUserId() {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.userId;
  } catch {
    return null;
  }
}

function getToken() {
  return localStorage.getItem(CONFIG.STORAGE_KEY);
}

function setToken(token) {
  localStorage.setItem(CONFIG.STORAGE_KEY, token);
}

function removeToken() {
  localStorage.removeItem(CONFIG.STORAGE_KEY);
}

async function apiFetch(route, options = {}) {
  const token = getToken();
  const isFormData = options.body instanceof FormData;
  const headers = { ...options.headers };
  if (!isFormData) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${CONFIG.API_URL}${route}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.msg || "Request failed");
  return data;
}

function difficultyBadge(difficulty) {
  const colors = { easy: "#4caf50", medium: "#ff9800", hard: "#f44336" };
  const color = colors[difficulty] || colors.medium;
  return `<span class="badge-difficulty" style="background:${color}">${difficulty || "medium"}</span>`;
}

function showAuth() {
  document.getElementById("auth-section").style.display = "block";
  document.getElementById("app-section").style.display = "none";
  document.getElementById("logout-btn").style.display = "none";
  renderAuthForm();
}

function renderAuthForm() {
  const fields = isRegisterMode ? CONFIG.FIELDS.REGISTER : CONFIG.FIELDS.LOGIN;
  const title = isRegisterMode ? "Sign Up" : "Log In";
  const switchText = isRegisterMode
    ? 'Already have an account? <a href="#" id="switch-mode">Log in</a>'
    : 'Don\'t have an account? <a href="#" id="switch-mode">Sign up</a>';

  const formHTML = `
    <h2>${title}</h2>
    <form id="auth-form">
      ${fields
        .map((f) => {
          const type = f === "password" ? "password" : f === "email" ? "email" : "text";
          const label = f.charAt(0).toUpperCase() + f.slice(1);
          return `
          <div class="form-group">
            <label for="${f}">${label}</label>
            <input type="${type}" id="${f}" name="${f}" required />
          </div>`;
        })
        .join("")}
      <button type="submit">${title}</button>
    </form>
    <p class="switch-text">${switchText}</p>
    <p id="auth-error" class="error"></p>
  `;

  document.getElementById("auth-section").innerHTML = formHTML;
  document.getElementById("auth-form").addEventListener("submit", handleAuth);
  document.getElementById("switch-mode").addEventListener("click", (e) => {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    renderAuthForm();
  });
}

async function handleAuth(e) {
  e.preventDefault();
  const errorEl = document.getElementById("auth-error");
  errorEl.textContent = "";

  const fields = isRegisterMode ? CONFIG.FIELDS.REGISTER : CONFIG.FIELDS.LOGIN;
  const route = isRegisterMode ? CONFIG.ROUTES.REGISTER : CONFIG.ROUTES.LOGIN;

  const body = {};
  fields.forEach((f) => {
    body[f] = document.getElementById(f).value;
  });

  try {
    const data = await apiFetch(route, {
      method: "POST",
      body: JSON.stringify(body),
    });
    setToken(data.token);
    showApp();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

async function showApp() {
  document.getElementById("auth-section").style.display = "none";
  document.getElementById("app-section").style.display = "block";
  document.getElementById("logout-btn").style.display = "inline-block";
  await loadQuestions();
}

async function loadQuestions(keyword = "", page = 1, difficulty = "") {
  const container = document.getElementById("questions-container");
  container.innerHTML = '<p class="loading">Loading questions...</p>';

  try {
    const params = new URLSearchParams({ page, limit: CONFIG.QUESTIONS_PER_PAGE });
    if (keyword) params.set("keyword", keyword);
    if (difficulty) params.set("difficulty", difficulty);
    const result = await apiFetch(`${CONFIG.ROUTES.QUESTIONS}?${params}`);
    const { data: questions, total, totalPages } = result;
    const currentUserId = getCurrentUserId();

    const solvedCount = questions.filter((q) => q.attempted).length;

    let html = `
      <div class="score-bar">
        <div class="score-item">
          <div class="score-value">${total}</div>
          <div class="score-label">Questions</div>
        </div>
        <div class="score-item">
          <div class="score-value">${solvedCount}/${questions.length}</div>
          <div class="score-label">Solved (this page)</div>
        </div>
      </div>
      <div class="toolbar">
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button class="btn btn-primary" id="new-question-btn">+ New Question</button>
          <button class="btn btn-quiz" id="quiz-btn">Quiz</button>
          <button class="btn btn-leaderboard" id="leaderboard-btn">Leaderboard</button>
        </div>
        <div class="search-bar">
          <input type="text" id="keyword-input" placeholder="Search by keyword..." value="${keyword}" />
          <select id="difficulty-select" style="padding:0.5rem;border-radius:6px;border:1px solid #444;background:#2a2a4a;color:#fff">
            <option value="" ${!difficulty ? "selected" : ""}>All difficulties</option>
            <option value="easy" ${difficulty === "easy" ? "selected" : ""}>Easy</option>
            <option value="medium" ${difficulty === "medium" ? "selected" : ""}>Medium</option>
            <option value="hard" ${difficulty === "hard" ? "selected" : ""}>Hard</option>
          </select>
          <button class="btn btn-search" id="search-btn">Search</button>
          ${keyword || difficulty ? `<button class="btn btn-clear" id="clear-btn">Clear</button>` : ""}
        </div>
      </div>`;

    if (questions.length === 0) {
      html += '<p class="empty-state">No questions found. Create one to get started!</p>';
    } else {
      html += questions
        .map(
          (q) => `
        <article class="question-card ${q.attempted ? "solved-card" : ""}">
          <h3>
            <a href="#" class="question-link" data-id="${q.id}">${q.question}</a>
            ${q.attempted ? `<span class="badge-solved">Solved</span>` : ""}
            ${difficultyBadge(q.difficulty)}
          </h3>
          ${
            q.keywords && q.keywords.length
              ? `<div class="question-keywords">${q.keywords.map((k) => `<span class="keyword">${k}</span>`).join("")}</div>`
              : ""
          }
          <div class="question-actions">
            <span>
              <button class="btn btn-play" data-id="${q.id}">Play</button>
              <a href="#" class="read-more" data-id="${q.id}">See answer</a>
            </span>
            ${
              q.userId === currentUserId
                ? `<span class="owner-actions">
                    <button class="btn btn-edit" data-id="${q.id}">Edit</button>
                    <button class="btn btn-delete" data-id="${q.id}">Delete</button>
                  </span>`
                : ""
            }
          </div>
        </article>`
        )
        .join("");
    }

    if (totalPages > 1) {
      html += `
        <div class="pagination">
          <button class="btn btn-page" id="prev-btn" ${page <= 1 ? "disabled" : ""}>Previous</button>
          <span class="page-info">Page ${page} of ${totalPages}</span>
          <button class="btn btn-page" id="next-btn" ${page >= totalPages ? "disabled" : ""}>Next</button>
        </div>`;
    }

    container.innerHTML = html;

    document.getElementById("new-question-btn").addEventListener("click", () => showQuestionForm());
    document.getElementById("quiz-btn").addEventListener("click", () => startQuiz());
    document.getElementById("leaderboard-btn").addEventListener("click", () => loadLeaderboard());

    document.getElementById("search-btn").addEventListener("click", () => {
      loadQuestions(
        document.getElementById("keyword-input").value.trim(),
        1,
        document.getElementById("difficulty-select").value
      );
    });

    document.getElementById("keyword-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") loadQuestions(e.target.value.trim(), 1, document.getElementById("difficulty-select").value);
    });

    const clearBtn = document.getElementById("clear-btn");
    if (clearBtn) clearBtn.addEventListener("click", () => loadQuestions());

    const prevBtn = document.getElementById("prev-btn");
    if (prevBtn) prevBtn.addEventListener("click", () => loadQuestions(keyword, page - 1, difficulty));

    const nextBtn = document.getElementById("next-btn");
    if (nextBtn) nextBtn.addEventListener("click", () => loadQuestions(keyword, page + 1, difficulty));

    container.querySelectorAll(".question-link, .read-more").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        loadQuestionDetail(el.dataset.id);
      });
    });

    container.querySelectorAll(".btn-edit").forEach((el) => {
      el.addEventListener("click", () => showQuestionForm(el.dataset.id));
    });

    container.querySelectorAll(".btn-delete").forEach((el) => {
      el.addEventListener("click", () => deleteQuestion(el.dataset.id));
    });

    container.querySelectorAll(".btn-play").forEach((el) => {
      el.addEventListener("click", () => playQuestion(el.dataset.id));
    });
  } catch (err) {
    if (err.message === "No token provided" || err.message === "Invalid or expired token") {
      removeToken();
      showAuth();
      return;
    }
    container.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function loadQuestionDetail(qId) {
  const container = document.getElementById("questions-container");
  container.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const q = await apiFetch(`${CONFIG.ROUTES.QUESTIONS}/${qId}`);
    const currentUserId = getCurrentUserId();
    const isOwner = q.userId === currentUserId;

    container.innerHTML = `
      <a href="#" id="back-btn" class="back-link">&larr; Back to questions</a>
      <article class="question-card question-detail">
        <h3>${q.question} ${q.attempted ? `<span class="badge-solved">Solved</span>` : ""} ${difficultyBadge(q.difficulty)}</h3>
        <p class="question-meta">by ${q.userName || "Unknown"}</p>
        ${q.imageUrl ? `<img class="question-image" src="${q.imageUrl}" alt="">` : ""}
        <p class="question-answer">${q.answer}</p>
        ${
          q.keywords && q.keywords.length
            ? `<div class="question-keywords">${q.keywords.map((k) => `<span class="keyword">${k}</span>`).join("")}</div>`
            : ""
        }
        ${
          isOwner
            ? `<div class="question-actions detail-actions">
                <button class="btn btn-edit" id="detail-edit-btn">Edit</button>
                <button class="btn btn-delete" id="detail-delete-btn">Delete</button>
              </div>`
            : ""
        }
      </article>

      <div class="comments-section">
        <h3>Comments</h3>
        <div id="comments-list"><p class="loading">Loading comments...</p></div>
        <form id="comment-form" style="margin-top:1rem">
          <div class="form-group">
            <textarea id="comment-input" rows="2" placeholder="Write a comment..." style="width:100%"></textarea>
          </div>
          <button type="submit" class="btn btn-primary">Post Comment</button>
        </form>
        <p id="comment-error" class="error"></p>
      </div>`;

    document.getElementById("back-btn").addEventListener("click", (e) => {
      e.preventDefault();
      loadQuestions();
    });

    if (isOwner) {
      document.getElementById("detail-edit-btn").addEventListener("click", () => showQuestionForm(qId));
      document.getElementById("detail-delete-btn").addEventListener("click", () => deleteQuestion(qId));
    }


    loadComments(qId);

  
    document.getElementById("comment-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById("comment-error");
      const content = document.getElementById("comment-input").value.trim();
      if (!content) return;
      try {
        await apiFetch(`${CONFIG.ROUTES.QUESTIONS}/${qId}/comments`, {
          method: "POST",
          body: JSON.stringify({ content }),
        });
        document.getElementById("comment-input").value = "";
        loadComments(qId);
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });

  } catch (err) {
    container.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function loadComments(qId) {
  const listEl = document.getElementById("comments-list");
  if (!listEl) return;
  try {
    const comments = await apiFetch(`${CONFIG.ROUTES.QUESTIONS}/${qId}/comments`);
    const currentUserId = getCurrentUserId();

    if (comments.length === 0) {
      listEl.innerHTML = '<p style="color:#aaa">No comments yet.</p>';
      return;
    }

    listEl.innerHTML = comments.map((c) => `
      <div class="comment-card" data-id="${c.id}">
        <div class="comment-header">
          <strong>${c.userName}</strong>
          <span style="color:#aaa;font-size:0.8rem">${new Date(c.createdAt).toLocaleDateString()}</span>
          ${c.userId === currentUserId ? `<button class="btn-delete-comment" data-id="${c.id}" style="margin-left:auto;background:none;border:none;color:#f44336;cursor:pointer">Delete</button>` : ""}
        </div>
        <p style="margin:0.3rem 0 0">${c.content}</p>
      </div>
    `).join("");

    listEl.querySelectorAll(".btn-delete-comment").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await apiFetch(`${CONFIG.ROUTES.QUESTIONS}/${qId}/comments/${btn.dataset.id}`, { method: "DELETE" });
          loadComments(qId);
        } catch (err) {
          alert(err.message);
        }
      });
    });
  } catch (err) {
    listEl.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function loadLeaderboard() {
  const container = document.getElementById("questions-container");
  container.innerHTML = '<p class="loading">Loading leaderboard...</p>';

  try {
    const leaderboard = await apiFetch("/api/leaderboard");
    const medals = ["1", "2", "3", "4", "5"];

    container.innerHTML = `
      <a href="#" id="back-btn" class="back-link">&larr; Back to questions</a>
      <div class="question-form-wrapper">
        <h2>Leaderboard</h2>
        <p style="color:#aaa;margin-bottom:1.5rem">Top 5 players with most solved questions</p>
        ${leaderboard.length === 0
          ? '<p style="color:#aaa">No data yet.</p>'
          : leaderboard.map((u) => `
            <div class="question-card" style="display:flex;align-items:center;gap:1rem;padding:1rem">
              <span style="font-size:1.5rem">${medals[u.rank - 1] || u.rank}</span>
              <strong style="flex:1">${u.name}</strong>
              <span style="color:#ffd700">${u.attemptCount} solved</span>
            </div>
          `).join("")}
      </div>`;

    document.getElementById("back-btn").addEventListener("click", (e) => {
      e.preventDefault();
      loadQuestions();
    });
  } catch (err) {
    container.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function startQuiz() {
  const container = document.getElementById("questions-container");
  container.innerHTML = '<p class="loading">Loading quiz...</p>';

  try {
    const questions = await apiFetch(`${CONFIG.ROUTES.QUESTIONS}/quiz`);

    if (questions.length === 0) {
      container.innerHTML = `
        <a href="#" id="back-btn" class="back-link">&larr; Back to questions</a>
        <p class="empty-state">Not enough questions for a quiz!</p>`;
      document.getElementById("back-btn").addEventListener("click", (e) => { e.preventDefault(); loadQuestions(); });
      return;
    }

    let currentIndex = 0;
    let score = 0;

    function showQuizQuestion() {
      if (currentIndex >= questions.length) {
        container.innerHTML = `
          <div class="question-form-wrapper" style="text-align:center">
            <h2>Quiz Complete!</h2>
            <p style="font-size:1.5rem;margin:1rem 0">Score: <strong>${score}/${questions.length}</strong></p>
            <button class="btn btn-primary" id="quiz-again-btn">Play Again</button>
            <button class="btn" id="back-home-btn" style="margin-left:0.5rem">Back to Questions</button>
          </div>`;
        document.getElementById("quiz-again-btn").addEventListener("click", startQuiz);
        document.getElementById("back-home-btn").addEventListener("click", loadQuestions);
        return;
      }

      const q = questions[currentIndex];
      container.innerHTML = `
        <a href="#" id="back-btn" class="back-link">&larr; Back to questions</a>
        <div class="question-form-wrapper" style="text-align:center">
          <p style="color:#aaa">Question ${currentIndex + 1} of ${questions.length} &nbsp;|&nbsp; Score: ${score}</p>
          ${difficultyBadge(q.difficulty)}
          <div class="play-question-text" style="margin-top:1rem">${q.question}</div>
          ${q.imageUrl ? `<img class="question-image" src="${q.imageUrl}" alt="" style="margin:1rem auto">` : ""}
          <form id="quiz-form" style="text-align:left;margin-top:1rem">
            <div class="form-group">
              <label for="quiz-answer">Your answer</label>
              <textarea id="quiz-answer" rows="2" required></textarea>
            </div>
            <div style="text-align:center">
              <button type="submit" class="btn btn-play" style="padding:0.7rem 2.5rem">Submit</button>
            </div>
          </form>
          <div id="quiz-result"></div>
        </div>`;

      document.getElementById("back-btn").addEventListener("click", (e) => { e.preventDefault(); loadQuestions(); });

      document.getElementById("quiz-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const answer = document.getElementById("quiz-answer").value;
        const resultEl = document.getElementById("quiz-result");

        try {
          const result = await apiFetch(`${CONFIG.ROUTES.QUESTIONS}/${q.id}/play`, {
            method: "POST",
            body: JSON.stringify({ answer }),
          });

          if (result.correct) score++;

          resultEl.innerHTML = result.correct
            ? `<div class="play-result correct" style="margin-top:1rem">Correct! </div>`
            : `<div class="play-result incorrect" style="margin-top:1rem">Incorrect! The answer was: <strong>${result.correctAnswer}</strong></div>`;

          document.getElementById("quiz-form").style.display = "none";

          const nextBtn = document.createElement("button");
          nextBtn.className = "btn btn-primary";
          nextBtn.style.marginTop = "1rem";
          nextBtn.textContent = currentIndex + 1 < questions.length ? "Next Question →" : "See Results";
          nextBtn.addEventListener("click", () => { currentIndex++; showQuizQuestion(); });
          resultEl.appendChild(nextBtn);
        } catch (err) {
          resultEl.innerHTML = `<p class="error">${err.message}</p>`;
        }
      });
    }

    showQuizQuestion();
  } catch (err) {
    container.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function showQuestionForm(qId) {
  const container = document.getElementById("questions-container");
  const isEdit = !!qId;
  let q = { question: "", answer: "", keywords: [], difficulty: "medium" };

  if (isEdit) {
    try {
      q = await apiFetch(`${CONFIG.ROUTES.QUESTIONS}/${qId}`);
    } catch (err) {
      container.innerHTML = `<p class="error">${err.message}</p>`;
      return;
    }
  }

  container.innerHTML = `
    <a href="#" id="back-btn" class="back-link">&larr; Back to questions</a>
    <div class="question-form-wrapper">
      <h2>${isEdit ? "Edit Question" : "New Question"}</h2>
      <form id="question-form" enctype="multipart/form-data">
        <div class="form-group">
          <label for="q-question">Question</label>
          <input type="text" id="q-question" value="${q.question}" required />
        </div>
        <div class="form-group">
          <label for="q-answer">Answer</label>
          <textarea id="q-answer" rows="4" required>${q.answer}</textarea>
        </div>
        <div class="form-group">
          <label for="q-keywords">Keywords (comma-separated)</label>
          <input type="text" id="q-keywords" value="${q.keywords ? q.keywords.join(", ") : ""}" />
        </div>
        <div class="form-group">
          <label for="q-difficulty">Difficulty</label>
          <select id="q-difficulty" style="padding:0.5rem;border-radius:6px;border:1px solid #444;background:#2a2a4a;color:#fff;width:100%">
            <option value="easy" ${q.difficulty === "easy" ? "selected" : ""}>Easy</option>
            <option value="medium" ${q.difficulty === "medium" || !q.difficulty ? "selected" : ""}>Medium</option>
            <option value="hard" ${q.difficulty === "hard" ? "selected" : ""}>Hard</option>
          </select>
        </div>
        <div class="form-group">
          <label for="q-image">Image ${isEdit ? "(leave blank to keep current)" : "(optional)"}</label>
          <input type="file" id="q-image" accept="image/*" />
          ${isEdit && q.imageUrl ? `<img src="${q.imageUrl}" alt="" style="max-width:200px;margin-top:0.5rem;border-radius:4px" />` : ""}
        </div>
        <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Create Question"}</button>
      </form>
      <p id="question-form-error" class="error"></p>
    </div>`;

  document.getElementById("back-btn").addEventListener("click", (e) => {
    e.preventDefault();
    loadQuestions();
  });

  document.getElementById("question-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("question-form-error");
    errorEl.textContent = "";

    const body = new FormData();
    body.append("question", document.getElementById("q-question").value);
    body.append("answer", document.getElementById("q-answer").value);
    body.append("keywords", document.getElementById("q-keywords").value);
    body.append("difficulty", document.getElementById("q-difficulty").value);
    const imageFile = document.getElementById("q-image").files[0];
    if (imageFile) body.append("image", imageFile);

    try {
      if (isEdit) {
        await apiFetch(`${CONFIG.ROUTES.QUESTIONS}/${qId}`, { method: "PUT", body });
      } else {
        await apiFetch(CONFIG.ROUTES.QUESTIONS, { method: "POST", body });
      }
      loadQuestions();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

async function playQuestion(qId) {
  const container = document.getElementById("questions-container");
  container.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const q = await apiFetch(`${CONFIG.ROUTES.QUESTIONS}/${qId}`);

    container.innerHTML = `
      <a href="#" id="back-btn" class="back-link">&larr; Back to questions</a>
      <div class="question-form-wrapper" style="text-align:center">
        ${difficultyBadge(q.difficulty)}
        <div class="play-question-text" style="margin-top:0.5rem">${q.question}</div>
        ${q.imageUrl ? `<img class="question-image" src="${q.imageUrl}" alt="" style="margin:0 auto 1rem">` : ""}
        ${
          q.keywords && q.keywords.length
            ? `<div class="question-keywords" style="justify-content:center;margin-bottom:1.5rem">${q.keywords.map((k) => `<span class="keyword">${k}</span>`).join("")}</div>`
            : ""
        }
        <form id="play-form" style="text-align:left">
          <div class="form-group">
            <label for="play-answer">Your answer</label>
            <textarea id="play-answer" rows="3" required></textarea>
          </div>
          <div style="text-align:center">
            <button type="submit" class="btn btn-play" style="padding:0.7rem 2.5rem;font-size:1rem">Submit</button>
          </div>
        </form>
        <div id="play-result"></div>
        <p id="play-error" class="error"></p>
      </div>`;

    document.getElementById("back-btn").addEventListener("click", (e) => {
      e.preventDefault();
      loadQuestions();
    });

    document.getElementById("play-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById("play-error");
      const resultEl = document.getElementById("play-result");
      errorEl.textContent = "";
      resultEl.innerHTML = "";

      const answer = document.getElementById("play-answer").value;

      try {
        const result = await apiFetch(`${CONFIG.ROUTES.QUESTIONS}/${qId}/play`, {
          method: "POST",
          body: JSON.stringify({ answer }),
        });

        if (result.correct) {
          resultEl.innerHTML = `<div class="play-result correct">Correct!</div>`;
        } else {
          resultEl.innerHTML = `
            <div class="play-result incorrect">
              Incorrect! The answer was: <strong>${result.correctAnswer}</strong>
            </div>`;
        }
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
  } catch (err) {
    container.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function deleteQuestion(qId) {
  if (!confirm("Are you sure you want to delete this question?")) return;

  try {
    await apiFetch(`${CONFIG.ROUTES.QUESTIONS}/${qId}`, { method: "DELETE" });
    loadQuestions();
  } catch (err) {
    alert(err.message);
  }
}

function handleLogout() {
  removeToken();
  showAuth();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("logout-btn").addEventListener("click", handleLogout);
  if (getToken()) {
    showApp();
  } else {
    showAuth();
  }
});