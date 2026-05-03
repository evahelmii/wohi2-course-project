const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new PrismaClient();

const seedQuestions = [
  {
    question: "What is HTTP?",
    date: new Date("2026-03-20"),
    answer:
      "HTTP is the foundation of communication on the web. It defines how clients and servers exchange data.",
    keywords: ["http", "web"],
  },
  {
    question: "What are REST APIs?",
    date: new Date("2026-03-22"),
    answer:
      "REST is an architectural style that uses standard HTTP methods like GET, POST, PUT, and DELETE.",
    keywords: ["http", "api"],
  },
  {
    question: "What is Node.js?",
    date: new Date("2026-03-25"),
    answer:
      "Node.js allows you to run JavaScript on the server using a non-blocking, event-driven architecture.",
    keywords: ["javascript", "backend"],
  },
  {
    question: "What are Databases?",
    date: new Date("2026-03-26"),
    answer:
      "Databases store and organize data. Common types include relational databases like PostgreSQL and MySQL.",
    keywords: ["database", "backend"],
  },
];

async function main() {
  await prisma.attempt.deleteMany();
  await prisma.question.deleteMany();
  await prisma.keyword.deleteMany();
  await prisma.user.deleteMany();

  const hashedPassword = await bcrypt.hash("1234", 10);

  const user = await prisma.user.create({
    data: {
      email: "admin@example.com",
      password: hashedPassword,
      name: "Admin User",
    },
  });

  console.log("Created user:", user.email);

  for (const q of seedQuestions) {
    await prisma.question.create({
      data: {
        question: q.question,
        date: q.date,
        answer: q.answer,
        userId: user.id,
        keywords: {
          connectOrCreate: q.keywords.map((kw) => ({
            where: { name: kw },
            create: { name: kw },
          })),
        },
      },
    });
  }

  console.log("Seed data inserted successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
