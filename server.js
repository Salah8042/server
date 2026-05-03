const express = require("express");
const admin = require("firebase-admin");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json());

if (!process.env.FIREBASE_CONFIG || !process.env.DB_URL) {
  console.error("Missing ENV variables");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
} catch (e) {
  console.error("FIREBASE_CONFIG is invalid JSON");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.DB_URL,
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

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : auth;
}

async function authMiddleware(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "no token" });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.email = decoded.email || "";
    req.name = decoded.name || "";
    next();
  } catch (e) {
    console.error("auth error:", e);
    return res.status(401).json({ error: "invalid" });
  }
}

app.get("/", (req, res) => {
  res.send("🔥 Server Running OK 🔥");
});

app.post("/reward", authMiddleware, async (req, res) => {
  try {
    const deviceId = String(req.body?.deviceId || "").trim();

    if (!deviceId) {
      return res.status(400).json({ error: "missing deviceId" });
    }

    const now = Date.now();
    const userRef = db.ref(`users/${req.uid}`);

    const result = await userRef.transaction((current) => {
      if (current === null) {
        return {
          balance: 10,
          rewarded: true,
          deviceId,
          createdAt: now,
          updatedAt: now,
          lastRewardAt: now,
        };
      }

      if (current.deviceId && current.deviceId !== deviceId) {
        return; // abort transaction
      }

      if (current.rewarded === true) {
        return {
          ...current,
          updatedAt: now,
          deviceId: current.deviceId || deviceId,
        };
      }

      return {
        ...current,
        balance: 10,
        rewarded: true,
        deviceId: current.deviceId || deviceId,
        updatedAt: now,
        lastRewardAt: now,
      };
    });

    if (!result.committed) {
      return res.status(403).json({ error: "device mismatch" });
    }

    const data = result.snapshot.val() || {};
    return res.json({
      balance: data.balance || 0,
      rewarded: !!data.rewarded,
    });
  } catch (e) {
    console.error("reward error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

app.get("/balance", authMiddleware, async (req, res) => {
  try {
    const snap = await db.ref(`users/${req.uid}`).once("value");
    if (!snap.exists()) {
      return res.json({ balance: 0, rewarded: false });
    }

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
