import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import DoctorDashboard from "./DoctorDashboard.jsx";
import EmergencyScanView from "./EmergencyScanView.jsx";

describe("Emergency Frontend Components Rendering", () => {
  it("renders DoctorDashboard without ReferenceError or rendering crash", () => {
    const html = renderToString(
      React.createElement(DoctorDashboard, { wallet: "0x1111111111111111111111111111111111111111" })
    );
    expect(html).toBeTruthy();
    expect(html).toContain("Clinician Portal");
  });

  it("renders EmergencyScanView with clinical reason codes and facility inputs without crash", () => {
    const html = renderToString(
      React.createElement(EmergencyScanView, { initialPatientId: "p-test-uuid-999" })
    );
    expect(html).toBeTruthy();
    expect(html).toContain("Break-Glass Emergency Access");
    expect(html).toContain("Clinical Reason Code");
    expect(html).toContain("Facility / Hospital");
  });
});
