// Auth here comes from Workload Identity Federation set up on the
// prediction-light GCP project: the google-github-actions/auth step in the
// workflow exports a short-lived "external_account" Application Default
// Credentials file before this script runs.
//
// We talk to Firestore through @google-cloud/firestore directly rather than
// through firebase-admin/firestore. firebase-admin's own credential loader
// (admin.credential.applicationDefault(), and even a hand-rolled custom
// credential object passed to firebase-admin's initializeApp()) has a
// long-standing incompatibility with WIF's "external_account" credential
// files - see https://github.com/firebase/firebase-admin-node/issues/1377
// and https://github.com/firebase/firebase-admin-node/discussions/2816.
// @google-cloud/firestore does its own ADC resolution via
// google-auth-library under the hood, which handles WIF files correctly, so
// pointing it at the same project with no explicit credential just works.
// No key file, no secret GCP credential ever touches this repo either way.
import { Firestore, Timestamp, FieldValue } from "@google-cloud/firestore";

export const db = new Firestore({ projectId: "prediction-light" });
export { Timestamp, FieldValue };
