require("dotenv").config();

const express = require("express");
const admin = require("firebase-admin");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json());

/* 🔐 ENV CHECK */
if (!process.env.FIREBASE_CONFIG || !process.env.SECRET || !process.env.API_KEY) {
    console.error("❌ Missing ENV variables");
    process.exit(1);
}

/* 🔐 مفاتيح */
const API_KEY = process.env.API_KEY;
const SECRET = process.env.SECRET;

/* 🔥 Rate Limit */
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10
});
app.use(limiter);

/* 🔥 Firebase */
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.DB_URL
});

const db = admin.database();

/* 🔐 توليد التوقيع */
function generateHash(uid, timestamp) {
    return crypto
        .createHash("sha256")
        .update(uid + timestamp + SECRET)
        .digest("hex");
}

function verifySignature(uid, timestamp, sign) {
    return generateHash(uid, timestamp) === sign;
}

/* 🔐 Middleware حماية */
async function authMiddleware(req, res, next) {
    try {
        // API KEY
        if (req.headers["x-api-key"] !== API_KEY) {
            return res.status(403).send("forbidden");
        }

        // Token
        const token = req.headers["authorization"]?.split(" ")[1];
        if (!token) return res.status(401).send("no token");

        const decoded = await admin.auth().verifyIdToken(token);

        req.uid = decoded.uid;
        next();
    } catch (e) {
        console.error(e);
        res.status(401).send("invalid");
    }
}

/* 🎁 reward */
app.post("/reward", authMiddleware, async (req, res) => {
    try {
        const { timestamp, sign, deviceId } = req.body;

        // تحقق البيانات
        if (!timestamp || !sign || !deviceId) {
            return res.status(400).send("missing data");
        }

        // Signature
        if (!verifySignature(req.uid, timestamp, sign)) {
            return res.status(403).send("tampered");
        }

        // Timestamp (30 ثانية)
        if (Math.abs(Date.now() - timestamp) > 30000) {
            return res.status(403).send("expired");
        }

        const ref = db.ref("users/" + req.uid);

        const result = await ref.transaction((current) => {
            // أول مرة
            if (current === null) {
                return {
                    balance: 5,
                    deviceId: deviceId,
                    createdAt: Date.now(),
                    lastReward: Date.now()
                };
            }

            // Device Lock
            if (current.deviceId && current.deviceId !== deviceId) {
                return; // abort
            }

            return current;
        });

        if (!result.committed) {
            return res.status(403).send("device mismatch");
        }

        res.send({ balance: result.snapshot.val().balance });

    } catch (e) {
        console.error(e);
        res.status(500).send("error");
    }
});

/* 💰 balance */
app.get("/balance", authMiddleware, async (req, res) => {
    try {
        const snapshot = await db.ref("users/" + req.uid).once("value");

        if (!snapshot.exists()) {
            return res.send({ balance: 0 });
        }

        res.send({ balance: snapshot.val().balance });

    } catch (e) {
        console.error(e);
        res.status(500).send("error");
    }
});

/* 🟢 test */
app.get("/", (req, res) => {
    res.send("🔥 Secure Server Running 🔥");
});

/* 🚀 تشغيل */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 Server Ready 🔥"));
