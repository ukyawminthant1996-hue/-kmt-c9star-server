import jwt from "jsonwebtoken";
export function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Login လုပ်ရန် လိုအပ်ပါသည်။" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Login token မမှန်ပါ သို့မဟုတ် သက်တမ်းကုန်ပါပြီ။" });
  }
}
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin ခွင့်ပြုချက် လိုအပ်ပါသည်။" });
  next();
}
