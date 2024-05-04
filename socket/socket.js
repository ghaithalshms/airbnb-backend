const { Pool } = require("pg");
require("dotenv").config();

const connect = (io, connectedUsers) => {
  io.on("connection", (socket) => {
    setUser(socket, connectedUsers);
    sendMessage(socket, connectedUsers);
    disconnect(socket, connectedUsers);
  });
};

const setUser = (socket, connectedUsers) => {
  socket.on("set_username", (username) => {
    connectedUsers.set(username, socket);
  });
};

const sendMessage = (socket, connectedUsers) => {
  socket
    .on("send_message", (messageData) => {
      const userSocketID = connectedUsers.get(messageData.to)?.id;
      socket.to(userSocketID)?.emit("receive_message", messageData);
    })
    .catch((err) => {
      console.log(err);
    });
};

const disconnect = async (socket, connectedUsers) => {
  const pool = new Pool({ connectionString: process.env.PG_STRING });
  const client = await pool.connect().catch((err) => {
    console.log(err);
    res.status(500).json(err);
  });
  socket.on("disconnect", async () => {
    try {
      let userId = null;
      connectedUsers.forEach((value, key) => {
        if (value === socket) {
          userId = key;
        }
      });

      if (userId) {
        connectedUsers.delete(userId);
        await handleUpdateUserLastSeen(userId);
      }
    } catch (err) {
      console.log("unexpected error : ", err);
    } finally {
      await client?.release();
    }
  });
};

const handleUpdateUserLastSeen = async (userId) => {
  await client.query(`UPDATE users SET last_seen=$1 WHERE id=$2;`, [
    new Date().toISOString(),
    userId,
  ]);
};

module.exports = connect;
