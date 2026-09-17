// Auth here comes from Workload Identity Federation set up on the
// prediction-light GCP project: the google-github-actions/auth step in the
// workflow exports short-lived Application Default Credentials before this
// script runs, so applicationDefault() just picks them up. No key file,
// no secret GCP credential ever touches this repo.
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
const app = initializeApp({
credential: applicationDefault(),
projectId: "prediction-light"
});
export const db = getFirestore(app);
export { Timestamp, FieldValue };