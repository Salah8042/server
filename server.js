const express = require("express");
const admin = require("firebase-admin");

const app = express();
app.use(express.json());

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.DB_URL
});

const db = admin.database();

app.get("/", (req, res) => {
  res.send("🔥 Server Running 🔥");
});

app.post("/reward", async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) return res.status(401).send("no token");

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    const ref = db.ref("users/" + uid);
    const snap = await ref.once("value");

    if (!snap.exists()) {
      await ref.set({
        balance: 5,
        createdAt: Date.now()
      });

      return res.send({ balance: 5 });
    }

    res.send({ balance: snap.val().balance });

  } catch (e) {
    res.status(500).send("error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 Ready 🔥"));
