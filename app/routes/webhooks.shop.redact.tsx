import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { authenticate, sessionStorage } from "../shopify.server";
import { deleteShopRecord } from "../models/discount.server";
import { deleteAllRulesForShop } from "../models/rules.server";
import { FirestoreSessionStorage } from "../firestore-session-storage.server";

// GDPR (mandatory): sent 48h after a shop uninstalls the app, asking us to erase
// the shop's data. We delete this shop's rules, shop record, and any sessions.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop} — erasing all shop data`);

  await deleteAllRulesForShop(shop);
  await deleteShopRecord(shop);

  // sessionStorage is the same FirestoreSessionStorage instance configured in
  // shopify.server.ts; expose its shop-wide delete helper safely.
  if (sessionStorage instanceof FirestoreSessionStorage) {
    await sessionStorage.deleteAllSessionsForShop(shop);
  } else {
    // Fallback: bulk-delete via direct Firestore query.
    const snapshot = await db
      .collection("sessions")
      .where("shop", "==", shop)
      .get();
    for (const doc of snapshot.docs) await doc.ref.delete();
  }

  return new Response();
};
