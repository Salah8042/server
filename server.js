require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// Firebase init
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.DB_URL
});

const db = admin.database();

// API
app.post('/reward', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const token = req.headers['authorization'];

    if (apiKey !== process.env.API_KEY) {
      return res.status(403).json({ error: 'Invalid API key' });
    }

    if (!token) {
      return res.status(401).json({ error: 'No token' });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    const userRef = db.ref('users/' + uid);
    const snapshot = await userRef.get();

    let balance = 0;

    if (snapshot.exists()) {
      balance = snapshot.val().balance || 0;
    }

    balance += 10;

    await userRef.set({
      balance: balance
    });

    res.json({ balance });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/', (req, res) => {
  res.send('🔥 Server Running 🔥');
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Server started');
});
