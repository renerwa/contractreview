/**
 * 获取文件扩展名
 * @param fileName 文件名
 * @returns 文件扩展名（小写）
 */
export function getFileExtension(fileName: string) {
  const idx = fileName.lastIndexOf('.');
  if (idx < 0) return '';
  return fileName.slice(idx + 1).toLowerCase();
}

export function isTextLikeFile(file: File) {
  if (file.type.startsWith('text/')) {
    return true;
  }
  const ext = getFileExtension(file.name);
  return ['md', 'markdown', 'txt', 'csv', 'json', 'xml', 'html'].includes(ext);
}

export async function readFileAsText(file: File) {
  const buffer = await file.arrayBuffer();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  return decoder.decode(buffer);
}
