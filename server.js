const express = require("express");
const app = express();

app.use(express.json());

let users = {}; // مؤقت (بعد كده نربطه DB)

// 🎁 مكافأة التسجيل
app.post("/reward", (req, res) => {
    const { uid } = req.body;

    if (!uid) return res.status(400).send("invalid");

    if (!users[uid]) {
        users[uid] = {
            balance: 3,
            created: true
        };
    }

    res.send({ balance: users[uid].balance });
});

// 💰 جلب الرصيد
app.get("/balance", (req, res) => {
    const uid = req.query.uid;

    if (!uid || !users[uid]) {
        return res.send({ balance: 0 });
    }

    res.send({ balance: users[uid].balance });
});

app.get("/", (req, res) => {
    res.send("Server running 🔥");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server started"));
