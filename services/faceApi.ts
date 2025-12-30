
/**
 * Using face-api.js via CDN for browser-side facial recognition.
 * Models are loaded from a public repository to ensure functionality in any environment.
 */

// We import the browser-ready bundle of face-api.js
// Note: In a production environment, you'd usually npm install and bundle these.
// For this standalone app, we use the script approach to ensure model loading works.

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js/weights/';

export const loadModels = async () => {
  // @ts-ignore - faceapi is attached to window when loaded via script
  const faceapi = window.faceapi;
  if (!faceapi) throw new Error('face-api.js not loaded');

  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
  ]);
};

export const getFaceDescriptor = async (input: HTMLVideoElement | HTMLImageElement) => {
  // @ts-ignore
  const faceapi = window.faceapi;
  const detection = await faceapi.detectSingleFace(input)
    .withFaceLandmarks()
    .withFaceDescriptor();
  
  return detection ? detection.descriptor : null;
};

export const calculateDistance = (descriptor1: number[] | Float32Array, descriptor2: number[] | Float32Array): number => {
  // @ts-ignore
  const faceapi = window.faceapi;
  return faceapi.euclideanDistance(descriptor1, descriptor2);
};
