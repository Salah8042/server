const express = require("express");
const admin = require("firebase-admin");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json());

const SECRET = "ULTRA_SECRET_KEY_123";

// 🔥 Rate limit
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 20
}));

// 🔥 Firebase init
admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

// 🔥 Fake DB (غيرها بعدين)
let users = {};
let usedNonces = {};


// 🔐 Firebase Auth
async function verifyFirebase(req, res, next) {
  const token = req.headers.firebase;

  if (!token) return res.send("No Firebase");

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch {
    res.send("Invalid Firebase");
  }
}


// 🔐 Signature + Anti Replay
function verifySign(req, res, next) {
  const sign = req.headers.sign;
  const { timestamp, nonce } = req.body;

  if (!timestamp || !nonce) return res.send("Invalid request");

  const now = Date.now();

  // ⛔ منع replay
  if (Math.abs(now - timestamp) > 10000) {
    return res.send("Expired");
  }

  if (usedNonces[nonce]) {
    return res.send("Replay attack");
  }

  usedNonces[nonce] = true;

  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (sign !== expected) {
    return res.send("Tampered");
  }

  next();
}


// 💰 BONUS API
app.post("/reward", verifyFirebase, verifySign, (req, res) => {
  const uid = req.user.uid;

  if (!users[uid]) {
    users[uid] = {
      balance: 0,
      bonus: false
    };
  }

  if (users[uid].bonus) {
    return res.send("Already taken");
  }

  users[uid].balance += 3;
  users[uid].bonus = true;

  res.send({ balance: users[uid].balance });
});


// 📊 BALANCE
app.get("/balance", verifyFirebase, (req, res) => {
  const uid = req.user.uid;

  if (!users[uid]) {
    return res.send({ balance: 0 });
  }

  res.send({ balance: users[uid].balance });
});


// 👿 Honeypot (Trap)
app.post("/hack", (req, res) => {
  console.log("Hacker detected:", req.ip);
  res.send("Logged 👿");
});


app.get("/", (req, res) => {
  res.send("ULTRA SECURE SERVER 🔥");
});


app.listen(3000, () => console.log("Server started"));
