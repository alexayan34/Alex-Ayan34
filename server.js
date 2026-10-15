const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');

const app = express();
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'data.sqlite'));
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'dev-only-change-this-secret';
const CURRENCY = process.env.CURRENCY || 'BDT';

db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', vip TEXT NOT NULL DEFAULT 'Starter',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS wallets(
 user_id INTEGER PRIMARY KEY REFERENCES users(id), deposit_balance REAL NOT NULL DEFAULT 0,
 earnings_balance REAL NOT NULL DEFAULT 0, total_earned REAL NOT NULL DEFAULT 0,
 total_withdrawn REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks(
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL,
 reward REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS submissions(
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
 task_id INTEGER NOT NULL REFERENCES tasks(id), proof TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, task_id)
);
CREATE TABLE IF NOT EXISTS transactions(
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
 type TEXT NOT NULL, amount REAL NOT NULL, method TEXT DEFAULT '', reference TEXT DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending', note TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ledger(
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
 amount REAL NOT NULL, bucket TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS packages(
 id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, title TEXT NOT NULL, price REAL NOT NULL DEFAULT 0,
 days INTEGER NOT NULL DEFAULT 0, daily_reward REAL NOT NULL DEFAULT 0, description TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1
);
`);
const count = db.prepare('SELECT COUNT(*) n FROM tasks').get().n;
if (!count) {
 const add = db.prepare('INSERT INTO tasks(title,description,reward) VALUES(?,?,?)');
 add.run('Daily product knowledge','Read the sample product guide and answer the short quiz.',10);
 add.run('Community welcome','Read the community rules and submit a short acknowledgement.',5);
 add.run('Quality feedback','Review the sample interface and send constructive feedback.',15);
}
if (!db.prepare('SELECT COUNT(*) n FROM packages').get().n) {
 const add = db.prepare('INSERT INTO packages(code,title,price,days,daily_reward,description) VALUES(?,?,?,?,?,?)');
 add.run('L1','Starter',0,0,0,'Free starter access. Rewards depend on approved tasks.');
 add.run('L2','Explorer',0,0,0,'Example package card. Configure actual terms before launch.');
 add.run('L3','Pro',0,0,0,'Example package card. Do not treat projected rewards as guaranteed income.');
}
function ensureAdmin() {
 const email = process.env.ADMIN_EMAIL || 'admin@example.com';
 const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
 if (!db.prepare('SELECT id FROM users WHERE email=?').get(email)) {
   const hash = bcrypt.hashSync(password, 12);
   const info = db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')").run('Administrator',email,hash);
   db.prepare('INSERT INTO wallets(user_id) VALUES(?)').run(info.lastInsertRowid);
   console.log(`Admin account created: ${email} (set ADMIN_PASSWORD in environment before deployment)`);
 }
}
ensureAdmin();
app.use(express.json({limit:'100kb'}));
app.use(express.static(path.join(__dirname,'public')));
app.use('/api/auth', rateLimit({windowMs:15*60*1000,limit:40,standardHeaders:true,legacyHeaders:false}));

const auth = (req,res,next) => {
 const token = (req.headers.authorization || '').replace(/^Bearer\s+/,'');
 try { if (!token) throw new Error(); req.user = jwt.verify(token,SECRET); next(); }
 catch { res.status(401).json({error:'Please sign in to continue.'}); }
};
const admin = (req,res,next) => req.user?.role === 'admin' ? next() : res.status(403).json({error:'Admin access required.'});
const money = n => Math.round((Number(n)+Number.EPSILON)*100)/100;
function wallet(userId) { return db.prepare('SELECT * FROM wallets WHERE user_id=?').get(userId); }
function ledger(userId,amount,bucket,reason) {
 db.prepare('INSERT INTO ledger(user_id,amount,bucket,reason) VALUES(?,?,?,?)').run(userId,amount,bucket,reason);
}
app.get('/api/health',(req,res)=>res.json({ok:true,currency:CURRENCY}));
app.post('/api/auth/register',(req,res)=>{
 const {name,email,password}=req.body||{};
 if (!name || !email || !/^\S+@\S+\.\S+$/.test(email) || typeof password!=='string' || password.length<8)
   return res.status(400).json({error:'Enter a name, valid email, and password of at least 8 characters.'});
 try {
   const info=db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(name.trim().slice(0,80),email.toLowerCase().trim(),bcrypt.hashSync(password,12));
   db.prepare('INSERT INTO wallets(user_id) VALUES(?)').run(info.lastInsertRowid);
   const user=db.prepare('SELECT id,name,email,role,vip FROM users WHERE id=?').get(info.lastInsertRowid);
   res.status(201).json({token:jwt.sign(user,SECRET,{expiresIn:'7d'}),user});
 } catch(e) { res.status(409).json({error:'An account with that email may already exist.'}); }
});
app.post('/api/auth/login',(req,res)=>{
 const {email,password}=req.body||{};
 const user=db.prepare('SELECT * FROM users WHERE email=?').get(String(email||'').toLowerCase().trim());
 if(!user || !bcrypt.compareSync(String(password||''),user.password_hash)) return res.status(401).json({error:'Email or password is incorrect.'});
 const safe={id:user.id,name:user.name,email:user.email,role:user.role,vip:user.vip};
 res.json({token:jwt.sign(safe,SECRET,{expiresIn:'7d'}),user:safe});
});
app.get('/api/me',auth,(req,res)=>{
 const u=db.prepare('SELECT id,name,email,role,vip,created_at FROM users WHERE id=?').get(req.user.id);
 res.json({user:u,wallet:wallet(req.user.id),currency:CURRENCY});
});
app.get('/api/home',auth,(req,res)=>{
 const w=wallet(req.user.id);
 const tasks=db.prepare("SELECT * FROM tasks WHERE status='active' ORDER BY id DESC LIMIT 5").all();
 res.json({wallet:w,taskCount:tasks.length,tasks,announcements:[{title:'Welcome to your workspace',body:'Complete approved tasks and track every wallet transaction transparently.'}]});
});
app.get('/api/tasks',auth,(req,res)=>res.json(db.prepare("SELECT t.*, s.status AS submission_status FROM tasks t LEFT JOIN submissions s ON s.task_id=t.id AND s.user_id=? WHERE t.status='active' ORDER BY t.id DESC").all(req.user.id)));
app.post('/api/tasks/:id/submit',auth,(req,res)=>{
 const task=db.prepare("SELECT * FROM tasks WHERE id=? AND status='active'").get(Number(req.params.id));
 if(!task) return res.status(404).json({error:'Task not found.'});
 try {
  db.prepare('INSERT INTO submissions(user_id,task_id,proof) VALUES(?,?,?)').run(req.user.id,task.id,String(req.body.proof||'').slice(0,2000));
  res.status(201).json({message:'Submitted for review. Rewards are credited only after approval.'});
 } catch(e) { res.status(409).json({error:'You have already submitted this task.'}); }
});
app.get('/api/products',auth,(req,res)=>res.json(db.prepare('SELECT * FROM packages WHERE active=1 ORDER BY price,id').all()));
app.get('/api/transactions',auth,(req,res)=>res.json(db.prepare('SELECT id,type,amount,method,reference,status,note,created_at FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id)));
app.post('/api/recharge',auth,(req,res)=>{
 const amount=Number(req.body.amount), method=String(req.body.method||'').slice(0,40), reference=String(req.body.reference||'').trim().slice(0,120);
 if(!Number.isFinite(amount)||amount<50||amount>1000000||!method||!reference) return res.status(400).json({error:'Enter an amount (minimum ৳50), payment method and transaction reference.'});
 const info=db.prepare("INSERT INTO transactions(user_id,type,amount,method,reference,status) VALUES(?,'recharge',?,?,?,'pending')").run(req.user.id,money(amount),method,reference);
 res.status(201).json({message:'Recharge request submitted for admin review.',id:info.lastInsertRowid});
});
app.post('/api/withdraw',auth,(req,res)=>{
 const amount=Number(req.body.amount), method=String(req.body.method||'').slice(0,40), destination=String(req.body.destination||'').trim().slice(0,120);
 const w=wallet(req.user.id);
 if(!Number.isFinite(amount)||amount<100||amount>w.earnings_balance||!method||!destination) return res.status(400).json({error:'Enter a valid amount (minimum ৳100) within your available earnings balance and payout details.'});
 const run=db.transaction(()=>{
  db.prepare('UPDATE wallets SET earnings_balance=earnings_balance-? WHERE user_id=?').run(money(amount),req.user.id);
  ledger(req.user.id,-money(amount),'earnings','Withdrawal request reserved');
  return db.prepare("INSERT INTO transactions(user_id,type,amount,method,reference,status,note) VALUES(?,'withdrawal',?,?,?,'pending','Amount reserved until admin review')").run(req.user.id,money(amount),method,destination);
 });
 const info=run();
 res.status(201).json({message:'Withdrawal request submitted. The amount is reserved pending review.',id:info.lastInsertRowid});
});
app.get('/api/community',auth,(req,res)=>res.json({referralCode:'USER'+String(req.user.id).padStart(6,'0'),message:'Referral rewards should be configured with clear terms before enabling.'}));
app.get('/api/news',auth,(req,res)=>res.json([{id:1,title:'Platform notice',body:'This is a starter announcement. Admins can add real announcements in a future extension.',date:new Date().toISOString()}]));
app.get('/api/admin/overview',auth,admin,(req,res)=>{
 res.json({
  users:db.prepare('SELECT COUNT(*) n FROM users WHERE role="user"').get().n,
  pendingTransactions:db.prepare("SELECT COUNT(*) n FROM transactions WHERE status='pending'").get().n,
  pendingTasks:db.prepare("SELECT COUNT(*) n FROM submissions WHERE status='pending'").get().n,
  transactions:db.prepare("SELECT t.*,u.email FROM transactions t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 100").all(),
  submissions:db.prepare("SELECT s.*,u.email,t.title,t.reward FROM submissions s JOIN users u ON u.id=s.user_id JOIN tasks t ON t.id=s.task_id ORDER BY s.id DESC LIMIT 100").all(),
  tasks:db.prepare('SELECT * FROM tasks ORDER BY id DESC').all()
 });
});
app.post('/api/admin/transactions/:id/review',auth,admin,(req,res)=>{
 const status=req.body.status;
 if(!['approved','rejected'].includes(status)) return res.status(400).json({error:'Invalid status.'});
 const t=db.prepare("SELECT * FROM transactions WHERE id=? AND status='pending'").get(Number(req.params.id));
 if(!t) return res.status(404).json({error:'Pending transaction not found.'});
 const run=db.transaction(()=>{
  const w=wallet(t.user_id);
  if(t.type==='recharge' && status==='approved'){
   db.prepare('UPDATE wallets SET deposit_balance=deposit_balance+? WHERE user_id=?').run(t.amount,t.user_id);
   ledger(t.user_id,t.amount,'deposit','Recharge approved');
  }
  if(t.type==='withdrawal' && status==='rejected'){
   db.prepare('UPDATE wallets SET earnings_balance=earnings_balance+? WHERE user_id=?').run(t.amount,t.user_id);
   ledger(t.user_id,t.amount,'earnings','Withdrawal rejected; amount returned');
  }
  if(t.type==='withdrawal' && status==='approved'){
   db.prepare('UPDATE wallets SET total_withdrawn=total_withdrawn+? WHERE user_id=?').run(t.amount,t.user_id);
   ledger(t.user_id,-t.amount,'earnings','Withdrawal approved');
  }
  db.prepare('UPDATE transactions SET status=? WHERE id=?').run(status,t.id);
 });
 run(); res.json({message:`Transaction ${status}.`});
});
app.post('/api/admin/tasks',(req,res,next)=>{auth(req,res,()=>admin(req,res,next));},(req,res)=>{
 const {title,description,reward}=req.body||{}, amount=Number(reward);
 if(!title||!description||!Number.isFinite(amount)||amount<0||amount>100000) return res.status(400).json({error:'Provide title, description and valid reward.'});
 const info=db.prepare('INSERT INTO tasks(title,description,reward) VALUES(?,?,?)').run(String(title).slice(0,120),String(description).slice(0,1000),money(amount));
 res.status(201).json({id:info.lastInsertRowid});
});
app.post('/api/admin/submissions/:id/review',auth,admin,(req,res)=>{
 const status=req.body.status;
 if(!['approved','rejected'].includes(status)) return res.status(400).json({error:'Invalid status.'});
 const s=db.prepare("SELECT s.*,t.reward FROM submissions s JOIN tasks t ON t.id=s.task_id WHERE s.id=? AND s.status='pending'").get(Number(req.params.id));
 if(!s) return res.status(404).json({error:'Pending submission not found.'});
 const run=db.transaction(()=>{
  db.prepare('UPDATE submissions SET status=? WHERE id=?').run(status,s.id);
  if(status==='approved'){
   db.prepare('UPDATE wallets SET earnings_balance=earnings_balance+?,total_earned=total_earned+? WHERE user_id=?').run(s.reward,s.reward,s.user_id);
   ledger(s.user_id,s.reward,'earnings','Task reward approved');
  }
 });
 run(); res.json({message:`Task submission ${status}.`});
});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`Task platform running at http://localhost:${PORT}`));
