import { Capacitor } from '@capacitor/core';
import { IronCoachNative, canRunLocalModelSafely } from './native-runtime';

export const LOCAL_MODEL_KEY = 'ironcoach_phi3_gguf';
export const LOCAL_MODEL_DEST_PATH = '/app-data/models/ironcoach-phi3.gguf';

export interface LocalModelConfig {
  downloadUrl: string;
  checksumSha256: string;
}

export async function getLocalModelState() {
  if (!Capacitor.isNativePlatform()) {
    return {
      supported: false,
      ready: false,
      reason: 'Not running on native platform',
    };
  }

  const capabilities = await canRunLocalModelSafely();
  if (!capabilities.supportsLocalInference) {
    return {
      supported: false,
      ready: false,
      reason: 'Device does not meet local model requirements',
      capabilities,
    };
  }

  const status = await IronCoachNative.getModelStatus({ modelKey: LOCAL_MODEL_KEY });

  return {
    supported: true,
    ready: !!status.isDownloaded && !!status.checksumVerified,
    status,
    capabilities,
  };
}

export async function startLocalModelDownload(config: LocalModelConfig) {
  await IronCoachNative.startModelDownload({
    url: config.downloadUrl,
    checksumSha256: config.checksumSha256,
    modelKey: LOCAL_MODEL_KEY,
    destinationPath: LOCAL_MODEL_DEST_PATH,
  });
}

export async function pauseLocalModelDownload() {
  await IronCoachNative.pauseModelDownload({ modelKey: LOCAL_MODEL_KEY });
}

export async function resumeLocalModelDownload() {
  await IronCoachNative.resumeModelDownload({ modelKey: LOCAL_MODEL_KEY });
}

export async function cancelLocalModelDownload() {
  await IronCoachNative.cancelModelDownload({ modelKey: LOCAL_MODEL_KEY });
}
