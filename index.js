require("dotenv").config();
const authRoute = require("./routes/auth");
const userRoute = require("./routes/user");
const placeRoute = require("./routes/place");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const cors = require("cors");
const connectionSocket = require("./socket/socket");

const connectedUsers = new Map();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 15000000, //15 MB

  cors: {
    // origin: process.env.CLIENT_URL,
    methods: ["GET", "POST", "DELETE", "PUT"],
  },
});

connectionSocket(io, connectedUsers);

//ROUTERS, CALLING MIDDLEWARES
app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoute);
app.use("/api/users", userRoute);
app.use("/api/places", placeRoute);

app.listen(process.env.PORT || 5000, () => {
  console.log(`Server listening on port ${process.env.PORT || 5000}`);
});
