import { createDocument } from '@/shared/models/document';
import { getUserInfo } from '@/shared/models/user';
import { md5, getUuid } from '@/shared/lib/hash';
import { respData, respErr } from '@/shared/lib/resp';
import { getStorageService } from '@/shared/services/storage';
import { getFileExtension } from '@/shared/lib/contract-file';

export async function POST(req: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return respErr('file is required');
    }

    const arrayBuffer = await file.arrayBuffer();
    const body = new Uint8Array(arrayBuffer);
    const digest = md5(body);
    const ext = getFileExtension(file.name) || 'bin';
    const key = `contracts/${user.id}/${digest}.${ext}`;

    const storageService = await getStorageService();
    const exists = await storageService.exists({ key });
    let url = '';
    if (exists) {
      url = storageService.getPublicUrl({ key }) || '';
    }

    if (!url) {
      const uploadResult = await storageService.uploadFile({
        body,
        key,
        contentType: file.type || 'application/octet-stream',
        disposition: 'inline',
      });
      if (!uploadResult.success || !uploadResult.url) {
        return respErr(uploadResult.error || 'upload contract failed');
      }
      url = uploadResult.url;
    }

    const now = new Date();
    const contractType = getFormString(formData, 'contractType');
    const userParty = getFormString(formData, 'userParty');
    const signingPlace = getFormString(formData, 'signingPlace');
    const focusPoints = getFormString(formData, 'focusPoints');

    const document = await createDocument({
      id: getUuid(),
      userId: user.id,
      status: 'uploaded',
      filePath: url,
      fileName: file.name,
      fileType: file.type || '',
      fileSize: file.size,
      storageProvider: 'r2',
      contractType,
      userParty,
      signingPlace,
      focusPoints,
      createdAt: now,
      updatedAt: now,
    });

    return respData({
      document,
      file: {
        url,
        key,
        name: file.name,
        type: file.type,
        size: file.size,
      },
    });
  } catch (e: any) {
    console.log('contract upload failed:', e);
    return respErr(e.message || 'contract upload failed');
  }
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (!value || typeof value !== 'string') {
    return '';
  }
  return value.trim();
}
