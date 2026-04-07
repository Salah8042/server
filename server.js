const express = require("express");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json());

// حماية سبام
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10
});

app.use(limiter);

// داتا مؤقتة
let users = {};

// API
app.post("/reward", (req, res) => {
    const { uid, amount } = req.body;

    if (!uid || amount > 10) {
        return res.status(400).send("invalid");
    }

    if (!users[uid]) users[uid] = 0;

    users[uid] += amount;

    res.send({ balance: users[uid] });
});

// الصفحة الرئيسية
app.get("/", (req, res) => {
    res.send("Server running 🔥😂😂😂😂😂");
});

// 👇 أهم سطر في حياتك
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
