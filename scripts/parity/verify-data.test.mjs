import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSignature, checkFields, checkInspectionActions, checkVisitText, extractFormValue } from "./verify-data.mjs";

const inspection = {
  inspectionForms: [
    { formName: "Visit Information", formFields: [
      { formField: { fieldName: "Assisting 1" }, value: "PARITY-R Inspector 1" },
      { formField: { fieldName: "Assisting 2" }, value: "PARITY-R Inspector 2" },
      { formField: { fieldName: "Works being carried out" }, value: "PARITY-R Works" },
    ] },
    { formName: "Risk Assessment", formFields: [
      { formField: { fieldName: "Accessing Area/Lone Working- Comments" }, value: "PARITY-R risk comment" },
    ] },
  ],
};

test("extractFormValue finds a value by form + field name", () => {
  assert.equal(extractFormValue(inspection, "Visit Information", "Assisting 1"), "PARITY-R Inspector 1");
  assert.equal(extractFormValue(inspection, "Risk Assessment", "Accessing Area/Lone Working- Comments"), "PARITY-R risk comment");
  assert.equal(extractFormValue(inspection, "Nope", "x"), undefined);
});

test("checkSignature passes only with name + image", () => {
  assert.equal(checkSignature({ signature: "img", signatureName: "PARITY-R Client" }, { signatureName: "PARITY-R Client" }).status, "PASS");
  assert.equal(checkSignature({ signature: "", signatureName: "" }, { signatureName: "PARITY-R Client" }).status, "FAIL");
});

test("checkFields passes when all expected values match", () => {
  const r = checkFields("3b", "Mobile->Web", inspection, "Visit Information", { "Assisting 1": "PARITY-R Inspector 1", "Assisting 2": "PARITY-R Inspector 2", "Works being carried out": "PARITY-R Works" });
  assert.equal(r.status, "PASS");
});

test("checkFields fails and reports per-field when one is missing", () => {
  const r = checkFields("3b", "Mobile->Web", inspection, "Visit Information", { "Assisting 1": "PARITY-R Inspector 1", "Works being carried out": "WRONG" });
  assert.equal(r.status, "FAIL");
  assert.equal(r.fields["Assisting 1"], true);
  assert.equal(r.fields["Works being carried out"], false);
});

test("checkInspectionActions passes when all expected names present", () => {
  const acts = [{ name: "PARITY-R Hi" }, { name: "PARITY-R Med" }, { name: "PARITY-R Lo" }];
  const r = checkInspectionActions(acts, [{ name: "PARITY-R Hi" }, { name: "PARITY-R Med" }, { name: "PARITY-R Lo" }]);
  assert.equal(r.status, "PASS");
});

test("checkVisitText passes when all visit-level text fields match", () => {
  const want = { waterSystemDescription: "PARITY-R watersys", workDetails: "PARITY-R workdetails", samplingDetails: "PARITY-R sampling" };
  const r = checkVisitText({ ...want }, want);
  assert.equal(r.status, "PASS");
  assert.equal(r.id, "3d-visit-text");
});

test("checkVisitText fails and reports per-field when one differs", () => {
  const want = { waterSystemDescription: "PARITY-R watersys", workDetails: "PARITY-R workdetails", samplingDetails: "PARITY-R sampling" };
  const r = checkVisitText({ waterSystemDescription: "PARITY-R watersys", workDetails: "WRONG", samplingDetails: null }, want);
  assert.equal(r.status, "FAIL");
  assert.equal(r.fields.waterSystemDescription, true);
  assert.equal(r.fields.workDetails, false);
  assert.equal(r.fields.samplingDetails, false);
});
