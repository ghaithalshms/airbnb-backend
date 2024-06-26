const router = require("express").Router();
const { Pool } = require("pg");
require("dotenv").config();
const jwt = require("jsonwebtoken");

router.delete("/delete", async (req, res) => {
  const client = await handleGetClient();
  try {
    const { id, token } = req.body;
    const tokenId = getUserIdFromToken(token);

    if (tokenId !== id) {
      return res
        .status(401)
        .json("You are not authorized to delete this user.");
    }

    handleDeleteUserById(client, id).then((isDeleted) => {
      if (isDeleted) {
        res.status(200).send("User deleted successfully: " + id);
      } else {
        res.status(401).send("This user id doesn't exist: " + id);
      }
    });
  } catch (err) {
    res.status(500).json(err);
  } finally {
    client?.release();
  }
});

router.put("/update", async (req, res) => {
  const client = await handleGetClient();
  try {
    const { id, token } = req.body;
    const userDataToUpdate = req.body;

    const tokenId = getUserIdFromToken(token);

    if (tokenId !== id) {
      return res
        .status(401)
        .json("You are not authorized to update this user.");
    }

    handleUpdateUserById(client, id, userDataToUpdate).then((isUpdated) => {
      if (isUpdated) {
        res.status(200).send("User updated successfully: " + id);
      } else {
        res.status(401).send("This user id doesn't exist: " + id);
      }
    });
  } catch (err) {
    res.status(500).json(err);
  } finally {
    client?.release();
  }
});

router.get("/user", async (req, res) => {
  const client = await handleGetClient();
  try {
    const id = req.query.id;

    handleGetUserById(client, id).then((userData) => {
      if (userData) {
        return res.status(200).json(userData);
      } else {
        return res.status(401).json("This user doesn't exist: " + id);
      }
    });
  } catch (err) {
    res.status(500).json(err);
    console.log(err);
  } finally {
    client?.release();
  }
});

const handleGetClient = async () => {
  const pool = new Pool({ connectionString: process.env.PG_STRING });
  const client = await pool.connect().catch((err) => {
    console.log("pg client error:", err);
  });

  return client;
};

const handleGetUserById = async (client, id) => {
  const result = await client
    .query(
      `SELECT id, username, email, pp_path, first_name, last_name,
    created_at, biography, post_count, verified
     FROM users WHERE id = $1;`,
      [id]
    )
    .catch((err) => {
      console.log(err);
    });

  if (result.rowCount > 0) {
    return result.rows[0];
  } else {
    return null;
  }
};

const getUserIdFromToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SEC);
    return decoded.id;
  } catch (error) {
    console.error("Error decoding token:", error.message);
    return null;
  }
};

const handleDeleteUserById = async (client, id) => {
  const result = await client
    .query(`DELETE FROM users WHERE id = $1 RETURNING id;`, [id])
    .catch((err) => {
      console.log(err);
    });

  return result.rowCount > 0;
};

const handleUpdateUserById = async (client, id, userDataToUpdate) => {
  const result = await client
    .query(
      `UPDATE users SET
    username = $1,
    first_name = $2,
    last_name = $3,
    email = $4 
    WHERE id = $5
    RETURNING id;`,
      [
        userDataToUpdate.username,
        userDataToUpdate.first_name,
        userDataToUpdate.last_name,
        userDataToUpdate.email,
        id,
      ]
    )
    .catch((err) => {
      console.log(err);
    });

  return result.rowCount > 0;
};

module.exports = router;
