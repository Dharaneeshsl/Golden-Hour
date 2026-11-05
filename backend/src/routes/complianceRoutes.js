const {validatedRouter} = require("../utils/validatedRouter");
const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");

module.exports = (controller) => {
  const router = validatedRouter();

  router.get("/audit-export", requireAuth, controller.auditExport);
  router.get("/me/requests", requireAuth, controller.myRequests);
  router.post("/requests/:id/resolve", requireAuth, controller.resolveRequest);
  router.get("/requests", requireAuth, controller.requests);
  router.put("/holds/:patientId", requireAuth, controller.hold);
  router.get("/me/archive", requireAuth, controller.archive);

  // Export: strictly limited to the patient themselves
  router.get("/export/:patientId", requireAuth, controller.exportData);

  // DSR: strictly authenticated patient only, patientId derived from token
  router.post("/dsr", requireAuth, controller.submitDSR);

  // Erasure: disabled pending Step 4 legal-hold verification
  router.post("/erasure/:patientId", requireAuth, controller.executeErasure);

  return router;
};
