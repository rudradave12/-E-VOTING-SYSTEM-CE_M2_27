import { initializeApp, getApps, getApp, deleteApp, cert, App } from 'firebase-admin/app';
import { getAuth, Auth, DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { SERVER_CONFIG } from './config';

let adminApp: App | null = null;
let adminAuth: Auth | null = null;
let adminDb: Firestore | null = null;

// Test hooks for hermetic automated tests
type TokenVerifierFn = (token: string) => Promise<{
  isValid: boolean;
  uid?: string;
  email?: string;
  role?: string;
  error?: string;
}>;

let testVerifier: TokenVerifierFn | null = null;
let testFirestore: any = null;

export function setAdminTokenVerifierForTesting(verifier: TokenVerifierFn | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SECURITY VIOLATION: Cannot register test token verifier in production mode.');
  }
  testVerifier = verifier;
}

export function setAdminFirestoreForTesting(db: any): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SECURITY VIOLATION: Cannot register test Firestore mock in production mode.');
  }
  testFirestore = db;
}

export function isFirestoreTestingMockActive(): boolean {
  return testFirestore !== null;
}

export async function resetFirebaseAdminForTesting(): Promise<void> {
  const apps = getApps();
  for (const app of apps) {
    try {
      await deleteApp(app);
    } catch {
      // Ignore
    }
  }
  adminApp = null;
  adminAuth = null;
  adminDb = null;
  testVerifier = null;
  testFirestore = null;
}

/**
 * Checks whether Firebase Admin credentials or an emulator environment are configured.
 */
export function isFirebaseConfigured(): boolean {
  if (testFirestore !== null) return true;
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.FIRESTORE_EMULATOR_HOST
  );
}

/**
 * Initializes and returns the shared Firebase Admin App instance.
 */
export function getFirebaseAdminApp(): App {
  if (!adminApp) {
    if (getApps().length === 0) {
      const saKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (saKey) {
        try {
          const parsed = JSON.parse(saKey);
          adminApp = initializeApp({
            credential: cert(parsed),
            projectId: SERVER_CONFIG.PROJECT_ID,
          });
        } catch (e: any) {
          console.warn('[FirebaseAdmin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON:', e.message);
          adminApp = initializeApp({ projectId: SERVER_CONFIG.PROJECT_ID });
        }
      } else {
        adminApp = initializeApp({ projectId: SERVER_CONFIG.PROJECT_ID });
      }
    } else {
      adminApp = getApp();
    }
  }
  return adminApp;
}

/**
 * Returns the Firebase Admin Auth instance.
 */
export function getFirebaseAdminAuth(): Auth {
  if (!adminAuth) {
    const app = getFirebaseAdminApp();
    adminAuth = getAuth(app);
  }
  return adminAuth;
}

/**
 * Returns the Firebase Admin Firestore instance.
 * Automatically targets SERVER_CONFIG.FIRESTORE_DATABASE_ID when specified.
 */
export function getFirebaseAdminFirestore(): Firestore {
  if (testFirestore) {
    return testFirestore as unknown as Firestore;
  }
  if (!adminDb) {
    const app = getFirebaseAdminApp();
    const dbId = SERVER_CONFIG.FIRESTORE_DATABASE_ID;
    if (dbId && dbId !== '(default)') {
      adminDb = getFirestore(app, dbId);
    } else {
      adminDb = getFirestore(app);
    }
  }
  return adminDb;
}

/**
 * Creates a hermetic, in-memory mock of the Firebase Admin Firestore SDK
 * for testing without cloud credentials or network dependencies.
 */
export function createInMemoryFirestoreMock(): any {
  const store = new Map<string, any>();

  function createDocRef(docPath: string): any {
    const docId = docPath.split('/').pop() || '';
    return {
      id: docId,
      path: docPath,
      async get() {
        const data = store.get(docPath);
        return {
          exists: data !== undefined,
          id: docId,
          data: () => (data !== undefined ? JSON.parse(JSON.stringify(data)) : undefined),
        };
      },
      async set(data: any, options?: { merge?: boolean }) {
        if (options?.merge && store.has(docPath)) {
          const current = store.get(docPath);
          store.set(docPath, { ...current, ...JSON.parse(JSON.stringify(data)) });
        } else {
          store.set(docPath, JSON.parse(JSON.stringify(data)));
        }
      },
      async update(data: any) {
        if (!store.has(docPath)) {
          throw new Error(`NOT_FOUND: No document to update at path: ${docPath}`);
        }
        const current = store.get(docPath);
        store.set(docPath, { ...current, ...JSON.parse(JSON.stringify(data)) });
      },
      async delete() {
        store.delete(docPath);
      },
      collection(subName: string) {
        return createColRef(`${docPath}/${subName}`);
      },
    };
  }

  function createColRef(colPath: string): any {
    return {
      path: colPath,
      doc(id?: string) {
        const docId = id || `auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        return createDocRef(`${colPath}/${docId}`);
      },
      where(field: string, op: string, value: any) {
        return createQuery(colPath, [{ field, op, value }]);
      },
      limit(n: number) {
        return createQuery(colPath, [], n);
      },
      async get() {
        return executeQuery(colPath, []);
      },
    };
  }

  function createQuery(colPath: string, filters: Array<{ field: string; op: string; value: any }>, limitCount?: number): any {
    return {
      where(field: string, op: string, value: any) {
        return createQuery(colPath, [...filters, { field, op, value }], limitCount);
      },
      limit(n: number) {
        return createQuery(colPath, filters, n);
      },
      async get() {
        return executeQuery(colPath, filters, limitCount);
      },
    };
  }

  function executeQuery(colPath: string, filters: Array<{ field: string; op: string; value: any }>, limitCount?: number) {
    const colPrefix = `${colPath}/`;
    const matchingDocs: Array<{ id: string; data: any }> = [];

    for (const [key, val] of store.entries()) {
      if (key.startsWith(colPrefix)) {
        const subPath = key.substring(colPrefix.length);
        if (!subPath.includes('/')) {
          let matches = true;
          for (const f of filters) {
            if (f.op === '==') {
              if (val[f.field] !== f.value) {
                matches = false;
                break;
              }
            }
          }
          if (matches) {
            matchingDocs.push({ id: subPath, data: val });
          }
        }
      }
    }

    const sliced = limitCount ? matchingDocs.slice(0, limitCount) : matchingDocs;
    return {
      empty: sliced.length === 0,
      size: sliced.length,
      docs: sliced.map((d) => ({
        id: d.id,
        ref: createDocRef(`${colPath}/${d.id}`),
        exists: true,
        data: () => JSON.parse(JSON.stringify(d.data)),
      })),
    };
  }

  const mockDb = {
    collection(name: string) {
      return createColRef(name);
    },
    doc(path: string) {
      return createDocRef(path);
    },
    async runTransaction(updateFunction: (transaction: any) => Promise<any>) {
      const transaction = {
        async get(docRef: any) {
          return docRef.get();
        },
        set(docRef: any, data: any, options?: any) {
          docRef.set(data, options);
          return transaction;
        },
        update(docRef: any, data: any) {
          docRef.update(data);
          return transaction;
        },
      };
      return await updateFunction(transaction);
    },
    _dumpStore() {
      return store;
    },
    _clear() {
      store.clear();
    },
  };

  return mockDb;
}

/**
 * Verifies a Firebase ID token on the server and validates officer administrative privileges.
 * Fails closed if the token is forged, expired, malformed, or lacks administrator authorization.
 */
export async function verifyAdminIdToken(idToken: string): Promise<{
  isValid: boolean;
  uid?: string;
  email?: string;
  role?: string;
  error?: string;
}> {
  if (!idToken || typeof idToken !== 'string' || idToken.trim().length === 0) {
    return { isValid: false, error: 'Authentication token is missing or empty.' };
  }

  // Use test verifier if registered in non-production test environment
  if (testVerifier && process.env.NODE_ENV !== 'production') {
    return testVerifier(idToken.trim());
  }

  try {
    const auth = getFirebaseAdminAuth();
    const decoded: DecodedIdToken = await auth.verifyIdToken(idToken.trim());

    // Fail closed in production: Demo administrator credentials strictly rejected in production
    if (process.env.NODE_ENV === 'production') {
      const emailLower = (decoded.email || '').toLowerCase();
      if (emailLower === 'demo.admin@blockballot.local' || decoded.uid === 'demo-admin-uid') {
        return {
          isValid: false,
          error: 'Access denied: Demo administrator account cannot be used in production mode.',
        };
      }
    }

    // 1. Check custom claims for explicit administrator authorization
    const isExplicitAdminClaim =
      decoded.admin === true ||
      decoded.role === 'commissioner' ||
      decoded.role === 'officer';

    if (isExplicitAdminClaim) {
      return {
        isValid: true,
        uid: decoded.uid,
        email: decoded.email,
        role: (decoded.role as string) || 'commissioner',
      };
    }

    // 2. Check server-side /admins/{uid} Firestore collection authorization via Admin SDK
    try {
      const db = getFirebaseAdminFirestore();
      const adminDocRef = db.collection('admins').doc(decoded.uid);
      const adminDocSnap = await adminDocRef.get();

      if (adminDocSnap.exists) {
        const adminData = adminDocSnap.data();
        return {
          isValid: true,
          uid: decoded.uid,
          email: decoded.email || adminData?.email,
          role: adminData?.role || 'officer',
        };
      }
    } catch (firestoreErr: any) {
      console.warn('[FirebaseAdmin] Notice querying /admins collection:', firestoreErr.message);
    }

    // Fail closed: authenticated user is not in the authorized administrator registry
    return {
      isValid: false,
      error: 'Access denied: Authenticated user does not hold an authorized Commission officer role.',
    };
  } catch (err: any) {
    // Fail closed on any token verification or network failure
    return {
      isValid: false,
      error: `Firebase ID token verification failed: ${err.message || 'Invalid or expired signature.'}`,
    };
  }
}

