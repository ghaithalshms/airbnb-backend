const router = require("express").Router();
const { Pool } = require("pg");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { v4 } = require("uuid");
const { handleUpload } = require("../firebase/file");
const multer = require("multer");

const storage = multer.memoryStorage();
const upload = multer({ storage });

// CREATE NEW PLACE
router.post("/create", upload.array("images", 3), async (req, res) => {
  const client = await handleGetClient();

  try {
    const place = req.body.place;
    const token = req.body.token;
    const images = req.images;

    // verify data
    if (
      !(
        images &&
        place.title &&
        place.description &&
        place.city &&
        place.county &&
        place.price &&
        place.category
      )
    ) {
      return res.status(400).send("Missing required data.");
    }

    //verify token
    const tokenId = getUserIdFromToken(token);

    if (!tokenId) {
      return res
        .status(401)
        .json("You are not authorized to create this place, wrong token.");
    }

    // upload images
    const imagePaths = [];
    for (const image of images) {
      const imagePath = await handleUpload(
        image.buffer,
        image.mimetype,
        "places"
      );
      imagePaths.push(imagePath);
    }

    // create place
    handleCreatePlace(client, place, tokenId, imagePaths).then(
      async (isCreated) => {
        if (isCreated) {
          await handleUpdateUserPostCount(client, tokenId, true);
          res.status(200).send("Place created successfully.");
        } else {
          res.status(500).send("Unexpected error while creating the place.");
        }
      }
    );
  } catch (err) {
    res.status(500).json(err);
  } finally {
    client?.release();
  }
});

// ADD TO FAVORITE
router.post("/favorite", async (req, res) => {
  const client = await handleGetClient();

  try {
    const placeId = req.body.placeId;
    const token = req.body.token;

    // verify data
    if (!(placeId && token)) {
      return res.status(400).send("Missing required data.");
    }

    //verify token
    const tokenId = getUserIdFromToken(token);

    if (!tokenId) {
      return res
        .status(401)
        .json("You are not authorized to create this place, wrong token.");
    }

    // add place to favorites
    handleAddPlaceToFavoriteById(client, placeId, tokenId).then((isAdded) => {
      if (isAdded) {
        res
          .status(200)
          .send("Place added to favorites successfully: " + placeId);
      } else {
        res
          .status(500)
          .send(
            "An error happened while adding place to favorites: " + placeId
          );
      }
    });
  } catch (err) {
    res.status(500).json(err);
  } finally {
    client?.release();
  }
});

// UPDATE A PLACE
router.put("/update", async (req, res) => {
  const client = await handleGetClient();
  try {
    const { id, token } = req.body;
    const placeDataToUpdate = req.body;

    const tokenId = getUserIdFromToken(token);

    if (!(await handleVerifyCreator(client, id, tokenId))) {
      return res
        .status(401)
        .json("You are not authorized to update this user.");
    }

    handleUpdatePlaceById(client, id, placeDataToUpdate).then((isUpdated) => {
      if (isUpdated) {
        res.status(200).send("Place updated successfully: " + id);
      } else {
        res.status(401).send("This place id doesn't exist: " + id);
      }
    });
  } catch (err) {
    res.status(500).json(err);
  } finally {
    client?.release();
  }
});

// DELETE A PLACE
router.delete("/delete", async (req, res) => {
  const client = await handleGetClient();
  try {
    const { id, token } = req.body;
    const tokenId = getUserIdFromToken(token);

    if (!(await handleVerifyCreator(client, id, tokenId))) {
      return res
        .status(401)
        .json("You are not authorized to delete this place.");
    }

    handleDeletePlaceById(client, id, tokenId).then(async (isDeleted) => {
      if (isDeleted) {
        await handleUpdateUserPostCount(client, tokenId, false);
        res.status(200).send("Place deleted successfully: " + id);
      } else {
        res
          .status(401)
          .send("You're not authorized to delete this place: " + id);
      }
    });
  } catch (err) {
    res.status(500).json(err);
  } finally {
    client?.release();
  }
});

// GET A PLACE
router.get("/place", async (req, res) => {
  const client = await handleGetClient();
  try {
    const id = req.query.id;

    handleGetPlaceById(client, id).then((placeData) => {
      return res.status(200).json(placeData);
    });
  } catch (err) {
    res.status(500).json(err);
    console.log(err);
  } finally {
    client?.release();
  }
});

// GET PLACES WITH FILTER
router.get("/places", async (req, res) => {
  const client = await handleGetClient();
  try {
    const filters = JSON.parse(req.query.filters) || [];

    const places = await handleGetPlaces(client, filters);
    res.status(200).json(places);
  } catch (err) {
    res.status(500).json(err);
    console.log(err);
  } finally {
    client?.release();
  }
});

// MIDDLEWARES
const handleGetClient = async () => {
  const pool = new Pool({ connectionString: process.env.PG_STRING });
  const client = await pool.connect().catch((err) => {
    console.log("pg client error:", err);
  });

  return client;
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

const generateId = () => {
  return v4();
};

const handleCreatePlace = async (client, place, tokenId, imagePaths) => {
  const result = await client
    .query(
      `INSERT INTO places (id, title, description, city, county,
        district, image_paths, area, rooms, wc, price, beds, pets,
        category, amenities, features, creator, created_at) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 
        $12, $13, $14, $15, $16, $17, $18)
      RETURNING id;`,
      [
        generateId(),
        place.title,
        place.description,
        place.city,
        place.county,
        place.district,
        imagePaths,
        place.area,
        place.rooms,
        place.wc,
        place.price,
        place.beds,
        place.pets,
        place.category,
        place.amenities,
        place.features,
        tokenId,
        new Date().toISOString(),
      ]
    )
    .catch((err) => {
      console.log(err);
    });

  return result.rowCount > 0;
};

const handleDeletePlaceById = async (client, placeId, tokenId) => {
  const result = await client
    .query(`DELETE FROM places WHERE id = $1 RETURNING id;`, [placeId, tokenId])
    .catch((err) => {
      console.log(err);
    });

  return result.rowCount > 0;
};

const handleUpdateUserPostCount = async (client, id, isAugmenting) => {
  const result = await client
    .query(
      `UPDATE users SET post_count = post_count ${isAugmenting ? "+" : "-"} 1 
   WHERE id = $1 RETURNING id;`,
      [id]
    )
    .catch((err) => {
      console.log(err);
    });

  return result.rowCount > 0;
};

const handleVerifyCreator = async (client, placeId, tokenId) => {
  const result = await client
    .query(`SELECT creator FROM places WHERE id = $1 AND creator = $2;`, [
      placeId,
      tokenId,
    ])
    .catch((err) => {
      console.log(err);
    });
  return result.rowCount > 0;
};

const handleUpdatePlaceById = async (client, id, placeDataToUpdate) => {
  const result = await client
    .query(
      `UPDATE places SET
        title = $1,
        description = $2,
        city = $3,
        county = $4,
        district = $5,
        category = $6,
        price = $7,
        available = $8,
        area = $9,
        rooms = $10,
        beds = $11,
        wc = $12,
        pets = $13,
        category = $14,
        amenities = $15,
        features = $16,
        updated_at = $17
      WHERE id = $18
      RETURNING id;`,
      [
        placeDataToUpdate.title,
        placeDataToUpdate.description,
        placeDataToUpdate.city,
        placeDataToUpdate.county,
        placeDataToUpdate.district,
        placeDataToUpdate.category,
        placeDataToUpdate.price,
        placeDataToUpdate.area,
        placeDataToUpdate.rooms,
        placeDataToUpdate.beds,
        placeDataToUpdate.wc,
        placeDataToUpdate.pets,
        placeDataToUpdate.available,
        placeDataToUpdate.category,
        placeDataToUpdate.amenities,
        placeDataToUpdate.features,
        new Date().toISOString(),
        id,
      ]
    )
    .catch((err) => {
      console.log(err);
    });

  return result.rowCount > 0;
};

const handleGetPlaceById = async (client, id) => {
  const result = await client
    .query("SELECT * FROM users WHERE id = $1;", [id])
    .catch((err) => {
      console.log(err);
    });

  if (result.rowCount > 0) {
    return result.rows[0];
  } else {
    return null;
  }
};

const handleGetPlaces = async (client, filters) => {
  const { query, parameters } = setGetPlacesQueryParameters(filters);

  const result = await client.query(query, parameters).catch((err) => {
    console.log(err);
  });

  return result.rowCount > 0 ? result.rows : null;
};

const handleAddPlaceToFavoriteById = async (client, placeId, tokenId) => {
  const result = await client
    .query(
      `INSERT INTO favorites (id, place_id, user_id, added_at) 
      VALUES ($1, $2, $3, $5) RETURNING id;`,
      [generateId(), placeId, tokenId, new Date().toISOString()]
    )
    .catch((err) => {
      console.log(err);
    });

  return result.rowCount > 0;
};

const setGetPlacesQueryParameters = (filters) => {
  let query = `SELECT * FROM places`;
  let parameters = [];

  if (filters.category) {
    query += ` ${parameters.length > 0 ? "AND" : "WHERE"} category = $${
      parameters.length + 1
    }`;
    parameters.push(filters.category);
  }

  if (filters.city) {
    query += ` ${parameters.length > 0 ? "AND" : "WHERE"} city IN $${
      parameters.length + 1
    }`;
    parameters.push(filters.cities);
  }
  if (filters.county) {
    query += ` ${parameters.length > 0 ? "AND" : "WHERE"} county IN $${
      parameters.length + 1
    }`;
    parameters.push(filters.counties);
  }
  if (filters.district) {
    query += ` ${parameters.length > 0 ? "AND" : "WHERE"} district IN $${
      parameters.length + 1
    }`;
    parameters.push(filters.districts);
  }
  if (filters.area) {
    if (filters.area.max) {
      query += ` ${parameters.length > 0 ? "AND" : "WHERE"} area < $${
        parameters.length + 1
      }`;
      parameters.push(filters.area.max);
    }
    if (filters.area.min) {
      query += ` ${parameters.length > 0 ? "AND" : "WHERE"} area > $${
        parameters.length + 1
      }`;
      parameters.push(filters.area.min);
    }
  }
  if (filters.rooms) {
    query += ` ${parameters.length > 0 ? "AND" : "WHERE"} rooms = $${
      parameters.length + 1
    }`;
    parameters.push(filters.rooms);
  }
  if (filters.beds) {
    query += ` ${parameters.length > 0 ? "AND" : "WHERE"} beds = $${
      parameters.length + 1
    }`;
    parameters.push(filters.beds);
  }
  if (filters.wc) {
    query += ` ${parameters.length > 0 ? "AND" : "WHERE"} wc = $${
      parameters.length + 1
    }`;
    parameters.push(filters.wc);
  }
  if (filters.pets) {
    query += ` ${parameters.length > 0 ? "AND" : "WHERE"} pets = $${
      parameters.length + 1
    }`;
    parameters.push(filters.pets);
  }
  if (filters.available) {
    query += ` ${parameters.length > 0 ? "AND" : "WHERE"} available = $${
      parameters.length + 1
    }`;
    parameters.push(filters.available);
  }
  if (filters.price) {
    if (filters.price.max) {
      query += ` ${parameters.length > 0 ? "AND" : "WHERE"} price < $${
        parameters.length + 1
      }`;
      parameters.push(filters.price.max);
    }
    if (filters.price.min) {
      query += ` ${parameters.length > 0 ? "AND" : "WHERE"} price > $${
        parameters.length + 1
      }`;
      parameters.push(filters.price.min);
    }
  }
  if (filters.amenities) {
    query += ` ${parameters.length > 0 ? "AND" : "WHERE"} $${
      parameters.length + 1
    } <@ amenities`;
    parameters.push(filters.amenities);
  }
  if (filters.features) {
    query += ` ${parameters.length > 0 ? "AND" : "WHERE"} $${
      parameters.length + 1
    } <@ features`;
    parameters.push(filters.features);
  }

  query += `;`;

  return {
    query,
    parameters,
  };
};

module.exports = router;
