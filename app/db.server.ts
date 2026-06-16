import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import {
  Firestore,
  getFirestore,
  Timestamp,
} from "firebase-admin/firestore";

declare global {
  // eslint-disable-next-line no-var
  var firebaseAppGlobal: App | undefined;
  // eslint-disable-next-line no-var
  var firestoreGlobal: Firestore | undefined;
}

// Resolve credentials in this order:
//   1. FIREBASE_SERVICE_ACCOUNT_JSON  – inline JSON, useful for tests/secrets
//   2. GOOGLE_APPLICATION_CREDENTIALS – path to a service account key file
//   3. Application Default Credentials (Cloud Run, `gcloud auth ADC`, etc.)
function buildApp(): App {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT;

  const inlineKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineKey) {
    const credentials = JSON.parse(inlineKey);
    return initializeApp({
      credential: cert(credentials),
      projectId: projectId ?? credentials.project_id,
    });
  }

  return initializeApp(projectId ? { projectId } : undefined);
}

function getApp(): App {
  if (global.firebaseAppGlobal) return global.firebaseAppGlobal;
  const existing = getApps()[0];
  const app = existing ?? buildApp();
  if (process.env.NODE_ENV !== "production") {
    global.firebaseAppGlobal = app;
  }
  return app;
}

export function getDb(): Firestore {
  if (global.firestoreGlobal) return global.firestoreGlobal;
  const firestore = getFirestore(getApp());
  // Allow `undefined` values in writes so we can omit optional fields cleanly.
  firestore.settings({ ignoreUndefinedProperties: true });
  if (process.env.NODE_ENV !== "production") {
    global.firestoreGlobal = firestore;
  }
  return firestore;
}

export { Timestamp };
export const db = getDb();
export default db;
