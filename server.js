const express = require("express");
const admin = require("firebase-admin");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json());

const FIREBASE_CONFIG = process.env.FIREBASE_CONFIG;
const DB_URL = process.env.DB_URL;
const API_KEY = process.env.API_KEY;

if (!FIREBASE_CONFIG || !DB_URL || !API_KEY) {
  console.error("Missing ENV variables");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(FIREBASE_CONFIG);
} catch (e) {
  console.error("FIREBASE_CONFIG invalid");
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
    standardHeaders: true,
    legacyHeaders: false,
  })
);

function bearerToken(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : auth;
}

async function authGuard(req, res, next) {
  try {
    if (req.headers["x-api-key"] !== API_KEY) {
      return res.status(403).json({ error: "forbidden" });
    }

    const idToken = bearerToken(req);
    if (!idToken) {
      return res.status(401).json({ error: "no token" });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    req.uid = decoded.uid;
    next();
  } catch (e) {
    console.error("authGuard:", e);
    return res.status(401).json({ error: "invalid token" });
  }
}

async function appCheckGuard(req, res, next) {
  try {
    const appCheckToken = req.headers["x-firebase-appcheck"];
    if (!appCheckToken) {
      return res.status(401).json({ error: "missing appcheck" });
    }

    await admin.appCheck().verifyToken(appCheckToken);
    next();
  } catch (e) {
    console.error("appCheckGuard:", e);
    return res.status(401).json({ error: "invalid appcheck" });
  }
}

app.get("/", (req, res) => {
  res.send("🔥 Server Ready 🔥");
});

app.post("/init", authGuard, appCheckGuard, async (req, res) => {
  try {
    const deviceId = String(req.body?.deviceId || "").trim();
    if (!deviceId) {
      return res.status(400).json({ error: "missing deviceId" });
    }

    const ref = db.ref(`users/${req.uid}`);
    const snap = await ref.once("value");

    if (!snap.exists()) {
      await ref.set({
        balance: 10,
        rewarded: true,
        deviceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      const data = snap.val() || {};
      if (data.deviceId && data.deviceId !== deviceId) {
        return res.status(403).json({ error: "device mismatch" });
      }
    }

    return res.json({ success: true });
  } catch (e) {
    console.error("init error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

app.get("/balance", authGuard, appCheckGuard, async (req, res) => {
  try {
    const snap = await db.ref(`users/${req.uid}`).once("value");
    const data = snap.val() || {};
    return res.json({
      balance: data.balance || 0,
      rewarded: !!data.rewarded,
    });
  } catch (e) {
    console.error("balance error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 Server Ready 🔥"));
