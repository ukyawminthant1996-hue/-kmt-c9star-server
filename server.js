import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "./db.js";
import { requireAuth, requireAdmin } from "./auth.js";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must contain at least 32 characters");
}
const app = express();
app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGIN || "").split(",").filter(Boolean) }));
app.use(express.json({ limit: "32kb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: true, legacyHeaders: false }));

app.get("/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ status: "ok", service: "KMT C9Star API" }); }
  catch { res.status(503).json({ status: "database_unavailable" }); }
});

app.post("/api/auth/register", async (req, res) => {
  const schema = z.object({ username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/), password: z.string().min(10).max(100) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Username နှင့် password စည်းမျဉ်းကို စစ်ဆေးပါ။" });
  try {
    const hash = await bcrypt.hash(parsed.data.password, 12);
    const result = await pool.query(
      "INSERT INTO users(username,password_hash) VALUES($1,$2) RETURNING id,username,role,points",
      [parsed.data.username, hash]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "ဒီ username ကို အသုံးပြုပြီးပါပြီ။" });
    res.status(500).json({ error: "အကောင့်ဖွင့်ရာတွင် အမှားဖြစ်နေပါသည်။" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const parsed = z.object({ username: z.string(), password: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "အချက်အလက် မပြည့်စုံပါ။" });
  const result = await pool.query("SELECT id,username,password_hash,role FROM users WHERE username=$1", [parsed.data.username]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash)))
    return res.status(401).json({ error: "Username သို့မဟုတ် password မှားနေပါသည်။" });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: "2h" });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

app.get("/api/me", requireAuth, async (req, res) => {
  const r = await pool.query("SELECT id,username,role,points,created_at FROM users WHERE id=$1", [req.user.id]);
  if (!r.rows[0]) return res.status(404).json({ error: "အသုံးပြုသူ မတွေ့ပါ။" });
  res.json({ user: r.rows[0] });
});

app.get("/api/quizzes", async (_req, res) => {
  const r = await pool.query("SELECT id,title,description FROM quizzes WHERE is_published=true ORDER BY created_at DESC");
  res.json({ quizzes: r.rows });
});
app.get("/api/quizzes/:id", async (req, res) => {
  const q = await pool.query("SELECT id,title,description FROM quizzes WHERE id=$1 AND is_published=true", [req.params.id]);
  if (!q.rows[0]) return res.status(404).json({ error: "Quiz မတွေ့ပါ။" });
  const questions = await pool.query("SELECT id,question,options FROM questions WHERE quiz_id=$1 ORDER BY position", [req.params.id]);
  res.json({ quiz: q.rows[0], questions: questions.rows });
});

// The server grades answers; correct answers are never sent to the player.
app.post("/api/quizzes/:id/submit", requireAuth, async (req, res) => {
  const parsed = z.object({ answers: z.array(z.object({ questionId: z.string().uuid(), optionIndex: z.number().int().min(0).max(3) })).max(50) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "အဖြေတင်သွင်းမှု မမှန်ပါ။" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const q = await client.query("SELECT id,points_per_correct FROM quizzes WHERE id=$1 AND is_published=true", [req.params.id]);
    if (!q.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Quiz မတွေ့ပါ။" }); }
    const ids = parsed.data.answers.map(a => a.questionId);
    const rows = ids.length ? await client.query(
      "SELECT id,correct_index FROM questions WHERE quiz_id=$1 AND id=ANY($2::uuid[])", [req.params.id, ids]
    ) : { rows: [] };
    const answerMap = new Map(parsed.data.answers.map(a => [a.questionId, a.optionIndex]));
    const correct = rows.rows.filter(row => answerMap.get(row.id) === row.correct_index).length;
    const earned = correct * q.rows[0].points_per_correct;
    await client.query("UPDATE users SET points=points+$1 WHERE id=$2", [earned, req.user.id]);
    await client.query("INSERT INTO quiz_attempts(user_id,quiz_id,correct_count,points_earned) VALUES($1,$2,$3,$4)",
      [req.user.id, req.params.id, correct, earned]);
    await client.query("INSERT INTO points_ledger(user_id,delta,reason) VALUES($1,$2,$3)", [req.user.id, earned, "quiz_completion"]);
    const balance = await client.query("SELECT points FROM users WHERE id=$1", [req.user.id]);
    await client.query("COMMIT");
    res.json({ correct, totalSubmitted: parsed.data.answers.length, pointsEarned: earned, pointsBalance: balance.rows[0].points });
  } catch {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Quiz အဖြေသိမ်းရာတွင် အမှားဖြစ်နေပါသည်။" });
  } finally { client.release(); }
});

app.post("/api/admin/quizzes", requireAuth, requireAdmin, async (req, res) => {
  const parsed = z.object({ title: z.string().min(3).max(100), description: z.string().max(500).default(""), pointsPerCorrect: z.number().int().min(0).max(100), isPublished: z.boolean().default(false) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Quiz အချက်အလက် မမှန်ပါ။" });
  const r = await pool.query("INSERT INTO quizzes(title,description,points_per_correct,is_published) VALUES($1,$2,$3,$4) RETURNING *",
    [parsed.data.title, parsed.data.description, parsed.data.pointsPerCorrect, parsed.data.isPublished]);
  res.status(201).json({ quiz: r.rows[0] });
});
app.post("/api/admin/quizzes/:id/questions", requireAuth, requireAdmin, async (req, res) => {
  const parsed = z.object({ question: z.string().min(5).max(1000), options: z.array(z.string().min(1).max(200)).length(4), correctIndex: z.number().int().min(0).max(3), position: z.number().int().min(0).default(0) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "မေးခွန်းနှင့် အဖြေ ၄ ခု ဖြည့်ပါ။" });
  const r = await pool.query("INSERT INTO questions(quiz_id,question,options,correct_index,position) VALUES($1,$2,$3,$4,$5) RETURNING id,quiz_id,question,options,position",
    [req.params.id, parsed.data.question, JSON.stringify(parsed.data.options), parsed.data.correctIndex, parsed.data.position]);
  res.status(201).json({ question: r.rows[0] });
});

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: "Server error" }); });
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`KMT C9Star API listening on ${port}`));
