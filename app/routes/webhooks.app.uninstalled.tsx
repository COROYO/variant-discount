import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { authenticate, sessionStorage } from "../shopify.server";
import { FirestoreSessionStorage } from "../firestore-session-storage.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    if (sessionStorage instanceof FirestoreSessionStorage) {
      await sessionStorage.deleteAllSessionsForShop(shop);
    } else {
      const snapshot = await db
        .collection("sessions")
        .where("shop", "==", shop)
        .get();
      for (const doc of snapshot.docs) await doc.ref.delete();
    }
  }

  return new Response();
};
