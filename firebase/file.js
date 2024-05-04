const { bucket } = require("./bucket");
const { v4: uuidv4 } = require("uuid");

const handleUpload = async (file, fileType, folderName) => {
  try {
    if (!file) {
      return console.log("no file");
    }

    const fileName = `${folderName}/${new Date().toISOString()}-${uuidv4()}.${
      fileType.split("/")[1]
    }`;
    const blob = bucket.file(fileName);

    const blobStream = blob.createWriteStream({
      metadata: {
        contentType: fileType,
      },
      gzip: true,
    });

    return new Promise((resolve, reject) => {
      blobStream.on("error", (err) => reject(err));
      blobStream.on("finish", () => resolve(fileName));

      const buffer = Buffer.from(file.buffer);
      blobStream.end(buffer);
    });
  } catch (error) {
    console.error(`Error uploading file`, error);
    return false;
  }
};

const handleGet = async (filename) => {
  try {
    const file = bucket.file(`${filename}`);
    const url = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 10 * 60 * 1000, // 10 min
    });

    return url[0];
  } catch (error) {
    console.error(`Error getting file ${filename}:`, error);
    return false;
  }
};

const handleDelete = async (filename) => {
  try {
    const file = bucket.file(filename);
    await file.delete();
    return true;
  } catch (error) {
    console.error(`Error deleting file ${filename}:`, error);
    return false;
  }
};

module.exports = {
  handleUpload,
  handleGet,
  handleDelete,
};
