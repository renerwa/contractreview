import { getFileExtension } from '@/shared/lib/contract-file';
import { getUuid, md5 } from '@/shared/lib/hash';
import { respData, respErr } from '@/shared/lib/resp';
import { createDocument } from '@/shared/models/document';
import { getUserInfo } from '@/shared/models/user';
import { getStorageService } from '@/shared/services/storage';

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

    // 上传文件到存储服务，返回文件的 URL
    // 文件key为 contracts/{user_id}/{md5_hash}.{ext}

    // 将文件转换为二进制原始数据（ArrayBuffer）然后转成 Uint8Array 二进制数组（前端通用的可操作二进制格式）
    const arrayBuffer = await file.arrayBuffer();
    const body = new Uint8Array(arrayBuffer);
    const digest = md5(body);
    // 调用自定义方法获取文件后缀名，获取失败就默认用 bin（通用二进制后缀）
    const ext = getFileExtension(file.name) || 'bin';
    const key = `contracts/${user.id}/${digest}.${ext}`;

    const storageService = await getStorageService();
    // 检查文件是否存在,如果存在就直接返回URL,否则上传文件并获取URL
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

    // 创建文档记录
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

// 从表单数据中获取字符串值，返回空字符串
// 如果值不存在或不是字符串类型，返回空字符串
function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (!value || typeof value !== 'string') {
    return '';
  }
  return value.trim();
}
