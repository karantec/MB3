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
  const response = await mist.get(`/sites/${SITE_ID}/stats/assets`);

  return response.data;
}

module.exports = {
  getAssets,
};
