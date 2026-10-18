// Shared country -> required-document definitions, used by both the old
// anonymous intake form (assets/app.js) and the partner registration form
// (assets/register.js). Keep this the single source of truth for document
// field ids/labels so the two forms never drift apart.
window.DOC_DEFS = (function () {
  var DOCS = {
    US: {
      driver: [
        { id: "license_front", label: "Driving license — front", required: true },
        { id: "license_back", label: "Driving license — back", required: true },
        { id: "tlc_license", label: "TLC license", required: true }
      ],
      vehicle: [
        { id: "registration", label: "Vehicle registration", required: true },
        { id: "insurance", label: "Insurance policy", required: true }
      ],
      company: [
        { id: "cert", label: "Registration certificate", required: true },
        { id: "bank", label: "Bank details (IBAN / bank letter)", required: false },
        { id: "owner_id", label: "Owner / manager ID", required: false }
      ]
    },
    ES: {
      driver: [
        { id: "license_front", label: "Driving license — front", required: true },
        { id: "license_back", label: "Driving license — back", required: true },
        { id: "taxi_license", label: "Taxi / VTC license", required: true }
      ],
      vehicle: [
        { id: "circulacion", label: "Permiso de circulación", required: true },
        { id: "itv", label: "ITV certificate", required: true },
        { id: "insurance", label: "Insurance policy", required: true }
      ],
      company: [
        { id: "cert", label: "Registration certificate (alta autónomo)", required: true },
        { id: "bank", label: "Bank details (IBAN)", required: false },
        { id: "owner_id", label: "Owner / manager ID", required: false }
      ]
    },
    GR: {
      driver: [
        { id: "license_front", label: "Driving license — front", required: true },
        { id: "license_back", label: "Driving license — back", required: true },
        { id: "taxi_license", label: "Taxi / tourist-office license", required: true }
      ],
      vehicle: [
        { id: "registration", label: "Vehicle registration", required: true },
        { id: "kteo", label: "ΚΤΕΟ (roadworthiness) certificate", required: true },
        { id: "insurance", label: "Insurance policy", required: true }
      ],
      company: [
        { id: "cert", label: "Registration certificate", required: true },
        { id: "bank", label: "Bank details (IBAN)", required: false },
        { id: "owner_id", label: "Owner / manager ID", required: false }
      ]
    },
    GB: {
      driver: [
        { id: "pco_driver", label: "PCO driver licence", required: true },
        { id: "driving_license", label: "Driving licence", required: true }
      ],
      vehicle: [
        { id: "pco_vehicle", label: "PCO vehicle licence", required: true },
        { id: "mot", label: "MOT certificate", required: true },
        { id: "insurance", label: "Insurance policy", required: true }
      ],
      company: [
        { id: "cert", label: "Registration certificate (Companies House)", required: true },
        { id: "bank", label: "Bank details", required: false },
        { id: "owner_id", label: "Owner / manager ID", required: false }
      ]
    }
  };
  var GENERIC_DOCS = {
    driver: [
      { id: "license_front", label: "Driving license — front", required: true },
      { id: "license_back", label: "Driving license — back", required: true },
      { id: "professional_license", label: "Professional / taxi driver license", required: false }
    ],
    vehicle: [
      { id: "registration", label: "Vehicle registration", required: true },
      { id: "insurance", label: "Insurance policy", required: true }
    ],
    company: [
      { id: "cert", label: "Registration certificate", required: true },
      { id: "bank", label: "Bank details (IBAN / bank letter)", required: false },
      { id: "owner_id", label: "Owner / manager ID", required: false }
    ]
  };
  function slotsFor(country, type) {
    var set = DOCS[country] || GENERIC_DOCS;
    return set[type] || [];
  }
  return { DOCS: DOCS, GENERIC_DOCS: GENERIC_DOCS, slotsFor: slotsFor };
})();
