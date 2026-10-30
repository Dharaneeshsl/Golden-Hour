const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");

module.exports = (controller) => {
  const router = express.Router();

  // Export: strictly limited to the patient themselves
  router.get("/export/:patientId", requireAuth, controller.exportData);

  // DSR: strictly authenticated patient only, patientId derived from token
  router.post("/dsr", requireAuth, controller.submitDSR);

  // Erasure: disabled pending Step 4 legal-hold verification
  router.post("/erasure/:patientId", requireAuth, controller.executeErasure);

  return router;
};
