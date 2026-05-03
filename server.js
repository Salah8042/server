const express = require("express");
const admin = require("firebase-admin");

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
  console.error("FIREBASE_CONFIG invalid");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DB_URL,
});

const db = admin.database();

app.get("/", (req, res) => {
  res.send("🔥 Server Running 🔥");
});

app.post("/init", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;

    if (!token) {
      return res.status(401).json({ error: "no token" });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    const ref = db.ref("users/" + uid);
    const snap = await ref.once("value");

    if (!snap.exists()) {
      await ref.set({
        balance: 10,
        createdAt: Date.now(),
      });

      return res.json({ balance: 10 });
    }

    return res.json({
      balance: snap.val().balance || 0,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server error" });
  }
});

app.get("/balance", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;

    if (!token) {
      return res.status(401).json({ error: "no token" });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    const snap = await db.ref("users/" + uid).once("value");

    if (!snap.exists()) {
      return res.json({ balance: 0 });
    }

    return res.json({
      balance: snap.val().balance || 0,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 Server Ready 🔥"));
