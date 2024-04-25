const authRoute = require("./routes/auth");
const userRoute = require("./routes/user");
const placeRoute = require("./routes/place");
const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();

//ROUTERS, CALLING MIDDLEWARES
app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoute);
app.use("/api/users", userRoute);
app.use("/api/places", placeRoute);

app.listen(process.env.PORT || 5000, () => {
  console.log(`Server listening on port ${process.env.PORT || 5000}`);
});
