const express = require("express");
const app = express();

app.use(express.json());

let users = {};

// الصفحة الرئيسية
app.get("/", (req, res) => {
  res.send("Server running 🔥");
});

// مكافأة التسجيل
app.post("/reward", (req, res) => {
  const { uid } = req.body;

  if (!uid) {
    return res.status(400).send("no uid");
  }

  if (!users[uid]) {
    users[uid] = {
      balance: 0,
      bonus: false
    };
  }

  if (users[uid].bonus) {
    return res.send("Already taken");
  }

  users[uid].balance += 3;
  users[uid].bonus = true;

  res.json({ balance: users[uid].balance });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on " + PORT);
});
