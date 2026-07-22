const axios = require("axios");

const SITE_ID = process.env.MIST_SITE_ID;

const mist = axios.create({
  baseURL: "https://api.mist.com/api/v1",
  headers: {
    Authorization: `Token ${process.env.MIST_API_TOKEN}`,
    "Content-Type": "application/json",
  },
});

async function getAssets() {
  try {
    console.log("SITE_ID:", SITE_ID);

    const url = `/sites/${SITE_ID}/stats/assets`;
    console.log("Calling:", url);

    const response = await mist.get(url);

    return response.data;
  } catch (err) {
    console.error("Mist API Error");
    console.error("Status:", err.response?.status);
    console.error("Data:", err.response?.data);
    console.error("URL:", err.config?.url);

    throw err;
  }
}

module.exports = {
  getAssets,
};
