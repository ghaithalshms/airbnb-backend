const router = require("express").Router();
const { Pool } = require("pg");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { v4 } = require("uuid");
const { UploadFileToFireBase } = require("../firebase/upload_file");

router.post("/create", async (req, res) => {
  const client = handleGetClient();

  try {
    const place = req.body.place;
    const token = req.body.token;
    const image = req.image;
    const imageType = req.imageType;

    // verify data
    if (
      !(
        image &&
        place.title &&
        place.description &&
        place.country &&
        place.city &&
        place.district &&
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

    // upload image
    const imagePath =
      image && (await UploadFileToFireBase(image, imageType, "places"));

    if (!imagePath) {
      return res
        .status(500)
        .json("Unexpected error while uploading the image.");
    }

    // create place
    handleCreatePlace(client, res, place, tokenId, imagePath);
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

// router.get("/", async (req, res) => {
//   const qNew = req.query.new;
//   const qCategory = req.query.category;
//   try {
//     let places;

//     if (qNew) {
//       places = await Place.find().sort({ createdAt: -1 }).limit(1);
//     } else if (qCategory) {
//       places = await Place.find({
//         categorys: {
//           $in: [qCategory],
//         },
//       });
//     } else {
//       places = await Place.find();
//     }

//     res.status(200).json(places);
//   } catch (err) {
//     res.status(500).json(err);
//   }
// });

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

const generatePlaceId = () => {
  return v4();
};

const handleCreatePlace = async (client, res, place, tokenId, imagePath) => {
  client
    .query(
      `INSERT INTO places (id, title, description, country, city, district, 
        category, price, available, image_path, gross_square_meters, 
        room_living_rooms_number, bathroom_number, item_status, elevator, garden, 
        balcony, park, wifi, heating_type, creator, created_at) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18, $19, $20, $21, $22);`,
      [
        generatePlaceId(),
        place.title,
        place.description,
        place.country,
        place.city,
        place.district,
        place.category,
        place.price,
        place.available,
        imagePath,
        place.gross_square_meters,
        place.room_living_rooms_number,
        place.bathroom_number,
        place.item_status,
        place.elevator,
        place.garden,
        place.balcony,
        place.park,
        place.wifi,
        place.heating_type,
        tokenId,
        new Date().toISOString(),
      ]
    )
    .then(() => {
      res.status(201).send("Place created successfully.");
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json(err);
    });
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
        district = $5,
        category = $6,
        price = $7,
        available = $8,
        gross_square_meters = $9,
        room_living_rooms_number = $10,
        bathroom_number = $11,
        item_status = $12,
        elevator = $13,
        garden = $14,
        balcony = $15,
        park = $16,
        wifi = $17,
        heating_type = $18,
        updated_at = $19
      WHERE id = $20
      RETURNING id;`,
      [
        placeDataToUpdate.title,
        placeDataToUpdate.description,
        placeDataToUpdate.country,
        placeDataToUpdate.city,
        placeDataToUpdate.district,
        placeDataToUpdate.category,
        placeDataToUpdate.price,
        placeDataToUpdate.available,
        placeDataToUpdate.gross_square_meters,
        placeDataToUpdate.room_living_rooms_number,
        placeDataToUpdate.bathroom_number,
        placeDataToUpdate.item_status,
        placeDataToUpdate.elevator,
        placeDataToUpdate.garden,
        placeDataToUpdate.balcony,
        placeDataToUpdate.park,
        placeDataToUpdate.wifi,
        placeDataToUpdate.heating_type,
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

module.exports = router;
