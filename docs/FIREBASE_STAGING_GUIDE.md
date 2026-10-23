# BlockBallot — Firebase Staging Setup Guide

> [!CAUTION]
> **Owner-Executed Procedure Only**
> This guide is an administrative reference for project owners configuring a staging environment.
> **Automated scripts and developers must not execute live provisioning, deploy security rules, upload credentials, or incur cloud costs during local development without authorization.**

---

## 1. Firebase Project Architecture

For a staging environment, create a dedicated, isolated Firebase project (e.g., `blockballot-staging`) completely separated from any production or testbed instances.

```
┌────────────────────────────────────────────────────────┐
│             Firebase Project: blockballot-staging      │
├──────────────────────────┬─────────────────────────────┤
│ 1. Firebase Auth         │ 2. Cloud Firestore          │
│ - Google Identity Provider│ - Database: (default)       │
│ - Authorized Domain      │ - Region: asia-south1       │
│ - Strict Role Claims     │ - Rules: firestore.rules    │
└──────────────────────────┴─────────────────────────────┘
```

---

## 2. Step-by-Step Setup

### Step 1: Create Dedicated Staging Project
1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** and enter `blockballot-staging`.
3. Choose whether to enable Google Analytics (optional, recommended disabled for academic testing).
4. Note your Project ID: `blockballot-staging`.

### Step 2: Configure Authentication
1. Navigate to **Build > Authentication** and click **Get started**.
2. Under the **Sign-in method** tab, enable **Google**:
   * Set project support email.
   * Add staging domain to **Authorized domains** (e.g., `staging-vote.blockballot.ac.in` and `localhost` for testing).
3. Do not enable anonymous authentication or unverified email/password providers.

### Step 3: Configure Cloud Firestore
1. Navigate to **Build > Firestore Database** and click **Create database**.
2. Select database ID: `(default)`.
3. Select location: **`asia-south1` (Mumbai, India)** to comply with regional data governance requirements.
   > [!IMPORTANT]
   > Firestore database location is permanent and cannot be modified after creation.
4. Start in **Production mode** (denies all reads/writes by default).

### Step 4: Deploy Least-Privilege Firestore Security Rules
Deploy the audited `firestore.rules` file from this repository:
```bash
firebase use blockballot-staging
firebase deploy --only firestore:rules
```

**Security Rules Summary:**
* `/elections/*`, `/constituencies/*`, `/candidates/*`, `/parties/*`: Public read-only; client writes **strictly denied**.
* `/party_preference_polls/*`: Public read-only; client writes **strictly denied**.
* `/poll_responses/*`: Authenticated read/write for own user ID; updates and deletes **strictly denied**; non-ECI disclaimer required.
* `/voters/*`, `/otp_challenges/*`, `/audit_events/*`: Client reads and writes **strictly denied**; only accessible via Firebase Admin SDK.

### Step 5: Service Account Least Privilege (IAM)
The backend uses `firebase-admin` to manage voter verification and audit records.
1. In Google Cloud Console, navigate to **IAM & Admin > Service Accounts**.
2. Create service account `blockballot-api-staging`.
3. Assign only the minimal required roles:
   * **Cloud Datastore User** (`roles/datastore.user`) — permits read/write to Firestore.
   * **Firebase Authentication Admin** (`roles/firebaseauth.admin`) — permits cryptographic token verification.
4. Under **Keys**, create and download a private key in JSON format.
5. In your staging secret manager (AWS Secrets Manager or GCP Secret Manager), store the JSON content securely. **Never commit this JSON file to Git.**

---

## 3. Critical Administrative Security Notice

> [!WARNING]
> **Firebase Admin SDK Bypasses Security Rules**
> The Firebase Admin SDK initializes with privileged service account credentials that inherently bypass all client-side Firestore Security Rules.
> Consequently:
> 1. All authorization checks must be enforced strictly within the Express API routes (`server/routes/`).
> 2. Endpoints modifying elections, toggling voter eligibility, or initiating imports must verify administrative session tokens via `verifyAdminAuth()`.
> 3. Voter identity must be extracted exclusively from validated authentication tokens, never client-supplied IDs.
