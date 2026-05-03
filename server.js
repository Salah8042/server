const express = require("express");
const admin = require("firebase-admin");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json());

const API_KEY = process.env.API_KEY;
const SECRET = process.env.SECRET;
const DB_URL = process.env.DB_URL;
const FIREBASE_CONFIG = process.env.FIREBASE_CONFIG;

if (!API_KEY || !SECRET || !DB_URL || !FIREBASE_CONFIG) {
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
    max: 10,
  })
);

function generateHash(uid, timestamp) {
  return crypto
    .createHash("sha256")
    .update(uid + String(timestamp) + SECRET)
    .digest("hex");
}

function verifySignature(uid, timestamp, sign) {
  if (!uid || !timestamp || !sign) return false;
  return generateHash(uid, timestamp) === sign;
}

async function authMiddleware(req, res, next) {
  try {
    const apiKey = req.headers["x-api-key"];
    if (apiKey !== API_KEY) {
      return res.status(403).send("forbidden");
    }

    const authHeader = req.headers["authorization"];
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      return res.status(401).send("no token");
    }

    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (e) {
    console.error(e);
    return res.status(401).send("invalid");
  }
}

app.get("/", (req, res) => {
  res.send("🔥 Secure Server Running 🔥");
});

app.post("/reward", authMiddleware, async (req, res) => {
  try {
    const { timestamp, sign, deviceId } = req.body;

    if (!timestamp || !sign || !deviceId) {
      return res.status(400).send("missing data");
    }

    if (Math.abs(Date.now() - Number(timestamp)) > 30000) {
      return res.status(403).send("expired");
    }

    if (!verifySignature(req.uid, timestamp, sign)) {
      return res.status(403).send("tampered");
    }

    const ref = db.ref("users/" + req.uid);

    const result = await ref.transaction((current) => {
      if (current === null) {
        return {
          balance: 5,
          deviceId,
          createdAt: Date.now(),
          lastReward: Date.now(),
        };
      }

      if (current.deviceId && current.deviceId !== deviceId) {
        return;
      }

      return current;
    });

    if (!result.committed) {
      return res.status(403).send("device mismatch");
    }

    const data = result.snapshot.val();
    return res.send({ balance: data.balance || 0 });
  } catch (e) {
    console.error(e);
    return res.status(500).send("error");
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
    return res.status(500).send("error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 Server Ready 🔥"));
