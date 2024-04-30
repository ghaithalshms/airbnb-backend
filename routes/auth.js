const router = require("express").Router();
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
require("dotenv").config();
const { v4 } = require("uuid");
var crypto = require("crypto");

//REGISTER
router.post("/register", async (req, res) => {
  const client = await handleGetClient();
  try {
    const user = {
      username: req.body.username.trim().toLowerCase(),
      password: req.body.password,
      first_name: firstLetterToCapital(req.body.first_name.trim()),
      last_name: firstLetterToCapital(req.body.last_name.trim()),
      email: req.body.email.trim().toLowerCase(),
    };

    // verify data
    for (const [key, value] of Object.entries(user)) {
      if (!value) {
        return res.status(400).send("Missing required data.");
      }
      console.assert(value != null);
    }
    value != null;
    if (!isValidUsername(user.username)) {
      return res.status(400).send("Invalid username.");
    }

    if (await handleCheckUsernameAvailable(client, res, user.username)) {
      return res.status(403).send("Username already in use.");
    }

    handleCreateUser(client, res, user);
  } catch (err) {
    res.status(500).json(err);
  } finally {
    client?.release();
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  const client = await handleGetClient();
  try {
    const { username, password } = req.body;

    if (!(username && password)) {
      return res.status(400).send("Missing required data.");
    }

    const id = await handleGetUserIdByUsername(client, res, username);

    if (!id) {
      return res.status(401).json("This username doesn't exist.");
    }

    const user = await handleGetUserById(client, res, id);

    const hashPassword = generateHashPassword(password);

    if (hashPassword !== user.password) {
      return res.status(401).json("Wrong password.");
    }

    const token = generateToken(id);

    res.status(200).json({ token });
  } catch (err) {
    res.status(500).json(err);
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

const firstLetterToCapital = (word) => {
  return word.charAt(0).toUpperCase() + word.slice(1);
};

const isValidUsername = (username) => {
  if (!username) {
    return false;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return false;
  }

  if (username.length < 3 || username.length > 16) {
    return false;
  }

  return true;
};

const handleGetUserById = async (client, res, id) => {
  const result = await client
    .query("SELECT * FROM users WHERE id = $1;", [id])
    .catch((err) => {
      console.log(err);
      res.status(500).json(err);
    });

  if (result.rowCount > 0) {
    return result.rows[0];
  } else {
    return null;
  }
};

const handleCheckUsernameAvailable = async (client, res, username) => {
  const result = await client
    .query(`SELECT id FROM users WHERE username = $1;`, [username])
    .catch((err) => {
      console.log(err);
      res.status(500).json(err);
    });

  return result.rowCount > 0;
};

const handleGetUserIdByUsername = async (client, res, username) => {
  const result = await client
    .query(`SELECT id FROM users WHERE username = $1;`, [username])
    .catch((err) => {
      console.log(err);
      res.status(500).json(err);
    });

  if (result.rowCount > 0) {
    return result.rows[0].id;
  } else {
    return null;
  }
};

const generateUserId = () => {
  return v4();
};

const generateToken = (id) => {
  return jwt.sign(
    {
      id,
    },
    process.env.JWT_SEC,
    { expiresIn: "14d" }
  );
};

const generateHashPassword = (password) => {
  return crypto.createHash("sha256").update(password).digest().toString("hex");
};

const handleCreateUser = async (client, res, user) => {
  client
    .query(
      `INSERT INTO users (id, username, password, first_name, last_name, email, created_at) 
      VALUES ($1, $2, $3, $4, $5, $6, $7);`,
      [
        generateUserId(),
        user.username,
        generateHashPassword(user.password),
        user.first_name,
        user.last_name,
        user.email,
        new Date().toISOString(),
      ]
    )
    .then(() => {
      const token = generateToken(user.id);
      res.status(201).json({ token });
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json(err);
    });
};

module.exports = router;
