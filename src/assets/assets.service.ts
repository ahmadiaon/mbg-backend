import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);
  private readonly localAssetsRoot = path.join(process.cwd(), 'assets');

  constructor(private readonly config: ConfigService) {
    if (!fs.existsSync(this.localAssetsRoot)) {
      fs.mkdirSync(this.localAssetsRoot, { recursive: true });
    }
  }

  async upload(
    file: { buffer: Buffer; originalname: string; mimetype: string },
    folder: string,
    filename?: string,
  ) {
    // Mode Lokal: Selalu gunakan penyimpanan lokal untuk foto-profil atau jika diset lokal/tanpa remote token
    const useLocal =
      this.config.get<string>('ASSETS_STORAGE') === 'local' ||
      folder === 'foto-profil' ||
      !this.config.get<string>('ASSETS_API_TOKEN');

    if (useLocal) {
      try {
        const targetDir = path.join(this.localAssetsRoot, folder);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        const safeFilename =
          filename ||
          `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = path.join(targetDir, safeFilename);

        await fs.promises.writeFile(filePath, file.buffer);
        this.logger.log(`File tersimpan di assets lokal: ${filePath}`);

        return {
          success: true,
          url: `/assets/${folder}/${safeFilename}`,
          filename: safeFilename,
        };
      } catch (err) {
        this.logger.error('Gagal menyimpan file ke assets lokal:', err);
        throw new BadGatewayException('Gagal menyimpan file ke assets lokal');
      }
    }

    // Remote fallback (jika folder bukan foto-profil dan dikonfigurasi remote)
    const baseUrl = (
      this.config.get<string>('ASSETS_API_URL') ??
      'https://assets.mitrabaritogroup.com'
    ).replace(/\/$/, '');
    const token = this.config.get<string>('ASSETS_API_TOKEN');
    if (!token)
      throw new BadGatewayException('ASSETS_API_TOKEN belum dikonfigurasi');

    const body = new FormData();
    const bytes = new Uint8Array(file.buffer);
    body.append(
      'file',
      new Blob([bytes], { type: file.mimetype }),
      file.originalname,
    );
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
      if (!response.ok || !data.url)
        throw new Error(String(data.error || `HTTP ${response.status}`));
      return data as { success: boolean; url: string };
    } catch {
      // Jika remote gagal, fallback otomatis simpan lokal agar aplikasi tidak macet
      this.logger.warn('Remote upload gagal, beralih ke penyimpanan lokal');
      const targetDir = path.join(this.localAssetsRoot, folder);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const safeFilename =
        filename ||
        `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await fs.promises.writeFile(
        path.join(targetDir, safeFilename),
        file.buffer,
      );
      return {
        success: true,
        url: `/assets/${folder}/${safeFilename}`,
        filename: safeFilename,
      };
    }
  }
}
