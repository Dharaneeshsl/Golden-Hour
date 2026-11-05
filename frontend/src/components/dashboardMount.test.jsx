import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import PatientDashboard from "./PatientDashboard.jsx";
import DoctorDashboard from "./DoctorDashboard.jsx";
import AdminDashboard from "./AdminDashboard.jsx";
import EmergencyScanView from "./EmergencyScanView.jsx";
import PatientOnboarding from "./PatientOnboarding.jsx";

describe("Dashboard Components Mount & Render Regression Suite", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mounts and renders PatientDashboard cleanly", () => {
    const html = renderToString(
      React.createElement(PatientDashboard, {
        patientId: "p-test-1",
        wallet: "0x1111111111111111111111111111111111111111",
      })
    );
    expect(html).toBeTruthy();
    expect(html).toContain("Loading patient profile and records...");
  });

  it("mounts and renders DoctorDashboard with reason codes and facility state", () => {
    const html = renderToString(
      React.createElement(DoctorDashboard, {
        wallet: "0x2222222222222222222222222222222222222222",
      })
    );
    expect(html).toBeTruthy();
    expect(html).toContain("Clinician Portal");
    expect(html).toContain("Care Team Workspace");
  });

  it("mounts and renders AdminDashboard with administrative tabs", () => {
    const html = renderToString(React.createElement(AdminDashboard));
    expect(html).toBeTruthy();
    expect(html).toContain("Governance &amp; Compliance Dashboard");
    expect(html).toContain("Provider Management");
  });

  it("mounts and renders EmergencyScanView without missing inputs or state crashes", () => {
    const html = renderToString(
      React.createElement(MemoryRouter, null, React.createElement(EmergencyScanView, { initialPatientId: "p-test-1" }))
    );
    expect(html).toBeTruthy();
    expect(html).toContain("Break-Glass Emergency Access");
    expect(html).toContain("Clinical Reason Code");
    expect(html).toContain("Facility / Hospital");
  });

  it("mounts and renders PatientOnboarding inside Router context", () => {
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(PatientOnboarding, { onComplete: () => {} })
      )
    );
    expect(html).toBeTruthy();
    expect(html).toContain("Welcome to GoldenHour");
    expect(html).toContain("Register as Patient");
  });
});
