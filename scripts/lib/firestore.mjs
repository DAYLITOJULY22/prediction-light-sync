// Auth here comes from Workload Identity Federation set up on the
// prediction-light GCP project: the google-github-actions/auth step in the
// workflow exports a short-lived "external_account" Application Default
// Credentials file before this script runs. firebase-admin's own
// applicationDefault() has a long-standing bug parsing that file format
// (throws "Invalid contents in the credentials file" - see
// https://github.com/firebase/firebase-admin-node/issues/1377 and
// https://github.com/firebase/firebase-admin-node/discussions/2816), even on
// current versions. google-auth-library's GoogleAuth handles WIF files
// correctly, so we use it directly to fetch access tokens and hand them to
// firebase-admin through a minimal custom Credential. No key file, no secret
// GCP credential ever touches this repo either way.
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { GoogleAuth } from "google-auth-library";

const googleAuth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"]
});

const credential = {
  getAccessToken: async () => {
    const client = await googleAuth.getClient();
    const { token } = await client.getAccessToken();
    return {
      access_token: token,
      expires_in: 3600
    };
  }
};

const app = initializeApp({
  credential,
  projectId: "prediction-light"
});

export const db = getFirestore(app);
export { Timestamp, FieldValue };
