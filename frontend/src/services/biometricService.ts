/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * BlockBallot — Biometric Device Services & Hardware Adapter Layer
 *
 * Phase 05 Architectural Rules:
 * 1. Strict Privacy: Browser camera streams and frame snapshots exist exclusively
 *    in ephemeral memory during the active session. Media tracks are stopped immediately
 *    on retake, cancel, navigation, or unmount.
 * 2. Zero Persistent Biometric Bytes: No raw face frames, minutiae data, or fingerprint
 *    images are stored in localStorage, sessionStorage, application logs, or transmitted
 *    over the network to backend CRUD endpoints.
 * 3. Honest Hardware Boundary: Standard web browsers cannot directly communicate with
 *    USB fingerprint scanners without a local device daemon or certified vendor SDK.
 *    PhysicalScannerSdkAdapter honestly reports NOT_DETECTED when no compatible local SDK
 *    is active. A distinct SimulatedPreviewScannerAdapter provides demonstration workflows.
 */

export type CameraErrorType = 'NOT_SUPPORTED' | 'PERMISSION_DENIED' | 'NOT_FOUND' | 'GENERIC';

export interface CameraStreamResult {
  success: boolean;
  stream?: MediaStream;
  error?: string;
  errorType?: CameraErrorType;
}

export interface FrameCaptureResult {
  success: boolean;
  blobUrl?: string;
  width?: number;
  height?: number;
  error?: string;
}

/**
 * CameraDeviceService
 * Manages media lifecycle and ensures explicit track teardown.
 */
export class CameraDeviceService {
  private static instance: CameraDeviceService;

  private constructor() {}

  public static getInstance(): CameraDeviceService {
    if (!CameraDeviceService.instance) {
      CameraDeviceService.instance = new CameraDeviceService();
    }
    return CameraDeviceService.instance;
  }

  /**
   * Checks if MediaDevices and getUserMedia are supported in the current browser context.
   */
  public isSupported(): boolean {
    return !!(
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    );
  }

  /**
   * Requests camera video stream from the browser upon explicit user action.
   */
  public async requestCameraStream(
    constraints: MediaStreamConstraints = {
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    }
  ): Promise<CameraStreamResult> {
    if (!this.isSupported()) {
      return {
        success: false,
        error: 'Camera device API is not supported in this browser or environment.',
        errorType: 'NOT_SUPPORTED',
      };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return {
        success: true,
        stream,
      };
    } catch (err: any) {
      const name = err.name || '';
      let errorType: CameraErrorType = 'GENERIC';
      let message = 'Unable to access camera device.';

      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        errorType = 'PERMISSION_DENIED';
        message = 'Camera permission was denied. Please allow camera access in browser settings.';
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        errorType = 'NOT_FOUND';
        message = 'No video capture hardware (webcam) detected on this computer.';
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        errorType = 'GENERIC';
        message = 'Camera device is already in use by another application or tab.';
      }

      return {
        success: false,
        error: message,
        errorType,
      };
    }
  }

  /**
   * Safely terminates all media tracks on a given stream to release hardware indicators.
   */
  public stopCameraStream(stream: MediaStream | null | undefined): void {
    if (!stream) return;
    try {
      const tracks = stream.getTracks();
      for (const track of tracks) {
        track.stop();
      }
    } catch (err) {
      console.warn('[BiometricService] Notice stopping media track:', err);
    }
  }

  /**
   * Captures the current video frame to an in-memory canvas and creates a temporary blob URL.
   * Does NOT persist or serialize bytes to storage or network.
   */
  public captureFrame(videoElement: HTMLVideoElement): Promise<FrameCaptureResult> {
    return new Promise((resolve) => {
      try {
        if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
          resolve({
            success: false,
            error: 'Camera video stream is not active or has zero dimensions.',
          });
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve({
            success: false,
            error: 'Could not create canvas 2D rendering context.',
          });
          return;
        }

        // Draw image frame
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve({
                success: false,
                error: 'Failed to convert captured video frame to memory blob.',
              });
              return;
            }

            const blobUrl = URL.createObjectURL(blob);
            resolve({
              success: true,
              blobUrl,
              width: canvas.width,
              height: canvas.height,
            });
          },
          'image/jpeg',
          0.9
        );
      } catch (err: any) {
        resolve({
          success: false,
          error: err.message || 'Error capturing camera frame.',
        });
      }
    });
  }

  /**
   * Revokes a transient memory object URL.
   */
  public revokeBlobUrl(blobUrl: string | null | undefined): void {
    if (blobUrl && typeof blobUrl === 'string' && blobUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch (err) {
        console.warn('[BiometricService] Notice revoking blob URL:', err);
      }
    }
  }
}

// ============================================================================
// Fingerprint Scanner Adapter Abstraction
// ============================================================================

export type ScannerDeviceStatus = 'CONNECTED' | 'NOT_DETECTED' | 'SCANNING' | 'ERROR';

export type SupportedFingerType = 'THUMB' | 'INDEX' | 'MIDDLE' | 'RING' | 'LITTLE';

export type BiometricCaptureMode = 'HARDWARE_USB' | 'SIMULATED' | 'MANUAL_OFFICER_OVERRIDE';

export interface FingerprintScanResult {
  success: boolean;
  impressionIndex: number; // 1 to 4
  qualityScore: number; // 0-100 normalized score
  status: ScannerDeviceStatus;
  message: string;
  isSimulated: boolean;
  captureMode: BiometricCaptureMode;
}

export interface IFingerprintScannerAdapter {
  readonly name: string;
  readonly provider: string;
  readonly isSimulation: boolean;
  readonly captureMode: BiometricCaptureMode;
  getStatus(): Promise<ScannerDeviceStatus>;
  isHardwareConnected(): Promise<boolean>;
  captureImpression(impressionIndex: number, fingerType?: SupportedFingerType): Promise<FingerprintScanResult>;
  cancelScan(): Promise<void>;
}

/**
 * PhysicalScannerSdkAdapter
 * Represents the production integration point for USB fingerprint scanners (e.g. Mantra, SecuGen, Morpho).
 * Checks whether a local vendor daemon (e.g. localhost:11100 RD Service standard) is responding.
 * Honestly reports NOT_DETECTED when no local driver daemon is present.
 */
export class PhysicalScannerSdkAdapter implements IFingerprintScannerAdapter {
  public readonly name = 'Standard USB Biometric RD Service';
  public readonly provider = 'UIDAI/ECI Compatible Hardware Client';
  public readonly isSimulation = false;
  public readonly captureMode: BiometricCaptureMode = 'HARDWARE_USB';
  private readonly daemonEndpoint = 'http://127.0.0.1:11100';

  public async getStatus(): Promise<ScannerDeviceStatus> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${this.daemonEndpoint}/rd/info`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        return 'CONNECTED';
      }
      return 'NOT_DETECTED';
    } catch {
      // Local daemon is not running on localhost
      return 'NOT_DETECTED';
    }
  }

  public async isHardwareConnected(): Promise<boolean> {
    const status = await this.getStatus();
    return status === 'CONNECTED';
  }

  public async captureImpression(
    impressionIndex: number,
    _fingerType: SupportedFingerType = 'THUMB'
  ): Promise<FingerprintScanResult> {
    const isConnected = await this.isHardwareConnected();
    if (!isConnected) {
      return {
        success: false,
        impressionIndex,
        qualityScore: 0,
        status: 'NOT_DETECTED',
        message:
          'No supported scanner detected (Checked USB RD Service on port 11100). No physical fingerprint scanner SDK / driver daemon is currently responding. Connect a compatible local driver/SDK daemon or switch to Academic Simulation Mode.',
        isSimulated: false,
        captureMode: 'HARDWARE_USB',
      };
    }

    return {
      success: false,
      impressionIndex,
      qualityScore: 0,
      status: 'ERROR',
      message: 'Physical scanner driver handshake returned no biometric response.',
      isSimulated: false,
      captureMode: 'HARDWARE_USB',
    };
  }

  public async cancelScan(): Promise<void> {
    // No-op for inactive daemon
  }
}

/**
 * SimulatedPreviewScannerAdapter
 * Used in laboratory, training, and verification environments where hardware scanners are absent.
 * Clearly flags all operations as simulated demonstration previews.
 */
export class SimulatedPreviewScannerAdapter implements IFingerprintScannerAdapter {
  public readonly name = 'Simulated Scanner Preview Adapter';
  public readonly provider = 'BlockBallot Academic Testbed';
  public readonly isSimulation = true;
  public readonly captureMode: BiometricCaptureMode = 'SIMULATED';
  private status: ScannerDeviceStatus = 'CONNECTED';

  public async getStatus(): Promise<ScannerDeviceStatus> {
    return this.status;
  }

  public async isHardwareConnected(): Promise<boolean> {
    return false; // Truthful: Virtual testbed only, no physical hardware connected
  }

  public async captureImpression(
    impressionIndex: number,
    _fingerType: SupportedFingerType = 'THUMB'
  ): Promise<FingerprintScanResult> {
    // Generate realistic simulated scan progression
    this.status = 'SCANNING';

    // Simulate sensor integration delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    this.status = 'CONNECTED';
    return {
      success: true,
      impressionIndex,
      qualityScore: 88 + Math.floor(Math.random() * 8), // 88 - 95 score
      status: 'CONNECTED',
      message: `Impression ${impressionIndex} captured in Academic Simulation Mode (simulated quality score: clear ridges).`,
      isSimulated: true,
      captureMode: 'SIMULATED',
    };
  }

  public async cancelScan(): Promise<void> {
    this.status = 'CONNECTED';
  }
}

/**
 * Factory for fingerprint scanner adapters.
 */
export function getFingerprintScannerAdapter(mode: 'hardware' | 'simulation' = 'hardware'): IFingerprintScannerAdapter {
  if (mode === 'hardware') {
    return new PhysicalScannerSdkAdapter();
  }
  return new SimulatedPreviewScannerAdapter();
}

export const cameraService = CameraDeviceService.getInstance();
