# KMT C9Star Server Starter (v0.1)

ဤ project သည် Quiz + non-cash points အတွက် backend starter ဖြစ်သည်။ တကယ့်ငွေသွင်း/ငွေထုတ်စနစ် မပါဝင်ပါ။

## လိုအပ်ချက်
- Node.js 20+
- PostgreSQL database (ဥပမာ managed PostgreSQL provider)
- Server hosting account (ဥပမာ Node.js app hosting)

## Local စမ်းသပ်ရန်
1. `npm install`
2. `.env.example` ကို `.env` အဖြစ် copy လုပ်ပြီး `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` ဖြည့်ပါ။
3. PostgreSQL ထဲတွင် `database/schema.sql` ကို run လုပ်ပါ။
4. `npm start`
5. `http://localhost:3000/health` ကို ဖွင့်ပြီး API အသက်ရှင်ကြောင်း စစ်ပါ။

## ပထမဆုံး Admin ဖန်တီးရန်
1. `/api/auth/register` မှတစ်ဆင့် သင့်ကိုယ်ပိုင် username/password ဖြင့် account ဖွင့်ပါ။
2. Database SQL console တွင် အောက်ပါ command ကို ကိုယ့် username ဖြင့် ပြင်ပြီး run လုပ်ပါ။
   `UPDATE users SET role='admin' WHERE username='YOUR_ADMIN_USERNAME';`
3. Admin password ကို မျှဝေခြင်းမပြုပါနှင့်။ 2FA နှင့် secret manager ကို production မတင်မီ ထည့်သွင်းပါ။

## API လမ်းကြောင်းများ
- `GET /health`
- `POST /api/auth/register` `{ "username":"player01", "password":"a-long-password" }`
- `POST /api/auth/login` `{ "username":"player01", "password":"a-long-password" }`
- `GET /api/me` (Bearer token)
- `GET /api/quizzes`
- `GET /api/quizzes/:id`
- `POST /api/quizzes/:id/submit` (Bearer token)
- `POST /api/admin/quizzes` (admin token)
- `POST /api/admin/quizzes/:id/questions` (admin token)

## အရေးကြီးသော ကန့်သတ်ချက်များ
- Points များသည် ဂိမ်းအတွင်းသုံး non-cash points သာဖြစ်သည်။
- ဤ starter သည် production-ready ဟု မဆိုလိုပါ။ Deploy မလုပ်မီ security review, backups, monitoring, email verification, password reset, stricter CORS, admin 2FA, audit log, duplicate-attempt/anti-cheat rules နှင့် privacy/legal review လိုအပ်သည်။
- ငွေသားဆု/ငွေထုတ်၊ လောင်းကစား သို့မဟုတ် redeemable value များကို မထည့်ထားပါ။ ထိုစနစ်များမတည်ဆောက်မီ ဒေသဆိုင်ရာဥပဒေနှင့် လိုင်စင်၊ payment provider ခွင့်ပြုချက်တို့ကို ကျွမ်းကျင်သူနှင့် စစ်ဆေးပါ။
- JWT secret, database password များကို source code ထဲ မထည့်ပါနှင့်။ Hosting provider ၏ environment variables ထဲတွင်သာ ထည့်ပါ။
