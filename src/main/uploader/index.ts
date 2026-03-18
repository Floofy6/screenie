import type { CaptureResult, Uploader } from '@shared/types';

export const noUploader: Uploader = {
  upload: async () => {
    return {
      success: false,
      error: 'Uploader is not configured in this scaffold.'
    };
  }
};

export function createUploader(): Uploader {
  // Hook for future upload integrations (Imgur/S3/private endpoint/etc.).
  return noUploader;
}

