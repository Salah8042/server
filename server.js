const express = require("express");
const app = express();

app.use(express.json());

// 👇 تخزين مؤقت (يتصفر لو السيرفر عمل restart)
let users = {};

// 🎁 هدية التسجيل
app.post("/reward", (req, res) => {
    const { uid } = req.body;

    if (!uid) {
        return res.status(400).send("invalid");
    }

    // 👇 أول مرة بس
    if (!users[uid]) {
        users[uid] = 3;
    }

    res.send({ balance: users[uid] });
});

// 👇 اختبار السيرفر
app.get("/", (req, res) => {
    res.send("Server running 🔥");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
