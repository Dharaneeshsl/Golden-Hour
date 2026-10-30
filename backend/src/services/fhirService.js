/**
 * HL7 FHIR Release 4 & International Patient Summary (IPS) Serializer
 * 
 * Maps GoldenHour patient profile and critical emergency metadata
 * into standardized FHIR R4 JSON resources for ABDM and hospital EHR exchange.
 */

function toFhirPatient(patient) {
  const profile = patient.profile || {};
  return {
    resourceType: "Patient",
    id: patient.id,
    identifier: [
      {
        system: "https://goldenhour.health/patients",
        value: patient.id,
      },
      {
        system: "https://ethereum.org/address",
        value: patient.wallet,
      },
    ],
    active: true,
    name: [
      {
        use: "official",
        text: profile.fullName || "Anonymous Patient",
      },
    ],
    telecom: profile.phone
      ? [
          {
            system: "phone",
            value: profile.phone,
            use: "mobile",
          },
        ]
      : [],
    gender: (profile.gender || "unknown").toLowerCase(),
  };
}

function toFhirAllergies(patientId, allergies = []) {
  return allergies.map((allergy, idx) => ({
    resourceType: "AllergyIntolerance",
    id: `allergy-${patientId}-${idx}`,
    clinicalStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
          code: "active",
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
          code: "confirmed",
        },
      ],
    },
    patient: {
      reference: `Patient/${patientId}`,
    },
    code: {
      text: allergy,
    },
    criticality: "high",
  }));
}

function toFhirConditions(patientId, conditions = []) {
  return conditions.map((condition, idx) => ({
    resourceType: "Condition",
    id: `condition-${patientId}-${idx}`,
    clinicalStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
          code: "active",
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
          code: "confirmed",
        },
      ],
    },
    subject: {
      reference: `Patient/${patientId}`,
    },
    code: {
      text: condition,
    },
  }));
}

function buildIPSBundle(patient, records = []) {
  const fhirPatient = toFhirPatient(patient);
  const critical = patient.critical || {};
  const allergies = toFhirAllergies(patient.id, critical.allergies || []);
  const conditions = toFhirConditions(patient.id, critical.conditions || []);

  const entries = [
    { resource: fhirPatient },
    ...allergies.map((a) => ({ resource: a })),
    ...conditions.map((c) => ({ resource: c })),
  ];

  return {
    resourceType: "Bundle",
    id: `ips-bundle-${patient.id}`,
    type: "document",
    timestamp: new Date().toISOString(),
    entry: entries,
    meta: {
      profile: ["http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips"],
    },
  };
}

module.exports = {
  toFhirPatient,
  toFhirAllergies,
  toFhirConditions,
  buildIPSBundle,
};
