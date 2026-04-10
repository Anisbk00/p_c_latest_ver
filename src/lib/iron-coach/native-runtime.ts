import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface IronCoachDeviceCapabilities {
  ramGb: number;
  cpuCores: number;
  freeStorageGb: number;
  supportsLocalInference: boolean;
}

export interface IronCoachModelStatus {
  isDownloaded: boolean;
  modelPath?: string;
  downloadedBytes?: number;
  totalBytes?: number;
  checksumVerified?: boolean;
}

interface DownloadOptions {
  url: string;
  checksumSha256: string;
  modelKey: string;
  destinationPath: string;
}

interface InferOptions {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  requestId?: string;
}

export interface IronCoachNativePlugin {
  getCapabilities(): Promise<IronCoachDeviceCapabilities>;
  getModelStatus(options: { modelKey: string }): Promise<IronCoachModelStatus>;
  startModelDownload(options: DownloadOptions): Promise<void>;
  pauseModelDownload(options: { modelKey: string }): Promise<void>;
  resumeModelDownload(options: { modelKey: string }): Promise<void>;
  cancelModelDownload(options: { modelKey: string }): Promise<void>;
  infer(options: InferOptions): Promise<{ text: string; confidence?: number }>;
  startInferenceStream(options: InferOptions): Promise<void>;
  stopInferenceStream(options: { requestId: string }): Promise<void>;
  addListener(eventName: 'modelDownloadProgress', listenerFunc: (event: { modelKey: string; downloadedBytes: number; totalBytes: number; progress: number }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'inferenceToken', listenerFunc: (event: { requestId: string; token: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'inferenceComplete', listenerFunc: (event: { requestId: string; fullText: string; confidence?: number }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'inferenceError', listenerFunc: (event: { requestId: string; error: string }) => void): Promise<PluginListenerHandle>;
}

export const IronCoachNative = registerPlugin<IronCoachNativePlugin>('IronCoachNative');

export async function canRunLocalModelSafely(): Promise<IronCoachDeviceCapabilities> {
  const capabilities = await IronCoachNative.getCapabilities();
  const supports = capabilities.ramGb >= 6 && capabilities.cpuCores >= 6 && capabilities.freeStorageGb >= 4;
  return {
    ...capabilities,
    supportsLocalInference: capabilities.supportsLocalInference && supports,
  };
}
