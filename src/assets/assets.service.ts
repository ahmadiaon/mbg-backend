import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AssetsService {
  constructor(private readonly config: ConfigService) {}

  async upload(file: { buffer: Buffer; originalname: string; mimetype: string }, folder: string, filename?: string) {
    const baseUrl = (this.config.get<string>('ASSETS_API_URL') ?? 'https://assets.mitrabaritogroup.com').replace(/\/$/, '');
    const token = this.config.get<string>('ASSETS_API_TOKEN');
    if (!token) throw new BadGatewayException('ASSETS_API_TOKEN belum dikonfigurasi');
    const body = new FormData();
    const bytes = new Uint8Array(file.buffer);
    body.append('file', new Blob([bytes], { type: file.mimetype }), file.originalname);
    body.append('folder', folder);
    body.append('filename', filename || file.originalname);
    try {
      const response = await fetch(`${baseUrl}/upload`, {
        method: 'POST',
        headers: { 'x-api-token': token },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(String(data.error || `HTTP ${response.status}`));
      return data as { success: boolean; url: string };
    } catch {
      throw new BadGatewayException('Gagal mengunggah file ke Assets API');
    }
  }
}
