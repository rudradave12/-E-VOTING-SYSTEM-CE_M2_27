# BlockBallot — Biometric Enrollment UI Architecture & Security Documentation

**Phase:** Phase 05 — Separate Biometric Enrollment UI  
**Branch:** `feature/simulation-voter-registry-rbac`  
**Base Commit:** `47bf038` (Phase 04 Completion)  
**Standard Status:** Production-Grade Separation & Ephemeral Memory Safety  

---

## 1. Executive Summary & Design Principles

BlockBallot Phase 05 implements dedicated, independent user interfaces for **Face Enrollment** and **Fingerprint Enrollment**, connecting voter registration workflows with the simulation voter registry and fine-grained Role-Based Access Control (RBAC).

### Key Architectural Principles:
1. **Strict Page & Modality Separation:** Face Enrollment (`/face-enrollment`) and Fingerprint Enrollment (`/fingerprint-enrollment`) are two entirely separate views and routing destinations. They are never combined into a single ambiguous form.
2. **Zero Persistent Raw Biometrics:** No captured face images, video frames, fingerprint ridge images, or biometric minutiae templates are ever stored in `localStorage`, `sessionStorage`, browser indexedDB, server application logs, or persisted to backend voter profile records.
3. **Honest Hardware Boundaries:** In modern browser environments, proprietary USB fingerprint scanners cannot be accessed directly without vendor device drivers or local daemons (such as the Indian UIDAI/ECI RD Service standard on `127.0.0.1:11100`). The system honestly reports `NOT_DETECTED` when no local hardware driver is present, while providing an explicitly labeled `Simulated Preview Mode` for testing and laboratory workflows.
4. **No Premature Enrollment:** Simply clicking "Save Progress" or capturing a frame does **not** mark a voter as `ENROLLED`. Status transitions only to `PENDING` (or `DEVICE_UNAVAILABLE`). The terminal `ENROLLED` state is strictly reserved for verified, certified biometric template matching engines.
5. **Strict RBAC & Jurisdiction Scoping:** Operational Voter Registration Officers (`VRO-SIM-001`) and Platform Administrators possess access to biometric enrollment workflows (`BIOMETRIC_ENROLLMENT_START`). Election Officers (`EO-SIM-001`) and unauthorized accounts are rejected with HTTP 403 Forbidden. Out-of-scope voters outside the officer's assigned constituency are blocked.

---

## 2. Separate Page Workflows

### A. Face Enrollment (`FaceEnrollmentScreen.tsx`)
- **Route / Screen ID:** `'face-enrollment'`
- **Visual Direction:** Aligned with the official *Face Scanning Instructions for Voter Registration and Verification* specification.
- **Header Context:** Safely displays the selected elector's Simulation Voter ID (`simulationVoterId`), full name, constituency, polling station, and current backend face status (`NOT_STARTED` / `PENDING`).
- **6-Step Process Banner:**
  1. *Initialize Camera:* Request camera permission and start video feed.
  2. *Detect Face:* Real-time oval frame alignment guide.
  3. *Guide User:* Proper lighting, neutral expression, and center positioning.
  4. *Capture Image:* Stable frame capture on explicit officer action.
  5. *Liveness Check:* Interactive guidance (blink, head movement, smile/neutral, random prompt).
  6. *Save or Cancel:* Save metadata progress as `PENDING` or retake.
- **Controls & States:**
  - *Start Camera:* Invokes `navigator.mediaDevices.getUserMedia` upon explicit user gesture.
  - *Capture Frame:* Captures image to an ephemeral in-memory canvas and generates a transient object URL (`blob:`).
  - *Retake / Cancel:* Immediately releases previous blob URLs and restarts or tears down the camera feed.
  - *Save Progress:* Calls `PATCH /api/admin/voters/:id/biometrics` with `{ modality: 'FACE', status: 'PENDING', qualityCheckStatus: 'PASSED' }`.
  - *Accessible Error States:* Clearly renders designated banners for `PERMISSION_DENIED`, `NOT_FOUND` (no webcam), and `NOT_SUPPORTED`.

### B. Fingerprint Enrollment (`FingerprintEnrollmentScreen.tsx`)
- **Route / Screen ID:** `'fingerprint-enrollment'`
- **Visual Direction:** Aligned with the official *Fingerprint Scanning Instructions for Voter Registration and Enrollment* specification.
- **Header Context:** Safely displays the selected elector's safe profile identifiers and current fingerprint metadata status.
- **6-Step Process Banner:**
  1. *Prepare Device:* Connect scanner and verify driver handshake.
  2. *Capture Fingerprint:* Elector places center of finger pad on platen.
  3. *Scan Multiple Times:* Progressive acquisition of 3–4 impressions (slots 1 to 4).
  4. *Check Quality:* Inspect ridge clarity, pressure, and pad completeness.
  5. *Save Progress:* Save metadata progress as `PENDING` in backend.
  6. *Supervisor Fallback:* Clear Phase 06 notice for voters requiring physical ID manual review.
- **Controls & Device Adapters:**
  - *Adapter Selector:* Toggle between `Physical USB Adapter` and `Simulated Preview Mode`.
  - *Physical Scanner Mode:* Probes local vendor RD Service (`http://127.0.0.1:11100/rd/info`). Honestly reports `NOT_DETECTED` when absent.
  - *Simulated Preview Mode:* Allows multi-impression simulation (impressions 1–4, progressive radar ridge visualization) explicitly marked as demonstration preview.
  - *Supported Finger Selector:* Interactive selector for Thumb (Recommended), Index, Middle, Ring, and Little fingers.
  - *Save Fingerprint:* Calls `PATCH /api/admin/voters/:id/biometrics` with `{ modality: 'FINGERPRINT', status: 'PENDING' }`.

---

## 3. Data Safety & Privacy Invariants

| Action | Permitted? | Backend Enforcement |
| :--- | :---: | :--- |
| **Transmit raw JPEG/PNG face photos to backend** | **NO** | Rejected with `400 Bad Request` by `FORBIDDEN_BIOMETRIC_REGISTRATION_KEYS` guard. |
| **Store biometric images in Firestore or localStorage** | **NO** | Ephemeral memory blobs (`blob:`) are held in memory only and revoked on unmount. |
| **Send raw fingerprint minutiae/templates** | **NO** | Rejected with `400 Bad Request` on all voter CRUD and biometric endpoints. |
| **Mark status as `ENROLLED` from frontend** | **NO** | `PATCH /api/admin/voters/:id/biometrics` rejects `status === 'ENROLLED'` with `400 Bad Request`. |
| **Claim manual physical ID approval in Phase 05** | **NO** | Rejects `status === 'MANUALLY_APPROVED'` with `400 Bad Request` (Phase 06 boundary). |
| **Access voter outside assigned constituency** | **NO** | Rejects with `403 Forbidden` (`isConstituencyInScope` check). |

---

## 4. Hardware Adapter Architecture & Future Vendor SDK Integration

Proprietary biometric hardware devices communicate via vendor SDKs. To allow future production deployment without refactoring the UI, BlockBallot introduces `IFingerprintScannerAdapter`:

```typescript
export interface IFingerprintScannerAdapter {
  readonly name: string;
  readonly provider: string;
  readonly isSimulation: boolean;
  getStatus(): Promise<ScannerDeviceStatus>;
  isHardwareConnected(): Promise<boolean>;
  captureImpression(impressionIndex: number, fingerType?: SupportedFingerType): Promise<FingerprintScanResult>;
  cancelScan(): Promise<void>;
}
```

### Future Integration Steps for Certified Hardware:
1. **Local RD Service Client:**
   Implement vendor-specific HTTP/WebSocket handshakes for Mantra (`MFS100`), SecuGen (`Hamster Pro`), or Morpho (`MSO 1300`).
2. **WebUSB API Driver:**
   For modern devices supporting WebUSB, bind `navigator.usb.requestDevice` with the vendor's USB vendorId/productId.
3. **Template Extraction Server:**
   Direct captured minutiae from the secure device driver directly to an isolated, certified biometric matching engine (e.g., ABIS), receiving back only an opaque token (`biometricReferenceId`).

---

## 5. Phase 06 Strict Boundary & Remaining Scope

The following items are **strictly reserved for Phase 06** and were **not** implemented in Phase 05:
1. **Manual Physical-ID Exception Approval Workflow:**
   - Exception request submission by VRO for electors with worn ridges or physical amputations (`VOTER_EXCEPTION_REQUEST`).
   - Supervisor review and final approval/rejection by Election Officer (`VOTER_EXCEPTION_APPROVE`).
   - Transition to `status: 'MANUALLY_APPROVED'` with `isManualException: true`.
2. **Election Lifecycle Redesign:** Unrelated to biometric capture.
3. **Voting Authorization Redesign & Smart Contract Changes:** Unrelated to biometric capture.
