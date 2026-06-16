import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import {
  Firestore,
  Timestamp,
  type CollectionReference,
} from "firebase-admin/firestore";

interface SessionRow {
  id: string;
  shop: string;
  state: string;
  isOnline: boolean;
  scope: string | null;
  expires: Timestamp | null;
  accessToken: string;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  accountOwner: boolean;
  locale: string | null;
  collaborator: boolean;
  emailVerified: boolean;
  refreshToken: string | null;
  refreshTokenExpires: Timestamp | null;
}

/**
 * Firestore-backed Shopify session storage. Sessions are stored as documents in
 * the configured collection (defaults to `sessions`) keyed by session id, which
 * mirrors the structure of the official Prisma adapter so behaviour is the same.
 */
export class FirestoreSessionStorage implements SessionStorage {
  private readonly collection: CollectionReference;

  constructor(firestore: Firestore, collectionName = "sessions") {
    this.collection = firestore.collection(collectionName);
  }

  async storeSession(session: Session): Promise<boolean> {
    await this.collection
      .doc(session.id)
      .set(this.sessionToRow(session), { merge: false });
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const snapshot = await this.collection.doc(id).get();
    if (!snapshot.exists) return undefined;
    return this.rowToSession(snapshot.data() as SessionRow);
  }

  async deleteSession(id: string): Promise<boolean> {
    await this.collection.doc(id).delete().catch(() => {});
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    // Firestore batches are limited to 500 operations.
    for (let i = 0; i < ids.length; i += 400) {
      const batch = this.collection.firestore.batch();
      for (const id of ids.slice(i, i + 400)) {
        batch.delete(this.collection.doc(id));
      }
      await batch.commit();
    }
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const snapshot = await this.collection
      .where("shop", "==", shop)
      .orderBy("expires", "desc")
      .limit(25)
      .get();
    return snapshot.docs.map((doc) => this.rowToSession(doc.data() as SessionRow));
  }

  /** Used by the redact webhook to wipe every session for a shop. */
  async deleteAllSessionsForShop(shop: string): Promise<number> {
    const snapshot = await this.collection.where("shop", "==", shop).get();
    if (snapshot.empty) return 0;
    const ids = snapshot.docs.map((doc) => doc.id);
    await this.deleteSessions(ids);
    return ids.length;
  }

  private sessionToRow(session: Session): SessionRow {
    const params = session.toObject();
    const user = params.onlineAccessInfo?.associated_user;
    return {
      id: session.id,
      shop: session.shop,
      state: session.state,
      isOnline: session.isOnline,
      scope: session.scope ?? null,
      expires: session.expires ? Timestamp.fromDate(session.expires) : null,
      accessToken: session.accessToken ?? "",
      userId: user?.id != null ? String(user.id) : null,
      firstName: user?.first_name ?? null,
      lastName: user?.last_name ?? null,
      email: user?.email ?? null,
      accountOwner: user?.account_owner ?? false,
      locale: user?.locale ?? null,
      collaborator: user?.collaborator ?? false,
      emailVerified: user?.email_verified ?? false,
      refreshToken: params.refreshToken ?? null,
      refreshTokenExpires: params.refreshTokenExpires
        ? Timestamp.fromMillis(
            typeof params.refreshTokenExpires === "number"
              ? params.refreshTokenExpires
              : new Date(params.refreshTokenExpires).getTime(),
          )
        : null,
    };
  }

  private rowToSession(row: SessionRow): Session {
    // Mirrors PrismaSessionStorage.rowToSession so the round-trip is identical.
    const sessionParams: Record<string, string | number | boolean> = {
      id: row.id,
      shop: row.shop,
      state: row.state,
      isOnline: row.isOnline,
      userId: String(row.userId),
      firstName: String(row.firstName),
      lastName: String(row.lastName),
      email: String(row.email),
      locale: String(row.locale),
    };
    if (row.accountOwner !== null) sessionParams.accountOwner = row.accountOwner;
    if (row.collaborator !== null) sessionParams.collaborator = row.collaborator;
    if (row.emailVerified !== null) sessionParams.emailVerified = row.emailVerified;
    if (row.expires) sessionParams.expires = row.expires.toMillis();
    if (row.scope) sessionParams.scope = row.scope;
    if (row.accessToken) sessionParams.accessToken = row.accessToken;
    if (row.refreshToken) sessionParams.refreshToken = row.refreshToken;
    if (row.refreshTokenExpires) {
      sessionParams.refreshTokenExpires = row.refreshTokenExpires.toMillis();
    }
    return Session.fromPropertyArray(Object.entries(sessionParams), true);
  }
}
