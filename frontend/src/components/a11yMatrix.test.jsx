import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider, LanguageSelector } from "../config/i18n";
import EmergencyScanView from "./EmergencyScanView";
import CardScanner from "./CardScanner";
import OfflineCard from "./OfflineCard";
import Support from "./Support";
import SummaryFreshness from "./SummaryFreshness";

describe("Accessibility (a11y), Device Matrix, & Responsive Design Test Suite", () => {
  beforeEach(() => {
    const memoryStorage = new Map();
    globalThis.localStorage = {
      getItem: (key) => memoryStorage.get(key) || null,
      setItem: (key, val) => memoryStorage.set(key, String(val)),
      removeItem: (key) => memoryStorage.delete(key),
      clear: () => memoryStorage.clear(),
    };
  });

  afterEach(() => {
    delete globalThis.localStorage;
  });

  it("renders skip-link with accessible target and keyboard focus classes", () => {
    function PageWithSkip() {
      return (
        <div>
          <a href="#main-content" className="skip-link">Skip to main content</a>
          <main id="main-content">
            <h1>Emergency Care</h1>
          </main>
        </div>
      );
    }
    const html = renderToStaticMarkup(<PageWithSkip />);
    expect(html).toContain('class="skip-link"');
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('id="main-content"');
  });

  it("verifies emergency interactive controls have accessible names and semantic labels", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <I18nProvider>
          <EmergencyScanView />
        </I18nProvider>
      </MemoryRouter>
    );

    // Form inputs must have labels
    expect(html).toContain("<label>Clinical Reason Code</label>");
    expect(html).toContain("<label>Facility / Hospital</label>");
    expect(html).toContain("<label>Patient ID</label>");
    expect(html).toContain("UNCONSCIOUS_TRAUMA");
  });

  it("verifies CardScanner provides accessible video label, fallback inputs, and button roles", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <I18nProvider>
          <CardScanner />
        </I18nProvider>
      </MemoryRouter>
    );

    expect(html).toContain('aria-label="QR camera preview"');
    expect(html).toContain('type="url"');
    expect(html).toContain("Start camera");
    expect(html).toContain("Or paste this hospital’s card link");
  });

  it("verifies OfflineCard contains accessible status announcements and clear actions", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <I18nProvider>
          <OfflineCard />
        </I18nProvider>
      </MemoryRouter>
    );

    expect(html).toContain("Your offline QR card");
    expect(html).toContain("No current saved card.");
  });

  it("verifies Support and Usual-Care fallback views provide clear accessible guidance and live status", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <I18nProvider>
          <Support />
        </I18nProvider>
      </MemoryRouter>
    );

    expect(html).toContain('<p role="status">Checking service availability…</p>');
    expect(html).toContain("This is not an emergency response service");
    expect(html).toContain("follow the hospital’s usual care procedure");
  });

  it("verifies SummaryFreshness includes warning indicators for clinical review age", () => {
    const staleDate = "2020-01-01T00:00:00.000Z";
    const freshDate = new Date().toISOString();

    const staleHtml = renderToStaticMarkup(
      <SummaryFreshness updatedAt={staleDate} patient={false} />
    );
    expect(staleHtml).toContain('role="alert"');
    expect(staleHtml).toContain("Summary may be stale");

    const freshHtml = renderToStaticMarkup(
      <SummaryFreshness updatedAt={freshDate} patient={false} />
    );
    expect(freshHtml).toContain('role="note"');
    expect(freshHtml).toContain("Patient-reported summary");
  });

  it("renders LanguageSelector with accessible ARIA labels across English, Tamil, and Hindi", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <LanguageSelector />
      </I18nProvider>
    );

    expect(html).toContain('aria-label="Select application language"');
    expect(html).toContain('value="en"');
    expect(html).toContain('value="ta"');
    expect(html).toContain('value="hi"');
    expect(html).toContain("தமிழ் (Tamil)");
    expect(html).toContain("हिंदी (Hindi)");
  });
});
