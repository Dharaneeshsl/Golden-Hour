const {createHandler} = require("../backend/src/serverless");
module.exports = createHandler(async () => {
  const {createApp} = require("../backend/src/app");
  return createApp();
});
