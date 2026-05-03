const express = require("express");
const admin = require("firebase-admin");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json());

const FIREBASE_CONFIG = process.env.FIREBASE_CONFIG;
const DB_URL = process.env.DB_URL;

if (!FIREBASE_CONFIG || !DB_URL) {
  console.error("Missing ENV variables");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(FIREBASE_CONFIG);
} catch (e) {
  console.error("FIREBASE_CONFIG is invalid JSON");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DB_URL,
});

const db = admin.database();

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 20,
  })
);

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      return res.status(401).send("no token");
    }

    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.user = decoded;
    next();
  } catch (e) {
    console.error(e);
    res.status(401).send("invalid");
  }
}

app.get("/", (req, res) => {
  res.send("🔥 Secure Server Running 🔥");
});

app.post("/reward", authMiddleware, async (req, res) => {
  try {
    const ref = db.ref("users/" + req.uid);
    const snapshot = await ref.once("value");

    if (!snapshot.exists()) {
      const userData = req.user || {};

      await ref.set({
        balance: 5,
        name: userData.name || "",
        email: userData.email || "",
        createdAt: Date.now(),
      });

      return res.send({ balance: 5, created: true });
    }

    const data = snapshot.val();
    return res.send({
      balance: data.balance || 0,
      created: false,
    });
  } catch (e) {
    console.error(e);
    res.status(500).send("error");
  }
});

app.get("/balance", authMiddleware, async (req, res) => {
  try {
    const snapshot = await db.ref("users/" + req.uid).once("value");

    if (!snapshot.exists()) {
      return res.send({ balance: 0 });
    }

    return res.send({ balance: snapshot.val().balance || 0 });
  } catch (e) {
    console.error(e);
    res.status(500).send("error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 Server Ready 🔥"));
