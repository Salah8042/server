const express = require("express");
const admin = require("firebase-admin");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json());

/* 🔐 مفاتيح */
const API_KEY = "salah_secret_999";
const SECRET = "super_secret_key_123";

/* 🔥 Rate Limit */
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20
});
app.use(limiter);

/* 🔥 Firebase من ENV */
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sample-firebase-ai-app-7d182-default-rtdb.firebaseio.com"
});

const db = admin.database();

/* 🔐 التوقيع */
function generateHash(uid, timestamp) {
    return crypto
        .createHash("sha256")
        .update(uid + timestamp + SECRET)
        .digest("hex");
}

function verifySignature(uid, timestamp, sign) {
    return generateHash(uid, timestamp) === sign;
}

/* 🎁 reward */
app.post("/reward", async (req, res) => {
    try {
        // 🔐 API KEY
        if (req.headers["x-api-key"] !== API_KEY) {
            return res.status(403).send("forbidden");
        }

        // 🔐 Firebase Token
        const token = req.headers["authorization"];
        if (!token) return res.status(401).send("no token");

        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;

        const { timestamp, sign, deviceId } = req.body;

        // 🔐 Signature
        if (!verifySignature(uid, timestamp, sign)) {
            return res.status(403).send("tampered");
        }

        // ⏱️ Timestamp (30 ثانية)
        if (Math.abs(Date.now() - timestamp) > 30000) {
            return res.status(403).send("expired");
        }

        const ref = db.ref("users/" + uid);
        const snapshot = await ref.once("value");

        // 👇 أول مرة
        if (!snapshot.exists()) {
            await ref.set({
                balance: 3,
                deviceId: deviceId,
                createdAt: Date.now()
            });

            return res.send({ balance: 3 });
        }

        const data = snapshot.val();

        // 🔒 Device Lock
        if (data.deviceId && data.deviceId !== deviceId) {
            return res.status(403).send("device mismatch");
        }

        res.send({ balance: data.balance });

    } catch (e) {
        res.status(401).send("invalid");
    }
});

/* 💰 balance */
app.get("/balance", async (req, res) => {
    try {
        if (req.headers["x-api-key"] !== API_KEY) {
            return res.status(403).send("forbidden");
        }

        const token = req.headers["authorization"];
        if (!token) return res.status(401).send("no token");

        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;

        const snapshot = await db.ref("users/" + uid).once("value");

        if (!snapshot.exists()) {
            return res.send({ balance: 0 });
        }

        res.send({ balance: snapshot.val().balance });

    } catch (e) {
        res.status(401).send("invalid");
    }
});

/* 🟢 test */
app.get("/", (req, res) => {
    res.send("🔥 Secure Server Running 🔥");
});

/* 🚀 تشغيل */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 Server Ready 🔥"));
