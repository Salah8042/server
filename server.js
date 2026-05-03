const express = require("express");
const admin = require("firebase-admin");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json());

/* 🔐 ENV Check */
if (!process.env.FIREBASE_CONFIG || !process.env.DB_URL || !process.env.API_KEY || !process.env.SECRET) {
    console.error("❌ Missing ENV variables");
    process.exit(1);
}

/* 🔐 ENV */
const API_KEY = process.env.API_KEY;
const SECRET = process.env.SECRET;

/* 🔥 Rate Limit */
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30
});
app.use(limiter);

/* 🔥 Firebase */
let serviceAccount;

try {
    serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
} catch (e) {
    console.error("❌ FIREBASE_CONFIG JSON Error");
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.DB_URL
});

const db = admin.database();

/* 🔐 Hash */
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
        if (req.headers["x-api-key"] !== API_KEY) {
            return res.status(403).send("forbidden");
        }

        const token = req.headers["authorization"];
        if (!token) return res.status(401).send("no token");

        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;

        const { timestamp, sign, deviceId } = req.body;

        if (!verifySignature(uid, timestamp, sign)) {
            return res.status(403).send("tampered");
        }

        if (Math.abs(Date.now() - timestamp) > 30000) {
            return res.status(403).send("expired");
        }

        const ref = db.ref("users/" + uid);
        const snapshot = await ref.once("value");

        if (!snapshot.exists()) {
            await ref.set({
                balance: 5,
                deviceId: deviceId,
                createdAt: Date.now()
            });

            return res.send({ balance: 5 });
        }

        const data = snapshot.val();

        if (data.deviceId && data.deviceId !== deviceId) {
            return res.status(403).send("device mismatch");
        }

        res.send({ balance: data.balance });

    } catch (e) {
        console.error(e);
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
        console.error(e);
        res.status(401).send("invalid");
    }
});

/* 🟢 test */
app.get("/", (req, res) => {
    res.send("🔥 Server Running OK 🔥");
});

/* 🚀 Start */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 Server Ready 🔥"));
