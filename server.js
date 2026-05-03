// server.js
const express = require('express');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// === Init Firebase ===
if (!process.env.FIREBASE_CONFIG) {
  throw new Error('FIREBASE_CONFIG is missing');
}
if (!process.env.DB_URL) {
  throw new Error('DB_URL is missing');
}
if (!process.env.API_KEY) {
  throw new Error('API_KEY is missing');
}

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.DB_URL
});

const db = admin.database();

// === Health check ===
app.get('/', (req, res) => {
  res.send('🔥 Server Running 🔥');
});

// === Reward endpoint ===
app.post('/reward', async (req, res) => {
  try {
    // 1) API KEY check
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(403).json({ error: 'Invalid API key' });
    }

    // 2) Firebase ID token check
    let authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }
    // يدعم "Bearer <token>" أو token مباشر
    const idToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const userRef = db.ref('users/' + uid);

    // 3) Transaction عشان نضمن مرة واحدة بس
    const result = await userRef.transaction((current) => {
      if (current === null) {
        // أول مرة
        return {
          balance: 10,
          rewarded: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
      }

      // لو خد المكافأة قبل كده
      if (current.rewarded === true) {
        // نرجّع نفس الداتا بدون تغيير
        return current;
      }

      // حالة نادرة: موجود لكن rewarded=false
      return {
        ...current,
        balance: 10, // تثبيت على 10
        rewarded: true,
        updatedAt: Date.now()
      };
    });

    if (!result.committed) {
      // لو الترانزاكشن ما اتحفظتش
      return res.status(500).json({ error: 'Transaction failed' });
    }

    const finalData = result.snapshot.val();
    return res.json({ balance: finalData.balance });

  } catch (err) {
    console.error('Reward error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// === Start server ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server started on port', PORT);
});
