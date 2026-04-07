const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Server is alive ✅");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server started on " + PORT);
});
