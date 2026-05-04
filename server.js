const express = require("express");
const admin = require("firebase-admin");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

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
  console.error("Invalid FIREBASE_CONFIG");
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
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

function randomHex(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

function timingSafeEqualText(a, b) {
  const aa = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function hmacHex(key, data) {
  return crypto.createHmac("sha256", String(key)).update(String(data)).digest("hex");
}

async function authGuard(req, res, next) {
  try {
    if (req.headers["x-api-key"] !== API_KEY) {
      return res.status(403).json({ error: "forbidden" });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "no token" });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.email = decoded.email || null;
    req.name = decoded.name || null;
    next();
  } catch (e) {
    console.error("authGuard:", e);
    return res.status(401).json({ error: "invalid token" });
  }
}

app.get("/", (req, res) => {
  res.send("🔥 Server Ready 🔥");
});

app.post("/session", authGuard, async (req, res) => {
  try {
    const uid = req.uid;
    const deviceId = String(req.body?.deviceId || "").trim();

    if (!deviceId) {
      return res.status(400).json({ error: "missing deviceId" });
    }

    const sessionId = randomHex(16);
    const sessionKey = randomHex(32);
    const challenge = randomHex(16);
    const expiresAt = Date.now() + 5 * 60 * 1000;

    await db.ref(`sessions/${uid}/${sessionId}`).set({
      sessionKey,
      deviceId,
      challenge,
      used: false,
      createdAt: Date.now(),
      expiresAt,
    });

    return res.json({
      sessionId,
      sessionKey,
      challenge,
      expiresAt,
    });
  } catch (e) {
    console.error("session error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

app.post("/reward", authGuard, async (req, res) => {
  try {
    const uid = req.uid;
    const deviceId = String(req.body?.deviceId || "").trim();
    const sessionId = String(req.body?.sessionId || "").trim();
    const challenge = String(req.body?.challenge || "").trim();
    const timestamp = Number(req.body?.timestamp || 0);
    const nonce = String(req.body?.nonce || "").trim();
    const sign = String(req.body?.sign || "").trim();

    if (!deviceId || !sessionId || !challenge || !timestamp || !nonce || !sign) {
      return res.status(400).json({ error: "missing data" });
    }

    if (Math.abs(Date.now() - timestamp) > 15000) {
      return res.status(403).json({ error: "expired" });
    }

    const sessionRef = db.ref(`sessions/${uid}/${sessionId}`);
    const snap = await sessionRef.once("value");

    if (!snap.exists()) {
      return res.status(403).json({ error: "bad session" });
    }

    const session = snap.val() || {};

    if (session.used === true) {
      return res.status(403).json({ error: "session used" });
    }

    if (session.deviceId !== deviceId) {
      return res.status(403).json({ error: "device mismatch" });
    }

    if (session.challenge !== challenge) {
      return res.status(403).json({ error: "bad challenge" });
    }

    if (session.expiresAt && Date.now() > session.expiresAt) {
      return res.status(403).json({ error: "session expired" });
    }

    const expected = hmacHex(
      session.sessionKey,
      `${uid}|${sessionId}|${deviceId}|${challenge}|${timestamp}|${nonce}|reward`
    );

    if (!timingSafeEqualText(expected, sign)) {
      return res.status(403).json({ error: "bad signature" });
    }

    const nonceRef = db.ref(`nonces/${uid}/${sessionId}/${nonce}`);
    const nonceTx = await nonceRef.transaction((current) => {
      if (current === null) return Date.now();
      return;
    });

    if (!nonceTx.committed) {
      return res.status(403).json({ error: "replay" });
    }

    const userRef = db.ref(`users/${uid}`);
    const rewardTx = await userRef.transaction((current) => {
      if (current === null) {
        return {
          balance: 10,
          rewarded: true,
          deviceId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      }

      if (current.rewarded === true) {
        return {
          ...current,
          updatedAt: Date.now(),
        };
      }

      return {
        ...current,
        balance: 10,
        rewarded: true,
        deviceId: current.deviceId || deviceId,
        updatedAt: Date.now(),
      };
    });

    if (!rewardTx.committed) {
      return res.status(500).json({ error: "reward failed" });
    }

    await sessionRef.update({ used: true, usedAt: Date.now() });

    const user = rewardTx.snapshot.val() || {};
    return res.json({
      balance: user.balance || 0,
      rewarded: !!user.rewarded,
    });
  } catch (e) {
    console.error("reward error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

app.get("/balance", authGuard, async (req, res) => {
  try {
    const snap = await db.ref(`users/${req.uid}`).once("value");
    const user = snap.val() || {};
    return res.json({
      balance: user.balance || 0,
      rewarded: !!user.rewarded,
    });
  } catch (e) {
    console.error("balance error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 Server Running 🔥"));
