/**
 * Stub for @mediapipe/selfie_segmentation
 * Provides the named export that @tensorflow-models/body-segmentation statically imports
 * so the build succeeds. We use the tfjs runtime (not mediapipe runtime), so this is never called.
 */
export class SelfieSegmentation {
  constructor() {}
  setOptions() {}
  onResults() {}
  send() {}
  initialize() { return Promise.resolve(); }
  close() {}
}
