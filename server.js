const express = require("express");
const app = express();

app.use(express.json());

let users = {};

app.post("/reward", (req, res) => {
    const { uid, amount } = req.body;

    if (!uid || amount > 10) {
        return res.status(400).send("invalid");
    }

    if (!users[uid]) users[uid] = 0;

    users[uid] += amount;

    res.send({ balance: users[uid] });
});

app.get("/", (req, res) => {
    res.send("Server running 🔥");
});

app.listen(3000);
