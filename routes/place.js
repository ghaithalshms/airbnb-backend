const router = require("express").Router();
const { Pool } = require("pg");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { v4 } = require("uuid");
const { UploadFileToFireBase } = require("../firebase/upload_file");

// CREATE NEW PLACE
router.post("/create", async (req, res) => {
  const client = await handleGetClient();

  try {
    const place = req.body.place;
    const token = req.body.token;
    // const image = req.image;
    // const imageType = req.imageType;

    // verify data
    if (
      !(
        place.title &&
        place.description &&
        place.country &&
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

    // // upload image
    // const imagePath =
    //   image && (await UploadFileToFireBase(image, imageType, "places"));

    // if (!imagePath) {
    //   return res
    //     .status(500)
    //     .json("Unexpected error while uploading the image.");
    // }

    const imagePath = null;

    // create place
    handleCreatePlace(client, place, tokenId, imagePath).then((isCreated) => {
      if (isCreated) {
        res.status(200).send("Place created successfully.");
      } else {
        res.status(500).send("Unexpected error while creating the place.");
      }
    });
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

    handleDeletePlaceById(client, id, tokenId).then((isDeleted) => {
      if (isDeleted) {
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
    const filters = req.query.filters;
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

const handleCreatePlace = async (client, place, tokenId, imagePath) => {
  const result = await client
    .query(
      `INSERT INTO places (id, title, description, country, city, county, district,
      image_path, area, rooms, wc, price, beds, pets, available,
      category, amenities, features, creator, created_at) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 
        $12, $13, $14, $15, $16, $17, $18, $19, $20)
         RETURNING id;`,
      [
        generateId(),
        place.title,
        place.description,
        place.country,
        place.city,
        place.county,
        place.district,
        imagePath,
        place.area,
        place.rooms,
        place.wc,
        place.price,
        place.beds,
        place.pets,
        place.available,
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
        country = $3,
        city = $4,
        county = $5,
        district = $6,
        category = $7,
        price = $8,
        available = $9,
        area = $10,
        rooms = $11,
        beds = $12,
        wc = $13,
        pets = $14,
        available = $15,
        category = $16,
        amenities = $17,
        features = $18,
        updated_at = $19
      WHERE id = $20
      RETURNING id;`,
      [
        placeDataToUpdate.title,
        placeDataToUpdate.description,
        placeDataToUpdate.country,
        placeDataToUpdate.city,
        placeDataToUpdate.county,
        placeDataToUpdate.district,
        placeDataToUpdate.category,
        placeDataToUpdate.price,
        placeDataToUpdate.available,
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
    query += ` WHERE category = $${parameters.length + 1}`;
    parameters.push(filters.category);
  }
  if (filters.country) {
    query += ` WHERE country IN $${parameters.length + 1}`;
    parameters.push(filters.countries);
  }
  if (filters.city) {
    query += ` WHERE city IN $${parameters.length + 1}`;
    parameters.push(filters.cities);
  }
  if (filters.county) {
    query += ` WHERE county IN $${parameters.length + 1}`;
    parameters.push(filters.counties);
  }
  if (filters.district) {
    query += ` WHERE district IN $${parameters.length + 1}`;
    parameters.push(filters.districts);
  }
  if (filters.area) {
    if (filters.area.max) {
      query += ` WHERE area > $${parameters.length + 1}`;
      parameters.push(filters.area.max);
    }
    if (filters.area.min) {
      query += ` WHERE area < $${parameters.length + 1}`;
      parameters.push(filters.area.min);
    }
  }
  if (filters.rooms) {
    query += ` WHERE rooms = $${parameters.length + 1}`;
    parameters.push(filters.rooms);
  }
  if (filters.beds) {
    query += ` WHERE beds = $${parameters.length + 1}`;
    parameters.push(filters.beds);
  }
  if (filters.wc) {
    query += ` WHERE wc = $${parameters.length + 1}`;
    parameters.push(filters.wc);
  }
  if (filters.pets) {
    query += ` WHERE pets = $${parameters.length + 1}`;
    parameters.push(filters.pets);
  }
  if (filters.available) {
    query += ` WHERE available = $${parameters.length + 1}`;
    parameters.push(filters.available);
  }
  if (filters.price) {
    if (filters.price.max) {
      query += ` WHERE price > $${parameters.length + 1}`;
      parameters.push(filters.price.max);
    }
    if (filters.price.min) {
      query += ` WHERE price < $${parameters.length + 1}`;
      parameters.push(filters.price.min);
    }
  }
  if (filters.amenities) {
    query += ` WHERE $${parameters.length + 1} <@ amenities`;
    parameters.push(filters.amenities);
  }
  if (filters.features) {
    query += ` WHERE $${parameters.length + 1} <@ features`;
    parameters.push(filters.features);
  }
  if (filters.category) {
    query += ` WHERE category = $${parameters.length + 1}`;
    parameters.push(filters.category);
  }

  query += `;`;

  return {
    query,
    parameters,
  };
};

module.exports = router;
